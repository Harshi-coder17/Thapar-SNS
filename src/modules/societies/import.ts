import "server-only";

// Society list import, apply mode (ADR-0013 §5, OI-57; dataset data/society-import). In ONE
// transaction it creates every new record as inactive, unverified and awaiting its first Head, with
// its faculty associations unverified (admin-visible only). It skips records whose source key or
// name already exists, never overwrites, never deletes and never merges possible duplicates (they are
// created separately and reported). Fields the dataset flags as questionable are left empty rather
// than guessed. Idempotent: a second run creates nothing.
import { audit } from "@/modules/admin";
import type { PrismaClient } from "@/shared/db/client";

import { planImport } from "../../../scripts/society-import/plan.mjs";
import { categoryForSource } from "./source-categories";

export interface DatasetFaculty {
  name: string;
  department?: string | null;
  email?: string | null;
  sourceRole: string;
  verification?: { status?: string; matchBasis?: string; official?: { email?: string; profileUrl?: string } };
}

export interface DatasetRecord {
  key: string;
  name: string;
  shortName?: string | null;
  description?: string | null;
  contactEmail?: string | null;
  websites?: string[];
  logoReference?: string | null;
  faculty?: DatasetFaculty[];
  source?: { recordUrl?: string; sourceType?: string | null; sourceSubtype?: string | null };
  review?: { questionableFields?: string[]; possibleDuplicateOf?: string[] };
}

export interface SocietyImportReport {
  records: number;
  created: { key: string; slug: string }[];
  skipped: { key: string; reason: string }[];
  invalid: { key: string; problems: string[] }[];
  possibleDuplicates: { key: string; possibleDuplicateOf: string[] }[];
  facultyAssociations: number;
  linkedToDirectory: number;
}

type LinkTarget = { id: string; email: string | null; profileUrl: string | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function importSocieties(prisma: PrismaClient, records: DatasetRecord[], options: { apply: boolean; fetchedAt: Date; linkTargets: LinkTarget[] }): Promise<SocietyImportReport> {
  const existing = await prisma.society.findMany({ select: { name: true, slug: true, sourceKey: true } });
  const plan = planImport(records, existing);
  const byKey = new Map(records.map((r) => [r.key, r]));
  const byEmail = new Map(options.linkTargets.filter((t) => t.email).map((t) => [t.email!.toLowerCase(), t.id]));
  const byProfileUrl = new Map(options.linkTargets.filter((t) => t.profileUrl).map((t) => [t.profileUrl!, t.id]));
  const report: SocietyImportReport = {
    records: records.length,
    created: [],
    skipped: plan.skip.map((s) => ({ key: s.key, reason: s.reason })),
    invalid: plan.invalid.map((i) => ({ key: i.key, problems: i.problems })),
    possibleDuplicates: plan.possibleDuplicates,
    facultyAssociations: 0,
    linkedToDirectory: 0,
  };
  const takenSlugs = new Set(existing.map((e) => e.slug));
  const rows = plan.create.map((entry) => {
    const record = byKey.get(entry.key)!;
    const flagged = new Set(record.review?.questionableFields ?? []);
    let slug = entry.slug;
    for (let n = 2; takenSlugs.has(slug); n++) slug = `${entry.slug.slice(0, 56)}-${n}`;
    takenSlugs.add(slug);
    const website = flagged.has("websites") || flagged.has("websiteAsPublished") ? undefined : (record.websites ?? []).find((w) => /^https:\/\/[^\s]+$/.test(w));
    const faculty = (record.faculty ?? []).map((person) => {
      const verified = person.verification?.status === "verified";
      const officialEmail = person.verification?.official?.email?.toLowerCase();
      const profileId = verified ? ((officialEmail && byEmail.get(officialEmail)) ?? (person.verification?.official?.profileUrl && byProfileUrl.get(person.verification.official.profileUrl)) ?? null) : null;
      return {
        name: person.name.trim(),
        department: person.department?.trim() || null,
        email: person.email && EMAIL.test(person.email) ? person.email.toLowerCase() : null,
        sourceRole: person.sourceRole,
        sourceUrl: record.source?.recordUrl ?? null,
        facultyProfileId: profileId,
        matchBasis: profileId ? (person.verification?.matchBasis ?? null) : null,
      };
    });
    report.facultyAssociations += faculty.length;
    report.linkedToDirectory += faculty.filter((f) => f.facultyProfileId).length;
    report.created.push({ key: entry.key, slug });
    return {
      society: {
        slug,
        name: record.name.trim(),
        shortName: record.shortName?.trim() || null,
        description: record.description?.trim() || null,
        contactEmail: !flagged.has("contactEmail") && record.contactEmail && EMAIL.test(record.contactEmail) ? record.contactEmail.toLowerCase() : null,
        socialLinks: website ? { website } : {},
        isActive: false,
        sourceKey: entry.key,
        sourceType: record.source?.sourceType ?? null,
        sourceSubtype: record.source?.sourceSubtype ?? null,
        categorySlug: categoryForSource({ sourceType: record.source?.sourceType ?? null, sourceSubtype: record.source?.sourceSubtype ?? null }),
        sourceUrl: record.source?.recordUrl ?? null,
        sourceFetchedAt: options.fetchedAt,
      },
      faculty,
    };
  });
  if (!options.apply || rows.length === 0) return report;
  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const society = await tx.society.create({ data: row.society, select: { id: true } });
        if (row.faculty.length) await tx.societyFacultyAssociation.createMany({ data: row.faculty.map((f) => ({ ...f, societyId: society.id })) });
        await audit(tx, { actorId: null, action: "societies.society.imported", targetType: "society", targetId: society.id, details: { sourceKey: row.society.sourceKey, facultyAssociations: row.faculty.length } });
      }
    },
    { timeout: 120_000 },
  );
  return report;
}

/**
 * Sets the official source labels on existing imported societies (matched by source key) and, only
 * where a society has no category yet, the application category from the explicit mapping. A category
 * chosen by a Head or an admin is never overwritten. Idempotent; audited.
 */
export async function applySourceCategories(prisma: PrismaClient, records: DatasetRecord[], options: { apply: boolean }): Promise<{ matched: number; labelsSet: number; categoriesSet: number; byCategory: Record<string, number> }> {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const rows = await prisma.society.findMany({ where: { sourceKey: { in: [...byKey.keys()] } }, select: { id: true, sourceKey: true, sourceType: true, sourceSubtype: true, categorySlug: true } });
  const valid = new Set((await prisma.societyCategory.findMany({ where: { active: true }, select: { slug: true } })).map((c) => c.slug));
  const changes: { id: string; data: { sourceType?: string | null; sourceSubtype?: string | null; categorySlug?: string } }[] = [];
  const byCategory: Record<string, number> = {};
  let labelsSet = 0;
  let categoriesSet = 0;
  for (const row of rows) {
    const source = byKey.get(row.sourceKey!)!.source ?? {};
    const labels = { sourceType: source.sourceType ?? null, sourceSubtype: source.sourceSubtype ?? null };
    const data: (typeof changes)[number]["data"] = {};
    if (row.sourceType !== labels.sourceType || row.sourceSubtype !== labels.sourceSubtype) {
      data.sourceType = labels.sourceType;
      data.sourceSubtype = labels.sourceSubtype;
      labelsSet++;
    }
    const category = categoryForSource(labels);
    if (row.categorySlug === null && category && valid.has(category)) {
      data.categorySlug = category;
      categoriesSet++;
    }
    const finalCategory = data.categorySlug ?? row.categorySlug ?? "none";
    byCategory[finalCategory] = (byCategory[finalCategory] ?? 0) + 1;
    if (Object.keys(data).length) changes.push({ id: row.id, data });
  }
  if (options.apply && changes.length) {
    await prisma.$transaction(
      async (tx) => {
        for (const change of changes) await tx.society.update({ where: { id: change.id }, data: change.data });
        await audit(tx, { actorId: null, action: "societies.import.categories_set", targetType: "society", details: { labelsSet, categoriesSet } });
      },
      { timeout: 120_000 },
    );
  }
  return { matched: rows.length, labelsSet, categoriesSet, byCategory };
}

/** Imported societies still without a logo, with their official logo reference (import tool). */
export async function societiesNeedingLogo(prisma: PrismaClient, keys: string[]): Promise<{ id: string; sourceKey: string }[]> {
  return prisma.society.findMany({ where: { sourceKey: { in: keys }, logoAssetId: null }, select: { id: true, sourceKey: true } }) as Promise<{ id: string; sourceKey: string }[]>;
}

/** Attaches an imported official logo (only when none is set; never replaces a Head's upload). */
export async function attachImportedLogo(prisma: PrismaClient, societyId: string, assetId: string, sourceUrl: string): Promise<boolean> {
  const { count } = await prisma.society.updateMany({ where: { id: societyId, logoAssetId: null }, data: { logoAssetId: assetId, logoSourceUrl: sourceUrl } });
  return count === 1;
}
