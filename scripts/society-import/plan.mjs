// Read-only planning core for the society import (OI-57, ADR-0013 §5). Pure functions, unit-tested;
// no database or file access here.

/** Lower-case URL name, the same rule as the societies module's slugify(). */
export function slugify(name) {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "society";
}

/** Case-, accent-, punctuation- and spacing-insensitive form of a name, for exact duplicate detection. */
export function normaliseName(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Classifies every dataset record against the societies already in the target database.
 * Nothing is ever merged or overwritten: a record that matches an existing society by source key or
 * normalised name is SKIPPED; a record flagged as a possible duplicate is still NEW but reported.
 */
export function planImport(records, existing) {
  const byKey = new Map(existing.filter((row) => row.sourceKey).map((row) => [row.sourceKey, row]));
  const byName = new Map(existing.map((row) => [normaliseName(row.name), row]));
  const seenKeys = new Set();
  const plan = { create: [], skip: [], invalid: [], possibleDuplicates: [] };
  for (const record of records) {
    const problems = [];
    if (typeof record.key !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(record.key)) problems.push("invalid key");
    if (seenKeys.has(record.key)) problems.push("key repeated in the dataset");
    if (typeof record.name !== "string" || record.name.trim().length < 3 || record.name.length > 150) problems.push("name must be 3 to 150 characters");
    if (record.source?.recordUrl && !/^https:\/\//.test(record.source.recordUrl)) problems.push("source URL must be https");
    seenKeys.add(record.key);
    if (problems.length) {
      plan.invalid.push({ key: record.key, name: record.name, problems });
      continue;
    }
    const match = byKey.get(record.key) ?? byName.get(normaliseName(record.name));
    if (match) {
      plan.skip.push({ key: record.key, name: record.name, existing: match.slug, reason: byKey.has(record.key) ? "source key already imported" : "same name as an existing society" });
      continue;
    }
    plan.create.push({ key: record.key, name: record.name, slug: slugify(record.name) });
    if (record.review?.possibleDuplicateOf?.length) plan.possibleDuplicates.push({ key: record.key, name: record.name, possibleDuplicateOf: record.review.possibleDuplicateOf });
  }
  return plan;
}
