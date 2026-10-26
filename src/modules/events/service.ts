import "server-only";

// Events (FR-EVT-1..5, UC-07, OI-12, OI-13, OI-14, OI-34, OI-36; ADR-0013 §3.7).
// Who manages an event, checked on EVERY request from the database:
// - a society event: an active Head of that (active) society, acting in the personal capacity, via
//   getSocietyActor; actions are audited on behalf of the society;
// - a campus event (societyId null): a platform admin acting in the platform capacity.
// Platform admins may also cancel any event (oversight), audited as platform actions.
// Registration takes a row lock on the event, so capacity is never exceeded under concurrency; the
// unique (event, user) constraint prevents duplicates (FR-EVT-5).
import { audit } from "@/modules/admin";
import { notify } from "@/modules/notifications";
import { enqueue } from "@/modules/outbox";
import { getSocietyActor } from "@/modules/societies";
import type { Db, Prisma, PrismaClient } from "@/shared/db/client";
import { type ApiActor, forbidden, invalid, invalidState, notFound, ok, type ServiceResult } from "@/shared/http/api-action";
import { htmlToPlainText, sanitizeRichText } from "@/shared/security/sanitize-html";

import { cancelEventSchema, createEventSchema, fieldErrors, interestSchema, type RegistrationField, registerSchema, updateEventSchema, validateResponses } from "./schemas";

export type StoredStatus = "DRAFT" | "PUBLISHED" | "LIVE" | "COMPLETED" | "CANCELLED";

/** OI-13: LIVE and COMPLETED follow from the time window of a published event. */
export function effectiveStatus(event: { status: StoredStatus; startAt: Date; endAt: Date }, now = new Date()): StoredStatus {
  if (event.status === "DRAFT" || event.status === "CANCELLED") return event.status;
  if (now >= event.endAt) return "COMPLETED";
  if (now >= event.startAt) return "LIVE";
  return "PUBLISHED";
}

const isOpen = (status: StoredStatus) => status === "PUBLISHED" || status === "LIVE";

interface Manager {
  /** Audit attribution: on behalf of the society, or a platform action. */
  onBehalfOf?: { type: "society"; id: string };
}

/** Whether the actor may manage events of `societyId` (null = campus) in this request's capacity. */
async function managerFor(db: Db, actor: ApiActor, societyId: string | null): Promise<Manager | null> {
  if (societyId === null) return actor.capacity === "platform" ? {} : null;
  if (actor.capacity === "platform") return null;
  const society = await getSocietyActor(actor.userId, societyId);
  void db;
  return society ? { onBehalfOf: { type: "society", id: society.id } } : null;
}

function prepare(input: { title: string; description: string; venue: string; startAt: string; endAt: string; capacity: number }, now: Date, publishing: boolean) {
  const fields: Record<string, string> = {};
  const description = sanitizeRichText(input.description);
  if (htmlToPlainText(description).length === 0) fields.description = "Describe the event.";
  else if (htmlToPlainText(description).length > 5000) fields.description = "Use at most 5000 characters.";
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (endAt <= startAt) fields.endAt = "The end must be after the start.";
  if (publishing && startAt <= now) fields.startAt = "A published event must start in the future.";
  return { fields, description, startAt, endAt };
}

/** FR-EVT-1: create an event (draft or published). */
export async function createEvent(prisma: PrismaClient, actor: ApiActor, raw: unknown, now = new Date()): Promise<ServiceResult<{ id: string }>> {
  const parsed = createEventSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const input = parsed.data;
  const manager = await managerFor(prisma, actor, input.societyId ?? null);
  if (!manager) return forbidden;
  const prepared = prepare(input, now, input.publish);
  if (Object.keys(prepared.fields).length) return invalid(prepared.fields);
  return prisma.$transaction(async (tx): Promise<ServiceResult<{ id: string }>> => {
    const event = await tx.event.create({
      data: {
        societyId: input.societyId ?? null,
        title: input.title,
        description: prepared.description,
        venue: input.venue,
        startAt: prepared.startAt,
        endAt: prepared.endAt,
        capacity: input.capacity,
        registrationSchema: input.registrationSchema as Prisma.InputJsonValue,
        status: input.publish ? "PUBLISHED" : "DRAFT",
        publishedAt: input.publish ? now : null,
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await audit(tx, { actorId: actor.userId, action: input.publish ? "events.event.published" : "events.event.created", targetType: "event", targetId: event.id, details: { societyId: input.societyId ?? null }, onBehalfOf: manager.onBehalfOf });
    return ok(event);
  });
}

type EventRow = NonNullable<Awaited<ReturnType<Db["event"]["findUnique"]>>>;

async function loadManaged(tx: Db, actor: ApiActor, eventId: string): Promise<{ error: ServiceResult<never> } | { event: EventRow; manager: Manager }> {
  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (!event) return { error: notFound };
  const manager = await managerFor(tx, actor, event.societyId);
  if (!manager) return { error: event.status === "DRAFT" ? notFound : forbidden };
  return { event, manager };
}

/** Edit an event (FR-EVT-1). Capacity cannot drop below the registered count; increases promote the waitlist. */
export async function updateEvent(prisma: PrismaClient, actor: ApiActor, eventId: string, raw: unknown, now = new Date()): Promise<ServiceResult> {
  const parsed = updateEventSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    await lockEvent(tx, eventId);
    const loaded = await loadManaged(tx, actor, eventId);
    if ("error" in loaded) return loaded.error;
    const { event, manager } = loaded;
    const status = effectiveStatus(event, now);
    if (status === "CANCELLED" || status === "COMPLETED") return invalidState("Cancelled or completed events cannot be edited.");
    const prepared = prepare(parsed.data, now, false);
    if (parsed.data.capacity < event.registeredCount) prepared.fields.capacity = `${event.registeredCount} people are registered; capacity cannot be lower.`;
    if (Object.keys(prepared.fields).length) return invalid(prepared.fields);
    await tx.event.update({
      where: { id: eventId },
      data: {
        title: parsed.data.title,
        description: prepared.description,
        venue: parsed.data.venue,
        startAt: prepared.startAt,
        endAt: prepared.endAt,
        capacity: parsed.data.capacity,
        registrationSchema: parsed.data.registrationSchema as Prisma.InputJsonValue,
      },
    });
    await promoteWaitlist(tx, eventId, event.title, now);
    await audit(tx, { actorId: actor.userId, action: "events.event.updated", targetType: "event", targetId: eventId, onBehalfOf: manager.onBehalfOf });
    return ok(undefined);
  });
}

/** DRAFT -> PUBLISHED (manual, OI-13). */
export async function publishEvent(prisma: PrismaClient, actor: ApiActor, eventId: string, now = new Date()): Promise<ServiceResult> {
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    const loaded = await loadManaged(tx, actor, eventId);
    if ("error" in loaded) return loaded.error;
    if (loaded.event.status !== "DRAFT") return invalidState("Only a draft can be published.");
    if (loaded.event.startAt <= now) return invalid({ startAt: "A published event must start in the future." });
    const changed = await tx.event.updateMany({ where: { id: eventId, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: now } });
    if (changed.count === 0) return invalidState("Only a draft can be published.");
    await audit(tx, { actorId: actor.userId, action: "events.event.published", targetType: "event", targetId: eventId, onBehalfOf: loaded.manager.onBehalfOf });
    return ok(undefined);
  });
}

/** Cancel (terminal, OI-13). Registrants are notified; registration closes (UC-07 E3). */
export async function cancelEvent(prisma: PrismaClient, actor: ApiActor, eventId: string, raw: unknown, now = new Date()): Promise<ServiceResult> {
  const parsed = cancelEventSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    await lockEvent(tx, eventId);
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) return notFound;
    // Society Heads (on behalf of the society) or, for oversight, platform admins.
    const manager = actor.capacity === "platform" ? {} : await managerFor(tx, actor, event.societyId);
    if (!manager) return event.status === "DRAFT" ? notFound : forbidden;
    const status = effectiveStatus(event, now);
    if (status === "CANCELLED" || status === "COMPLETED") return invalidState("This event has already ended or been cancelled.");
    await tx.event.update({ where: { id: eventId }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: parsed.data.reason } });
    const registrants = await tx.eventRegistration.findMany({ where: { eventId, status: { in: ["REGISTERED", "WAITLISTED"] } }, select: { userId: true } });
    await notify(tx, { recipients: registrants.map((r) => r.userId), type: "event.cancelled", payload: { eventId, eventTitle: event.title }, sourceKey: `event:${eventId}:cancelled` });
    await audit(tx, { actorId: actor.userId, action: "events.event.cancelled", targetType: "event", targetId: eventId, details: { registrants: registrants.length }, onBehalfOf: manager.onBehalfOf });
    return ok(undefined);
  });
}

async function lockEvent(tx: Db, eventId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "events_events" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
}

/** OI-14: fill free places from the waitlist, first come first served, notifying each promoted person. */
async function promoteWaitlist(tx: Db, eventId: string, eventTitle: string, now: Date): Promise<number> {
  const event = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { capacity: true, registeredCount: true } });
  const free = event.capacity - event.registeredCount;
  if (free <= 0) return 0;
  const waiting = await tx.eventRegistration.findMany({ where: { eventId, status: "WAITLISTED" }, orderBy: [{ queuedAt: "asc" }, { id: "asc" }], take: free, select: { id: true, userId: true } });
  for (const registration of waiting) {
    await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "REGISTERED" } });
    await notify(tx, { recipients: [registration.userId], type: "event.registration.promoted", payload: { eventId, eventTitle }, sourceKey: `registration:${registration.id}:promoted:${now.getTime()}` });
  }
  if (waiting.length) await tx.event.update({ where: { id: eventId }, data: { registeredCount: { increment: waiting.length } } });
  return waiting.length;
}

/**
 * UC-07: register for a published or live event. Returns the registration status; an existing active
 * registration is returned unchanged (E1). Full events waitlist (E2); cancelled ones refuse (E3).
 */
export async function register(prisma: PrismaClient, actor: ApiActor, eventId: string, raw: unknown, now = new Date()): Promise<ServiceResult<{ status: "REGISTERED" | "WAITLISTED"; already: boolean }>> {
  const parsed = registerSchema.safeParse(raw ?? {});
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  if (actor.capacity !== "personal") return forbidden;
  return prisma.$transaction(async (tx): Promise<ServiceResult<{ status: "REGISTERED" | "WAITLISTED"; already: boolean }>> => {
    await lockEvent(tx, eventId);
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event || event.status === "DRAFT") return notFound;
    const status = effectiveStatus(event, now);
    if (status === "CANCELLED") return invalidState("This event was cancelled. Registration is closed.");
    if (!isOpen(status)) return invalidState("Registration is closed for this event.");
    const existing = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId: actor.userId } } });
    if (existing && existing.status !== "CANCELLED") return ok({ status: existing.status, already: true });
    const answers = validateResponses(event.registrationSchema as RegistrationField[], parsed.data.responses);
    if (!answers.ok) return invalid(answers.fields);
    const seat = event.registeredCount < event.capacity;
    const newStatus = seat ? ("REGISTERED" as const) : ("WAITLISTED" as const);
    const registration = existing
      ? await tx.eventRegistration.update({ where: { id: existing.id }, data: { status: newStatus, responses: answers.value, queuedAt: now, cancelledAt: null }, select: { id: true } })
      : await tx.eventRegistration.create({ data: { eventId, userId: actor.userId, status: newStatus, responses: answers.value, queuedAt: now }, select: { id: true } });
    if (seat) await tx.event.update({ where: { id: eventId }, data: { registeredCount: { increment: 1 } } });
    // UC-07 step 6: the confirmation notification is written with the registration (and pushed via the outbox).
    await notify(tx, {
      recipients: [actor.userId],
      type: seat ? "event.registration.confirmed" : "event.registration.waitlisted",
      payload: { eventId, eventTitle: event.title },
      sourceKey: `registration:${registration.id}:${newStatus}:${now.getTime()}`,
    });
    return ok({ status: newStatus, already: false });
  });
}

/** OI-14: cancel one's own registration before the start; the first waitlisted person is promoted. */
export async function cancelRegistration(prisma: PrismaClient, actor: ApiActor, eventId: string, now = new Date()): Promise<ServiceResult> {
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    await lockEvent(tx, eventId);
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event || event.status === "DRAFT") return notFound;
    const registration = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId: actor.userId } } });
    if (!registration || registration.status === "CANCELLED") return notFound;
    if (now >= event.startAt) return invalidState("Registrations cannot be cancelled after the event has started.");
    await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "CANCELLED", cancelledAt: now } });
    if (registration.status === "REGISTERED") {
      await tx.event.update({ where: { id: eventId }, data: { registeredCount: { decrement: 1 } } });
      if (effectiveStatus(event, now) !== "CANCELLED") await promoteWaitlist(tx, eventId, event.title, now);
    }
    return ok(undefined);
  });
}

/**
 * FR-EVT-4 / OI-36: "Interested" on published or live events. The unique key makes repeats harmless;
 * the counter changes in the same transaction and a versioned absolute count is queued for realtime.
 */
export async function setInterest(prisma: PrismaClient, actor: ApiActor, eventId: string, raw: unknown, now = new Date()): Promise<ServiceResult<{ interested: boolean; interestCount: number; version: number }>> {
  const parsed = interestSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  if (actor.capacity !== "personal") return forbidden;
  return prisma.$transaction(async (tx): Promise<ServiceResult<{ interested: boolean; interestCount: number; version: number }>> => {
    await lockEvent(tx, eventId);
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { status: true, startAt: true, endAt: true } });
    if (!event || event.status === "DRAFT") return notFound;
    if (!isOpen(effectiveStatus(event, now))) return invalidState("Interest can be shown only for upcoming or live events.");
    const changed = parsed.data.interested
      ? (await tx.eventInterest.createMany({ data: [{ eventId, userId: actor.userId }], skipDuplicates: true })).count
      : -(await tx.eventInterest.deleteMany({ where: { eventId, userId: actor.userId } })).count;
    const updated = changed
      ? await tx.event.update({ where: { id: eventId }, data: { interestCount: { increment: changed }, interestVersion: { increment: 1 } }, select: { interestCount: true, interestVersion: true } })
      : await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { interestCount: true, interestVersion: true } });
    if (changed) {
      await enqueue(tx, {
        type: "realtime.publish",
        payload: { channel: `event:${eventId}`, body: JSON.stringify({ kind: "interest", interestCount: updated.interestCount, version: updated.interestVersion }) },
        dedupeKey: `event.interest:${eventId}:${updated.interestVersion}`,
      });
    }
    return ok({ interested: parsed.data.interested, interestCount: updated.interestCount, version: updated.interestVersion });
  });
}

/** Scheduled job (OI-13): write the time-derived status back so stored and shown status agree. */
export async function tidyStatuses(prisma: PrismaClient, now = new Date()): Promise<number> {
  const completed = await prisma.event.updateMany({ where: { status: { in: ["PUBLISHED", "LIVE"] }, endAt: { lte: now } }, data: { status: "COMPLETED" } });
  const live = await prisma.event.updateMany({ where: { status: "PUBLISHED", startAt: { lte: now }, endAt: { gt: now } }, data: { status: "LIVE" } });
  return completed.count + live.count;
}

/** For managers: are they allowed to manage this event? (UI hint; the API re-checks.) */
export async function canManage(prisma: PrismaClient, actor: ApiActor, societyId: string | null): Promise<boolean> {
  return (await managerFor(prisma, actor, societyId)) !== null;
}

