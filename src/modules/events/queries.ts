import "server-only";

// Event reads (FR-EVT-3/4, UCD-6). Drafts are visible only to the people who may manage them; the
// shown status is derived from the time window (OI-13).
import { userSummaries } from "@/modules/identity";
import type { Prisma, PrismaClient } from "@/shared/db/client";
import type { ApiActor } from "@/shared/http/api-action";
import { htmlToPlainText, sanitizeRichText } from "@/shared/security/sanitize-html";

import type { RegistrationField } from "./schemas";
import { canManage, effectiveStatus, type StoredStatus } from "./service";

export interface EventCard {
  id: string;
  title: string;
  excerpt: string;
  venue: string;
  startAt: Date;
  endAt: Date;
  status: StoredStatus;
  capacity: number;
  registeredCount: number;
  interestCount: number;
  interestVersion: number;
  society: { id: string; slug: string; name: string; logoAssetId: string | null } | null;
  myStatus: "REGISTERED" | "WAITLISTED" | null;
  interested: boolean;
}

export interface EventDetail extends EventCard {
  description: string;
  registrationSchema: RegistrationField[];
  canManage: boolean;
  cancelReason: string | null;
  waitlistPosition: number | null;
}

const cardSelect = (userId: string) =>
  ({
    id: true,
    title: true,
    description: true,
    venue: true,
    startAt: true,
    endAt: true,
    status: true,
    capacity: true,
    registeredCount: true,
    interestCount: true,
    interestVersion: true,
    society: { select: { id: true, slug: true, name: true, logoAssetId: true, logoAsset: { select: { status: true } } } },
    registrations: { where: { userId, status: { in: ["REGISTERED", "WAITLISTED"] } }, select: { status: true } },
    interests: { where: { userId }, select: { userId: true } },
  }) satisfies Prisma.EventSelect;

type CardRow = Prisma.EventGetPayload<{ select: ReturnType<typeof cardSelect> }>;

const toCard = (row: CardRow, now: Date): EventCard => {
  const text = htmlToPlainText(row.description);
  return {
    id: row.id,
    title: row.title,
    excerpt: text.length > 200 ? `${text.slice(0, 199)}…` : text,
    venue: row.venue,
    startAt: row.startAt,
    endAt: row.endAt,
    status: effectiveStatus(row, now),
    capacity: row.capacity,
    registeredCount: row.registeredCount,
    interestCount: row.interestCount,
    interestVersion: row.interestVersion,
    society: row.society ? { id: row.society.id, slug: row.society.slug, name: row.society.name, logoAssetId: row.society.logoAsset?.status === "APPROVED" ? row.society.logoAssetId : null } : null,
    myStatus: (row.registrations[0]?.status as "REGISTERED" | "WAITLISTED" | undefined) ?? null,
    interested: row.interests.length > 0,
  };
};

export interface EventFilters {
  view?: "upcoming" | "past" | "mine" | "interested";
  societyId?: string;
  q?: string;
  /** Include the society's drafts (workspace views; the caller checked the Head grant). */
  includeDrafts?: boolean;
}

/** UCD-6 Browse Events. */
export async function listEvents(prisma: PrismaClient, userId: string, filters: EventFilters = {}, now = new Date()): Promise<EventCard[]> {
  const q = filters.q?.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
  const view = filters.view ?? "upcoming";
  const where: Prisma.EventWhereInput = {
    status: filters.includeDrafts ? undefined : { not: "DRAFT" },
    ...(filters.societyId ? { societyId: filters.societyId } : { OR: [{ societyId: null }, { society: { isActive: true } }] }),
    ...(view === "upcoming" ? { endAt: { gt: now }, status: filters.includeDrafts ? { not: "CANCELLED" } : { in: ["PUBLISHED", "LIVE"] } } : {}),
    ...(view === "past" ? { OR: [{ endAt: { lte: now } }, { status: "CANCELLED" }] } : {}),
    ...(view === "mine" ? { registrations: { some: { userId, status: { in: ["REGISTERED", "WAITLISTED"] } } } } : {}),
    ...(view === "interested" ? { interests: { some: { userId } } } : {}),
    ...(q ? { AND: [{ OR: [{ title: { contains: q, mode: "insensitive" } }, { venue: { contains: q, mode: "insensitive" } }] }] } : {}),
  };
  const rows = await prisma.event.findMany({ where, orderBy: { startAt: view === "past" ? "desc" : "asc" }, take: 100, select: cardSelect(userId) });
  return rows.map((row) => toCard(row, now));
}

/** One event, or null when it does not exist or is a draft the actor may not manage. */
export async function getEvent(prisma: PrismaClient, actor: ApiActor, eventId: string, now = new Date()): Promise<EventDetail | null> {
  const row = await prisma.event.findUnique({ where: { id: eventId }, select: { ...cardSelect(actor.userId), registrationSchema: true, cancelReason: true, societyId: true } });
  if (!row) return null;
  const manage = await canManage(prisma, actor, row.societyId);
  if (row.status === "DRAFT" && !manage) return null;
  let waitlistPosition: number | null = null;
  if (row.registrations[0]?.status === "WAITLISTED") {
    const mine = await prisma.eventRegistration.findUniqueOrThrow({ where: { eventId_userId: { eventId, userId: actor.userId } }, select: { queuedAt: true } });
    waitlistPosition = (await prisma.eventRegistration.count({ where: { eventId, status: "WAITLISTED", queuedAt: { lt: mine.queuedAt } } })) + 1;
  }
  return {
    ...toCard(row, now),
    description: sanitizeRichText(row.description),
    registrationSchema: (row.registrationSchema ?? []) as unknown as RegistrationField[],
    canManage: manage,
    cancelReason: row.cancelReason,
    waitlistPosition,
  };
}

export interface RegistrationRow {
  userId: string;
  name: string;
  branchName: string | null;
  year: number | null;
  status: "REGISTERED" | "WAITLISTED" | "CANCELLED";
  responses: Record<string, unknown>;
  createdAt: Date;
}

/** Registrations for the event's managers only (null otherwise). Roll numbers are never included. */
export async function listRegistrations(prisma: PrismaClient, actor: ApiActor, eventId: string): Promise<RegistrationRow[] | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { societyId: true } });
  if (!event || !(await canManage(prisma, actor, event.societyId))) return null;
  const rows = await prisma.eventRegistration.findMany({ where: { eventId }, orderBy: [{ status: "asc" }, { queuedAt: "asc" }], select: { userId: true, status: true, responses: true, createdAt: true } });
  const people = await userSummaries(rows.map((r) => r.userId));
  return rows.map((r) => {
    const p = people.get(r.userId);
    return { userId: r.userId, name: p?.name ?? "Former user", branchName: p?.branchName ?? null, year: p?.year ?? null, status: r.status, responses: (r.responses ?? {}) as Record<string, unknown>, createdAt: r.createdAt };
  });
}

export interface CalendarEvent {
  id: string;
  title: string;
  venue: string;
  startAt: Date;
  endAt: Date;
  societyName: string | null;
  status: StoredStatus;
  mine: boolean;
}

/** For the calendar (FR-CAL-1 society layer, OI-24): published events in a window, optionally only the user's own. */
export async function listEventsForCalendar(prisma: PrismaClient, userId: string, from: Date, to: Date, mineOnly: boolean, now = new Date()): Promise<CalendarEvent[]> {
  const rows = await prisma.event.findMany({
    where: {
      status: { not: "DRAFT" },
      startAt: { lt: to },
      endAt: { gt: from },
      OR: [{ societyId: null }, { society: { isActive: true } }],
      ...(mineOnly ? { OR: [{ registrations: { some: { userId, status: { in: ["REGISTERED", "WAITLISTED"] } } } }, { interests: { some: { userId } } }] } : {}),
    },
    orderBy: { startAt: "asc" },
    take: 500,
    select: {
      id: true,
      title: true,
      venue: true,
      startAt: true,
      endAt: true,
      status: true,
      society: { select: { name: true } },
      registrations: { where: { userId, status: { in: ["REGISTERED", "WAITLISTED"] } }, select: { status: true } },
      interests: { where: { userId }, select: { userId: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    venue: r.venue,
    startAt: r.startAt,
    endAt: r.endAt,
    societyName: r.society?.name ?? null,
    status: effectiveStatus(r, now),
    mine: r.registrations.length > 0 || r.interests.length > 0,
  }));
}

/** Counts for the user's profile and Home (registered events). */
export const myRegistrationCount = (prisma: PrismaClient, userId: string) => prisma.eventRegistration.count({ where: { userId, status: "REGISTERED" } });
