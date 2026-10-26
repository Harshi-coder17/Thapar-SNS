import "server-only";

// Public interface of the notifications module (OI-26: in-app notifications, pushed live when the
// user is connected). Producers call notify() inside their own transaction, so a notification exists
// if and only if the action committed. The unique (sourceKey, recipient) pair makes re-runs harmless.
// A `notification.created` outbox row asks the service to push the new unread count over realtime.
import { enqueue } from "@/modules/outbox";
import type { Db, Prisma, PrismaClient } from "@/shared/db/client";

/** Every notification type (OI-26) and how it is displayed. */
export const NOTIFICATION_TYPES = {
  "event.registration.confirmed": (p: Payload) => ({ title: `You are registered for ${p.eventTitle}`, href: `/events/${p.eventId}` }),
  "event.registration.waitlisted": (p: Payload) => ({ title: `You are on the waitlist for ${p.eventTitle}`, href: `/events/${p.eventId}` }),
  "event.registration.promoted": (p: Payload) => ({ title: `A place opened up: you are now registered for ${p.eventTitle}`, href: `/events/${p.eventId}` }),
  "event.cancelled": (p: Payload) => ({ title: `${p.eventTitle} was cancelled`, href: `/events/${p.eventId}` }),
  "mate.response.received": (p: Payload) => ({ title: `New response to "${p.requestTitle}"`, href: `/mates/${p.requestId}` }),
  "mate.response.accepted": (p: Payload) => ({ title: `Your response to "${p.requestTitle}" was accepted. Start chatting.`, href: `/chat/${p.connectionId}` }),
  "mate.response.rejected": (p: Payload) => ({ title: `Your response to "${p.requestTitle}" was not accepted`, href: `/mates/${p.requestId}` }),
  "chat.message": (p: Payload) => ({ title: `New message about "${p.requestTitle}"`, href: `/chat/${p.connectionId}` }),
  "upload.approved": (p: Payload) => ({ title: `Your upload "${p.name}" is now available`, href: String(p.href ?? "/materials") }),
  "upload.rejected": (p: Payload) => ({ title: `Your upload "${p.name}" was rejected: ${p.reason}`, href: String(p.href ?? "/materials") }),
  "archive.decided": (p: Payload) => ({ title: p.approved ? `Your project "${p.projectTitle}" was published` : `Your project "${p.projectTitle}" was not accepted${p.note ? `: ${p.note}` : ""}`, href: `/archive/${p.projectId}` }),
  "faculty.claim.decided": (p: Payload) => ({ title: p.approved ? "Your faculty profile claim was approved. Sign in again to use faculty access." : `Your faculty profile claim was not approved${p.reason ? `: ${p.reason}` : ""}`, href: `/faculty/${p.profileId}` }),
  "society.membership.decided": (p: Payload) => ({ title: p.approved ? `You are now a member of ${p.societyName}` : `Your request to join ${p.societyName} was not approved`, href: `/societies/${p.societySlug}` }),
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
type Payload = Record<string, string | number | boolean | null>;

/** Creates notifications inside the caller's transaction (idempotent per sourceKey and recipient). */
export async function notify(db: Db, input: { recipients: string[]; type: NotificationType; payload: Payload; sourceKey: string }): Promise<void> {
  const recipients = [...new Set(input.recipients)];
  if (recipients.length === 0) return;
  await db.notification.createMany({
    data: recipients.map((recipientId) => ({ recipientId, type: input.type, payload: input.payload as Prisma.InputJsonValue, sourceKey: input.sourceKey })),
    skipDuplicates: true,
  });
  await enqueue(db, ...recipients.map((recipientId) => ({ type: "notification.created", payload: { recipientId }, dedupeKey: `notification.created:${input.sourceKey}:${recipientId}` })));
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  href: string;
  read: boolean;
  createdAt: Date;
}

const view = (row: { id: string; type: string; payload: Prisma.JsonValue; readAt: Date | null; createdAt: Date }): NotificationView => {
  const render = NOTIFICATION_TYPES[row.type as NotificationType];
  const payload = (row.payload ?? {}) as Payload;
  const display = render ? render(payload) : { title: "Notification", href: "/notifications" };
  return { id: row.id, type: row.type, title: display.title, href: display.href, read: row.readAt !== null, createdAt: row.createdAt };
};

export async function listNotifications(prisma: PrismaClient, userId: string, options: { cursor?: string; take?: number } = {}): Promise<{ items: NotificationView[]; nextCursor: string | null }> {
  const take = Math.min(options.take ?? 30, 50);
  const rows = await prisma.notification.findMany({
    where: { recipientId: userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
  });
  const page = rows.slice(0, take);
  return { items: page.map(view), nextCursor: rows.length > take ? (page.at(-1)?.id ?? null) : null };
}

/** True when the recipient still has an unread notification whose source key starts with `prefix`. */
export async function hasUnread(db: Db, recipientId: string, sourceKeyPrefix: string): Promise<boolean> {
  return (await db.notification.findFirst({ where: { recipientId, readAt: null, sourceKey: { startsWith: sourceKeyPrefix } }, select: { id: true } })) !== null;
}

export const unreadCount = (prisma: PrismaClient, userId: string) => prisma.notification.count({ where: { recipientId: userId, readAt: null } });

/** Marks the user's own notifications read (all, or the given ids). Never touches anyone else's. */
export async function markRead(prisma: PrismaClient, userId: string, ids: string[] | "all", now = new Date()): Promise<number> {
  const { count } = await prisma.notification.updateMany({
    where: { recipientId: userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: now },
  });
  return count;
}
