// Local data imports (owner instruction 2026-10-25: official Thapar data is treated as verified).
//
//   npm run import -- faculty   [--apply]   official faculty directory (data/faculty-import)
//   npm run import -- societies [--apply]   society list (data/society-import), ADR-0013 §5
//   npm run import -- images    [--apply]   official society logos and faculty photos
//   npm run import -- faculty-order [--apply] official page order for existing faculty profiles
//   npm run import -- society-categories [--apply] official source labels and mapped categories
//
// Without --apply nothing is written (a dry-run report is printed). With --apply every step is
// idempotent: existing rows are skipped, never overwritten or deleted. Images are downloaded only over
// https from official thapar.edu hosts and go through the same quarantine-first validation as user
// uploads (the background service approves or rejects them).
import { readFileSync } from "node:fs";

import sharp from "sharp";

import { importSystemAsset } from "@/modules/assets";
import { facultyImport, type FacultyRecord } from "@/modules/faculty";
import { nudge } from "@/modules/outbox";
import { type DatasetRecord, societyImport } from "@/modules/societies";

const FACULTY_FILE = "data/faculty-import/thapar-faculty.2026-10-25.json";
const SOCIETY_FILE = "data/society-import/thapar-student-organisations.2026-10-25.json";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SYSTEM_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const [command, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply");

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

/** Official hosts only: thapar.edu and its subdomains. */
export function officialImageUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname !== "thapar.edu" && !url.hostname.endsWith(".thapar.edu")) return null;
    url.protocol = "https:"; // always fetch over TLS
    return url;
  } catch {
    return null;
  }
}

async function download(url: URL): Promise<Buffer> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "user-agent": "thapar-sns-import/1.0 (local development)" } });
    if (response.status >= 300 && response.status < 400) {
      const next = officialImageUrl(new URL(response.headers.get("location") ?? "", current).toString());
      if (!next) throw new Error("redirect left the official hosts");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > MAX_IMAGE_BYTES) throw new Error("too large");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error("too large");
    return bytes;
  }
  throw new Error("too many redirects");
}

async function faculty() {
  const dataset = readJson<{ fetchedAt: string; records: FacultyRecord[] }>(FACULTY_FILE);
  const report = await facultyImport.run(dataset.records, { apply, fetchedAt: new Date(`${dataset.fetchedAt}T00:00:00Z`) });
  console.log(`Faculty directory ${apply ? "IMPORT" : "DRY RUN (nothing written)"}: ${report.records} records; ${apply ? "created" : "would create"} ${report.created}; skipped (already present) ${report.skipped}; invalid ${report.invalid.length}.`);
  for (const row of report.invalid) console.log(`  invalid ${row.key}: ${row.problem}`);
  for (const row of report.emailsWithheld) console.log(`  email not shown (published value is not an @thapar.edu address): ${row.published}`);
}

async function facultyOrder() {
  const dataset = readJson<{ records: FacultyRecord[] }>(FACULTY_FILE);
  const report = await facultyImport.order(dataset.records, { apply });
  console.log(`Faculty order ${apply ? "UPDATE" : "DRY RUN (nothing written)"}: ${report.matched} existing profiles matched; ${apply ? "updated" : "would update"} ${report.changed} (only the official order columns).`);
}

async function societyCategories() {
  const dataset = readJson<{ records: DatasetRecord[] }>(SOCIETY_FILE);
  const report = await societyImport.categories(dataset.records, { apply });
  console.log(`Society categories ${apply ? "UPDATE" : "DRY RUN (nothing written)"}: ${report.matched} imported societies matched; source labels ${apply ? "set" : "to set"} on ${report.labelsSet}; categories ${apply ? "set" : "to set"} on ${report.categoriesSet} (only where none existed).`);
  console.log(`Resulting categories: ${JSON.stringify(report.byCategory)}`);
}

async function societies() {
  const dataset = readJson<{ fetchedAt: string; records: DatasetRecord[] }>(SOCIETY_FILE);
  const report = await societyImport.run(dataset.records, { apply, fetchedAt: new Date(`${dataset.fetchedAt}T00:00:00Z`), linkTargets: await facultyImport.linkTargets() });
  console.log(`Society ${apply ? "IMPORT" : "DRY RUN (nothing written)"}: ${report.records} records; ${apply ? "created" : "would create"} ${report.created.length} (inactive, unverified, awaiting their first Head); skipped ${report.skipped.length}; invalid ${report.invalid.length}.`);
  for (const row of report.skipped) console.log(`  skip ${row.key}: ${row.reason}`);
  for (const row of report.invalid) console.log(`  invalid ${row.key}: ${row.problems.join("; ")}`);
  for (const row of report.possibleDuplicates) console.log(`  possible duplicate kept separate: ${row.key} ~ ${row.possibleDuplicateOf.join(", ")}`);
  console.log(`Faculty associations: ${report.facultyAssociations} (unverified until an admin reviews them); linked to an official directory profile: ${report.linkedToDirectory}.`);
}

async function images() {
  const societiesData = readJson<{ records: DatasetRecord[] }>(SOCIETY_FILE).records;
  const facultyData = readJson<{ records: FacultyRecord[] }>(FACULTY_FILE).records;
  const logoByKey = new Map(societiesData.map((r) => [r.key, r.logoReference ?? null]));
  const photoByKey = new Map(facultyData.map((r) => [r.key, r.photoUrl]));
  const logoTargets = await societyImport.needingLogo([...logoByKey.keys()]);
  const photoTargets = await facultyImport.withoutPhoto(facultyData.filter((r) => r.photoUrl).map((r) => r.key));
  const results = { logos: { imported: 0, skippedUnofficial: 0, failed: 0 }, photos: { imported: 0, skippedUnofficial: 0, failed: 0 } };
  const jobs = [
    ...logoTargets.map((t) => ({ kind: "logos" as const, id: t.id, key: t.sourceKey, raw: logoByKey.get(t.sourceKey) ?? null })),
    ...photoTargets.map((t) => ({ kind: "photos" as const, id: t.id, key: t.sourceKey, raw: photoByKey.get(t.sourceKey) ?? null })),
  ];
  console.log(`Images ${apply ? "IMPORT" : "DRY RUN (nothing downloaded or written)"}: ${logoTargets.length} societies without a logo, ${photoTargets.length} faculty profiles without a photo.`);
  for (const job of jobs) {
    const url = officialImageUrl(job.raw);
    if (!url) {
      results[job.kind].skippedUnofficial++;
      if (job.raw) console.log(`  skip ${job.key}: not an official thapar.edu image (${new URL(job.raw).hostname})`);
      continue;
    }
    if (!apply) {
      results[job.kind].imported++;
      continue;
    }
    try {
      let bytes = await download(url);
      const purpose = job.kind === "logos" ? "SOCIETY_LOGO" : "FACULTY_PHOTO";
      // OI-60: an official image larger than the 2 MB system-image limit is downscaled (at most 1200 px,
      // JPEG) before validation. The published URL stays recorded as its source.
      if (bytes.length > SYSTEM_IMAGE_MAX_BYTES) bytes = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
      const asset = await importSystemAsset({ purpose, fileName: decodeURIComponent(url.pathname.split("/").pop() ?? "image"), bytes, sourceUrl: job.raw! });
      if ("error" in asset) throw new Error(asset.error);
      const attached = job.kind === "logos" ? await societyImport.attachLogo(job.id, asset.assetId, job.raw!) : await facultyImport.attachPhoto(job.id, asset.assetId, job.raw!);
      if (attached) results[job.kind].imported++;
    } catch (error) {
      results[job.kind].failed++;
      console.log(`  failed ${job.key}: ${error instanceof Error ? error.message : "error"}`);
    }
  }
  console.log(`Logos: ${apply ? "imported" : "would import"} ${results.logos.imported}, skipped (not official) ${results.logos.skippedUnofficial}, failed ${results.logos.failed}.`);
  console.log(`Faculty photos: ${apply ? "imported" : "would import"} ${results.photos.imported}, skipped (not official) ${results.photos.skippedUnofficial}, failed ${results.photos.failed}.`);
  if (apply) {
    await nudge();
    console.log("Queued for validation: the background service (npm run service) approves or rejects each file; only approved images are shown.");
  }
}

const commands: Record<string, () => Promise<void>> = { faculty, "faculty-order": facultyOrder, societies, "society-categories": societyCategories, images };
const run = command ? commands[command] : undefined;
if (!run) {
  console.error("usage: npm run import -- <faculty|faculty-order|societies|society-categories|images> [--apply]");
  process.exit(2);
}
await run();
process.exit(0);
