import "server-only";

// Find Mates and chat (FR-MATE-1..5, UC-10, ACT-1..9, SPEC-MATE-COUNT, OI-15, OI-16, OI-17).
// Acceptance locks the request row, so concurrent acceptances never exceed the team size; the
// unique (request, responder) pair prevents duplicate responses. Chat is 1:1 per MateConnection and
// every read or write checks that the caller is one of its two participants (IDOR, 404 otherwise).
import { hasUnread, notify } from "@/modules/notifications";
import { enqueue } from "@/modules/outbox";
import type { Db, PrismaClient } from "@/shared/db/client";
import { type ApiActor, conflict, forbidden, invalid, invalidState, notFound, ok, type ServiceResult } from "@/shared/http/api-action";
import { cleanPlainText, htmlToPlainText, sanitizeRichText } from "@/shared/security/sanitize-html";

import { createRequestSchema, decideSchema, fieldErrors, MAX_EXPIRY_DAYS, messageSchema, respondSchema } from "./schemas";

const isUniqueViolation = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

/** UC-10 steps 4 to 6: validate, sanitise, create with status OPEN and current count 1 (P2). */
export async function createRequest(prisma: PrismaClient, actor: ApiActor, raw: unknown, activeTags: () => Promise<Set<string>>, now = new Date()): Promise<ServiceResult<{ id: string }>> {
  if (actor.capacity !== "personal") return forbidden;
  const parsed = createRequestSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const input = parsed.data;
  const fields: Record<string, string> = {};
  const description = sanitizeRichText(input.description);
  const text = htmlToPlainText(description);
  if (text.length === 0) fields.description = "Describe what you are looking for.";
  else if (text.length > 3000) fields.description = "Use at most 3000 characters.";
  const expiresAt = new Date(input.expiresAt);
  if (expiresAt <= now) fields.expiresAt = "The expiry date must be in the future.";
  else if (expiresAt.getTime() - now.getTime() > MAX_EXPIRY_DAYS * 86_400_000) fields.expiresAt = `Choose a date within ${MAX_EXPIRY_DAYS} days.`;
  const known = await activeTags();
  if (input.skills.some((s) => !known.has(s))) fields.skills = "Choose skills from the list.";
  if (Object.keys(fields).length) return invalid(fields);
  const request = await prisma.mateRequest.create({
    data: {
      creatorId: actor.userId,
      title: input.title,
      description,
      type: input.type,
      subject: input.subject ?? null,
      teamSize: input.teamSize,
      expiresAt,
      skills: { create: input.skills.map((tagSlug) => ({ tagSlug })) },
    },
    select: { id: true },
  });
  return ok(request);
}

const isLive = (r: { status: string; expiresAt: Date }, now: Date) => r.status === "OPEN" && r.expiresAt > now;

/** ACT-3: respond with a message (FR-MATE-3). Not to one's own, closed or expired requests. */
export async function respond(prisma: PrismaClient, actor: ApiActor, requestId: string, raw: unknown, now = new Date()): Promise<ServiceResult<{ id: string }>> {
  if (actor.capacity !== "personal") return forbidden;
  const parsed = respondSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const request = await prisma.mateRequest.findUnique({ where: { id: requestId }, select: { creatorId: true, status: true, expiresAt: true, title: true } });
  if (!request) return notFound;
  if (request.creatorId === actor.userId) return invalidState("You cannot respond to your own request.");
  if (!isLive(request, now)) return invalidState("This request is closed or has expired.");
  try {
    return await prisma.$transaction(async (tx): Promise<ServiceResult<{ id: string }>> => {
      const response = await tx.mateResponse.create({ data: { requestId, responderId: actor.userId, message: cleanPlainText(parsed.data.message) }, select: { id: true } });
      // ACT-4: notify the requester.
      await notify(tx, { recipients: [request.creatorId], type: "mate.response.received", payload: { requestId, requestTitle: request.title }, sourceKey: `mate.response:${response.id}` });
      return ok(response);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return conflict("You have already responded to this request.");
    throw error;
  }
}

/**
 * ACT-5 to ACT-9: the requester accepts or rejects a pending response. Accepting creates the
 * connection (and so the chat), increments current_count and closes the request when the team is full.
 */
export async function decide(prisma: PrismaClient, actor: ApiActor, requestId: string, responseId: string, raw: unknown, now = new Date()): Promise<ServiceResult<{ connectionId: string | null }>> {
  const parsed = decideSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  return prisma.$transaction(async (tx): Promise<ServiceResult<{ connectionId: string | null }>> => {
    await tx.$queryRaw`SELECT "id" FROM "findmates_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
    const request = await tx.mateRequest.findUnique({ where: { id: requestId } });
    if (!request) return notFound;
    if (request.creatorId !== actor.userId) return request ? forbidden : notFound;
    const response = await tx.mateResponse.findFirst({ where: { id: responseId, requestId } });
    if (!response) return notFound;
    if (response.status !== "PENDING") return invalidState("This response has already been decided.");
    if (parsed.data.decision === "REJECT") {
      await tx.mateResponse.update({ where: { id: responseId }, data: { status: "REJECTED", decidedAt: now } });
      // ACT-6: rejection notification.
      await notify(tx, { recipients: [response.responderId], type: "mate.response.rejected", payload: { requestId, requestTitle: request.title }, sourceKey: `mate.response:${responseId}:rejected` });
      return ok({ connectionId: null });
    }
    if (!isLive(request, now)) return invalidState("This request is closed or has expired.");
    if (request.currentCount >= request.teamSize) return invalidState("The team is already full.");
    await tx.mateResponse.update({ where: { id: responseId }, data: { status: "ACCEPTED", decidedAt: now } });
    const connection = await tx.mateConnection.create({ data: { requestId, responseId, requesterId: request.creatorId, responderId: response.responderId }, select: { id: true } });
    const newCount = request.currentCount + 1;
    await tx.mateRequest.update({
      where: { id: requestId },
      data: {
        currentCount: newCount,
        firstAcceptedAt: request.firstAcceptedAt ?? now,
        // ACT-9: close when the team is full.
        ...(newCount >= request.teamSize ? { status: "CLOSED", closedAt: now } : {}),
      },
    });
    // ACT-7: acceptance notification; ACT-8: the chat channel is the connection.
    await notify(tx, { recipients: [response.responderId], type: "mate.response.accepted", payload: { requestId, requestTitle: request.title, connectionId: connection.id }, sourceKey: `mate.response:${responseId}:accepted` });
    return ok({ connectionId: connection.id });
  });
}

/** OI-16: the requester closes the request early. */
export async function closeRequest(prisma: PrismaClient, actor: ApiActor, requestId: string, now = new Date()): Promise<ServiceResult> {
  const request = await prisma.mateRequest.findUnique({ where: { id: requestId }, select: { creatorId: true } });
  if (!request) return notFound;
  if (request.creatorId !== actor.userId) return forbidden;
  const { count } = await prisma.mateRequest.updateMany({ where: { id: requestId, status: "OPEN" }, data: { status: "CLOSED", closedAt: now } });
  return count ? ok(undefined) : invalidState("This request is already closed.");
}

/** FR-MATE-5 job: OPEN requests past their expiry become EXPIRED (queries already hide them). */
export async function expireRequests(prisma: PrismaClient, now = new Date()): Promise<number> {
  const { count } = await prisma.mateRequest.updateMany({ where: { status: "OPEN", expiresAt: { lte: now } }, data: { status: "EXPIRED", closedAt: now } });
  return count;
}

/** The connection, when `userId` is one of its two participants; otherwise null (never reveals existence). */
export async function participantConnection(db: Db, userId: string, connectionId: string) {
  const connection = await db.mateConnection.findUnique({ where: { id: connectionId }, select: { id: true, requesterId: true, responderId: true, request: { select: { id: true, title: true } } } });
  if (!connection || (connection.requesterId !== userId && connection.responderId !== userId)) return null;
  return connection;
}

/** FR-MATE-4 chat: send a message (persisted, sanitised, then published live). */
export async function sendMessage(prisma: PrismaClient, actor: ApiActor, connectionId: string, raw: unknown): Promise<ServiceResult<{ id: string; createdAt: Date }>> {
  if (actor.capacity !== "personal") return forbidden;
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const body = cleanPlainText(parsed.data.body);
  if (!body) return invalid({ body: "Write a message." });
  return prisma.$transaction(async (tx): Promise<ServiceResult<{ id: string; createdAt: Date }>> => {
    const connection = await participantConnection(tx, actor.userId, connectionId);
    if (!connection) return notFound;
    const message = await tx.chatMessage.create({ data: { connectionId, senderId: actor.userId, body }, select: { id: true, createdAt: true } });
    const other = connection.requesterId === actor.userId ? connection.responderId : connection.requesterId;
    // One unread chat notification per conversation at a time (no notification flood).
    if (!(await hasUnread(tx, other, `chat:${connectionId}:`))) await notify(tx, { recipients: [other], type: "chat.message", payload: { connectionId, requestTitle: connection.request.title }, sourceKey: `chat:${connectionId}:${message.id}` });
    await enqueue(tx, { type: "realtime.publish", payload: { channel: `connection:${connectionId}`, body: JSON.stringify({ kind: "message", id: message.id }) }, dedupeKey: `chat.message:${message.id}` });
    return ok(message);
  });
}

/** Messages of a conversation the caller takes part in (oldest first; `after` = last seen id for re-sync). */
export async function listMessages(prisma: PrismaClient, userId: string, connectionId: string, after?: string): Promise<{ id: string; mine: boolean; body: string; hidden: boolean; createdAt: Date }[] | null> {
  const connection = await participantConnection(prisma, userId, connectionId);
  if (!connection) return null;
  let since: Date | undefined;
  if (after) {
    const anchor = await prisma.chatMessage.findFirst({ where: { id: after, connectionId }, select: { createdAt: true } });
    since = anchor?.createdAt;
  }
  const rows = await prisma.chatMessage.findMany({
    where: { connectionId, ...(since ? { createdAt: { gt: since } } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500,
    select: { id: true, senderId: true, body: true, hiddenAt: true, createdAt: true },
  });
  return rows.map((m) => ({ id: m.id, mine: m.senderId === userId, body: m.hiddenAt ? "" : m.body, hidden: m.hiddenAt !== null, createdAt: m.createdAt }));
}

/** Moderation (Slice 5): hide or restore a chat message. */
export async function setMessageHidden(prisma: PrismaClient, messageId: string, hidden: boolean): Promise<boolean> {
  const { count } = await prisma.chatMessage.updateMany({ where: { id: messageId }, data: { hiddenAt: hidden ? new Date() : null } });
  return count === 1;
}
