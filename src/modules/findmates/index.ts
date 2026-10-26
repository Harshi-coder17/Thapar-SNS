import "server-only";

// Public interface of the findmates module (Slices 2c and 4a).
import { apiDeps, profileOptions } from "@/modules/identity";
import { nudge } from "@/modules/outbox";
import { getDb } from "@/shared/db/client";
import { RATE, runAction } from "@/shared/http/api-action";

import * as queries from "./queries";
import * as service from "./service";

export type { BrowseFilters, ConnectionView, RequestCard, RequestDetail, ResponseView } from "./queries";
export { MAX_EXPIRY_DAYS, MAX_SKILLS, matchScore } from "./schemas";

const activeTags = async () => new Set((await profileOptions()).tags.map((t) => t.slug));

export const browseRequests = (userId: string, filters?: queries.BrowseFilters) => queries.browse(getDb(), userId, filters);
export const getRequest = (userId: string, requestId: string) => queries.getRequest(getDb(), userId, requestId);
export const listConnections = (userId: string) => queries.listConnections(getDb(), userId);
export const listMessages = (userId: string, connectionId: string, after?: string) => service.listMessages(getDb(), userId, connectionId, after);
export const participantConnection = (userId: string, connectionId: string) => service.participantConnection(getDb(), userId, connectionId);
export const timeToMatchHours = (since?: Date) => queries.timeToMatchHours(getDb(), since);

/** Route handlers for /api/mates/* (docs/api/findmates.md). */
export const matesApi = {
  create: (request: Request) =>
    runAction(apiDeps(), request, { name: "mates:create", maxBodyBytes: 256 * 1024, rules: RATE.create, body: true, status: 201, run: (actor, body) => service.createRequest(getDb(), actor, body, activeTags), output: (v) => ({ request: v }) }),
  respond: async (request: Request, id: string) => {
    const response = await runAction(apiDeps(), request, { name: "mates:respond", rules: RATE.create, ids: [id], body: true, status: 201, run: (actor, body) => service.respond(getDb(), actor, id, body), output: (v) => ({ response: v }) });
    if (response.ok) await nudge();
    return response;
  },
  decide: async (request: Request, id: string, responseId: string) => {
    const response = await runAction(apiDeps(), request, { name: "mates:decide", rules: RATE.write, ids: [id, responseId], body: true, run: (actor, body) => service.decide(getDb(), actor, id, responseId, body) });
    if (response.ok) await nudge();
    return response;
  },
  close: (request: Request, id: string) => runAction(apiDeps(), request, { name: "mates:close", rules: RATE.write, ids: [id], run: (actor) => service.closeRequest(getDb(), actor, id) }),
  send: async (request: Request, connectionId: string) => {
    const response = await runAction(apiDeps(), request, { name: "chat:send", rules: RATE.create, ids: [connectionId], body: true, status: 201, run: (actor, body) => service.sendMessage(getDb(), actor, connectionId, body), output: (v) => ({ message: v }) });
    if (response.ok) await nudge();
    return response;
  },
  /** GET messages (HTTP re-sync after a realtime reconnect: ?after=<last id>). */
  messages: (request: Request, connectionId: string) =>
    runAction(apiDeps(), request, {
      name: "chat:read",
      rules: RATE.read,
      ids: [connectionId],
      run: async (actor) => {
        const after = new URL(request.url).searchParams.get("after") ?? undefined;
        const messages = await service.listMessages(getDb(), actor.userId, connectionId, after && /^[0-9a-f-]{36}$/i.test(after) ? after : undefined);
        return messages ? { ok: true, value: { messages } } : { ok: false, code: "NOT_FOUND" };
      },
    }),
};

/** Admin dashboard counts (Slice 5). */
export async function mateCounts(now = new Date()): Promise<{ open: number; connections: number; messages: number }> {
  const db = getDb();
  const [open, connections, messages] = await Promise.all([db.mateRequest.count({ where: { status: "OPEN", expiresAt: { gt: now } } }), db.mateConnection.count(), db.chatMessage.count()]);
  return { open, connections, messages };
}

/** Service job (FR-MATE-5). */
export const expireMateRequests = (now?: Date) => service.expireRequests(getDb(), now);
/** Moderation (Slice 5). */
export const setChatMessageHidden = (messageId: string, hidden: boolean) => service.setMessageHidden(getDb(), messageId, hidden);
/** Moderation: a chat message visible to `userId` (a participant), or null. */
export async function messageForParticipant(userId: string, messageId: string): Promise<{ body: string } | null> {
  const message = await getDb().chatMessage.findUnique({ where: { id: messageId }, select: { body: true, connectionId: true, hiddenAt: true } });
  if (!message || message.hiddenAt || !(await service.participantConnection(getDb(), userId, message.connectionId))) return null;
  return { body: message.body };
}
export const chatMessageText = async (messageId: string) => (await getDb().chatMessage.findUnique({ where: { id: messageId }, select: { body: true } }))?.body ?? null;
