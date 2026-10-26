import "server-only";

// Project archive (Slice 4c: FR-ARC-1..3, OI-21, OI-22, OI-23, OI-39). Submissions are invisible to
// everyone except the submitter and reviewers until an admin approves them (FR-ARC-2). Screenshots
// go through the quarantine-first upload pipeline; only APPROVED images are shown. Upvotes are one per
// student; comments are threaded to depth 3 (CHECK constraint in the database as well).
import { audit } from "@/modules/admin";
import { assetStatuses, ownedAssetFor } from "@/modules/assets";
import { apiDeps, userSummaries } from "@/modules/identity";
import { notify } from "@/modules/notifications";
import { nudge } from "@/modules/outbox";
import { getDb, type Prisma, type PrismaClient } from "@/shared/db/client";
import { type ApiActor, forbidden, invalid, invalidState, notFound, ok, RATE, runAction, type ServiceResult } from "@/shared/http/api-action";
import { cleanPlainText, htmlToPlainText, sanitizeRichText } from "@/shared/security/sanitize-html";
import { z } from "zod";

export const MAX_SCREENSHOTS = 5;
export const MAX_TAGS = 8;
export const MAX_DEPTH = 3;
const GITHUB = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

const submitSchema = z
  .object({
    title: z.string().trim().min(3, "Use at least 3 characters.").max(150),
    description: z.string().max(100_000),
    githubUrl: z
      .string()
      .trim()
      .transform((v) => v.replace(/\/+$/, "").replace(/\.git$/, ""))
      .pipe(z.string().regex(GITHUB, "Use a GitHub repository link: https://github.com/owner/repo")),
    tags: z
      .array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9+#.-]{0,29}$/, "Tags are short words such as react or ml."))
      .transform((list) => [...new Set(list)])
      .pipe(z.array(z.string()).max(MAX_TAGS, `Use at most ${MAX_TAGS} tags.`)),
    screenshotAssetIds: z.array(z.uuid()).max(MAX_SCREENSHOTS, `Add at most ${MAX_SCREENSHOTS} screenshots.`).default([]),
  })
  .strict();
const reviewSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(500).optional()) }).strict();
const commentSchema = z.object({ body: z.string().trim().min(1, "Write a comment.").max(2000, "Use at most 2000 characters."), parentId: z.uuid().optional() }).strict();

const fieldErrors = (error: z.ZodError) => {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return fields;
};

/** FR-ARC-1: submit a project for review. */
export async function submitProject(prisma: PrismaClient, actor: ApiActor, raw: unknown): Promise<ServiceResult<{ id: string }>> {
  if (actor.capacity !== "personal") return forbidden;
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const input = parsed.data;
  const description = sanitizeRichText(input.description);
  const text = htmlToPlainText(description);
  if (text.length < 20) return invalid({ description: "Describe the project in at least 20 characters." });
  if (text.length > 5000) return invalid({ description: "Use at most 5000 characters." });
  const shots = [...new Set(input.screenshotAssetIds)];
  for (const assetId of shots) {
    const owned = await ownedAssetFor(actor.userId, assetId, "ARCHIVE_SCREENSHOT");
    if (!owned.ok) return invalid({ screenshotAssetIds: owned.code === "INVALID_STATE" ? owned.message : "A screenshot could not be used." });
  }
  const used = await prisma.archiveScreenshot.count({ where: { assetId: { in: shots } } });
  if (used) return invalid({ screenshotAssetIds: "A screenshot is already used by another project." });
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.archiveProject.create({
      data: {
        submitterId: actor.userId,
        title: input.title,
        description,
        githubUrl: input.githubUrl,
        tags: { create: input.tags.map((tag) => ({ tag })) },
        screenshots: { create: shots.map((assetId, position) => ({ assetId, position })) },
      },
      select: { id: true },
    });
    await audit(tx, { actorId: actor.userId, action: "archive.project.submitted", targetType: "archive_project", targetId: created.id });
    return created;
  });
  return ok(project);
}

/** FR-ARC-2 / OI-21: admin review (platform capacity). */
export async function reviewProject(prisma: PrismaClient, actor: ApiActor, projectId: string, raw: unknown, now = new Date()): Promise<ServiceResult> {
  if (actor.capacity !== "platform") return forbidden;
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  if (parsed.data.decision === "REJECT" && !parsed.data.note) return invalid({ note: "Give a short reason for the rejection." });
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    const project = await tx.archiveProject.findUnique({ where: { id: projectId }, select: { status: true, submitterId: true, title: true } });
    if (!project) return notFound;
    if (project.status !== "SUBMITTED") return invalidState("This project has already been reviewed.");
    if (project.submitterId === actor.userId) return forbidden; // no self-review
    const approved = parsed.data.decision === "APPROVE";
    await tx.archiveProject.update({ where: { id: projectId }, data: { status: approved ? "APPROVED" : "REJECTED", reviewedById: actor.userId, reviewNote: parsed.data.note ?? null, reviewedAt: now } });
    await audit(tx, { actorId: actor.userId, action: approved ? "archive.project.approved" : "archive.project.rejected", targetType: "archive_project", targetId: projectId });
    if (project.submitterId) await notify(tx, { recipients: [project.submitterId], type: "archive.decided", payload: { projectId, projectTitle: project.title, approved, note: parsed.data.note ?? null }, sourceKey: `archive:${projectId}:reviewed` });
    return ok(undefined);
  });
}

/** OI-22: one upvote per student, on approved projects only. */
export async function setVote(prisma: PrismaClient, actor: ApiActor, projectId: string, up: boolean): Promise<ServiceResult<{ upvoteCount: number; voted: boolean }>> {
  if (actor.capacity !== "personal") return forbidden;
  return prisma.$transaction(async (tx): Promise<ServiceResult<{ upvoteCount: number; voted: boolean }>> => {
    const project = await tx.archiveProject.findFirst({ where: { id: projectId, status: "APPROVED" }, select: { id: true } });
    if (!project) return notFound;
    const changed = up
      ? (await tx.archiveVote.createMany({ data: [{ projectId, userId: actor.userId }], skipDuplicates: true })).count
      : -(await tx.archiveVote.deleteMany({ where: { projectId, userId: actor.userId } })).count;
    const row = changed
      ? await tx.archiveProject.update({ where: { id: projectId }, data: { upvoteCount: { increment: changed } }, select: { upvoteCount: true } })
      : await tx.archiveProject.findUniqueOrThrow({ where: { id: projectId }, select: { upvoteCount: true } });
    return ok({ upvoteCount: row.upvoteCount, voted: up });
  });
}

/** FR-ARC-3 / OI-23: comment, or reply to a comment of the same project, up to depth 3. */
export async function addComment(prisma: PrismaClient, actor: ApiActor, projectId: string, raw: unknown): Promise<ServiceResult<{ id: string }>> {
  if (actor.capacity !== "personal") return forbidden;
  const parsed = commentSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const body = cleanPlainText(parsed.data.body);
  if (!body) return invalid({ body: "Write a comment." });
  const project = await prisma.archiveProject.findFirst({ where: { id: projectId, status: "APPROVED" }, select: { id: true } });
  if (!project) return notFound;
  let depth = 1;
  if (parsed.data.parentId) {
    // The parent must belong to the same project (cross-project ids are rejected as not found).
    const parent = await prisma.archiveComment.findFirst({ where: { id: parsed.data.parentId, projectId }, select: { depth: true, hiddenAt: true } });
    if (!parent) return notFound;
    if (parent.depth >= MAX_DEPTH) return invalidState(`Replies can be nested at most ${MAX_DEPTH} levels deep.`);
    depth = parent.depth + 1;
  }
  const comment = await prisma.archiveComment.create({ data: { projectId, authorId: actor.userId, parentId: parsed.data.parentId ?? null, depth, body }, select: { id: true } });
  return ok(comment);
}

/** The comment author deletes their own comment (hidden; replies stay in the thread). */
export async function deleteComment(prisma: PrismaClient, actor: ApiActor, projectId: string, commentId: string): Promise<ServiceResult> {
  const comment = await prisma.archiveComment.findFirst({ where: { id: commentId, projectId }, select: { authorId: true } });
  if (!comment) return notFound;
  if (comment.authorId !== actor.userId) return forbidden;
  await prisma.archiveComment.update({ where: { id: commentId }, data: { hiddenAt: new Date() } });
  return ok(undefined);
}

export interface ProjectCard {
  id: string;
  title: string;
  excerpt: string;
  githubUrl: string;
  tags: string[];
  upvoteCount: number;
  voted: boolean;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  coverAssetId: string | null;
  submitterName: string | null;
  createdAt: Date;
}

export interface CommentNode {
  id: string;
  authorName: string | null;
  mine: boolean;
  body: string;
  hidden: boolean;
  depth: number;
  createdAt: Date;
  replies: CommentNode[];
}

export interface ProjectDetail extends ProjectCard {
  description: string;
  screenshots: string[];
  reviewNote: string | null;
  mine: boolean;
  comments: CommentNode[];
}

const cardSelect = (userId: string) =>
  ({
    id: true,
    title: true,
    description: true,
    githubUrl: true,
    upvoteCount: true,
    status: true,
    createdAt: true,
    submitterId: true,
    tags: { select: { tag: true }, orderBy: { tag: "asc" } },
    screenshots: { select: { assetId: true }, orderBy: { position: "asc" } },
    votes: { where: { userId }, select: { userId: true } },
  }) satisfies Prisma.ArchiveProjectSelect;

type CardRow = Prisma.ArchiveProjectGetPayload<{ select: ReturnType<typeof cardSelect> }>;

async function toCards(rows: CardRow[]): Promise<{ cards: ProjectCard[]; approvedShots: Set<string> }> {
  const statuses = await assetStatuses(rows.flatMap((r) => r.screenshots.map((s) => s.assetId)));
  const approvedShots = new Set([...statuses].filter(([, s]) => s.status === "APPROVED").map(([id]) => id));
  const people = await userSummaries(rows.flatMap((r) => (r.submitterId ? [r.submitterId] : [])));
  const cards = rows.map((r) => {
    const text = htmlToPlainText(r.description);
    return {
      id: r.id,
      title: r.title,
      excerpt: text.length > 200 ? `${text.slice(0, 199)}…` : text,
      githubUrl: r.githubUrl,
      tags: r.tags.map((t) => t.tag),
      upvoteCount: r.upvoteCount,
      voted: r.votes.length > 0,
      status: r.status,
      coverAssetId: r.screenshots.map((s) => s.assetId).find((id) => approvedShots.has(id)) ?? null,
      submitterName: r.submitterId ? (people.get(r.submitterId)?.name ?? null) : null,
      createdAt: r.createdAt,
    };
  });
  return { cards, approvedShots };
}

/** FR-ARC-3: browse and search approved projects (or, for reviewers, the queue). */
export async function listProjects(prisma: PrismaClient, userId: string, filters: { q?: string; tag?: string; sort?: "new" | "top"; view?: "approved" | "mine" | "queue" }): Promise<ProjectCard[]> {
  const q = filters.q?.trim().slice(0, 100);
  let ids: string[] | undefined;
  if (q) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id" FROM "archive_projects" p
       WHERE to_tsvector('simple', coalesce(p."title", '') || ' ' || coalesce(p."description", '')) @@ plainto_tsquery('simple', ${q})
          OR EXISTS (SELECT 1 FROM "archive_project_tags" t WHERE t."projectId" = p."id" AND t."tag" = lower(${q}))
       LIMIT 500`;
    ids = rows.map((r) => r.id);
  }
  const view = filters.view ?? "approved";
  const where: Prisma.ArchiveProjectWhereInput = {
    ...(view === "approved" ? { status: "APPROVED" } : {}),
    ...(view === "mine" ? { submitterId: userId } : {}),
    ...(view === "queue" ? { status: "SUBMITTED" } : {}),
    ...(ids ? { id: { in: ids } } : {}),
    ...(filters.tag ? { tags: { some: { tag: filters.tag.toLowerCase() } } } : {}),
  };
  const rows = await prisma.archiveProject.findMany({ where, orderBy: filters.sort === "top" ? [{ upvoteCount: "desc" }, { createdAt: "desc" }] : { createdAt: view === "queue" ? "asc" : "desc" }, take: 100, select: cardSelect(userId) });
  return (await toCards(rows)).cards;
}

/** One project; unapproved projects only for the submitter or a reviewer (FR-ARC-2). */
export async function getProject(prisma: PrismaClient, userId: string, isReviewer: boolean, projectId: string): Promise<ProjectDetail | null> {
  const row = await prisma.archiveProject.findUnique({ where: { id: projectId }, select: { ...cardSelect(userId), reviewNote: true } });
  if (!row) return null;
  const mine = row.submitterId === userId;
  if (row.status !== "APPROVED" && !mine && !isReviewer) return null;
  const { cards, approvedShots } = await toCards([row]);
  const comments = row.status === "APPROVED" ? await commentTree(prisma, userId, projectId) : [];
  return {
    ...cards[0]!,
    description: sanitizeRichText(row.description),
    screenshots: row.screenshots.map((s) => s.assetId).filter((id) => approvedShots.has(id)),
    reviewNote: mine || isReviewer ? row.reviewNote : null,
    mine,
    comments,
  };
}

async function commentTree(prisma: PrismaClient, userId: string, projectId: string): Promise<CommentNode[]> {
  const rows = await prisma.archiveComment.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, take: 1000, select: { id: true, authorId: true, parentId: true, depth: true, body: true, hiddenAt: true, createdAt: true } });
  const people = await userSummaries(rows.flatMap((r) => (r.authorId ? [r.authorId] : [])));
  const nodes = new Map<string, CommentNode>(
    rows.map((r) => [r.id, { id: r.id, authorName: r.authorId ? (people.get(r.authorId)?.name ?? null) : null, mine: r.authorId === userId, body: r.hiddenAt ? "" : r.body, hidden: r.hiddenAt !== null, depth: r.depth, createdAt: r.createdAt, replies: [] }]),
  );
  const roots: CommentNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    const parent = r.parentId ? nodes.get(r.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Moderation (Slice 5). */
export async function setCommentHidden(prisma: PrismaClient, commentId: string, hidden: boolean): Promise<boolean> {
  const { count } = await prisma.archiveComment.updateMany({ where: { id: commentId }, data: { hiddenAt: hidden ? new Date() : null } });
  return count === 1;
}

// Wiring.
export const archive = {
  list: (userId: string, filters: Parameters<typeof listProjects>[2]) => listProjects(getDb(), userId, filters),
  get: (userId: string, isReviewer: boolean, id: string) => getProject(getDb(), userId, isReviewer, id),
  publishedCount: () => getDb().archiveProject.count({ where: { status: "APPROVED" } }),
  queueCount: () => getDb().archiveProject.count({ where: { status: "SUBMITTED" } }),
  /** A screenshot may be loaded when its project is visible to the viewer (approved, own, or reviewer). */
  screenshotVisible: async (userId: string, isReviewer: boolean, projectId: string, assetId: string) => {
    const shot = await getDb().archiveScreenshot.findFirst({ where: { projectId, assetId }, select: { project: { select: { status: true, submitterId: true } } } });
    return !!shot && (shot.project.status === "APPROVED" || shot.project.submitterId === userId || isReviewer);
  },
  setCommentHidden: (commentId: string, hidden: boolean) => setCommentHidden(getDb(), commentId, hidden),
  /** Moderation: a visible comment on an approved project (its text), or null. */
  visibleComment: async (commentId: string) => (await getDb().archiveComment.findFirst({ where: { id: commentId, hiddenAt: null, project: { status: "APPROVED" } }, select: { body: true } }))?.body ?? null,
  commentText: async (commentId: string) => (await getDb().archiveComment.findUnique({ where: { id: commentId }, select: { body: true } }))?.body ?? null,
  projectTitle: async (projectId: string) => (await getDb().archiveProject.findUnique({ where: { id: projectId }, select: { title: true } }))?.title ?? null,
  /** Moderation: an approved project can be withdrawn back to REJECTED with a note (audited by the caller). */
  withdraw: async (projectId: string, note: string) => (await getDb().archiveProject.updateMany({ where: { id: projectId, status: "APPROVED" }, data: { status: "REJECTED", reviewNote: note } })).count === 1,
};

export const archiveApi = {
  submit: (request: Request) =>
    runAction(apiDeps(), request, { name: "archive:submit", maxBodyBytes: 256 * 1024, rules: RATE.create, body: true, status: 201, run: (actor, body) => submitProject(getDb(), actor, body), output: (v) => ({ project: v }) }),
  review: async (request: Request, id: string) => {
    const response = await runAction(apiDeps(), request, { name: "archive:review", rules: RATE.admin, ids: [id], body: true, capacity: "platform", run: (actor, body) => reviewProject(getDb(), actor, id, body) });
    if (response.ok) await nudge();
    return response;
  },
  vote: (request: Request, id: string, up: boolean) => runAction(apiDeps(), request, { name: "archive:vote", rules: RATE.write, ids: [id], run: (actor) => setVote(getDb(), actor, id, up) }),
  comment: (request: Request, id: string) =>
    runAction(apiDeps(), request, { name: "archive:comment", rules: RATE.create, ids: [id], body: true, status: 201, run: (actor, body) => addComment(getDb(), actor, id, body), output: (v) => ({ comment: v }) }),
  deleteComment: (request: Request, id: string, commentId: string) =>
    runAction(apiDeps(), request, { name: "archive:uncomment", rules: RATE.write, ids: [id, commentId], run: (actor) => deleteComment(getDb(), actor, id, commentId) }),
};
