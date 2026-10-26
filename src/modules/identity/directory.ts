import "server-only";

// Read-only user lookups for other modules (docs/architecture/modules.md §3 getUsers). They return
// the public profile only (OI-27): never the roll number, never session data. The email is
// returned only to the caller that already knows it (lookup by email, used by admins).
import type { Db } from "@/shared/db/client";

/** What another student may see about a user (OI-27 recommended default). */
export interface UserSummary {
  id: string;
  name: string;
  branchName: string | null;
  year: number | null;
}

export async function getUserSummaries(db: Db, ids: readonly string[]): Promise<Map<string, UserSummary>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, year: true, branch: { select: { name: true } } },
  });
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, branchName: row.branch?.name ?? null, year: row.year }]));
}

/** A user who has signed in at least once, found by email (case-insensitive), or null. */
export async function findUserByEmail(db: Db, email: string): Promise<{ id: string; name: string; profileComplete: boolean } | null> {
  const row = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, name: true, profileCompletedAt: true } });
  return row ? { id: row.id, name: row.name, profileComplete: row.profileCompletedAt !== null } : null;
}

/** The user's year and branch, used for recruitment eligibility. */
export async function getStudentFacts(db: Db, id: string): Promise<{ year: number | null; branchCode: string | null } | null> {
  return db.user.findUnique({ where: { id }, select: { year: true, branchCode: true } });
}

/** Skill tag slugs of the given users (public profile data, FR-AUTH-2), for match scoring (OI-17). */
export async function getUserSkillSlugs(db: Db, ids: readonly string[]): Promise<Map<string, string[]>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.userSkill.findMany({ where: { userId: { in: unique } }, select: { userId: true, tagSlug: true } });
  const result = new Map<string, string[]>(unique.map((id) => [id, []]));
  for (const row of rows) result.get(row.userId)!.push(row.tagSlug);
  return result;
}
