// Society import planning (OI-57) and the committed research dataset's safety rules (ADR-0013 §5,
// owner decisions 2026-10-25). The dry run never writes; these tests cover its decisions.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { slugify as moduleSlugify } from "@/modules/societies/service";

import { normaliseName, planImport, slugify } from "../../../scripts/society-import/plan.mjs";

interface DatasetRecord {
  key: string;
  name: string;
  websites: string[];
  websiteAsPublished: string | null;
  contactEmail: string | null;
  faculty: {
    name: string;
    email: string | null;
    sourceRole: string;
    redactions: string[];
    verification: {
      status: string;
      matchBasis?: string;
      source: string;
      reason?: string;
      official?: { name: string; email: string | null; listedUnder: string; profileUrl: string | null; listingUrl: string; directoryEntry: string };
    };
  }[];
  source: { recordUrl: string; sourceType: string | null };
  review: { sourceStatus: string; appReview: string; questionableFields: string[]; possibleDuplicateOf: string[]; flags: string[] };
}

const dataset = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../../data/society-import/thapar-student-organisations.2026-10-25.json"), "utf8")) as { records: DatasetRecord[] };
const byName = (name: string) => dataset.records.find((r) => r.name === name)!;

describe("import plan", () => {
  it("uses the same URL-name rule as the application", () => {
    for (const name of ["Chemist’s Association for Research and Education Society (CARE)", "Dance Club ‘NOX’", "Music & Dance", "Café"]) expect(slugify(name)).toBe(moduleSlugify(name));
  });

  it("matches existing societies by source key or normalised name and never plans an overwrite", () => {
    const records = [
      { key: "alpha-club", name: "Alpha Club" },
      { key: "beta-society", name: "Beta  Society" },
      { key: "gamma-cell", name: "Gamma Cell" },
    ];
    const existing = [
      { name: "Something else", slug: "x", sourceKey: "alpha-club" },
      { name: "BETA society", slug: "beta-society", sourceKey: null },
    ];
    const plan = planImport(records, existing);
    expect(plan.create.map((r) => r.key)).toEqual(["gamma-cell"]);
    expect(plan.skip.map((r) => [r.key, r.reason])).toEqual([
      ["alpha-club", "source key already imported"],
      ["beta-society", "same name as an existing society"],
    ]);
    expect(normaliseName("  Music &  Dance! ")).toBe("music and dance");
  });

  it("rejects invalid records and repeated keys", () => {
    const plan = planImport(
      [
        { key: "ok-key", name: "Valid Name" },
        { key: "ok-key", name: "Repeated Key" },
        { key: "Bad Key", name: "Valid Name Two" },
        { key: "long", name: "x".repeat(151) },
      ],
      [],
    );
    expect(plan.create.map((r) => r.key)).toEqual(["ok-key"]);
    expect(plan.invalid.map((r) => r.key)).toEqual(["ok-key", "Bad Key", "long"]);
  });

  it("plans all 56 organisations of the dataset as new against an empty database, reporting the duplicate pair", () => {
    const plan = planImport(dataset.records, []);
    expect(plan.create).toHaveLength(56);
    expect(plan.invalid).toEqual([]);
    expect(plan.possibleDuplicates.map((r) => r.key).sort()).toEqual(["electoral-club", "thapar-electoral-club"]);
  });
});

describe("research dataset safety rules (owner decisions 2026-10-25)", () => {
  it("has 56 records with unique stable keys and an https source URL each; officially published, awaiting in-app review", () => {
    expect(dataset.records).toHaveLength(56);
    expect(new Set(dataset.records.map((r) => r.key)).size).toBe(56);
    for (const r of dataset.records) {
      expect(r.source.recordUrl, r.key).toMatch(/^https:\/\/studentsocieties\.thapar\.edu\/api\/organizations\/[0-9a-f]{24}$/);
      expect(r.review.sourceStatus, r.key).toBe("official_published");
      expect(r.review.appReview, r.key).toBe("pending");
    }
  });

  it("keeps Electoral Club and Thapar Electoral Club as separate records, flagged as possible duplicates", () => {
    expect(byName("Electoral Club").review.possibleDuplicateOf).toEqual(["thapar-electoral-club"]);
    expect(byName("Thapar Electoral Club").review.possibleDuplicateOf).toEqual(["electoral-club"]);
  });

  it("keeps questionable raw values but marks them unverified; invalid URL text never becomes a link", () => {
    const enactus = byName("ENACTUS");
    expect(enactus.websiteAsPublished).toBe("ENACTUS Website");
    expect(enactus.websites).toEqual([]);
    expect(enactus.review.questionableFields).toContain("websiteAsPublished");
    expect(byName("Energy Conservation Club (ECC)").review.questionableFields).toEqual(["contactEmail", "websites"]);
    expect(byName("Chemist’s Association for Research and Education Society (CARE)").review.questionableFields).toEqual(["websites"]);
    for (const r of dataset.records) for (const url of r.websites) expect(url, r.key).toMatch(/^https?:\/\/[^\s,]+$/);
  });

  it("applies the approved redactions: no faculty photo links and no personal faculty email addresses", () => {
    const faculty = dataset.records.flatMap((r) => r.faculty);
    expect(JSON.stringify(dataset)).not.toContain("imageRef");
    expect(faculty.filter((f) => f.redactions.includes("photo_link_removed"))).toHaveLength(99);
    const personal = faculty.filter((f) => f.redactions.includes("personal_email_removed"));
    expect(personal.map((f) => f.name).sort()).toEqual(["Dr. Jainy Sachdeva", "Mr. Tanuj Chopra"]);
    for (const f of faculty) if (f.email !== null) expect(f.email, f.name).toMatch(/@thapar\.edu$/i);
  });

  it("takes faculty details only from the official faculty directory and its department pages", () => {
    const official = /^https:\/\/(www|tslas|ched|ced|eied|eced|med|btd|csed)\.thapar\.edu\//;
    for (const f of dataset.records.flatMap((r) => r.faculty)) {
      expect(f.verification.source, f.name).toBe("https://www.thapar.edu/faculties");
      if (f.verification.status === "verified") {
        expect(f.verification.official?.listingUrl, f.name).toMatch(official);
        expect(f.verification.official?.directoryEntry, f.name).toMatch(/^https:\/\/www\.thapar\.edu\/faculties\//);
        if (f.verification.matchBasis === "institutional_email") expect(f.verification.official?.email?.toLowerCase(), f.name).toBe(f.email?.toLowerCase());
        else expect(f.verification.matchBasis, f.name).toBe("name_and_department");
      } else {
        expect(["no_official_record", "needs_review"], f.name).toContain(f.verification.status);
        expect(f.verification.reason, f.name).toBeTruthy();
      }
    }
  });

  it("keeps the published and official values side by side (nothing replaced)", () => {
    const tanuj = dataset.records.flatMap((r) => r.faculty).find((f) => f.name === "Mr. Tanuj Chopra")!;
    expect(tanuj.verification).toMatchObject({ status: "verified", matchBasis: "name_and_department" });
    expect(tanuj.verification.official?.name).toBe("Dr. Tanuj Chopra");
    expect(tanuj.email).toBeNull(); // the published personal address stays removed; the official address is kept separately
    const mamta = dataset.records.flatMap((r) => r.faculty).find((f) => f.name === "Dr. Mamta Gulati")!;
    expect(mamta.verification.status).toBe("needs_review");
  });

  it("contains no secrets", () => {
    const text = JSON.stringify(dataset);
    expect(text).not.toMatch(/password|secret|api[_-]?key|BEGIN [A-Z ]*KEY|GOCSPX|postgres(ql)?:\/\/|bearer /i);
  });
});
