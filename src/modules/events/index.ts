import "server-only";

// Public interface of the events module (Slice 2b). Pages read with the signed-in actor; every
// change goes through the route handlers below, which re-check authorisation per request.
import { apiDeps } from "@/modules/identity";
import { nudge } from "@/modules/outbox";
import { getDb } from "@/shared/db/client";
import { type ApiActor, RATE, runAction } from "@/shared/http/api-action";

import * as queries from "./queries";
import * as service from "./service";

export type { CalendarEvent, EventCard, EventDetail, EventFilters, RegistrationRow } from "./queries";
export type { RegistrationField } from "./schemas";
export { FIELD_TYPES, MAX_FIELDS } from "./schemas";
export { effectiveStatus } from "./service";

/** The page actor (personal capacity unless a page explicitly asks for the admin view). */
export const pageActor = (session: { user: { id: string; role: ApiActor["globalRole"] } }, capacity: ApiActor["capacity"] = "personal"): ApiActor => ({
  userId: session.user.id,
  globalRole: session.user.role,
  capacity: capacity === "platform" && session.user.role === "ADMIN" ? "platform" : "personal",
});

export const listEvents = (userId: string, filters?: queries.EventFilters) => queries.listEvents(getDb(), userId, filters);
export const getEvent = (actor: ApiActor, eventId: string) => queries.getEvent(getDb(), actor, eventId);
export const listRegistrations = (actor: ApiActor, eventId: string) => queries.listRegistrations(getDb(), actor, eventId);
export const listEventsForCalendar = (userId: string, from: Date, to: Date, mineOnly: boolean) => queries.listEventsForCalendar(getDb(), userId, from, to, mineOnly);
export const myRegistrationCount = (userId: string) => queries.myRegistrationCount(getDb(), userId);
/** Realtime authorisation: the event exists and is not a draft (its interest count is public to signed-in users). */
export const eventIsPublic = async (eventId: string) => ((await getDb().event.findUnique({ where: { id: eventId }, select: { status: true } }))?.status ?? "DRAFT") !== "DRAFT";
export const canManageEvents = (actor: ApiActor, societyId: string | null) => service.canManage(getDb(), actor, societyId);

/** Route handlers for /api/events/* (docs/api/events.md). */
export const eventsApi = {
  create: (request: Request) =>
    runAction(apiDeps(), request, { name: "events:create", maxBodyBytes: 256 * 1024, rules: RATE.create, body: true, status: 201, capacity: "either", run: (actor, body) => service.createEvent(getDb(), actor, body), output: (v) => ({ event: v }) }),
  update: (request: Request, id: string) =>
    runAction(apiDeps(), request, { name: "events:update", maxBodyBytes: 256 * 1024, rules: RATE.write, ids: [id], body: true, capacity: "either", run: (actor, body) => service.updateEvent(getDb(), actor, id, body) }),
  publish: (request: Request, id: string) =>
    runAction(apiDeps(), request, { name: "events:publish", rules: RATE.write, ids: [id], capacity: "either", run: (actor) => service.publishEvent(getDb(), actor, id) }),
  cancel: (request: Request, id: string) =>
    runAction(apiDeps(), request, { name: "events:cancel", rules: RATE.write, ids: [id], body: true, capacity: "either", run: (actor, body) => service.cancelEvent(getDb(), actor, id, body) }),
  register: async (request: Request, id: string) => {
    const response = await runAction(apiDeps(), request, { name: "events:register", rules: RATE.write, ids: [id], body: true, run: (actor, body) => service.register(getDb(), actor, id, body) });
    if (response.ok) await nudge();
    return response;
  },
  cancelRegistration: async (request: Request, id: string) => {
    const response = await runAction(apiDeps(), request, { name: "events:unregister", rules: RATE.write, ids: [id], run: (actor) => service.cancelRegistration(getDb(), actor, id) });
    if (response.ok) await nudge();
    return response;
  },
  interest: async (request: Request, id: string) => {
    const response = await runAction(apiDeps(), request, { name: "events:interest", rules: RATE.write, ids: [id], body: true, run: (actor, body) => service.setInterest(getDb(), actor, id, body) });
    if (response.ok) await nudge();
    return response;
  },
  /** GET: current interest count (HTTP re-sync after a realtime reconnect, ADR-0012). */
  interestCount: (request: Request, id: string) =>
    runAction(apiDeps(), request, {
      name: "events:count",
      rules: RATE.read,
      ids: [id],
      run: async () => {
        const row = await getDb().event.findUnique({ where: { id }, select: { status: true, interestCount: true, interestVersion: true } });
        return row && row.status !== "DRAFT" ? { ok: true, value: { interestCount: row.interestCount, version: row.interestVersion } } : { ok: false, code: "NOT_FOUND" };
      },
    }),
};

/** Admin dashboard counts (Slice 5). */
export async function eventCounts(now = new Date()): Promise<{ upcoming: number; drafts: number; registrations: number; interests: number }> {
  const db = getDb();
  const [upcoming, drafts, registrations, interests] = await Promise.all([
    db.event.count({ where: { status: { in: ["PUBLISHED", "LIVE"] }, endAt: { gt: now } } }),
    db.event.count({ where: { status: "DRAFT" } }),
    db.eventRegistration.count({ where: { status: "REGISTERED" } }),
    db.eventInterest.count(),
  ]);
  return { upcoming, drafts, registrations, interests };
}

/** Service job (OI-13). */
export const tidyEventStatuses = (now?: Date) => service.tidyStatuses(getDb(), now);
