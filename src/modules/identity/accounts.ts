import "server-only";

// Account administration (Slice 5, ADR-0010 §3 and §4). Every privilege or access change revokes the
// user's sessions in the same transaction, so the change applies on the next request. Callers pass
// their transaction so the change and their audit entry commit together.
import type { Db, PrismaClient } from "@/shared/db/client";

export type UserRole = "STUDENT" | "FACULTY" | "ADMIN";

/** Sets the role and revokes all sessions. Returns the previous role, or null if the user does not exist. */
export async function setUserRole(db: Db, userId: string, role: UserRole): Promise<{ previous: UserRole; sessionsRevoked: number } | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!row) return null;
  await db.user.update({ where: { id: userId }, data: { role } });
  const { count } = await db.session.deleteMany({ where: { userId } });
  return { previous: row.role, sessionsRevoked: count };
}

/** Bans (reason) or unbans (null) a user. A ban revokes all sessions. False if the user does not exist. */
export async function setUserBan(db: Db, userId: string, reason: string | null, now = new Date()): Promise<boolean> {
  const { count } = await db.user.updateMany({ where: { id: userId }, data: reason ? { bannedAt: now, bannedReason: reason } : { bannedAt: null, bannedReason: null } });
  if (count === 0) return false;
  if (reason) await db.session.deleteMany({ where: { userId } });
  return true;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchName: string | null;
  year: number | null;
  profileComplete: boolean;
  bannedAt: Date | null;
  bannedReason: string | null;
  createdAt: Date;
  activeSessions: number;
}

/** Admin user directory (Slice 5). Search by name or email. */
export async function listUsersForAdmin(prisma: PrismaClient, q: string | undefined, take = 50): Promise<AdminUserRow[]> {
  const term = q?.trim().slice(0, 100);
  const rows = await prisma.user.findMany({
    where: term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term.toLowerCase() } }] } : {},
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, name: true, email: true, role: true, year: true, profileCompletedAt: true, bannedAt: true, bannedReason: true, createdAt: true, branch: { select: { name: true } }, _count: { select: { sessions: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, branchName: r.branch?.name ?? null, year: r.year, profileComplete: r.profileCompletedAt !== null, bannedAt: r.bannedAt, bannedReason: r.bannedReason, createdAt: r.createdAt, activeSessions: r._count.sessions }));
}

/** Counts for the admin dashboard (MET-2). */
export async function userCounts(prisma: PrismaClient, since: Date): Promise<{ total: number; completedProfiles: number; newSince: number; activeSessionsSince: number; banned: number }> {
  const [total, completedProfiles, newSince, activeUsers, banned] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { profileCompletedAt: { not: null } } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.session.groupBy({ by: ["userId"], where: { updatedAt: { gte: since } } }),
    prisma.user.count({ where: { bannedAt: { not: null } } }),
  ]);
  return { total, completedProfiles, newSince, activeSessionsSince: activeUsers.length, banned };
}

export interface AdminSessionRow {
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  /** Shortened user agent, for recognising the device. */
  device: string | null;
}

/** FR-AUTH-4: the active sessions of the listed users, for the admin Users page (no tokens, ever). */
export async function sessionsByUser(prisma: PrismaClient, userIds: string[]): Promise<Map<string, AdminSessionRow[]>> {
  const rows = await prisma.session.findMany({ where: { userId: { in: userIds }, expiresAt: { gt: new Date() } }, orderBy: { updatedAt: "desc" }, select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true, userAgent: true } });
  const result = new Map<string, AdminSessionRow[]>();
  for (const r of rows) {
    const device = r.userAgent ? r.userAgent.replace(/\s+/g, " ").slice(0, 80) : null;
    result.set(r.userId, [...(result.get(r.userId) ?? []), { id: r.id, createdAt: r.createdAt, lastUsedAt: r.updatedAt, expiresAt: r.expiresAt, device }]);
  }
  return result;
}
