import "server-only";

// Faculty directory import (Slice 4b; data/faculty-import). Creates profiles that do not exist yet,
// keyed by the stable source key (institutional email, else the official profile URL). It never
// overwrites or deletes an existing profile (a claimed profile may have faculty edits). Idempotent.
import { audit } from "@/modules/admin";
import type { PrismaClient } from "@/shared/db/client";

export interface FacultyRecord {
  key: string;
  name: string;
  designation: string;
  department: string;
  email: string | null;
  specialization: string | null;
  profileUrl: string;
  photoUrl: string | null;
  sourceUrl: string;
  /** Official page order (dataset fields; optional for older datasets). */
  unitOrder?: number;
  listingOrder?: number;
}

export interface FacultyImportReport {
  records: number;
  created: number;
  skipped: number;
  invalid: { key: string; problem: string }[];
  /** Published emails that are not @thapar.edu addresses (e.g. a typo on the source page): the profile is imported without an email. */
  emailsWithheld: { key: string; published: string }[];
}

const INSTITUTIONAL = /^[^\s@]+@thapar\.edu$/;

const https = (value: string | null | undefined) => typeof value === "string" && /^https:\/\/[^\s]+$/.test(value);

export function validateFacultyRecord(r: FacultyRecord): string | null {
  if (typeof r.key !== "string" || r.key.length < 3 || r.key.length > 300) return "invalid key";
  if (typeof r.name !== "string" || r.name.trim().length < 2 || r.name.length > 150) return "invalid name";
  if (typeof r.department !== "string" || r.department.trim().length < 2) return "missing department";
  if (typeof r.designation !== "string" || r.designation.trim().length < 2) return "missing designation";
  if (!https(r.profileUrl) || !https(r.sourceUrl)) return "source URLs must be https";
  if (r.photoUrl !== null && !https(r.photoUrl)) return "photo URL must be https";
  return null;
}

export async function importFacultyDirectory(prisma: PrismaClient, records: FacultyRecord[], options: { apply: boolean; fetchedAt: Date }): Promise<FacultyImportReport> {
  const report: FacultyImportReport = { records: records.length, created: 0, skipped: 0, invalid: [], emailsWithheld: [] };
  const valid = records.filter((r) => {
    const problem = validateFacultyRecord(r);
    if (problem) report.invalid.push({ key: r.key, problem });
    return !problem;
  });
  const existing = new Set((await prisma.facultyProfile.findMany({ select: { sourceKey: true } })).map((p) => p.sourceKey));
  const fresh = valid.filter((r) => !existing.has(r.key));
  report.skipped = valid.length - fresh.length;
  for (const r of fresh) if (r.email && !INSTITUTIONAL.test(r.email)) report.emailsWithheld.push({ key: r.key, published: r.email });
  report.created = fresh.length;
  if (!options.apply || fresh.length === 0) return report;
  await prisma.$transaction(async (tx) => {
    await tx.facultyProfile.createMany({
      data: fresh.map((r) => ({
        sourceKey: r.key,
        name: r.name.trim(),
        department: r.department.trim(),
        designation: r.designation.trim(),
        email: r.email && INSTITUTIONAL.test(r.email) ? r.email : null,
        specialization: r.specialization?.trim() || null,
        profileUrl: r.profileUrl,
        sourceUrl: r.sourceUrl,
        sourceFetchedAt: options.fetchedAt,
        unitOrder: r.unitOrder ?? null,
        listingOrder: r.listingOrder ?? null,
      })),
      skipDuplicates: true,
    });
    await audit(tx, { actorId: null, action: "faculty.directory.imported", targetType: "faculty_profile", details: { created: fresh.length, skipped: report.skipped } });
  });
  return report;
}

/**
 * Sets the official presentation order on existing profiles (matched by source key). Only the two order
 * columns change, and only where they differ; nothing else is touched. Idempotent.
 */
export async function applyOfficialOrder(prisma: PrismaClient, records: FacultyRecord[], options: { apply: boolean }): Promise<{ matched: number; changed: number }> {
  const withOrder = records.filter((r) => typeof r.unitOrder === "number" && typeof r.listingOrder === "number");
  const existing = new Map((await prisma.facultyProfile.findMany({ where: { sourceKey: { in: withOrder.map((r) => r.key) } }, select: { sourceKey: true, unitOrder: true, listingOrder: true } })).map((p) => [p.sourceKey, p]));
  const changes = withOrder.filter((r) => existing.has(r.key) && (existing.get(r.key)!.unitOrder !== r.unitOrder || existing.get(r.key)!.listingOrder !== r.listingOrder));
  if (options.apply && changes.length) {
    await prisma.$transaction(
      async (tx) => {
        for (const r of changes) await tx.facultyProfile.update({ where: { sourceKey: r.key }, data: { unitOrder: r.unitOrder, listingOrder: r.listingOrder } });
        await audit(tx, { actorId: null, action: "faculty.directory.order_set", targetType: "faculty_profile", details: { changed: changes.length } });
      },
      { timeout: 120_000 },
    );
  }
  return { matched: existing.size, changed: changes.length };
}

/** Profiles that still need their official photo (import tool). */
export async function profilesWithoutPhoto(prisma: PrismaClient, keys: string[]): Promise<{ id: string; sourceKey: string }[]> {
  return prisma.facultyProfile.findMany({ where: { sourceKey: { in: keys }, photoAssetId: null }, select: { id: true, sourceKey: true } });
}

/** Attaches an imported official photo (only if none is set; never replaces one). */
export async function attachImportedPhoto(prisma: PrismaClient, profileId: string, assetId: string, sourceUrl: string): Promise<boolean> {
  const { count } = await prisma.facultyProfile.updateMany({ where: { id: profileId, photoAssetId: null }, data: { photoAssetId: assetId, photoSourceUrl: sourceUrl } });
  return count === 1;
}

/** For linking society faculty associations to directory profiles: by institutional email or official profile URL. */
export async function profilesForLinking(prisma: PrismaClient): Promise<{ id: string; email: string | null; profileUrl: string | null }[]> {
  return prisma.facultyProfile.findMany({ select: { id: true, email: true, profileUrl: true } });
}
