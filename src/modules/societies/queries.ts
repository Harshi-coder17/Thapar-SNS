import "server-only";

// Society Hub reads for server-rendered pages (FR-SOC-3, FR-SOC-4, UCD-3; ADR-0013). Visibility
// rules are applied in the queries themselves:
// - drafts only for the society's Heads; members-only posts only for members and Heads;
// - stories only until they expire (FR-SOC-3);
// - inactive societies hidden from the directory but readable by direct link (OI-38);
// - content is presented as the society: the individual author is included only for the society's
//   Heads and platform admins (posts.viewAuthor);
// - faculty associations: verified ones for everyone, unverified ones for platform admins only.
import type { Prisma, PrismaClient } from "@/shared/db/client";
import { htmlToPlainText, sanitizeRichText } from "@/shared/security/sanitize-html";

import { sourceLabel } from "./source-categories";

import { can, SOCIETY_ACTIONS, type SocietyAction, type SocietyActorFacts } from "./permissions";
import type { SocialLinks } from "./schemas";
import type { Actor, IdentityPort } from "./service";

export const POSTS_PAGE_SIZE = 20;
const EXCERPT_LENGTH = 220;

export type MemberGroup = "CORE" | "GENERAL";

export interface CategoryOption {
  slug: string;
  label: string;
}

export interface SocietyCard {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  /** Null when the society has not provided a description. */
  excerpt: string | null;
  category: CategoryOption | null;
  isActive: boolean;
  memberCount: number;
  followerCount: number;
  following: boolean;
  isHead: boolean;
  isMember: boolean;
  /** Inactive and without an active Head (for example a newly imported organisation). */
  awaitingHead: boolean;
  /** Logo and banner, only once APPROVED by the upload pipeline (Slice 2d); null shows initials / the brand banner. */
  logoAssetId: string | null;
  bannerAssetId: string | null;
}

export interface PersonSummary {
  id: string;
  name: string;
  branchName: string | null;
  year: number | null;
}

/** A person as the society displays them: display group and optional title only. */
export interface DisplayedPerson extends PersonSummary {
  position: string | null;
}

export interface FacultyAssociationView {
  id: string;
  name: string;
  department: string | null;
  email: string | null;
  sourceRole: string;
  sourceUrl: string | null;
  verified: boolean;
  /** The matching official faculty-directory profile, when one was identified at import. */
  facultyProfileId: string | null;
  /** Matched to the official faculty directory (shown to everyone, display only). */
  official: boolean;
}

export interface SocietyDetail extends SocietyCard {
  description: string | null;
  links: SocialLinks;
  contactEmail: string | null;
  createdAt: Date;
  verified: boolean;
  sourceUrl: string | null;
  /** When the imported record was taken from its official source. */
  sourceFetchedAt: Date | null;
  /** The official directory's own label, e.g. "Chapter · Technical / Academic" (not the app category). */
  sourceLabel: string | null;
  /** Provenance of an imported official logo (shown as its source). */
  logoSourceUrl: string | null;
  headCount: number;
  /** Public: the society's Heads and core members, with their titles. */
  heads: DisplayedPerson[];
  coreMembers: DisplayedPerson[];
  faculty: FacultyAssociationView[];
  pendingRequest: { id: string; createdAt: Date } | null;
  /**
   * The actor's permissions in the society capacity: from an active Head grant or membership only
   * (to show or hide controls; the API re-checks on every request).
   */
  can: Record<SocietyAction, boolean>;
  /** The actor's permissions in the platform-admin capacity (all false unless the account is ADMIN). Kept separate from `can`. */
  adminCan: Record<SocietyAction, boolean>;
}

export interface PostView {
  id: string;
  society: { id: string; slug: string; name: string };
  /** Only for the society's Heads and platform admins; everyone else sees the society as the author. */
  author: PersonSummary | null;
  type: "UPDATE" | "RECRUITMENT" | "STORY";
  visibility: "PUBLIC" | "MEMBERS";
  title: string | null;
  /** Sanitised HTML (updates, recruitment) or plain text (stories). */
  body: string;
  excerpt: string;
  rolesSought: string[];
  eligibleYears: number[];
  eligibleBranches: { code: string; name: string }[];
  deadline: Date | null;
  applicationUrl: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  updatedAt: Date;
}

export async function listCategories(prisma: PrismaClient): Promise<CategoryOption[]> {
  return prisma.societyCategory.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { slug: true, label: true } });
}

const excerptOf = (text: string) => (text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : text);

const cardSelect = (userId: string) =>
  ({
    id: true,
    slug: true,
    name: true,
    shortName: true,
    description: true,
    isActive: true,
    category: { select: { slug: true, label: true } },
    _count: { select: { memberships: true, follows: true, headGrants: { where: { revokedAt: null } } } },
    follows: { where: { userId }, select: { userId: true } },
    memberships: { where: { userId }, select: { userId: true } },
    headGrants: { where: { userId, revokedAt: null }, select: { id: true } },
    logoAssetId: true,
    logoAsset: { select: { status: true } },
    bannerAssetId: true,
    bannerAsset: { select: { status: true } },
  }) satisfies Prisma.SocietySelect;

type CardRow = Prisma.SocietyGetPayload<{ select: ReturnType<typeof cardSelect> }>;

const toCard = (row: CardRow): SocietyCard => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  shortName: row.shortName,
  excerpt: row.description ? excerptOf(row.description.replace(/\s+/g, " ")) : null,
  category: row.category,
  isActive: row.isActive,
  memberCount: row._count.memberships,
  followerCount: row._count.follows,
  following: row.follows.length > 0,
  isHead: row.headGrants.length > 0,
  isMember: row.memberships.length > 0,
  awaitingHead: !row.isActive && row._count.headGrants === 0,
  logoAssetId: row.logoAsset?.status === "APPROVED" ? row.logoAssetId : null,
  bannerAssetId: row.bannerAsset?.status === "APPROVED" ? row.bannerAssetId : null,
});

/** Society-capacity facts (the ADMIN role adds nothing here). */
const factsFor = (_actor: Actor, card: Pick<SocietyCard, "isHead" | "isMember" | "isActive">): SocietyActorFacts => ({
  platformAdmin: false,
  isHead: card.isHead,
  isMember: card.isMember,
  societyActive: card.isActive,
});

/** Platform-capacity facts: only for ADMIN accounts; Head grant and membership are ignored. */
const adminFactsFor = (actor: Actor, card: Pick<SocietyCard, "isActive">): SocietyActorFacts => ({
  platformAdmin: actor.globalRole === "ADMIN",
  isHead: false,
  isMember: false,
  societyActive: card.isActive,
});

const permissionMap = (facts: SocietyActorFacts) => Object.fromEntries(SOCIETY_ACTIONS.map((action) => [action, can(facts, action)])) as Record<SocietyAction, boolean>;

export interface DirectoryFilters {
  q?: string;
  category?: string;
  /** all: every active society; following / mine: the actor's; inactive: admins only (OI-38). */
  view?: "all" | "following" | "mine" | "inactive";
}

/** FR-SOC-4: directory of active societies with search and an optional category filter. */
export async function listSocieties(prisma: PrismaClient, actor: Actor, filters: DirectoryFilters): Promise<SocietyCard[]> {
  // LIKE wildcards in the search text are matched literally (PostgreSQL's default escape is "\").
  const q = filters.q?.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
  const view = filters.view === "inactive" && actor.globalRole !== "ADMIN" ? "all" : (filters.view ?? "all");
  const and: Prisma.SocietyWhereInput[] = [];
  if (q) and.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { shortName: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
  if (view === "mine") and.push({ OR: [{ memberships: { some: { userId: actor.userId } } }, { headGrants: { some: { userId: actor.userId, revokedAt: null } } }] });
  const where: Prisma.SocietyWhereInput = {
    isActive: view !== "inactive",
    ...(filters.category ? { categorySlug: filters.category } : {}),
    ...(view === "following" ? { follows: { some: { userId: actor.userId } } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
  const rows = await prisma.society.findMany({ where, orderBy: { name: "asc" }, take: 300, select: cardSelect(actor.userId) });
  return rows.map(toCard);
}

/**
 * Official student organisations from the Thapar student societies directory (imported, ADR-0013 §5)
 * that do not have a Head on Thapar SNS yet. Owner decision 2026-10-25: they are shown to every
 * signed-in student, clearly marked, read-only (no posts, membership or following until activated).
 * Categories come from the explicit mapping of the official source labels (source-categories.ts).
 */
export async function listOfficialAwaitingHead(prisma: PrismaClient, actor: Actor, filters: Pick<DirectoryFilters, "q" | "category">): Promise<SocietyCard[]> {
  const q = filters.q?.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
  const rows = await prisma.society.findMany({
    where: {
      isActive: false,
      sourceKey: { not: null },
      headGrants: { none: { revokedAt: null } },
      ...(filters.category ? { categorySlug: filters.category } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { shortName: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { name: "asc" },
    take: 300,
    select: cardSelect(actor.userId),
  });
  return rows.map(toCard);
}

/** Societies the user can switch into (active Head grants), for the workspace switcher. */
export async function listManagedSocieties(prisma: PrismaClient, userId: string): Promise<{ id: string; slug: string; name: string; isActive: boolean }[]> {
  const grants = await prisma.societyHeadGrant.findMany({
    where: { userId, revokedAt: null },
    select: { society: { select: { id: true, slug: true, name: true, isActive: true } } },
    orderBy: { society: { name: "asc" } },
  });
  return grants.map((grant) => grant.society);
}

async function displayed(identity: IdentityPort, rows: { userId: string; position: string | null }[]): Promise<DisplayedPerson[]> {
  const people = await identity.userSummaries(rows.map((row) => row.userId));
  return rows
    .flatMap((row) => {
      const person = people.get(row.userId);
      return person ? [{ ...person, position: row.position }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One society by URL name, with the actor's state and permissions; null if it does not exist. */
export async function getSocietyBySlug(prisma: PrismaClient, identity: IdentityPort, actor: Actor, slug: string): Promise<SocietyDetail | null> {
  const row = await prisma.society.findUnique({
    where: { slug },
    select: { ...cardSelect(actor.userId), socialLinks: true, contactEmail: true, createdAt: true, verifiedAt: true, sourceUrl: true, sourceFetchedAt: true, logoSourceUrl: true, sourceType: true, sourceSubtype: true },
  });
  if (!row) return null;
  const card = toCard(row);
  // Owner decision 2026-10-25 (ADR-0013 §5 revised): official imported organisations are readable by
  // every signed-in student, like any inactive society (OI-38); being inactive keeps them read-only.
  const allowed = permissionMap(factsFor(actor, card));
  const adminAllowed = permissionMap(adminFactsFor(actor, card));
  const grants = await prisma.societyHeadGrant.findMany({ where: { societyId: row.id, revokedAt: null }, select: { userId: true } });
  const headIds = new Set(grants.map((grant) => grant.userId));
  const members = await prisma.societyMembership.findMany({
    where: { societyId: row.id, OR: [{ group: "CORE" }, { userId: { in: [...headIds] } }] },
    select: { userId: true, group: true, position: true },
  });
  const positions = new Map(members.map((member) => [member.userId, member.position]));
  const pending = await prisma.societyMembershipRequest.findFirst({ where: { societyId: row.id, userId: actor.userId, status: "PENDING" }, select: { id: true, createdAt: true } });
  const faculty = await prisma.societyFacultyAssociation.findMany({
    // Shown to everyone: associations an admin verified, and those matched at import to the official
    // faculty directory (official data is authoritative, owner 2026-10-25). Display only: no permission
    // ever comes from an association. Unmatched entries stay admin-only until reviewed.
    where: { societyId: row.id, ...(adminAllowed["faculty.viewUnverified"] ? {} : { OR: [{ verifiedAt: { not: null } }, { facultyProfileId: { not: null } }] }) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, department: true, email: true, sourceRole: true, sourceUrl: true, verifiedAt: true, facultyProfileId: true },
  });
  return {
    ...card,
    description: row.description,
    links: (row.socialLinks ?? {}) as SocialLinks,
    contactEmail: row.contactEmail,
    createdAt: row.createdAt,
    verified: row.verifiedAt !== null,
    sourceUrl: row.sourceUrl,
    sourceFetchedAt: row.sourceFetchedAt,
    sourceLabel: sourceLabel(row),
    logoSourceUrl: row.logoSourceUrl,
    headCount: headIds.size,
    heads: await displayed(identity, [...headIds].map((userId) => ({ userId, position: positions.get(userId) ?? null }))),
    coreMembers: await displayed(identity, members.filter((member) => member.group === "CORE" && !headIds.has(member.userId))),
    faculty: faculty.map(({ verifiedAt, ...rest }) => ({ ...rest, verified: verifiedAt !== null, official: rest.facultyProfileId !== null })),
    pendingRequest: pending,
    can: allowed,
    adminCan: adminAllowed,
  };
}

const postSelect = {
  id: true,
  societyId: true,
  society: { select: { id: true, slug: true, name: true } },
  authorId: true,
  type: true,
  visibility: true,
  title: true,
  body: true,
  rolesSought: true,
  eligibleYears: true,
  eligibleBranchCodes: true,
  deadline: true,
  applicationUrl: true,
  publishedAt: true,
  expiresAt: true,
  updatedAt: true,
} satisfies Prisma.SocietyPostSelect;

type PostRow = Prisma.SocietyPostGetPayload<{ select: typeof postSelect }>;

async function toPostViews(identity: IdentityPort, rows: PostRow[], showAuthor: boolean): Promise<PostView[]> {
  if (rows.length === 0) return [];
  const [people, branches] = await Promise.all([
    showAuthor ? identity.userSummaries(rows.flatMap((row) => (row.authorId ? [row.authorId] : []))) : Promise.resolve(new Map<string, PersonSummary>()),
    identity.activeBranches(),
  ]);
  const branchNames = new Map(branches.map((branch) => [branch.code, branch.name]));
  return rows.map((row) => {
    // Stored bodies were sanitised on write; sanitising again on read is defence in depth.
    const body = row.type === "STORY" ? row.body : sanitizeRichText(row.body);
    return {
      id: row.id,
      society: row.society,
      author: showAuthor && row.authorId ? (people.get(row.authorId) ?? null) : null,
      type: row.type,
      visibility: row.visibility,
      title: row.title,
      body,
      excerpt: excerptOf(row.type === "STORY" ? row.body : htmlToPlainText(body)),
      rolesSought: row.rolesSought,
      eligibleYears: row.eligibleYears,
      eligibleBranches: row.eligibleBranchCodes.map((code) => ({ code, name: branchNames.get(code) ?? code })),
      deadline: row.deadline,
      applicationUrl: row.applicationUrl,
      publishedAt: row.publishedAt,
      expiresAt: row.expiresAt,
      updatedAt: row.updatedAt,
    };
  });
}

type SocietyFacts = Pick<SocietyDetail, "id" | "isHead" | "isMember" | "isActive">;

/** Visibility filter for posts of one society, given the actor's facts there. */
function visiblePosts(facts: SocietyActorFacts, now: Date): Prisma.SocietyPostWhereInput {
  return {
    ...(can(facts, "posts.viewDrafts") ? {} : { publishedAt: { not: null } }),
    ...(can(facts, "posts.viewMembersOnly") ? {} : { visibility: "PUBLIC" }),
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export interface PostPage {
  posts: PostView[];
  /** Cursor for the next (older) page, or null. */
  nextCursor: string | null;
}

/** Posts of one society, newest first (drafts first for Heads). Stories are listed separately. */
export async function listSocietyPosts(
  prisma: PrismaClient,
  identity: IdentityPort,
  actor: Actor,
  society: SocietyFacts,
  options: { type?: "UPDATE" | "RECRUITMENT"; cursor?: string; now?: Date } = {},
): Promise<PostPage> {
  const now = options.now ?? new Date();
  const facts = factsFor(actor, society);
  const rows = await prisma.societyPost.findMany({
    where: { societyId: society.id, type: options.type ?? { in: ["UPDATE", "RECRUITMENT"] }, ...visiblePosts(facts, now) },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { id: "desc" }],
    take: POSTS_PAGE_SIZE + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: postSelect,
  });
  const page = rows.slice(0, POSTS_PAGE_SIZE);
  return { posts: await toPostViews(identity, page, showAuthorTo(actor, society)), nextCursor: rows.length > POSTS_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null };
}

/** The individual author is shown to the society's Heads and to platform admins (oversight). */
const showAuthorTo = (actor: Actor, society: Pick<SocietyCard, "isHead" | "isMember" | "isActive">) =>
  can(factsFor(actor, society), "posts.viewAuthor") || can(adminFactsFor(actor, society), "posts.viewAuthor");

/** Unexpired stories (FR-SOC-3: invisible after 24 hours), for one society or for the actor's feed. */
export async function listActiveStories(
  prisma: PrismaClient,
  identity: IdentityPort,
  actor: Actor,
  scope: { society: SocietyFacts } | "feed",
  now = new Date(),
): Promise<PostView[]> {
  const where: Prisma.SocietyPostWhereInput = {
    type: "STORY",
    publishedAt: { not: null },
    expiresAt: { gt: now },
    society:
      scope === "feed"
        ? { isActive: true, OR: [{ follows: { some: { userId: actor.userId } } }, { memberships: { some: { userId: actor.userId } } }] }
        : { id: scope.society.id },
  };
  const rows = await prisma.societyPost.findMany({ where, orderBy: { publishedAt: "desc" }, take: 50, select: postSelect });
  const showAuthor = scope !== "feed" && showAuthorTo(actor, scope.society);
  return toPostViews(identity, rows, showAuthor);
}

/** One post, or null when it does not exist or is not visible to the actor (never reveal existence). */
export async function getPost(prisma: PrismaClient, identity: IdentityPort, actor: Actor, society: SocietyFacts, postId: string, now = new Date()): Promise<PostView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const facts = factsFor(actor, society);
  const row = await prisma.societyPost.findFirst({ where: { id: postId, societyId: society.id, ...visiblePosts(facts, now) }, select: postSelect });
  return row ? ((await toPostViews(identity, [row], showAuthorTo(actor, society)))[0] ?? null) : null;
}

/**
 * Home feed: published posts from societies the actor follows or belongs to (owner decision
 * 2026-10-24). Members-only posts appear only where the actor is a member. Shown as the society.
 */
export async function listFeed(prisma: PrismaClient, identity: IdentityPort, actor: Actor, options: { cursor?: string; now?: Date } = {}): Promise<PostPage> {
  const rows = await prisma.societyPost.findMany({
    where: {
      type: { in: ["UPDATE", "RECRUITMENT"] },
      publishedAt: { not: null },
      society: { isActive: true },
      OR: [
        { visibility: "PUBLIC", society: { follows: { some: { userId: actor.userId } } } },
        { society: { memberships: { some: { userId: actor.userId } } } },
      ],
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: POSTS_PAGE_SIZE + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: postSelect,
  });
  const page = rows.slice(0, POSTS_PAGE_SIZE);
  return { posts: await toPostViews(identity, page, false), nextCursor: rows.length > POSTS_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null };
}

export interface MemberView extends DisplayedPerson {
  group: MemberGroup;
  isHead: boolean;
  joinedAt: Date;
}

/** Member list with display groups and titles: members, Heads and admins only. */
export async function listMembers(prisma: PrismaClient, identity: IdentityPort, society: Pick<SocietyDetail, "id" | "can" | "adminCan">): Promise<MemberView[] | null> {
  if (!society.can["members.viewAll"] && !society.adminCan["members.viewAll"]) return null;
  const rows = await prisma.societyMembership.findMany({ where: { societyId: society.id }, select: { userId: true, group: true, position: true, joinedAt: true }, orderBy: { joinedAt: "asc" } });
  const grants = await prisma.societyHeadGrant.findMany({ where: { societyId: society.id, revokedAt: null }, select: { userId: true } });
  const headIds = new Set(grants.map((grant) => grant.userId));
  const people = await identity.userSummaries(rows.map((row) => row.userId));
  const rank = (member: { isHead: boolean; group: MemberGroup }) => (member.isHead ? 0 : member.group === "CORE" ? 1 : 2);
  return rows
    .flatMap((row) => {
      const person = people.get(row.userId);
      return person ? [{ ...person, position: row.position, group: row.group, isHead: headIds.has(row.userId), joinedAt: row.joinedAt }] : [];
    })
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export interface HeadView extends PersonSummary {
  grantedAt: Date;
  grantReason: string;
  revokedAt: Date | null;
  revokeReason: string | null;
}

/** Active Heads and the tenure history: the society's Heads and platform admins only. */
export async function listHeads(prisma: PrismaClient, identity: IdentityPort, society: Pick<SocietyDetail, "id" | "can" | "adminCan">): Promise<{ active: HeadView[]; history: HeadView[] } | null> {
  if (!society.can["workspace.open"] && !society.adminCan["heads.manage"]) return null;
  const grants = await prisma.societyHeadGrant.findMany({
    where: { societyId: society.id },
    orderBy: { grantedAt: "desc" },
    take: 100,
    select: { userId: true, grantedAt: true, grantReason: true, revokedAt: true, revokeReason: true },
  });
  const people = await identity.userSummaries(grants.map((grant) => grant.userId));
  const views = grants.flatMap((grant) => {
    const person = people.get(grant.userId);
    return person ? [{ ...person, grantedAt: grant.grantedAt, grantReason: grant.grantReason, revokedAt: grant.revokedAt, revokeReason: grant.revokeReason }] : [];
  });
  return { active: views.filter((view) => view.revokedAt === null).sort((a, b) => a.name.localeCompare(b.name)), history: views.filter((view) => view.revokedAt !== null) };
}

export interface RequestView {
  id: string;
  person: PersonSummary;
  message: string | null;
  createdAt: Date;
}

/** Pending membership requests: the society's Heads only. */
export async function listPendingRequests(prisma: PrismaClient, identity: IdentityPort, society: Pick<SocietyDetail, "id" | "can">): Promise<RequestView[] | null> {
  if (!society.can["membership.decide"]) return null;
  const rows = await prisma.societyMembershipRequest.findMany({ where: { societyId: society.id, status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { id: true, userId: true, message: true, createdAt: true } });
  const people = await identity.userSummaries(rows.map((row) => row.userId));
  return rows.flatMap((row) => {
    const person = people.get(row.userId);
    return person ? [{ id: row.id, person, message: row.message, createdAt: row.createdAt }] : [];
  });
}
