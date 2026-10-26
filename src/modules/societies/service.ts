import "server-only";

// Society Hub write operations (FR-SOC-1..4, OI-10, OI-11, OI-38; ADR-0013 / OI-56, owner decisions
// 2026-10-25). Every operation:
// 1. loads the society and the actor's facts from the database on every request: active Head grant,
//    membership row, global role (never anything sent by the browser);
// 2. checks the permission rules (permissions.ts);
// 3. validates the input (schemas.ts) and sanitises rich text on write;
// 4. writes, with its audit record in the same transaction. Actions a Head takes in the society
//    workspace are audited as the individual ON BEHALF OF the society.
// Head changes lock the society row (SELECT ... FOR UPDATE), so concurrent requests can never leave
// an active society without an active Head. Results are values; the HTTP layer maps them.
import { audit, type AuditEntry } from "@/modules/admin";
import { notify } from "@/modules/notifications";
import type { UserSummary } from "@/modules/identity";
import type { Db, PrismaClient } from "@/shared/db/client";
import { cleanPlainText, htmlToPlainText, sanitizeRichText } from "@/shared/security/sanitize-html";
import { z } from "zod";

import { can, type GlobalRole, type SocietyAction } from "./permissions";
import {
  createPostSchema,
  createSocietySchema,
  decideRequestSchema,
  facultyReviewSchema,
  fieldErrors,
  headEmailSchema,
  memberDisplaySchema,
  membershipRequestSchema,
  POST_BODY_MAX,
  type RecruitmentInput,
  setActiveSchema,
  STORY_MAX,
  updatePostSchema,
  updateSocietySchema,
} from "./schemas";

/**
 * The signed-in user, as read from the database for this request, and the capacity this request acts
 * in. "society" (default): society powers come only from an active Head grant. "platform": the
 * platform-admin oversight interface; valid only when globalRole is ADMIN (checked again here).
 */
export interface Actor {
  userId: string;
  globalRole: GlobalRole;
  capacity?: "society" | "platform";
}

/** True when this request acts as a platform admin (requested capacity AND confirmed ADMIN role). */
export const actsAsPlatformAdmin = (actor: Actor) => actor.capacity === "platform" && actor.globalRole === "ADMIN";

/** What this module needs from the identity module (its public interface; injected for tests). */
export interface IdentityPort {
  userByEmail(email: string): Promise<{ id: string; name: string; profileComplete: boolean } | null>;
  userSummaries(ids: readonly string[]): Promise<Map<string, UserSummary>>;
  activeBranches(): Promise<{ code: string; name: string }[]>;
}

export type ServiceError =
  | { ok: false; code: "VALIDATION"; fields: Record<string, string> }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" }
  | { ok: false; code: "CONFLICT" | "INVALID_STATE"; message: string };

export type Result<T = undefined> = { ok: true; value: T } | ServiceError;

/** Stories disappear 24 hours after publication (FR-SOC-3). */
export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const notFound = { ok: false, code: "NOT_FOUND" } as const;
const forbidden = { ok: false, code: "FORBIDDEN" } as const;
const invalid = (fields: Record<string, string>) => ({ ok: false, code: "VALIDATION", fields }) as const;
const conflict = (message: string) => ({ ok: false, code: "CONFLICT", message }) as const;
const invalidState = (message: string) => ({ ok: false, code: "INVALID_STATE", message }) as const;

const isUniqueViolation = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

const NOT_SIGNED_IN = "This person must sign in to Thapar SNS at least once before they can become a Head.";
const LAST_HEAD = "An active society must keep at least one Head. Add another Head first, or hand over.";

interface LoadedContext {
  society: { id: string; slug: string; isActive: boolean };
  isHead: boolean;
  isMember: boolean;
  allowed: (action: SocietyAction) => boolean;
  /** Audit attribution: a Head acting in the workspace acts on behalf of the society. */
  onBehalfOf: AuditEntry["onBehalfOf"];
}

/**
 * The society and the actor's facts, read inside the caller's transaction. With `lock`, the society
 * row is locked until the transaction ends, which serialises every Head change for that society.
 */
async function loadContext(db: Db, actor: Actor, societyId: string, options: { lock?: boolean } = {}): Promise<LoadedContext | null> {
  if (options.lock) {
    const locked = await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "societies_societies" WHERE "id" = ${societyId}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
  }
  const society = await db.society.findUnique({ where: { id: societyId }, select: { id: true, slug: true, isActive: true } });
  if (!society) return null;
  // The two capacities never mix: as a platform admin the Head grant and membership are ignored;
  // in the society capacity the ADMIN role is ignored.
  if (actsAsPlatformAdmin(actor)) {
    const facts = { platformAdmin: true, isHead: false, isMember: false, societyActive: society.isActive };
    return { society, isHead: false, isMember: false, allowed: (action) => can(facts, action), onBehalfOf: undefined };
  }
  // Sequential, not parallel: these may run inside an interactive transaction.
  const grant = await db.societyHeadGrant.findFirst({ where: { societyId, userId: actor.userId, revokedAt: null }, select: { id: true } });
  const membership = await db.societyMembership.findUnique({ where: { societyId_userId: { societyId, userId: actor.userId } }, select: { userId: true } });
  const facts = { platformAdmin: false, isHead: grant !== null, isMember: membership !== null, societyActive: society.isActive };
  return {
    society,
    isHead: facts.isHead,
    isMember: facts.isMember,
    allowed: (action) => can(facts, action),
    onBehalfOf: facts.isHead ? { type: "society", id: societyId } : undefined,
  };
}

/** Lower-case URL name derived from a society name. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "society";
}

async function freeSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set((await db.society.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((row) => row.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

async function nameTaken(db: Db, name: string, exceptId?: string): Promise<boolean> {
  const row = await db.society.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  return row !== null;
}

async function categoryExists(db: Db, slug: string): Promise<boolean> {
  return (await db.societyCategory.count({ where: { slug, active: true } })) === 1;
}

const activeHeadCount = (db: Db, societyId: string) => db.societyHeadGrant.count({ where: { societyId, revokedAt: null } });

/** Makes sure a (new) Head is also a member, without changing an existing member's display data. */
async function ensureMember(db: Db, societyId: string, userId: string): Promise<void> {
  await db.societyMembership.upsert({ where: { societyId_userId: { societyId, userId } }, create: { societyId, userId, group: "CORE" }, update: {} });
  await db.societyMembershipRequest.updateMany({ where: { societyId, userId, status: "PENDING" }, data: { status: "CANCELLED" } });
}

// ------------------------------------------------------------------------------------------------
// Society profile (FR-SOC-1, UCD-4) and platform administration (OI-38)
// ------------------------------------------------------------------------------------------------

/** FR-SOC-1: an admin creates a society with one or more initial Heads (ADR-0013). */
export async function createSociety(prisma: PrismaClient, identity: IdentityPort, actor: Actor, raw: unknown, now = new Date()): Promise<Result<{ id: string; slug: string }>> {
  if (!can({ platformAdmin: actsAsPlatformAdmin(actor), isHead: false, isMember: false, societyActive: true }, "society.create")) return forbidden;
  const parsed = createSocietySchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const input = parsed.data;
  const heads = await Promise.all(input.headEmails.map(async (email) => ({ email, user: await identity.userByEmail(email) })));
  const unknown = heads.filter((head) => !head.user).map((head) => head.email);
  if (unknown.length > 0) return invalid({ headEmails: `${NOT_SIGNED_IN} Not found: ${unknown.join(", ")}` });

  try {
    return await prisma.$transaction(async (tx) => {
      const fields: Record<string, string> = {};
      if (input.categorySlug !== undefined && !(await categoryExists(tx, input.categorySlug))) fields.categorySlug = "Choose a category from the list, or none.";
      if (await nameTaken(tx, input.name)) fields.name = "A society with this name already exists.";
      if (Object.keys(fields).length > 0) return invalid(fields);
      const society = await tx.society.create({
        data: {
          slug: await freeSlug(tx, input.name),
          name: input.name,
          shortName: input.shortName ?? null,
          description: input.description === undefined ? null : cleanPlainText(input.description) || null,
          categorySlug: input.categorySlug ?? null,
          socialLinks: input.links,
          contactEmail: input.contactEmail ?? null,
          createdById: actor.userId,
          verifiedAt: now,
          verifiedById: actor.userId,
        },
        select: { id: true, slug: true },
      });
      await audit(tx, { actorId: actor.userId, action: "societies.society.created", targetType: "society", targetId: society.id, details: { heads: heads.length } });
      for (const head of heads) {
        await ensureMember(tx, society.id, head.user!.id);
        await tx.societyHeadGrant.create({ data: { societyId: society.id, userId: head.user!.id, grantedById: actor.userId, grantReason: "CREATED_WITH_SOCIETY", grantedAt: now } });
        await audit(tx, { actorId: actor.userId, action: "societies.head.added", targetType: "society", targetId: society.id, details: { userId: head.user!.id, reason: "CREATED_WITH_SOCIETY" } });
      }
      return ok(society);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return invalid({ name: "A society with this name already exists." });
    throw error;
  }
}

/** UCD-4: any Head (or an admin) edits the profile. Renaming is admin-only: the name is the society's identity. */
export async function updateSociety(prisma: PrismaClient, actor: Actor, societyId: string, raw: unknown): Promise<Result> {
  try {
    return await prisma.$transaction(async (tx) => {
      const context = await loadContext(tx, actor, societyId);
      if (!context) return notFound;
      if (!context.allowed("society.editProfile")) return forbidden;
      const parsed = updateSocietySchema.safeParse(raw);
      if (!parsed.success) return invalid(fieldErrors(parsed.error));
      const input = parsed.data;
      const fields: Record<string, string> = {};
      if (input.name !== undefined && !context.allowed("society.rename")) fields.name = "Only a platform administrator can rename a society.";
      else if (input.name !== undefined && (await nameTaken(tx, input.name, societyId))) fields.name = "A society with this name already exists.";
      if (input.categorySlug !== undefined && !(await categoryExists(tx, input.categorySlug))) fields.categorySlug = "Choose a category from the list, or none.";
      if (Object.keys(fields).length > 0) return invalid(fields);
      await tx.society.update({
        where: { id: societyId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          shortName: input.shortName ?? null,
          description: input.description === undefined ? null : cleanPlainText(input.description) || null,
          categorySlug: input.categorySlug ?? null,
          socialLinks: input.links,
          contactEmail: input.contactEmail ?? null,
        },
      });
      await audit(tx, { actorId: actor.userId, action: "societies.society.updated", targetType: "society", targetId: societyId, details: { renamed: input.name !== undefined }, onBehalfOf: context.onBehalfOf });
      return ok(undefined);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return invalid({ name: "A society with this name already exists." });
    throw error;
  }
}

const imageSchema = z.object({ kind: z.enum(["logo", "banner"]), assetId: z.uuid().nullable() }).strict();

/**
 * Slice 2d: a Head (or an admin, ?as=admin) sets or clears the society logo or banner. The file must be
 * the caller's own upload for that purpose, already through (or in) the quarantine pipeline; it is
 * shown only once APPROVED.
 */
export async function setSocietyImage(prisma: PrismaClient, actor: Actor, societyId: string, raw: unknown, ownedAsset: (userId: string, assetId: string, purpose: "SOCIETY_LOGO" | "SOCIETY_BANNER") => Promise<{ ok: boolean; code?: string; message?: string }>): Promise<Result> {
  const parsed = imageSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const { kind, assetId } = parsed.data;
  if (assetId) {
    const owned = await ownedAsset(actor.userId, assetId, kind === "logo" ? "SOCIETY_LOGO" : "SOCIETY_BANNER");
    if (!owned.ok) return owned.code === "INVALID_STATE" ? invalid({ assetId: owned.message ?? "Upload the image first." }) : notFound;
  }
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId);
    if (!context) return notFound;
    if (!context.allowed("society.editProfile")) return forbidden;
    await tx.society.update({ where: { id: societyId }, data: kind === "logo" ? { logoAssetId: assetId, ...(assetId ? { logoSourceUrl: null } : {}) } : { bannerAssetId: assetId } });
    await audit(tx, { actorId: actor.userId, action: `societies.society.${kind}.${assetId ? "set" : "cleared"}`, targetType: "society", targetId: societyId, details: { assetId }, onBehalfOf: context.onBehalfOf });
    return ok(undefined);
  });
}

/**
 * OI-38: an admin deactivates or reactivates a society. Activation needs at least one active Head
 * (ADR-0013); activating an unverified (imported) society also records the admin's review.
 */
export async function setSocietyActive(prisma: PrismaClient, actor: Actor, societyId: string, raw: unknown, now = new Date()): Promise<Result> {
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId, { lock: true });
    if (!context) return notFound;
    if (!context.allowed("society.setActive")) return forbidden;
    const parsed = setActiveSchema.safeParse(raw);
    if (!parsed.success) return invalid(fieldErrors(parsed.error));
    if (context.society.isActive === parsed.data.active) return ok(undefined);
    if (parsed.data.active && (await activeHeadCount(tx, societyId)) === 0) return invalidState("Appoint at least one Head before activating this society.");
    await tx.society.update({ where: { id: societyId }, data: { isActive: parsed.data.active } });
    if (parsed.data.active) await tx.society.updateMany({ where: { id: societyId, verifiedAt: null }, data: { verifiedAt: now, verifiedById: actor.userId } });
    // Pending requests cannot be decided while inactive; they are cancelled so nobody waits forever.
    if (!parsed.data.active) await tx.societyMembershipRequest.updateMany({ where: { societyId, status: "PENDING" }, data: { status: "CANCELLED" } });
    await audit(tx, { actorId: actor.userId, action: "societies.society.status_changed", targetType: "society", targetId: societyId, details: { active: parsed.data.active } });
    return ok(undefined);
  });
}

// ------------------------------------------------------------------------------------------------
// Heads (ADR-0013 §3.1, owner decisions 2026-10-25): equal access, any number, at least one per
// active society, history kept. Active Heads and platform admins add and remove Heads.
// ------------------------------------------------------------------------------------------------

/** Adds a Head. The person must have signed in at least once. */
export async function addHead(prisma: PrismaClient, identity: IdentityPort, actor: Actor, societyId: string, raw: unknown, now = new Date()): Promise<Result> {
  const parsed = headEmailSchema.safeParse(raw);
  const incoming = parsed.success ? await identity.userByEmail(parsed.data.email) : null;
  try {
    return await prisma.$transaction(async (tx) => {
      const context = await loadContext(tx, actor, societyId, { lock: true });
      if (!context) return notFound;
      if (!context.allowed("heads.manage")) return forbidden;
      if (!parsed.success) return invalid(fieldErrors(parsed.error));
      if (!incoming) return invalid({ email: NOT_SIGNED_IN });
      if (await tx.societyHeadGrant.findFirst({ where: { societyId, userId: incoming.id, revokedAt: null }, select: { id: true } })) return conflict("This person is already a Head of this society.");
      await ensureMember(tx, societyId, incoming.id);
      const reason = context.isHead ? "ADDED" : "ADMIN_RECOVERY";
      await tx.societyHeadGrant.create({ data: { societyId, userId: incoming.id, grantedById: actor.userId, grantReason: reason, grantedAt: now } });
      await audit(tx, { actorId: actor.userId, action: "societies.head.added", targetType: "society", targetId: societyId, details: { userId: incoming.id, reason }, onBehalfOf: context.onBehalfOf });
      return ok(undefined);
    });
  } catch (error) {
    // The partial unique index allows one active grant per person; a concurrent duplicate lands here.
    if (isUniqueViolation(error)) return conflict("This person is already a Head of this society.");
    throw error;
  }
}

/**
 * Removes someone's Head access (their account, membership, posts and history stay). Never leaves an
 * active society without a Head; the society row lock makes concurrent removals safe. Heads cannot
 * remove themselves (owner: no self step-down; use handover). Admins may remove any Head.
 */
export async function removeHead(prisma: PrismaClient, actor: Actor, societyId: string, userId: string, now = new Date()): Promise<Result> {
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId, { lock: true });
    if (!context) return notFound;
    if (!context.allowed("heads.manage")) return forbidden;
    const grant = await tx.societyHeadGrant.findFirst({ where: { societyId, userId, revokedAt: null }, select: { id: true } });
    if (!grant) return notFound;
    if (userId === actor.userId && !actsAsPlatformAdmin(actor)) return invalidState("Heads cannot remove themselves. Hand over to an incoming Head instead.");
    if (context.society.isActive && (await activeHeadCount(tx, societyId)) <= 1) return invalidState(LAST_HEAD);
    await tx.societyHeadGrant.update({ where: { id: grant.id }, data: { revokedAt: now, revokedById: actor.userId, revokeReason: "REMOVED" } });
    await audit(tx, { actorId: actor.userId, action: "societies.head.removed", targetType: "society", targetId: societyId, details: { userId }, onBehalfOf: context.onBehalfOf });
    return ok(undefined);
  });
}

/**
 * Handover at the end of a tenure: the acting Head passes their seat to an incoming person who has
 * signed in at least once. Atomic: the incoming grant is created before the outgoing one is revoked,
 * inside one transaction holding the society lock, so management access is never interrupted.
 */
export async function handOver(prisma: PrismaClient, identity: IdentityPort, actor: Actor, societyId: string, raw: unknown, now = new Date()): Promise<Result> {
  const parsed = headEmailSchema.safeParse(raw);
  const incoming = parsed.success ? await identity.userByEmail(parsed.data.email) : null;
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId, { lock: true });
    if (!context) return notFound;
    // Handover passes the actor's OWN seat, so only a Head (of an active society) can do it.
    if (!context.isHead || !context.allowed("heads.manage")) return forbidden;
    if (!parsed.success) return invalid(fieldErrors(parsed.error));
    if (!incoming) return invalid({ email: NOT_SIGNED_IN });
    if (incoming.id === actor.userId) return invalid({ email: "Choose the incoming Head, not yourself." });
    const outgoing = await tx.societyHeadGrant.findFirstOrThrow({ where: { societyId, userId: actor.userId, revokedAt: null }, select: { id: true } });
    const alreadyHead = await tx.societyHeadGrant.findFirst({ where: { societyId, userId: incoming.id, revokedAt: null }, select: { id: true } });
    if (!alreadyHead) {
      await ensureMember(tx, societyId, incoming.id);
      await tx.societyHeadGrant.create({ data: { societyId, userId: incoming.id, grantedById: actor.userId, grantReason: "HANDOVER", grantedAt: now } });
    }
    await tx.societyHeadGrant.update({ where: { id: outgoing.id }, data: { revokedAt: now, revokedById: actor.userId, revokeReason: "HANDOVER" } });
    await audit(tx, {
      actorId: actor.userId,
      action: "societies.head.handed_over",
      targetType: "society",
      targetId: societyId,
      details: { from: actor.userId, to: incoming.id, incomingWasHead: alreadyHead !== null },
      onBehalfOf: context.onBehalfOf,
    });
    return ok(undefined);
  });
}

// ------------------------------------------------------------------------------------------------
// Following (owner decision 2026-10-24): open, no approval, grants nothing. Idempotent.
// ------------------------------------------------------------------------------------------------

export async function followSociety(prisma: PrismaClient, actor: Actor, societyId: string): Promise<Result> {
  const context = await loadContext(prisma, actor, societyId);
  if (!context) return notFound;
  if (!context.allowed("society.follow")) return invalidState("This society is inactive.");
  await prisma.societyFollow.upsert({ where: { societyId_userId: { societyId, userId: actor.userId } }, create: { societyId, userId: actor.userId }, update: {} });
  return ok(undefined);
}

/** Unfollowing always works, also for inactive societies. */
export async function unfollowSociety(prisma: PrismaClient, actor: Actor, societyId: string): Promise<Result> {
  if (!(await prisma.society.count({ where: { id: societyId } }))) return notFound;
  await prisma.societyFollow.deleteMany({ where: { societyId, userId: actor.userId } });
  return ok(undefined);
}

// ------------------------------------------------------------------------------------------------
// Membership (OI-10): students request; any Head decides. Display group and title grant nothing.
// ------------------------------------------------------------------------------------------------

export async function requestMembership(prisma: PrismaClient, actor: Actor, societyId: string, raw: unknown): Promise<Result<{ requestId: string }>> {
  const parsed = membershipRequestSchema.safeParse(raw ?? {});
  try {
    return await prisma.$transaction(async (tx) => {
      const context = await loadContext(tx, actor, societyId);
      if (!context) return notFound;
      if (context.isMember || context.isHead) return conflict("You are already a member of this society.");
      if (!context.allowed("society.requestMembership")) return invalidState("This society is inactive.");
      if (!parsed.success) return invalid(fieldErrors(parsed.error));
      const pending = await tx.societyMembershipRequest.findFirst({ where: { societyId, userId: actor.userId, status: "PENDING" }, select: { id: true } });
      if (pending) return conflict("Your request is already waiting for a Head's decision.");
      const message = parsed.data.message === undefined ? null : cleanPlainText(parsed.data.message) || null;
      const request = await tx.societyMembershipRequest.create({ data: { societyId, userId: actor.userId, message }, select: { id: true } });
      await audit(tx, { actorId: actor.userId, action: "societies.membership.requested", targetType: "society", targetId: societyId, details: { requestId: request.id } });
      return ok({ requestId: request.id });
    });
  } catch (error) {
    // The partial unique index allows one pending request; a concurrent duplicate lands here.
    if (isUniqueViolation(error)) return conflict("Your request is already waiting for a Head's decision.");
    throw error;
  }
}

/** The requester withdraws their own pending request. */
export async function cancelMembershipRequest(prisma: PrismaClient, actor: Actor, societyId: string): Promise<Result> {
  return prisma.$transaction(async (tx) => {
    if (!(await tx.society.count({ where: { id: societyId } }))) return notFound;
    const pending = await tx.societyMembershipRequest.findFirst({ where: { societyId, userId: actor.userId, status: "PENDING" }, select: { id: true } });
    if (!pending) return notFound;
    await tx.societyMembershipRequest.update({ where: { id: pending.id }, data: { status: "CANCELLED" } });
    await audit(tx, { actorId: actor.userId, action: "societies.membership.cancelled", targetType: "society", targetId: societyId, details: { requestId: pending.id } });
    return ok(undefined);
  });
}

/** Any Head approves (the student becomes a GENERAL member) or rejects a pending request. */
export async function decideMembershipRequest(prisma: PrismaClient, actor: Actor, societyId: string, requestId: string, raw: unknown, now = new Date()): Promise<Result> {
  const parsed = decideRequestSchema.safeParse(raw);
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId);
    if (!context) return notFound;
    if (!context.allowed("membership.decide")) return forbidden;
    if (!parsed.success) return invalid(fieldErrors(parsed.error));
    const request = await tx.societyMembershipRequest.findFirst({ where: { id: requestId, societyId }, select: { userId: true } });
    if (!request) return notFound;
    const approve = parsed.data.decision === "APPROVE";
    // Conditional update: a request is decided once, even if two decisions race.
    const decided = await tx.societyMembershipRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, decidedAt: now },
    });
    if (decided.count === 0) return invalidState("This request has already been decided or withdrawn.");
    if (approve) await tx.societyMembership.upsert({ where: { societyId_userId: { societyId, userId: request.userId } }, create: { societyId, userId: request.userId, group: "GENERAL" }, update: {} });
    await audit(tx, {
      actorId: actor.userId,
      action: approve ? "societies.membership.approved" : "societies.membership.rejected",
      targetType: "society",
      targetId: societyId,
      details: { requestId, userId: request.userId },
      onBehalfOf: context.onBehalfOf,
    });
    const society = await tx.society.findUniqueOrThrow({ where: { id: societyId }, select: { name: true, slug: true } });
    await notify(tx, { recipients: [request.userId], type: "society.membership.decided", payload: { approved: approve, societyName: society.name, societySlug: society.slug }, sourceKey: `membership:${requestId}:decided` });
    return ok(undefined);
  });
}

/** Any Head sets a member's display group and free-text title (ADR-0013 §3.2). Never grants anything. */
export async function updateMemberDisplay(prisma: PrismaClient, actor: Actor, societyId: string, userId: string, raw: unknown): Promise<Result> {
  const parsed = memberDisplaySchema.safeParse(raw);
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId);
    if (!context) return notFound;
    if (!context.allowed("membership.edit")) return forbidden;
    if (!parsed.success) return invalid(fieldErrors(parsed.error));
    const target = await tx.societyMembership.findUnique({ where: { societyId_userId: { societyId, userId } }, select: { group: true, position: true } });
    if (!target) return notFound;
    const position = parsed.data.position === undefined ? target.position : parsed.data.position?.trim() || null;
    const group = parsed.data.group ?? target.group;
    await tx.societyMembership.update({ where: { societyId_userId: { societyId, userId } }, data: { group, position } });
    await audit(tx, {
      actorId: actor.userId,
      action: "societies.member.display_changed",
      targetType: "society",
      targetId: societyId,
      details: { userId, group, positionSet: position !== null },
      onBehalfOf: context.onBehalfOf,
    });
    return ok(undefined);
  });
}

/** A Head removes a member, or a member leaves (userId = actor). Heads lose Head access first. */
export async function removeMember(prisma: PrismaClient, actor: Actor, societyId: string, userId: string): Promise<Result> {
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId);
    if (!context) return notFound;
    const leaving = userId === actor.userId;
    if (leaving) {
      if (!context.isMember) return notFound;
      if (!context.allowed("society.leave")) return invalidState("Heads cannot leave. Hand over to an incoming Head first.");
    } else if (!context.allowed("membership.remove")) {
      return forbidden;
    }
    const target = await tx.societyMembership.findUnique({ where: { societyId_userId: { societyId, userId } }, select: { group: true } });
    if (!target) return notFound;
    if (await tx.societyHeadGrant.findFirst({ where: { societyId, userId, revokedAt: null }, select: { id: true } })) {
      return invalidState("This person is a Head. Remove their Head access before removing their membership.");
    }
    await tx.societyMembership.delete({ where: { societyId_userId: { societyId, userId } } });
    await audit(tx, {
      actorId: actor.userId,
      action: leaving ? "societies.member.left" : "societies.member.removed",
      targetType: "society",
      targetId: societyId,
      details: { userId, group: target.group },
      onBehalfOf: leaving ? undefined : context.onBehalfOf,
    });
    return ok(undefined);
  });
}

// ------------------------------------------------------------------------------------------------
// Faculty associations (ADR-0013 §3.5): admin-visible only until an admin reviews them.
// ------------------------------------------------------------------------------------------------

export async function reviewFacultyAssociation(prisma: PrismaClient, actor: Actor, societyId: string, associationId: string, raw: unknown, now = new Date()): Promise<Result> {
  const parsed = facultyReviewSchema.safeParse(raw);
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId);
    if (!context) return notFound;
    if (!context.allowed("faculty.review")) return forbidden;
    if (!parsed.success) return invalid(fieldErrors(parsed.error));
    const updated = await tx.societyFacultyAssociation.updateMany({
      where: { id: associationId, societyId },
      data: parsed.data.verified ? { verifiedAt: now, verifiedById: actor.userId } : { verifiedAt: null, verifiedById: null },
    });
    if (updated.count === 0) return notFound;
    await audit(tx, { actorId: actor.userId, action: "societies.faculty.reviewed", targetType: "society", targetId: societyId, details: { associationId, verified: parsed.data.verified } });
    return ok(undefined);
  });
}

// ------------------------------------------------------------------------------------------------
// Posts (FR-SOC-3, OI-11): any Head; shown publicly as the society; audited on behalf of it.
// ------------------------------------------------------------------------------------------------

interface PreparedPost {
  title: string | null;
  body: string;
  visibility: "PUBLIC" | "MEMBERS";
  recruitment: RecruitmentInput | null;
}

/** Validates type-specific rules and sanitises the body. */
async function preparePost(
  identity: IdentityPort,
  type: "UPDATE" | "RECRUITMENT" | "STORY",
  input: { title?: string; body: string; visibility: "PUBLIC" | "MEMBERS"; recruitment?: RecruitmentInput },
  publishing: boolean,
  now: Date,
): Promise<PreparedPost | { fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  if (type === "STORY") {
    const text = cleanPlainText(input.body);
    if (input.title !== undefined) fields.title = "Stories have no title.";
    if (input.visibility !== "PUBLIC") fields.visibility = "Stories are always public.";
    if (input.recruitment !== undefined) fields.recruitment = "Stories have no recruitment details.";
    if (text.length === 0) fields.body = "Write the story.";
    else if (text.length > STORY_MAX) fields.body = `Use at most ${STORY_MAX} characters.`;
    return Object.keys(fields).length > 0 ? { fields } : { title: null, body: text, visibility: "PUBLIC", recruitment: null };
  }

  const body = sanitizeRichText(input.body);
  const plainLength = htmlToPlainText(body).length;
  if (input.title === undefined) fields.title = "Add a title.";
  if (plainLength === 0) fields.body = "Write the post.";
  else if (plainLength > POST_BODY_MAX) fields.body = `Use at most ${POST_BODY_MAX} characters.`;
  if (type === "RECRUITMENT") {
    if (!input.recruitment) fields.rolesSought = "List at least one role.";
    else {
      const known = new Set((await identity.activeBranches()).map((branch) => branch.code));
      if (input.recruitment.eligibleBranchCodes.some((code) => !known.has(code))) fields.eligibleBranchCodes = "Choose branches from the list.";
      if (publishing && input.recruitment.deadline && new Date(input.recruitment.deadline) <= now) fields.deadline = "The deadline must be in the future.";
    }
  } else if (input.recruitment !== undefined) {
    fields.recruitment = "Only recruitment posts have recruitment details.";
  }
  if (Object.keys(fields).length > 0) return { fields };
  return { title: input.title ?? null, body, visibility: input.visibility, recruitment: type === "RECRUITMENT" ? (input.recruitment ?? null) : null };
}

const recruitmentColumns = (recruitment: RecruitmentInput | null) => ({
  rolesSought: recruitment?.rolesSought ?? [],
  eligibleYears: recruitment?.eligibleYears ?? [],
  eligibleBranchCodes: recruitment?.eligibleBranchCodes ?? [],
  deadline: recruitment?.deadline ? new Date(recruitment.deadline) : null,
  applicationUrl: recruitment?.applicationUrl ?? null,
});

/** Any Head creates posts (drafts or published); stories publish at once for 24 hours. */
export async function createPost(prisma: PrismaClient, identity: IdentityPort, actor: Actor, societyId: string, raw: unknown, now = new Date()): Promise<Result<{ id: string }>> {
  const parsed = createPostSchema.safeParse(raw);
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId);
    if (!context) return notFound;
    if (!context.allowed("posts.create")) return forbidden;
    if (!parsed.success) return invalid(fieldErrors(parsed.error));
    const input = parsed.data;
    const publish = input.type === "STORY" ? true : input.publish;
    const prepared = await preparePost(identity, input.type, input, publish, now);
    if ("fields" in prepared) return invalid(prepared.fields);
    const post = await tx.societyPost.create({
      data: {
        societyId,
        authorId: actor.userId,
        type: input.type,
        visibility: prepared.visibility,
        title: prepared.title,
        body: prepared.body,
        ...recruitmentColumns(prepared.recruitment),
        publishedAt: publish ? now : null,
        expiresAt: input.type === "STORY" ? new Date(now.getTime() + STORY_LIFETIME_MS) : null,
      },
      select: { id: true },
    });
    await audit(tx, {
      actorId: actor.userId,
      action: publish ? "societies.post.published" : "societies.post.drafted",
      targetType: "society_post",
      targetId: post.id,
      details: { societyId, type: input.type },
      onBehalfOf: context.onBehalfOf,
    });
    return ok(post);
  });
}

/** Any Head edits updates and recruitment posts, and publishes drafts. Stories cannot be edited. */
export async function updatePost(prisma: PrismaClient, identity: IdentityPort, actor: Actor, societyId: string, postId: string, raw: unknown, now = new Date()): Promise<Result> {
  const parsed = updatePostSchema.safeParse(raw);
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId);
    if (!context) return notFound;
    const post = await tx.societyPost.findFirst({ where: { id: postId, societyId }, select: { type: true, publishedAt: true, visibility: true } });
    // Drafts and members-only posts are not revealed to people who cannot see them.
    const visible = post && (post.publishedAt !== null || context.allowed("posts.viewDrafts")) && (post.visibility === "PUBLIC" || context.allowed("posts.viewMembersOnly"));
    if (!post || !visible) return notFound;
    if (!context.allowed("posts.edit")) return forbidden;
    if (post.type === "STORY") return invalidState("Stories cannot be edited. Delete it and post a new one.");
    if (!parsed.success) return invalid(fieldErrors(parsed.error));
    const publishing = post.publishedAt === null && parsed.data.publish;
    // The future-deadline rule applies when a post is published, so old posts stay editable.
    const prepared = await preparePost(identity, post.type, parsed.data, publishing, now);
    if ("fields" in prepared) return invalid(prepared.fields);
    await tx.societyPost.update({
      where: { id: postId },
      data: {
        title: prepared.title,
        body: prepared.body,
        visibility: prepared.visibility,
        ...recruitmentColumns(prepared.recruitment),
        // Published posts stay published; a draft is published when asked.
        ...(publishing ? { publishedAt: now } : {}),
      },
    });
    await audit(tx, {
      actorId: actor.userId,
      action: publishing ? "societies.post.published" : "societies.post.updated",
      targetType: "society_post",
      targetId: postId,
      details: { societyId },
      onBehalfOf: context.onBehalfOf,
    });
    return ok(undefined);
  });
}

/** Any Head deletes posts (also after deactivation). Audited, because content disappears. */
export async function deletePost(prisma: PrismaClient, actor: Actor, societyId: string, postId: string): Promise<Result> {
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, actor, societyId);
    if (!context) return notFound;
    const post = await tx.societyPost.findFirst({ where: { id: postId, societyId }, select: { type: true, authorId: true, publishedAt: true, visibility: true } });
    const visible = post && (post.publishedAt !== null || context.allowed("posts.viewDrafts")) && (post.visibility === "PUBLIC" || context.allowed("posts.viewMembersOnly"));
    if (!post || !visible) return notFound;
    if (!context.allowed("posts.delete")) return forbidden;
    await tx.societyPost.delete({ where: { id: postId } });
    await audit(tx, {
      actorId: actor.userId,
      action: "societies.post.deleted",
      targetType: "society_post",
      targetId: postId,
      details: { societyId, type: post.type, authorId: post.authorId },
      onBehalfOf: context.onBehalfOf,
    });
    return ok(undefined);
  });
}

// ------------------------------------------------------------------------------------------------
// Cross-module contract (ADR-0013 §3.7), used by Events in Slice 2b.
// ------------------------------------------------------------------------------------------------

/** The society, when `userId` holds an active Head grant for an active society; otherwise null. */
export async function getSocietyActor(db: Db, userId: string, societyId: string): Promise<{ id: string; slug: string; name: string } | null> {
  const grant = await db.societyHeadGrant.findFirst({
    where: { societyId, userId, revokedAt: null, society: { isActive: true } },
    select: { society: { select: { id: true, slug: true, name: true } } },
  });
  return grant?.society ?? null;
}
