import "server-only";

// Find Mates reads (FR-MATE-2, UC-10 P1, ACT-3/5, OI-17). Browsing shows only OPEN, unexpired requests
// (expiry is enforced at query time; the job only tidies the stored status).
import { userSkillSlugs, userSummaries } from "@/modules/identity";
import type { Prisma, PrismaClient } from "@/shared/db/client";
import { htmlToPlainText, sanitizeRichText } from "@/shared/security/sanitize-html";

import { matchScore } from "./schemas";

export interface RequestCard {
  id: string;
  title: string;
  excerpt: string;
  type: "HACKATHON" | "PROJECT" | "CASUAL";
  subject: string | null;
  skills: { slug: string; label: string }[];
  teamSize: number;
  currentCount: number;
  status: "OPEN" | "CLOSED" | "EXPIRED";
  expiresAt: Date;
  createdAt: Date;
  creator: { id: string; name: string } | null;
  responseCount: number;
  /** OI-17: overlap between the request's skills and the viewer's skills, 0 to 1. */
  match: number;
  mine: boolean;
  myResponse: "PENDING" | "ACCEPTED" | "REJECTED" | null;
}

export interface BrowseFilters {
  type?: "HACKATHON" | "PROJECT" | "CASUAL";
  skills?: string[];
  subject?: string;
  q?: string;
  sort?: "newest" | "best";
  view?: "open" | "mine" | "responded";
}

const select = (userId: string) =>
  ({
    id: true,
    title: true,
    description: true,
    type: true,
    subject: true,
    teamSize: true,
    currentCount: true,
    status: true,
    expiresAt: true,
    createdAt: true,
    creatorId: true,
    skills: { select: { tag: { select: { slug: true, label: true } } } },
    responses: { where: { responderId: userId }, select: { status: true } },
    _count: { select: { responses: true } },
  }) satisfies Prisma.MateRequestSelect;

type Row = Prisma.MateRequestGetPayload<{ select: ReturnType<typeof select> }>;

/** The viewer's skills, from their profile (identity module interface). */
async function viewerSkills(userId: string): Promise<string[]> {
  return (await userSkillSlugs([userId])).get(userId) ?? [];
}

function toCard(row: Row, userId: string, mySkills: string[], now: Date, names: Map<string, string>): RequestCard {
  const text = htmlToPlainText(row.description);
  const skills = row.skills.map((s) => s.tag);
  const expired = row.status === "OPEN" && row.expiresAt <= now;
  return {
    id: row.id,
    title: row.title,
    excerpt: text.length > 220 ? `${text.slice(0, 219)}…` : text,
    type: row.type,
    subject: row.subject,
    skills,
    teamSize: row.teamSize,
    currentCount: row.currentCount,
    status: expired ? "EXPIRED" : row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    creator: names.has(row.creatorId) ? { id: row.creatorId, name: names.get(row.creatorId)! } : null,
    responseCount: row._count.responses,
    match: Math.round(matchScore(skills.map((s) => s.slug), mySkills) * 100) / 100,
    mine: row.creatorId === userId,
    myResponse: row.responses[0]?.status ?? null,
  };
}

/** FR-MATE-2: browse and filter by type, skills and subject (and keywords). */
export async function browse(prisma: PrismaClient, userId: string, filters: BrowseFilters = {}, now = new Date()): Promise<RequestCard[]> {
  const q = filters.q?.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
  const subject = filters.subject?.trim().slice(0, 60).replace(/[\\%_]/g, "\\$&");
  const view = filters.view ?? "open";
  const where: Prisma.MateRequestWhereInput = {
    ...(view === "open" ? { status: "OPEN", expiresAt: { gt: now } } : {}),
    ...(view === "mine" ? { creatorId: userId } : {}),
    ...(view === "responded" ? { responses: { some: { responderId: userId } } } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.skills?.length ? { skills: { some: { tagSlug: { in: filters.skills } } } } : {}),
    ...(subject ? { subject: { contains: subject, mode: "insensitive" } } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const rows = await prisma.mateRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, select: select(userId) });
  const [mySkills, people] = await Promise.all([viewerSkills(userId), userSummaries(rows.map((r) => r.creatorId))]);
  const names = new Map([...people].map(([id, p]) => [id, p.name]));
  const cards = rows.map((row) => toCard(row, userId, mySkills, now, names));
  if (filters.sort === "best") cards.sort((a, b) => b.match - a.match || b.createdAt.getTime() - a.createdAt.getTime());
  return cards;
}

export interface ResponseView {
  id: string;
  responder: { id: string; name: string; branchName: string | null; year: number | null };
  message: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  match: number;
  connectionId: string | null;
  createdAt: Date;
}

export interface RequestDetail extends RequestCard {
  description: string;
  /** Only for the creator: every response, best match first (OI-17). */
  responses: ResponseView[] | null;
  /** The viewer's own response and its connection, if accepted. */
  myConnectionId: string | null;
}

export async function getRequest(prisma: PrismaClient, userId: string, requestId: string, now = new Date()): Promise<RequestDetail | null> {
  const row = await prisma.mateRequest.findUnique({ where: { id: requestId }, select: select(userId) });
  if (!row) return null;
  const mySkills = await viewerSkills(userId);
  const creator = await userSummaries([row.creatorId]);
  const card = toCard(row, userId, mySkills, now, new Map([...creator].map(([id, p]) => [id, p.name])));
  let responses: ResponseView[] | null = null;
  if (card.mine) {
    const list = await prisma.mateResponse.findMany({ where: { requestId }, orderBy: { createdAt: "asc" }, select: { id: true, responderId: true, message: true, status: true, createdAt: true, connection: { select: { id: true } } } });
    const people = await userSummaries(list.map((r) => r.responderId));
    const skillsBy = await userSkillSlugs(list.map((r) => r.responderId));
    responses = list
      .map((r) => {
        const p = people.get(r.responderId);
        return {
          id: r.id,
          responder: { id: r.responderId, name: p?.name ?? "Former user", branchName: p?.branchName ?? null, year: p?.year ?? null },
          message: r.message,
          status: r.status,
          match: Math.round(matchScore(card.skills.map((s) => s.slug), skillsBy.get(r.responderId) ?? []) * 100) / 100,
          connectionId: r.connection?.id ?? null,
          createdAt: r.createdAt,
        };
      })
      .sort((a, b) => (a.status === "PENDING" ? 0 : 1) - (b.status === "PENDING" ? 0 : 1) || b.match - a.match || a.createdAt.getTime() - b.createdAt.getTime());
  }
  const myConnection = card.myResponse === "ACCEPTED" ? await prisma.mateConnection.findFirst({ where: { requestId, responderId: userId }, select: { id: true } }) : null;
  return { ...card, description: sanitizeRichText(row.description), responses, myConnectionId: myConnection?.id ?? null };
}

export interface ConnectionView {
  id: string;
  requestId: string;
  requestTitle: string;
  other: { id: string; name: string };
  createdAt: Date;
  lastMessageAt: Date | null;
}

/** The user's chat conversations (one per accepted response, OI-16). */
export async function listConnections(prisma: PrismaClient, userId: string): Promise<ConnectionView[]> {
  const rows = await prisma.mateConnection.findMany({
    where: { OR: [{ requesterId: userId }, { responderId: userId }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, requesterId: true, responderId: true, createdAt: true, request: { select: { id: true, title: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  const people = await userSummaries(rows.map((r) => (r.requesterId === userId ? r.responderId : r.requesterId)));
  return rows
    .map((r) => {
      const otherId = r.requesterId === userId ? r.responderId : r.requesterId;
      return { id: r.id, requestId: r.request.id, requestTitle: r.request.title, other: { id: otherId, name: people.get(otherId)?.name ?? "Former user" }, createdAt: r.createdAt, lastMessageAt: r.messages[0]?.createdAt ?? null };
    })
    .sort((a, b) => (b.lastMessageAt ?? b.createdAt).getTime() - (a.lastMessageAt ?? a.createdAt).getTime());
}

/** MET-1 / SPEC-METRICS: time from creation to the first accepted response, for requests that got one. */
export async function timeToMatchHours(prisma: PrismaClient, since?: Date): Promise<number[]> {
  const rows = await prisma.mateRequest.findMany({ where: { firstAcceptedAt: { not: null }, ...(since ? { createdAt: { gte: since } } : {}) }, select: { createdAt: true, firstAcceptedAt: true } });
  return rows.map((r) => (r.firstAcceptedAt!.getTime() - r.createdAt.getTime()) / 3_600_000);
}
