#!/usr/bin/env node
// Builds data/faculty-import/thapar-faculty.<date>.json from a scrape of the official faculty pages
// (https://www.thapar.edu/faculties and the department or school pages it links to).
//
//   node scripts/faculty-import/build-dataset.mjs <official-faculty.json> <category-order.txt> [fetchedAt]
//
// official-faculty.json: entries in the order the official pages list them (each unit's page lists
// its head first, then its senior roles and faculty by seniority). category-order.txt: the unit links
// in the order https://www.thapar.edu/faculties shows them (school, departments, centres).
// People listed under several units are merged by institutional email: the department entry is primary.
import { readFileSync, writeFileSync } from "node:fs";

const [scrapeFile, ordersFile, fetchedAt = "2026-10-25"] = process.argv.slice(2);
if (!scrapeFile || !ordersFile) {
  console.error("usage: build-dataset.mjs <official-faculty.json> <category-order.txt> [fetchedAt]");
  process.exit(2);
}
const entries = JSON.parse(readFileSync(scrapeFile, "utf8"));
const units = readFileSync(ordersFile, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
const unitRank = (entry) => {
  const path = entry.directoryEntry ? new URL(entry.directoryEntry).pathname : "";
  const i = units.indexOf(path);
  return i === -1 ? units.length : i;
};

const keyOf = (x) => (x.email ? x.email.toLowerCase() : x.profileUrl);
const groups = new Map();
entries.forEach((x, index) => {
  const k = keyOf(x);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push({ ...x, index });
});

const records = [];
for (const [key, list] of groups) {
  const primary = list.find((x) => /^Department of|^Thapar School/.test(x.department)) ?? list[0];
  const pick = (f) => primary[f] ?? list.map((x) => x[f]).find(Boolean) ?? null;
  records.push({
    key,
    name: primary.name,
    designation: primary.designation,
    department: primary.department,
    email: primary.email ? primary.email.toLowerCase() : null,
    otherEmails: [...new Set(list.flatMap((x) => x.allEmails ?? []).map((e) => e.toLowerCase()))].filter((e) => e !== (primary.email ?? "").toLowerCase()),
    specialization: pick("specialization"),
    profileUrl: primary.profileUrl,
    photoUrl: pick("photoUrl"),
    sourceUrl: primary.listingUrl,
    directoryEntry: primary.directoryEntry ?? null,
    /** Position of the unit on https://www.thapar.edu/faculties (school, departments, centres). */
    unitOrder: unitRank(primary),
    /** Position on the unit's official page (head first, then by seniority). */
    listingOrder: primary.index,
    alsoListed: list.filter((x) => x !== primary).map((x) => ({ department: x.department, designation: x.designation, profileUrl: x.profileUrl, listingUrl: x.listingUrl })),
  });
}
records.sort((a, b) => a.unitOrder - b.unitOrder || a.listingOrder - b.listingOrder);

const out = {
  dataset: "Thapar Institute faculty directory (official pages)",
  fetchedAt,
  source: {
    directory: "https://www.thapar.edu/faculties",
    note: "Collected from https://www.thapar.edu/faculties and the official department and school faculty pages it links to. Values are as officially published; nothing is invented. Entries listed under several units are merged by institutional email (the department entry is primary; the others are kept in alsoListed). unitOrder and listingOrder keep the official page order.",
  },
  rules: [
    "Treated as verified official data (owner instruction 2026-10-25).",
    "Missing values stay null: no email, specialization or photo is guessed.",
    "Photos are imported only from official thapar.edu URLs, through the quarantine-first upload pipeline.",
  ],
  records,
};
const target = `data/faculty-import/thapar-faculty.${fetchedAt}.json`;
writeFileSync(target, JSON.stringify(out, null, 1) + "\n");
console.log(`${target}: ${records.length} records (${records.filter((r) => r.unitOrder === units.length).length} without a unit position)`);
