import "server-only";

import type { PrismaClient } from "@/shared/db/client";

import type { IdentityAuth } from "./auth";
import { logIdentityError } from "./safe-log";
import { ACTIVITY_WRITE_INTERVAL_MS, checkSession, type DeviceClass, isWithinAbsoluteLifetime } from "./session-policy";

/** What the rest of the application may know about the signed-in user. Never includes tokens. */
export interface CurrentSession {
  sessionId: string;
  expiresAt: Date;
  user: { id: string; name: string; email: string; role: "STUDENT" | "FACULTY" | "ADMIN"; image: string | null };
  /** FR-AUTH-2: false until the first-time profile is completed (app pages require it). */
  profileComplete: boolean;
  /** Session policy (docs/auth/session-policy.md): the limits that apply and when they end. */
  deviceClass: DeviceClass;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface ReadSessionOptions {
  /**
   * True when this request is a user action (the activity signal, a submitted change): it extends the
   * inactivity limit. Background requests (realtime tickets, polling, live refreshes, page renders)
   * leave it unchanged, so an idle open tab still expires.
   */
  touch?: boolean;
}

/**
 * Reads the session server-side (C3: the browser never receives the session object).
 * Enforces the 30-day absolute lifetime (OI-05): an older session is deleted and treated as absent.
 */
export async function readCurrentSession(auth: IdentityAuth, prisma: PrismaClient, headers: Headers, now: Date = new Date(), options: ReadSessionOptions = {}): Promise<CurrentSession | null> {
  let result: Awaited<ReturnType<IdentityAuth["api"]["getSession"]>> = null;
  let failed = false;
  try {
    result = await auth.api.getSession({ headers });
  } catch (error) {
    logIdentityError("session lookup failed", error);
    failed = true;
  }
  // Deliberately thrown without `cause`: the original error message can contain request data,
  // and Next.js logs error causes (C7).
  if (failed) throw new Error("Session lookup failed");
  if (!result) return null;
  const { session, user } = result;
  if (!isWithinAbsoluteLifetime(new Date(session.createdAt), now)) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  // Device-specific inactivity and absolute limits (2026-10-26), from the stored session row.
  const stored = await prisma.session.findUnique({ where: { id: session.id }, select: { createdAt: true, lastActiveAt: true, userAgent: true } });
  if (!stored) return null;
  let check = checkSession(stored, now);
  if (!check.ok) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (options.touch && now.getTime() - stored.lastActiveAt.getTime() >= ACTIVITY_WRITE_INTERVAL_MS) {
    await prisma.session.updateMany({ where: { id: session.id }, data: { lastActiveAt: now } });
    check = checkSession({ ...stored, lastActiveAt: now }, now);
    if (!check.ok) return null;
  }
  // Role and profile state come from the database row, not from Better Auth's session object.
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, profileCompletedAt: true, bannedAt: true } });
  if (!row) return null;
  // Slice 5: a banned account has no usable session, even one created before the ban.
  if (row.bannedAt) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    return null;
  }
  const role = row.role;
  return {
    sessionId: session.id,
    expiresAt: new Date(session.expiresAt),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      image: user.image ?? null,
    },
    profileComplete: row.profileCompletedAt !== null,
    deviceClass: check.deviceClass,
    idleExpiresAt: check.idleExpiresAt,
    absoluteExpiresAt: check.absoluteExpiresAt,
  };
}

/**
 * Sliding-expiry cookie refresh (OI-05). Better Auth extends a used session's expiry once a day and
 * re-issues the cookie only from an HTTP endpoint (disabled by C3), while server-rendered pages
 * cannot set cookies. The request proxy calls this so the browser cookie slides with the database
 * session. Returns the Set-Cookie values to forward (usually none).
 */
export async function refreshedSessionCookies(auth: IdentityAuth, headers: Headers): Promise<string[]> {
  const { headers: responseHeaders } = await auth.api.getSession({ headers, returnHeaders: true });
  return responseHeaders?.getSetCookie() ?? [];
}

/** Revokes one session by id (admin path, FR-AUTH-4); effective on the next request. */
export async function revokeSessionById(prisma: PrismaClient, sessionId: string): Promise<boolean> {
  return (await prisma.session.deleteMany({ where: { id: sessionId } })).count > 0;
}

/** Revokes every session of a user (e.g. ban or privilege change). Returns the number removed. */
export async function revokeAllSessionsForUser(prisma: PrismaClient, userId: string): Promise<number> {
  return (await prisma.session.deleteMany({ where: { userId } })).count;
}

/** "Sign out other devices": revokes the user's sessions except the current one (replaces F-04). */
export async function revokeOtherSessions(prisma: PrismaClient, current: { userId: string; sessionId: string }): Promise<number> {
  return (await prisma.session.deleteMany({ where: { userId: current.userId, id: { not: current.sessionId } } })).count;
}

/** Deletes sessions past their sliding expiry or the 30-day absolute lifetime (housekeeping). */
export async function deleteStaleSessions(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const absoluteCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let count = (await prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { createdAt: { lte: absoluteCutoff } }] } })).count;
  // Sessions past their device's inactivity or absolute limit (they are refused on use anyway).
  const candidates = await prisma.session.findMany({
    where: { OR: [{ lastActiveAt: { lte: new Date(now.getTime() - 30 * 60 * 1000) } }, { createdAt: { lte: new Date(now.getTime() - 12 * 60 * 60 * 1000) } }] },
    select: { id: true, createdAt: true, lastActiveAt: true, userAgent: true },
    take: 1000,
  });
  const ended = candidates.filter((c) => !checkSession(c, now).ok).map((c) => c.id);
  if (ended.length) count += (await prisma.session.deleteMany({ where: { id: { in: ended } } })).count;
  return count;
}
