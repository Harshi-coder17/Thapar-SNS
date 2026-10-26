import "server-only";

// Faculty directory (Slice 4b: FR-FAC-1..3, ADR-0010). Profiles are seeded from the official Thapar
// faculty pages (scripts/faculty-import); nothing is invented. Search combines full-text (tsvector)
// with trigram similarity on the name for typo tolerance (FR-FAC-2). Claims need admin approval; on
// approval the profile is linked and verified, the role becomes FACULTY and sessions are revoked, in
// one transaction with the audit entry and the notification.
import { audit } from "@/modules/admin";
import { apiDeps, setUserRole } from "@/modules/identity";
import { notify } from "@/modules/notifications";
import { societiesForFacultyProfile } from "@/modules/societies";
import { nudge } from "@/modules/outbox";
import { getDb, type PrismaClient } from "@/shared/db/client";
import { type ApiActor, conflict, forbidden, invalid, invalidState, notFound, ok, RATE, runAction, type ServiceResult } from "@/shared/http/api-action";
import { cleanPlainText } from "@/shared/security/sanitize-html";
import { z } from "zod";

import * as importer from "./import";
import { isSeniorLeadership, leadershipRank } from "./leadership";

export interface FacultyCard {
  id: string;
  name: string;
  department: string;
  designation: string;
  email: string | null;
  specialization: string | null;
  photoAssetId: string | null;
  isVerified: boolean;
}

export interface FacultyDetail extends FacultyCard {
  cabin: string | null;
  officeHours: string | null;
  profileUrl: string | null;
  sourceUrl: string;
  sourceFetchedAt: Date | null;
  claimedByMe: boolean;
  myPendingClaim: boolean;
  /** The viewer already has a linked faculty profile, or a pending claim on another profile. */
  viewerCannotClaim: boolean;
  hasPendingClaim: boolean;
  /** ADR-0010 §5: only the linked faculty member may edit the allow-listed fields. */
  canEdit: boolean;
  societies: { slug: string; name: string; role: string }[];
}

const cardSelect = { id: true, name: true, department: true, designation: true, email: true, specialization: true, photoAssetId: true, isVerified: true, photoAsset: { select: { status: true } } } as const;

const toCard = (r: { id: string; name: string; department: string; designation: string; email: string | null; specialization: string | null; photoAssetId: string | null; isVerified: boolean; photoAsset: { status: string } | null }): FacultyCard => ({
  id: r.id,
  name: r.name,
  department: r.department,
  designation: r.designation,
  email: r.email,
  specialization: r.specialization,
  photoAssetId: r.photoAsset?.status === "APPROVED" ? r.photoAssetId : null,
  isVerified: r.isVerified,
});

/** FR-FAC-1/2: search by name, department, designation or specialization, tolerant of typos in names. */
export const FACULTY_PAGE_SIZE = 48;

export async function searchFaculty(prisma: PrismaClient, filters: { q?: string; department?: string; page?: number }): Promise<{ items: FacultyCard[]; total: number; page: number; pages: number }> {
  const q = filters.q?.trim().slice(0, 100) ?? "";
  const department = filters.department?.trim() || undefined;
  const requested = Math.max(1, Math.floor(filters.page ?? 1));
  if (!q) {
    const where = department ? { department } : {};
    const total = await prisma.facultyProfile.count({ where });
    const pages = Math.max(1, Math.ceil(total / FACULTY_PAGE_SIZE));
    const page = Math.min(requested, pages);
    // Official order (owner 2026-10-25): the unit's position on thapar.edu/faculties, then the person's
    // position on that unit's page (head first, then by seniority).
    const rows = await prisma.facultyProfile.findMany({ where, orderBy: [{ unitOrder: { sort: "asc", nulls: "last" } }, { listingOrder: { sort: "asc", nulls: "last" } }, { name: "asc" }, { id: "asc" }], skip: (page - 1) * FACULTY_PAGE_SIZE, take: FACULTY_PAGE_SIZE, select: cardSelect });
    return { items: rows.map(toCard), total, page, pages };
  }
  const ranked = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM (
      SELECT "id",
             ts_rank(to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("department", '') || ' ' || coalesce("designation", '') || ' ' || coalesce("specialization", '')), plainto_tsquery('simple', ${q})) AS rank,
             similarity(lower("name"), lower(${q})) AS sim,
             to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("department", '') || ' ' || coalesce("designation", '') || ' ' || coalesce("specialization", '')) @@ plainto_tsquery('simple', ${q}) AS hit,
             word_similarity(lower(${q}), lower("name")) AS wsim
        FROM "faculty_profiles"
       WHERE (${department ?? null}::text IS NULL OR "department" = ${department ?? null})
    ) s
    WHERE hit OR sim > 0.2 OR wsim > 0.5
    ORDER BY hit DESC, rank DESC, greatest(sim, wsim) DESC, "id"
    LIMIT 100`;
  const total = ranked.length;
  const pages = Math.max(1, Math.ceil(total / FACULTY_PAGE_SIZE));
  const page = Math.min(requested, pages);
  const slice = ranked.slice((page - 1) * FACULTY_PAGE_SIZE, page * FACULTY_PAGE_SIZE);
  const order = new Map(slice.map((r, i) => [r.id, i]));
  const rows = await prisma.facultyProfile.findMany({ where: { id: { in: slice.map((r) => r.id) } }, select: cardSelect });
  return { items: rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(toCard), total, page, pages };
}

/** Schools, departments and centres in the order of thapar.edu/faculties, with their head count. */
export async function departments(prisma: PrismaClient): Promise<{ name: string; count: number }[]> {
  const rows = await prisma.facultyProfile.groupBy({ by: ["department"], _count: { _all: true }, _min: { unitOrder: true } });
  return rows
    .sort((a, b) => (a._min.unitOrder ?? 9999) - (b._min.unitOrder ?? 9999) || a.department.localeCompare(b.department))
    .map((r) => ({ name: r.department, count: r._count._all }));
}

export interface LeaderCard extends FacultyCard {
  rank: number;
}

/** University leadership from official designations (deans first; presentation only, never a permission). */
export async function leadership(prisma: PrismaClient): Promise<{ senior: LeaderCard[]; associateDeans: LeaderCard[] }> {
  const rows = await prisma.facultyProfile.findMany({
    where: { OR: ["dean", "vice-chancellor", "vice chancellor", "doaa", "dosa", "dofa", "adofa", "controller of examinations", "chief technology officer"].map((t) => ({ designation: { contains: t, mode: "insensitive" as const } })) },
    select: { ...cardSelect, unitOrder: true, listingOrder: true },
  });
  const ranked = rows
    .map((r) => ({ row: r, rank: leadershipRank(r.designation) }))
    .filter((x): x is { row: (typeof rows)[number]; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || (a.row.unitOrder ?? 9999) - (b.row.unitOrder ?? 9999) || (a.row.listingOrder ?? 9999) - (b.row.listingOrder ?? 9999))
    .map((x) => ({ ...toCard(x.row), rank: x.rank }));
  return { senior: ranked.filter((c) => isSeniorLeadership(c.rank)), associateDeans: ranked.filter((c) => !isSeniorLeadership(c.rank)) };
}

export async function getFaculty(prisma: PrismaClient, userId: string, id: string): Promise<FacultyDetail | null> {
  const r = await prisma.facultyProfile.findUnique({
    where: { id },
    select: {
      ...cardSelect,
      cabin: true,
      officeHours: true,
      profileUrl: true,
      sourceUrl: true,
      sourceFetchedAt: true,
      userId: true,
      claims: { where: { status: "PENDING" }, select: { claimantId: true } },
    },
  });
  if (!r) return null;
  const [viewerLink, viewerPending] = await Promise.all([
    prisma.facultyProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.facultyClaim.findFirst({ where: { claimantId: userId, status: "PENDING", profileId: { not: id } }, select: { id: true } }),
  ]);
  return {
    ...toCard(r),
    cabin: r.cabin,
    officeHours: r.officeHours,
    profileUrl: r.profileUrl,
    sourceUrl: r.sourceUrl,
    sourceFetchedAt: r.sourceFetchedAt,
    claimedByMe: r.userId === userId,
    myPendingClaim: r.claims.some((c) => c.claimantId === userId),
    viewerCannotClaim: Boolean(viewerLink || viewerPending),
    hasPendingClaim: r.claims.length > 0,
    canEdit: r.userId === userId,
    societies: await societiesForFacultyProfile(id),
  };
}

const claimSchema = z.object({ message: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(500).optional()) }).strict();
const decideSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().min(3, "Give a short reason.").max(300) }).strict();
const revokeSchema = z.object({ reason: z.string().trim().min(3, "Give a short reason.").max(300) }).strict();
const editSchema = z
  .object({
    cabin: z.string().trim().max(100).nullable(),
    officeHours: z.string().trim().max(300).nullable(),
    specialization: z.string().trim().max(500).nullable(),
  })
  .strict();

const fieldErrors = (error: z.ZodError) => {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return fields;
};
const isUniqueViolation = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

/** ADR-0010 §1: request a claim on an unclaimed profile (one pending claim per profile, DB-enforced). */
export async function requestClaim(prisma: PrismaClient, actor: ApiActor, profileId: string, raw: unknown): Promise<ServiceResult<{ id: string }>> {
  if (actor.capacity !== "personal") return forbidden;
  const parsed = claimSchema.safeParse(raw ?? {});
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const profile = await prisma.facultyProfile.findUnique({ where: { id: profileId }, select: { userId: true } });
  if (!profile) return notFound;
  if (profile.userId) return invalidState("This profile has already been claimed.");
  if (await prisma.facultyProfile.findUnique({ where: { userId: actor.userId }, select: { id: true } })) return invalidState("Your account is already linked to a faculty profile.");
  // One claim waiting per account (also a unique index), so no account can hold claims on many profiles.
  if (await prisma.facultyClaim.findFirst({ where: { claimantId: actor.userId, status: "PENDING" }, select: { id: true } })) return conflict("You already have a claim waiting for review. Wait for the decision before claiming another profile.");
  try {
    const claim = await prisma.$transaction(async (tx) => {
      const created = await tx.facultyClaim.create({ data: { profileId, claimantId: actor.userId, message: parsed.data.message ? cleanPlainText(parsed.data.message) : null }, select: { id: true } });
      await audit(tx, { actorId: actor.userId, action: "faculty.claim.requested", targetType: "faculty_profile", targetId: profileId });
      return created;
    });
    return ok(claim);
  } catch (error) {
    // Either unique index: this profile already has a pending claim, or this account just made one.
    if (isUniqueViolation(error)) return conflict("A claim for this profile, or another claim of yours, is already waiting for review.");
    throw error;
  }
}

/** ADR-0010 §2 and §3: admin decision (platform capacity), atomic with role, audit and notification. */
export async function decideClaim(prisma: PrismaClient, actor: ApiActor, claimId: string, raw: unknown, now = new Date()): Promise<ServiceResult> {
  if (actor.capacity !== "platform") return forbidden;
  const parsed = decideSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    const claim = await tx.facultyClaim.findUnique({ where: { id: claimId }, select: { id: true, status: true, profileId: true, claimantId: true } });
    if (!claim) return notFound;
    if (claim.status !== "PENDING") return invalidState("This claim has already been decided.");
    // Never decide one's own claim.
    if (claim.claimantId === actor.userId) return forbidden;
    const approve = parsed.data.decision === "APPROVE";
    if (approve) {
      const linked = await tx.facultyProfile.updateMany({ where: { id: claim.profileId, userId: null }, data: { userId: claim.claimantId, isVerified: true } });
      if (linked.count === 0) return invalidState("This profile has already been claimed.");
      const role = await setUserRole(tx, claim.claimantId, "FACULTY");
      if (!role) return notFound;
      // Keep an ADMIN's role: faculty verification must not demote an administrator.
      if (role.previous === "ADMIN") await setUserRole(tx, claim.claimantId, "ADMIN");
    }
    await tx.facultyClaim.update({ where: { id: claimId }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, reason: parsed.data.reason, decidedAt: now } });
    await audit(tx, { actorId: actor.userId, action: approve ? "faculty.claim.approved" : "faculty.claim.rejected", targetType: "faculty_claim", targetId: claimId, details: { profileId: claim.profileId, claimantId: claim.claimantId } });
    await notify(tx, { recipients: [claim.claimantId], type: "faculty.claim.decided", payload: { profileId: claim.profileId, approved: approve, reason: approve ? null : parsed.data.reason }, sourceKey: `faculty.claim:${claimId}:decided` });
    return ok(undefined);
  });
}

/** ADR-0010 §4: revoke an approved claim (unlink, unverify, role back to STUDENT unless ADMIN). */
export async function revokeClaim(prisma: PrismaClient, actor: ApiActor, profileId: string, raw: unknown, now = new Date()): Promise<ServiceResult> {
  if (actor.capacity !== "platform") return forbidden;
  const parsed = revokeSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    const profile = await tx.facultyProfile.findUnique({ where: { id: profileId }, select: { userId: true } });
    if (!profile) return notFound;
    if (!profile.userId) return invalidState("This profile is not claimed.");
    await tx.facultyProfile.update({ where: { id: profileId }, data: { userId: null, isVerified: false } });
    await tx.facultyClaim.updateMany({ where: { profileId, claimantId: profile.userId, status: "APPROVED" }, data: { status: "REVOKED", decidedById: actor.userId, reason: parsed.data.reason, decidedAt: now } });
    const role = await setUserRole(tx, profile.userId, "STUDENT");
    if (role?.previous === "ADMIN") await setUserRole(tx, profile.userId, "ADMIN");
    await audit(tx, { actorId: actor.userId, action: "faculty.claim.revoked", targetType: "faculty_profile", targetId: profileId, details: { userId: profile.userId } });
    return ok(undefined);
  });
}

/** ADR-0010 §5: the linked faculty member edits office hours, cabin and specialization (audited). */
export async function editOwnProfile(prisma: PrismaClient, actor: ApiActor, profileId: string, raw: unknown): Promise<ServiceResult> {
  if (actor.capacity !== "personal") return forbidden;
  const parsed = editSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    const profile = await tx.facultyProfile.findUnique({ where: { id: profileId }, select: { userId: true } });
    if (!profile) return notFound;
    if (profile.userId !== actor.userId) return forbidden;
    const clean = (v: string | null) => (v ? cleanPlainText(v) || null : null);
    await tx.facultyProfile.update({ where: { id: profileId }, data: { cabin: clean(parsed.data.cabin), officeHours: clean(parsed.data.officeHours), specialization: clean(parsed.data.specialization) } });
    await audit(tx, { actorId: actor.userId, action: "faculty.profile.edited", targetType: "faculty_profile", targetId: profileId, details: { fields: "cabin,officeHours,specialization" } });
    return ok(undefined);
  });
}

export interface ClaimRow {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  profile: { id: string; name: string; department: string; email: string | null };
  claimant: { id: string; name: string; email: string };
  /** ADR-0010 §2: a hint only; approval is still required. */
  emailMatches: boolean;
  message: string | null;
  reason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

/** Admin claims queue (pending first). */
export async function listClaims(prisma: PrismaClient, status?: "PENDING"): Promise<ClaimRow[]> {
  const rows = await prisma.facultyClaim.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
    select: { id: true, status: true, message: true, reason: true, createdAt: true, decidedAt: true, profile: { select: { id: true, name: true, department: true, email: true } }, claimant: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => ({ ...r, emailMatches: !!r.profile.email && r.profile.email.toLowerCase() === r.claimant.email.toLowerCase() }));
}

// Wiring.
export const faculty = {
  search: (filters: { q?: string; department?: string; page?: number }) => searchFaculty(getDb(), filters),
  departments: () => departments(getDb()),
  leadership: () => leadership(getDb()),
  get: (userId: string, id: string) => getFaculty(getDb(), userId, id),
  claims: (status?: "PENDING") => listClaims(getDb(), status),
  pendingClaimCount: () => getDb().facultyClaim.count({ where: { status: "PENDING" } }),
  count: () => getDb().facultyProfile.count(),
};

export const facultyApi = {
  claim: (request: Request, id: string) =>
    runAction(apiDeps(), request, { name: "faculty:claim", rules: RATE.create, ids: [id], body: true, status: 201, run: (actor, body) => requestClaim(getDb(), actor, id, body), output: (v) => ({ claim: v }) }),
  decide: async (request: Request, claimId: string) => {
    const response = await runAction(apiDeps(), request, { name: "faculty:decide", rules: RATE.admin, ids: [claimId], body: true, capacity: "platform", run: (actor, body) => decideClaim(getDb(), actor, claimId, body) });
    if (response.ok) await nudge();
    return response;
  },
  revoke: (request: Request, id: string) =>
    runAction(apiDeps(), request, { name: "faculty:revoke", rules: RATE.admin, ids: [id], body: true, capacity: "platform", run: (actor, body) => revokeClaim(getDb(), actor, id, body) }),
  edit: (request: Request, id: string) => runAction(apiDeps(), request, { name: "faculty:edit", rules: RATE.write, ids: [id], body: true, run: (actor, body) => editOwnProfile(getDb(), actor, id, body) }),
};

// Import tool entry points (scripts/imports).
export type { FacultyImportReport, FacultyRecord } from "./import";
export const facultyImport = {
  run: (records: importer.FacultyRecord[], options: { apply: boolean; fetchedAt: Date }) => importer.importFacultyDirectory(getDb(), records, options),
  order: (records: importer.FacultyRecord[], options: { apply: boolean }) => importer.applyOfficialOrder(getDb(), records, options),
  withoutPhoto: (keys: string[]) => importer.profilesWithoutPhoto(getDb(), keys),
  attachPhoto: (profileId: string, assetId: string, sourceUrl: string) => importer.attachImportedPhoto(getDb(), profileId, assetId, sourceUrl),
  linkTargets: () => importer.profilesForLinking(getDb()),
};
