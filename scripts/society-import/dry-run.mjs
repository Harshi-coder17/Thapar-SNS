#!/usr/bin/env node
// Society import DRY RUN (OI-57, ADR-0013 §5). Reads the research dataset and the target database and
// prints what an import would do. It never writes: there is no apply mode, and the database session
// is opened READ ONLY. Importing requires the owner's explicit approval and a separate, reviewed tool.
//
// Usage: node scripts/society-import/dry-run.mjs [dataset.json]   (DATABASE_URL from .env)
import { readFileSync } from "node:fs";

import "dotenv/config";
import pg from "pg";

import { planImport } from "./plan.mjs";

const file = process.argv[2] ?? "data/society-import/thapar-student-organisations.2026-10-25.json";
const dataset = JSON.parse(readFileSync(file, "utf8"));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("society-import dry run: DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
let existing;
try {
  await client.query("BEGIN READ ONLY");
  existing = (await client.query(`SELECT "name", "slug", "sourceKey" FROM "societies_societies"`)).rows;
  await client.query("ROLLBACK");
} finally {
  await client.end();
}

const records = dataset.records ?? [];
const plan = planImport(records, existing);
const flagged = records.filter((r) => r.review?.questionableFields?.length);
console.log(`Society import DRY RUN (nothing written). Dataset: ${file}`);
console.log(`Records: ${records.length}. Existing societies in the target database: ${existing.length}.`);
console.log(`Would create: ${plan.create.length} (hidden and inactive, awaiting their first Head and an admin's activation; data as officially published).`);
console.log(`Would skip (already present, never overwritten): ${plan.skip.length}.`);
for (const row of plan.skip) console.log(`  skip ${row.key}: ${row.reason} (${row.existing})`);
console.log(`Invalid: ${plan.invalid.length}.`);
for (const row of plan.invalid) console.log(`  invalid ${row.key}: ${row.problems.join("; ")}`);
console.log(`Possible duplicates kept separate: ${plan.possibleDuplicates.length}.`);
for (const row of plan.possibleDuplicates) console.log(`  ${row.key} may duplicate ${row.possibleDuplicateOf.join(", ")}`);
console.log(`Records with flagged fields (the official source contradicts itself or is malformed; kept raw): ${flagged.length}.`);
for (const row of flagged) console.log(`  ${row.key}: ${row.review.questionableFields.join(", ")}`);
const faculty = records.flatMap((r) => r.faculty ?? []);
const byStatus = {};
for (const person of faculty) byStatus[person.verification?.status ?? "unchecked"] = (byStatus[person.verification?.status ?? "unchecked"] ?? 0) + 1;
console.log(`Faculty associations: ${faculty.length}. Official faculty directory check: ${JSON.stringify(byStatus)}. (Current application rule: imported associations stay admin-visible until an admin reviews them.)`);
const redacted = faculty.filter((person) => person.redactions?.length).length;
console.log(`Faculty entries with recorded redactions: ${redacted}.`);
