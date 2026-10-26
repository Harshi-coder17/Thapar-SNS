// Outbox (ADR-0004), quarantine-first uploads (UC-13, OI-18/39), data imports (ADR-0013 §5) and
// placement (PLC-1..5) against PostgreSQL.
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { completeUpload, createUploadIntent, processUploadedAsset, quarantineKey } from "@/modules/assets/service";
import { importFacultyDirectory } from "@/modules/faculty/import";
import { claimDue, complete, enqueue, fail, MAX_ATTEMPTS } from "@/modules/outbox";
import { importCsv, matrix } from "@/modules/placement";
import { importSocieties } from "@/modules/societies/import";
import { createMaterial, listMaterials } from "@/modules/studymaterial";
import type { Storage } from "@/shared/storage/s3";
import { createHash } from "node:crypto";

import { type Platform, startPlatform } from "./setup";

let p: Platform;
beforeAll(async () => {
  p = await startPlatform();
});
afterAll(async () => {
  await p?.stop();
});

/** In-memory object store with the same contract as the S3 adapter. */
function memoryStorage(): Storage & { objects: Map<string, { body: Buffer; type: string }> } {
  const objects = new Map<string, { body: Buffer; type: string }>();
  return {
    objects,
    bucket: "test",
    origin: "http://storage.test",
    signedPutUrl: async (key) => `http://storage.test/${key}?signed`,
    signedGetUrl: async (key) => `http://storage.test/${key}?signed`,
    head: async (key) => (objects.has(key) ? { size: objects.get(key)!.body.length, contentType: objects.get(key)!.type } : null),
    read: async (key, max) => objects.get(key)!.body.subarray(0, max),
    put: async (key, body, type) => void objects.set(key, { body, type }),
    copy: async (from, to) => void objects.set(to, objects.get(from)!),
    remove: async (key) => void objects.delete(key),
    configureCors: async () => undefined,
  };
}

describe("outbox (ADR-0004, background-jobs.md §3 to §5)", () => {
  it("de-duplicates enqueues and never gives one row to two concurrent workers", async () => {
    await enqueue(p.prisma, ...Array.from({ length: 20 }, (_, i) => ({ type: "test.job", payload: { i }, dedupeKey: `test:${i}` })));
    await enqueue(p.prisma, { type: "test.job", payload: { i: 0 }, dedupeKey: "test:0" });
    expect(await p.prisma.outboxEvent.count({ where: { eventType: "test.job" } })).toBe(20);
    const [a, b] = await Promise.all([claimDue(p.prisma, "worker-a", 15), claimDue(p.prisma, "worker-b", 15)]);
    const ids = [...a, ...b].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(20);
    // Only the lease holder can complete a row.
    expect(await complete(p.prisma, a[0]!.id, "worker-b")).toBe(false);
    expect(await complete(p.prisma, a[0]!.id, "worker-a")).toBe(true);
  });

  it("rolls back the outbox row with the domain change, retries with backoff, and dies after 8 attempts", async () => {
    await expect(
      p.prisma.$transaction(async (tx) => {
        await enqueue(tx, { type: "test.atomic", payload: {}, dedupeKey: "atomic:1" });
        throw new Error("domain change failed");
      }),
    ).rejects.toThrow();
    expect(await p.prisma.outboxEvent.count({ where: { dedupeKey: "atomic:1" } })).toBe(0);

    await enqueue(p.prisma, { type: "test.flaky", payload: {}, dedupeKey: "flaky:1" });
    let now = new Date(Date.now() + 1000);
    let outcome = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const [row] = (await claimDue(p.prisma, "w", 50, now)).filter((e) => e.eventType === "test.flaky");
      expect(row, `attempt ${attempt}`).toBeDefined();
      outcome = await fail(p.prisma, row!.id, "w", row!.attemptCount, "Error", now);
      const stored = await p.prisma.outboxEvent.findUniqueOrThrow({ where: { id: row!.id } });
      if (outcome === "retry") expect(stored.availableAt.getTime()).toBeGreaterThan(now.getTime());
      now = new Date(stored.availableAt.getTime() + 1);
    }
    expect(outcome).toBe("dead");
    expect((await p.prisma.outboxEvent.findFirstOrThrow({ where: { dedupeKey: "flaky:1" } })).status).toBe("DEAD");
  });

  it("reclaims a row whose lease expired (crashed worker)", async () => {
    await enqueue(p.prisma, { type: "test.lease", payload: {}, dedupeKey: "lease:1" });
    const [row] = (await claimDue(p.prisma, "crashed", 50)).filter((e) => e.eventType === "test.lease");
    const later = new Date(Date.now() + 3 * 60_000);
    const [again] = (await claimDue(p.prisma, "rescuer", 50, later)).filter((e) => e.eventType === "test.lease");
    expect(again?.id).toBe(row!.id);
    expect(await complete(p.prisma, row!.id, "crashed")).toBe(false);
  });
});

describe("quarantine-first uploads (UC-13, OI-18, OI-39)", () => {
  const pdf = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer\n%%EOF\n");
  const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

  async function upload(ownerId: string, bytes: Buffer, declared: { contentType: string; sha256?: string; fileName?: string }) {
    const storage = memoryStorage();
    const intent = await createUploadIntent(p.prisma, storage, ownerId, { purpose: "STUDY_MATERIAL", fileName: declared.fileName ?? "notes.pdf", contentType: declared.contentType, size: bytes.length, sha256: declared.sha256 ?? sha(bytes) });
    if (!intent.ok) throw new Error(JSON.stringify(intent));
    await storage.put(quarantineKey(intent.value.assetId), bytes, declared.contentType);
    expect((await completeUpload(p.prisma, storage, ownerId, intent.value.assetId)).ok).toBe(true);
    const result = await processUploadedAsset(p.prisma, storage, intent.value.assetId);
    return { storage, assetId: intent.value.assetId, result };
  }

  it("approves a valid PDF, publishes it and removes the quarantine copy", async () => {
    const owner = await p.user();
    const { storage, assetId, result } = await upload(owner.id, pdf, { contentType: "application/pdf" });
    expect(result).toBe("approved");
    const asset = await p.prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    expect(asset.status).toBe("APPROVED");
    expect(storage.objects.has(asset.publishedKey!)).toBe(true);
    expect(storage.objects.has(asset.quarantineKey)).toBe(false);
    expect(await p.prisma.outboxEvent.count({ where: { dedupeKey: `file.uploaded:${assetId}` } })).toBe(1);
  });

  it("rejects a checksum mismatch and a renamed executable, and deletes the bytes", async () => {
    const owner = await p.user();
    const mismatch = await upload(owner.id, pdf, { contentType: "application/pdf", sha256: "0".repeat(64) });
    expect(mismatch.result).toBe("rejected");
    expect(mismatch.storage.objects.size).toBe(0);
    const exe = Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00");
    const renamed = await upload(owner.id, exe, { contentType: "application/pdf", fileName: "notes.pdf" });
    expect(renamed.result).toBe("rejected");
    const asset = await p.prisma.asset.findUniqueOrThrow({ where: { id: renamed.assetId } });
    expect(asset.status).toBe("REJECTED");
    expect(asset.rejectionReason).toBeTruthy();
    expect(await p.prisma.notification.count({ where: { recipientId: owner.id, type: "upload.rejected" } })).toBe(2);
  });

  it("refuses disallowed types and oversized files before issuing an upload URL", async () => {
    const owner = await p.user();
    const storage = memoryStorage();
    expect((await createUploadIntent(p.prisma, storage, owner.id, { purpose: "STUDY_MATERIAL", fileName: "x.exe", contentType: "application/x-msdownload", size: 10, sha256: "a".repeat(64) })).ok).toBe(false);
    expect(await createUploadIntent(p.prisma, storage, owner.id, { purpose: "STUDY_MATERIAL", fileName: "big.pdf", contentType: "application/pdf", size: 30 * 1024 * 1024, sha256: "a".repeat(64) })).toMatchObject({ ok: false, code: "TOO_LARGE" });
    expect((await createUploadIntent(p.prisma, storage, owner.id, { purpose: "FACULTY_PHOTO", fileName: "me.png", contentType: "image/png", size: 10, sha256: "a".repeat(64) })).ok).toBe(false);
  });

  it("lists study material only once its file is approved, and only the owner can attach the file", async () => {
    const owner = await p.user();
    const { assetId } = await upload(owner.id, pdf, { contentType: "application/pdf" });
    const thief = await p.user();
    expect((await createMaterial(p.prisma, p.personal(thief.id), { assetId, subjectCode: "UCS503", title: "Software engineering notes", type: "NOTES", semester: 5, branchCode: "COE" })).ok).toBe(false);
    const created = await createMaterial(p.prisma, p.personal(owner.id), { assetId, subjectCode: "ucs503", title: "Software engineering notes", type: "NOTES", semester: 5, branchCode: "COE" });
    expect(created.ok).toBe(true);
    const names = async () => new Map<string, { name: string }>();
    const listed = await listMaterials(p.prisma, owner.id, { subjectCode: "UCS503" }, names);
    expect(listed.map((m) => m.title)).toContain("Software engineering notes");
    const rejected = await upload(owner.id, pdf, { contentType: "application/pdf", sha256: "1".repeat(64) });
    await p.prisma.studyMaterial.create({ data: { uploaderId: owner.id, assetId: rejected.assetId, subjectCode: "UCS503", title: "Should never show", type: "NOTES", semester: 5, branchCode: "COE" } });
    expect((await listMaterials(p.prisma, owner.id, { subjectCode: "UCS503" }, names)).map((m) => m.title)).not.toContain("Should never show");
  });
});

describe("data imports (ADR-0013 §5; official faculty directory)", () => {
  it("imports the society dataset inactive and awaiting a Head, leaves flagged fields empty, and is idempotent", async () => {
    const dataset = JSON.parse(readFileSync("data/society-import/thapar-student-organisations.2026-10-25.json", "utf8")) as { records: Parameters<typeof importSocieties>[1] };
    const facultyData = JSON.parse(readFileSync("data/faculty-import/thapar-faculty.2026-10-25.json", "utf8")) as { records: Parameters<typeof importFacultyDirectory>[1] };
    const faculty = await importFacultyDirectory(p.prisma, facultyData.records, { apply: true, fetchedAt: new Date("2026-10-25") });
    expect(faculty.created).toBe(facultyData.records.length);
    expect((await importFacultyDirectory(p.prisma, facultyData.records, { apply: true, fetchedAt: new Date("2026-10-25") })).created).toBe(0);
    // No non-institutional email is ever shown.
    expect(await p.prisma.facultyProfile.count({ where: { email: { not: null }, NOT: { email: { endsWith: "@thapar.edu" } } } })).toBe(0);

    const dry = await importSocieties(p.prisma, dataset.records, { apply: false, fetchedAt: new Date("2026-10-25"), linkTargets: [] });
    expect(await p.prisma.society.count({ where: { sourceKey: { not: null } } })).toBe(0);
    expect(dry.created).toHaveLength(dataset.records.length);

    const linkTargets = await p.prisma.facultyProfile.findMany({ select: { id: true, email: true, profileUrl: true } });
    const report = await importSocieties(p.prisma, dataset.records, { apply: true, fetchedAt: new Date("2026-10-25"), linkTargets });
    expect(report.created).toHaveLength(56);
    expect(report.linkedToDirectory).toBeGreaterThan(0);
    const imported = await p.prisma.society.findMany({ where: { sourceKey: { not: null } }, select: { isActive: true, verifiedAt: true, sourceKey: true, contactEmail: true, socialLinks: true, _count: { select: { headGrants: true } } } });
    expect(imported).toHaveLength(56);
    expect(imported.every((s) => !s.isActive && s.verifiedAt === null && s._count.headGrants === 0)).toBe(true);
    // CARE's published website is CCS's (flagged in the dataset): left empty rather than guessed.
    const care = imported.find((s) => s.sourceKey === "chemists-association-for-research-and-education-society-care")!;
    expect(care.socialLinks).toEqual({});
    expect(await p.prisma.societyFacultyAssociation.count({ where: { verifiedAt: { not: null } } })).toBe(0);
    const again = await importSocieties(p.prisma, dataset.records, { apply: true, fetchedAt: new Date("2026-10-25"), linkTargets });
    expect(again.created).toHaveLength(0);
    expect(again.skipped).toHaveLength(56);
  });
});

describe("placement (PLC-1..5)", () => {
  it("imports aggregate CSV records with an audit entry and applies suppression in the matrix", async () => {
    const admin = await p.user({ role: "ADMIN" });
    const csv = [
      "academic_year,programme,branch_code,company,offer_type,offer_count,eligible_count,placed_count,median_ctc_lpa,source_citation,source_date",
      "2025-26,B.E.,COE,Alpha Corp,FULL_TIME,40,,,,Test citation,2026-06-30",
      "2025-26,B.E.,COE,Beta Corp,FULL_TIME,3,,,,Test citation,2026-06-30",
      "2025-26,B.E.,ECE,Alpha Corp,FULL_TIME,12,,,,Test citation,2026-06-30",
      "2025-26,B.E.,ECE,Beta Corp,FULL_TIME,9,,,,Test citation,2026-06-30",
    ].join("\n");
    const result = await importCsv(p.prisma, p.platform(admin.id), { csv });
    expect(result).toEqual({ ok: true, value: { created: 4, updated: 0 } });
    expect(await p.prisma.auditLog.count({ where: { action: "placement.csv.imported", actorId: admin.id } })).toBe(1);
    const view = await matrix(p.prisma, { academicYear: "2025-26", offerType: "FULL_TIME", programme: "B.E." });
    const coe = view!.rows.find((r) => r.code === "COE")!;
    const shown = coe.cells.map((c) => c.display);
    expect(shown).toContain("<5");
    expect(shown).not.toContain("3");
    // The row total would reveal the small cell: at least one other entry in the row is hidden too.
    expect([...coe.cells, coe.total].filter((c) => c.state !== "shown").length).toBeGreaterThanOrEqual(2);
    // A single-branch filter shows the same, already-suppressed values (no differencing).
    const filtered = await matrix(p.prisma, { academicYear: "2025-26", offerType: "FULL_TIME", programme: "B.E.", branch: "COE" });
    expect(filtered!.rows[0]!.cells.map((c) => c.display)).toEqual(shown);
    expect((await importCsv(p.prisma, p.platform(admin.id), { csv })).ok && true).toBe(true);
    expect(await p.prisma.placementRecord.count()).toBe(4);
  });
});
