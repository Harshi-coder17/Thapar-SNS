import "server-only";

// Public interface of the outbox module (ADR-0004, docs/database/background-jobs.md). Background work
// is written in the SAME transaction as the domain change (enqueue), then processed at least once by
// the service: a signed nudge after commit triggers immediate processing, and a 5-minute sweep catches
// anything missed. Handlers must be idempotent (state-conditional updates, unique constraints).
import { createHmac } from "node:crypto";

import type { Db, Prisma, PrismaClient } from "@/shared/db/client";
import { internalKey } from "@/shared/security/internal-keys";

export interface OutboxMessage {
  type: string;
  /** Ids only: no secrets, no file bytes. */
  payload: Record<string, string | number | boolean | null>;
  /** Producer-side de-duplication (e.g. `file.uploaded:<assetId>`): a second enqueue is ignored. */
  dedupeKey?: string;
  availableAt?: Date;
}

/** Writes outbox rows inside the caller's transaction. Rows whose dedupeKey already exists are skipped. */
export async function enqueue(db: Db, ...messages: OutboxMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await db.outboxEvent.createMany({
    data: messages.map((m) => ({ eventType: m.type, payload: m.payload as Prisma.InputJsonValue, dedupeKey: m.dedupeKey ?? null, availableAt: m.availableAt ?? new Date() })),
    skipDuplicates: true,
  });
}

export const LEASE_MS = 2 * 60 * 1000;
export const MAX_ATTEMPTS = 8;

/** Retry delay (§4.5): min(15 s × 2^(attempt-1), 32 min), ± 20 % jitter. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(15_000 * 2 ** Math.max(0, attempt - 1), 32 * 60_000);
  return Math.round(base * (0.8 + 0.4 * random()));
}

export interface ClaimedEvent {
  id: string;
  eventType: string;
  payload: Prisma.JsonValue;
  attemptCount: number;
}

/**
 * Claims up to `limit` due rows for `workerId` (FOR UPDATE SKIP LOCKED, so concurrent workers never
 * take the same row), including rows whose lease expired (a crashed worker).
 */
export async function claimDue(prisma: PrismaClient, workerId: string, limit: number, now = new Date()): Promise<ClaimedEvent[]> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  return prisma.$queryRaw<ClaimedEvent[]>`
    UPDATE "outbox_events" o
       SET "status" = 'PROCESSING', "lockedBy" = ${workerId}, "lockedUntil" = ${leaseUntil}, "attemptCount" = o."attemptCount" + 1
     WHERE o."id" IN (
       SELECT "id" FROM "outbox_events"
        WHERE ("status" = 'PENDING' AND "availableAt" <= ${now})
           OR ("status" = 'PROCESSING' AND "lockedUntil" < ${now})
        ORDER BY "availableAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING o."id", o."eventType", o."payload", o."attemptCount"`;
}

/** Marks a claimed row done, only if this worker still holds the lease (a stale worker changes nothing). */
export async function complete(prisma: PrismaClient, id: string, workerId: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.outboxEvent.updateMany({
    where: { id, lockedBy: workerId, status: "PROCESSING" },
    data: { status: "DONE", processedAt: now, lockedBy: null, lockedUntil: null, lastError: null },
  });
  return count === 1;
}

/** Records an infrastructure failure: retried with backoff, DEAD after MAX_ATTEMPTS. */
export async function fail(prisma: PrismaClient, id: string, workerId: string, attemptCount: number, errorName: string, now = new Date()): Promise<"retry" | "dead" | "stale"> {
  const dead = attemptCount >= MAX_ATTEMPTS;
  const { count } = await prisma.outboxEvent.updateMany({
    where: { id, lockedBy: workerId, status: "PROCESSING" },
    data: dead
      ? { status: "DEAD", lockedBy: null, lockedUntil: null, lastError: errorName, processedAt: now }
      : { status: "PENDING", lockedBy: null, lockedUntil: null, lastError: errorName, availableAt: new Date(now.getTime() + backoffMs(attemptCount)) },
  });
  if (count === 0) return "stale";
  return dead ? "dead" : "retry";
}

/** Admin: DEAD rows for the dashboard. */
export const listDead = (prisma: PrismaClient, take = 100) =>
  prisma.outboxEvent.findMany({ where: { status: "DEAD" }, orderBy: { createdAt: "desc" }, take, select: { id: true, eventType: true, attemptCount: true, lastError: true, createdAt: true, processedAt: true } });

/** Admin: put a DEAD row back in the queue (after the cause is fixed). */
export async function requeueDead(prisma: PrismaClient, id: string): Promise<boolean> {
  const { count } = await prisma.outboxEvent.updateMany({ where: { id, status: "DEAD" }, data: { status: "PENDING", attemptCount: 0, availableAt: new Date(), lastError: null } });
  return count === 1;
}

/** Queue health for the admin dashboard. */
export async function queueStats(prisma: PrismaClient): Promise<{ pending: number; processing: number; dead: number; oldestPendingAt: Date | null }> {
  const [pending, processing, dead, oldest] = await Promise.all([
    prisma.outboxEvent.count({ where: { status: "PENDING" } }),
    prisma.outboxEvent.count({ where: { status: "PROCESSING" } }),
    prisma.outboxEvent.count({ where: { status: "DEAD" } }),
    prisma.outboxEvent.findFirst({ where: { status: "PENDING" }, orderBy: { availableAt: "asc" }, select: { createdAt: true } }),
  ]);
  return { pending, processing, dead, oldestPendingAt: oldest?.createdAt ?? null };
}

/** Outbox retention (§6): DONE rows older than 14 days are deleted. */
export async function deleteOldDone(prisma: PrismaClient, now = new Date()): Promise<number> {
  const { count } = await prisma.outboxEvent.deleteMany({ where: { status: "DONE", processedAt: { lt: new Date(now.getTime() - 14 * 86_400_000) } } });
  return count;
}

/** Signs a nudge body: HMAC-SHA256 over `timestamp.body` with the internal service key (§3.2). */
export function signNudge(timestamp: number, body: string, key = internalKey("service-nudge")): string {
  return createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex");
}

/** The local service's base URL (SERVICE_URL, default http://127.0.0.1:4100). */
export const serviceUrl = () => process.env.SERVICE_URL ?? "http://127.0.0.1:4100";

/**
 * Fire-and-forget hint to the service to process the queue now. Losing it never loses work: the
 * sweep picks the rows up. Never throws; 2-second timeout.
 */
export async function nudge(): Promise<void> {
  try {
    const body = JSON.stringify({ at: Date.now() });
    const timestamp = Date.now();
    await fetch(`${serviceUrl()}/internal/nudge`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-timestamp": String(timestamp), "x-signature": signNudge(timestamp, body) },
      body,
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // The sweep covers a lost nudge.
  }
}
