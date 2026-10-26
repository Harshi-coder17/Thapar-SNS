import "server-only";

// Public interface of the societies module (docs/architecture/modules.md). Other code imports only
// from this file. Pages read through the query functions below with the signed-in actor; every
// change goes through the API route handlers (societiesApi), which re-check permissions per row
// on every request (ADR-0013: active Head grants; display groups and titles grant nothing).
import { audit } from "@/modules/admin";
import { ownedAssetFor } from "@/modules/assets";
import { apiRateLimiter, appBaseURL, clientAddress, type CurrentSession, getCurrentSession, profileOptions, userByEmail, userSummaries } from "@/modules/identity";
import { getDb } from "@/shared/db/client";

import { societiesHandlers } from "./http";
import * as importer from "./import";
import { can } from "./permissions";
import * as queries from "./queries";
import { type Actor, getSocietyActor as findSocietyActor, type IdentityPort } from "./service";

export type { Actor } from "./service";
export type { SocietyAction } from "./permissions";
export type {
  CategoryOption,
  DirectoryFilters,
  DisplayedPerson,
  FacultyAssociationView,
  HeadView,
  MemberGroup,
  MemberView,
  PostPage,
  PostView,
  RequestView,
  SocietyCard,
  SocietyDetail,
} from "./queries";
export type { SocialLinks } from "./schemas";
export { DESCRIPTION_MAX, MAX_INITIAL_HEADS, MAX_ROLES_SOUGHT, NAME_MAX, POSITION_MAX, POST_BODY_MAX, POST_TITLE_MAX, REQUEST_MESSAGE_MAX, SHORT_NAME_MAX, STORY_MAX } from "./schemas";

const identityPort: IdentityPort = {
  userByEmail,
  userSummaries,
  activeBranches: async () => (await profileOptions()).branches,
};

/** The actor for society reads, from the signed-in session. */
export const actorOf = (session: CurrentSession): Actor => ({ userId: session.user.id, globalRole: session.user.role });

export const societyCategories = () => queries.listCategories(getDb());
export const activeBranches = identityPort.activeBranches;
export const listSocieties = (actor: Actor, filters: queries.DirectoryFilters) => queries.listSocieties(getDb(), actor, filters);
export const listOfficialAwaitingHead = (actor: Actor, filters: Pick<queries.DirectoryFilters, "q" | "category">) => queries.listOfficialAwaitingHead(getDb(), actor, filters);
export const getSociety = (actor: Actor, slug: string) => queries.getSocietyBySlug(getDb(), identityPort, actor, slug);
export const listSocietyPosts = (actor: Actor, society: queries.SocietyDetail, options?: { type?: "UPDATE" | "RECRUITMENT"; cursor?: string }) =>
  queries.listSocietyPosts(getDb(), identityPort, actor, society, options);
export const listSocietyStories = (actor: Actor, society: queries.SocietyDetail) => queries.listActiveStories(getDb(), identityPort, actor, { society });
export const listFeedStories = (actor: Actor) => queries.listActiveStories(getDb(), identityPort, actor, "feed");
export const getSocietyPost = (actor: Actor, society: queries.SocietyDetail, postId: string) => queries.getPost(getDb(), identityPort, actor, society, postId);
export const listFeed = (actor: Actor, cursor?: string) => queries.listFeed(getDb(), identityPort, actor, { cursor });
export const listSocietyMembers = (society: queries.SocietyDetail) => queries.listMembers(getDb(), identityPort, society);
export const listSocietyHeads = (society: queries.SocietyDetail) => queries.listHeads(getDb(), identityPort, society);
export const listMembershipRequests = (society: queries.SocietyDetail) => queries.listPendingRequests(getDb(), identityPort, society);
/** Societies the user is an active Head of: the workspace switcher's entries. */
export const listManagedSocieties = (userId: string) => queries.listManagedSocieties(getDb(), userId);
/** True when the actor may create societies (platform admins; FR-SOC-1). */
export const canCreateSociety = (actor: Actor) => can({ platformAdmin: actor.globalRole === "ADMIN", isHead: false, isMember: false, societyActive: true }, "society.create");

/**
 * Scheduled job (FR-SOC-3, background-jobs.md §6): deletes stories that expired more than `graceMs`
 * ago. Readers never see them anyway (query-time filter); this only removes the rows. Idempotent.
 */
export async function deleteExpiredStories(now = new Date(), graceMs = 60 * 60 * 1000): Promise<number> {
  return getDb().$transaction(async (tx) => {
    const { count } = await tx.societyPost.deleteMany({ where: { type: "STORY", expiresAt: { lte: new Date(now.getTime() - graceMs) } } });
    if (count) await audit(tx, { actorId: null, action: "societies.story.expired_deleted", targetType: "society_post", details: { count } });
    return count;
  });
}

/** UCD-2: the active societies a user belongs to, with their display title (public information). */
export async function membershipsOf(userId: string): Promise<{ slug: string; name: string; position: string | null; isHead: boolean }[]> {
  const rows = await getDb().societyMembership.findMany({ where: { userId, society: { isActive: true } }, orderBy: { society: { name: "asc" } }, select: { position: true, society: { select: { slug: true, name: true, headGrants: { where: { userId, revokedAt: null }, select: { id: true } } } } } });
  return rows.map((r) => ({ slug: r.society.slug, name: r.society.name, position: r.position, isHead: r.society.headGrants.length > 0 }));
}

/** Admin dashboard counts (Slice 5). */
export async function societyCounts(): Promise<{ active: number; inactive: number; awaitingHead: number; follows: number; memberships: number }> {
  const db = getDb();
  const [active, inactive, awaitingHead, follows, memberships] = await Promise.all([
    db.society.count({ where: { isActive: true } }),
    db.society.count({ where: { isActive: false } }),
    db.society.count({ where: { isActive: false, headGrants: { none: { revokedAt: null } } } }),
    db.societyFollow.count(),
    db.societyMembership.count(),
  ]);
  return { active, inactive, awaitingHead, follows, memberships };
}

/** Moderation (Slice 5): does the post exist and is it visible to the reporter? Removal deletes it (no hidden state for posts). */
export const moderationPost = {
  exists: async (postId: string) => (await getDb().societyPost.findFirst({ where: { id: postId, publishedAt: { not: null } }, select: { id: true } })) !== null,
  remove: async (postId: string) => (await getDb().societyPost.deleteMany({ where: { id: postId } })).count === 1,
  preview: async (postId: string) => {
    const post = await getDb().societyPost.findUnique({ where: { id: postId }, select: { title: true, body: true } });
    return post ? (post.title ?? post.body.replace(/<[^>]+>/g, " ").slice(0, 200)) : null;
  },
};

/** Societies (active, or official listings awaiting a Head) a faculty-directory profile is associated with (FR-FAC-1). */
export async function societiesForFacultyProfile(profileId: string): Promise<{ slug: string; name: string; role: string }[]> {
  const rows = await getDb().societyFacultyAssociation.findMany({ where: { facultyProfileId: profileId, society: { OR: [{ isActive: true }, { sourceKey: { not: null } }] } }, orderBy: { society: { name: "asc" } }, select: { sourceRole: true, society: { select: { slug: true, name: true } } } });
  return rows.map((r) => ({ slug: r.society.slug, name: r.society.name, role: r.sourceRole }));
}
/**
 * Cross-module contract (ADR-0013 §3.7), for Events in Slice 2b: the society when `userId` holds an
 * active Head grant for that active society, otherwise null. Callers must use it on every request.
 */
export const getSocietyActor = (userId: string, societyId: string) => findSocietyActor(getDb(), userId, societyId);

/** Display labels for membership display groups (organisational only, never permissions). */
export const MEMBER_GROUP_LABELS: Record<queries.MemberGroup, string> = { CORE: "Core member", GENERAL: "General member" };

/** Route handlers for /api/societies/* (docs/api/societies.md). */
export function societiesApi() {
  return societiesHandlers({
    prisma: getDb(),
    baseURL: appBaseURL(),
    identity: identityPort,
    readSession: getCurrentSession,
    limiter: apiRateLimiter(),
    clientAddress,
    ownedAsset: (userId, assetId, purpose) => ownedAssetFor(userId, assetId, purpose),
  });
}

/** Import tool entry points (scripts/imports; ADR-0013 §5). */
export type { DatasetRecord, SocietyImportReport } from "./import";
export const societyImport = {
  run: (records: importer.DatasetRecord[], options: { apply: boolean; fetchedAt: Date; linkTargets: { id: string; email: string | null; profileUrl: string | null }[] }) => importer.importSocieties(getDb(), records, options),
  needingLogo: (keys: string[]) => importer.societiesNeedingLogo(getDb(), keys),
  attachLogo: (societyId: string, assetId: string, sourceUrl: string) => importer.attachImportedLogo(getDb(), societyId, assetId, sourceUrl),
  categories: (records: importer.DatasetRecord[], options: { apply: boolean }) => importer.applySourceCategories(getDb(), records, options),
};
