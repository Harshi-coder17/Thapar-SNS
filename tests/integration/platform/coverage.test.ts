// Remaining acceptance criteria for Slices 2b to 5 (traceability.md): event transitions, calendar
// society layer, Find Mates filters/rejection/expiry, one vote per student, typo-tolerant faculty
// search on the official dataset, archive search and screenshot ownership, placement audit, story
// cleanup and notification scoping.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listProjects, submitProject } from "@/modules/archive";
import { listRange } from "@/modules/calendar";
import * as events from "@/modules/events/service";
import { searchFaculty } from "@/modules/faculty";
import { importFacultyDirectory } from "@/modules/faculty/import";
import { browse } from "@/modules/findmates/queries";
import * as mates from "@/modules/findmates/service";
import { markRead } from "@/modules/notifications";
import { deleteRecord, upsertRecord } from "@/modules/placement";
import { deleteExpiredStories } from "@/modules/societies";
import { setVote } from "@/modules/studymaterial";

import { future, type Platform, startPlatform } from "./setup";

let p: Platform;
beforeAll(async () => {
  p = await startPlatform();
});
afterAll(async () => {
  await p?.stop();
});

const description = "<p>A friendly gathering with talks and demos.</p>";
const tags = async () => new Set(["robotics", "python", "rust", "web-development", "machine-learning"]);

describe("events: legal transitions and edits (FR-EVT-1, FR-EVT-2)", () => {
  it("publishes drafts only, keeps capacity above the registered count, and is refused to another society's Head", async () => {
    const head = await p.user();
    const otherHead = await p.user();
    const society = await p.society("Mu", [head.id]);
    await p.society("Nu", [otherHead.id]);
    const draft = await events.createEvent(p.prisma, p.personal(head.id), { societyId: society.id, title: "Workshop", description, venue: "Lab 1", ...future(5), capacity: 2, registrationSchema: [], publish: false });
    if (!draft.ok) throw new Error("create failed");
    expect(await events.publishEvent(p.prisma, p.personal(otherHead.id), draft.value.id)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect((await events.publishEvent(p.prisma, p.personal(head.id), draft.value.id)).ok).toBe(true);
    expect(await events.publishEvent(p.prisma, p.personal(head.id), draft.value.id)).toMatchObject({ ok: false, code: "INVALID_STATE" });
    const [s1, s2] = [await p.user(), await p.user()];
    await events.register(p.prisma, p.personal(s1.id), draft.value.id, {});
    await events.register(p.prisma, p.personal(s2.id), draft.value.id, {});
    const base = { title: "Workshop", description, venue: "Lab 1", ...future(5), registrationSchema: [] };
    expect(await events.updateEvent(p.prisma, p.personal(head.id), draft.value.id, { ...base, capacity: 1 })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await events.updateEvent(p.prisma, p.personal(otherHead.id), draft.value.id, { ...base, capacity: 5 })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect((await events.updateEvent(p.prisma, p.personal(head.id), draft.value.id, { ...base, capacity: 5 })).ok).toBe(true);
    const past = { ...base, startAt: new Date(Date.now() - 86_400_000).toISOString(), endAt: new Date(Date.now() - 82_800_000).toISOString(), capacity: 5, societyId: society.id, publish: true };
    expect(await events.createEvent(p.prisma, p.personal(head.id), past)).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("shows published society events in the calendar's society layer, never drafts (FR-CAL-1)", async () => {
    const head = await p.user();
    const society = await p.society("Xi", [head.id]);
    const published = await events.createEvent(p.prisma, p.personal(head.id), { societyId: society.id, title: "Open day", description, venue: "Hall", ...future(3), capacity: 10, registrationSchema: [], publish: true });
    const draft = await events.createEvent(p.prisma, p.personal(head.id), { societyId: society.id, title: "Secret plan", description, venue: "Hall", ...future(3), capacity: 10, registrationSchema: [], publish: false });
    if (!published.ok || !draft.ok) throw new Error("create failed");
    const student = await p.user();
    const items = await listRange(p.prisma, p.personal(student.id), new Date(), new Date(Date.now() + 10 * 86_400_000), ["SOCIETY"]);
    expect(items.some((i) => i.eventId === published.value.id && i.layer === "SOCIETY")).toBe(true);
    expect(items.some((i) => i.eventId === draft.value.id)).toBe(false);
  });
});

describe("Find Mates browsing, rejection and expiry (FR-MATE-2, FR-MATE-4, FR-MATE-5)", () => {
  it("filters by type, skill and subject, and hides expired requests at query time", async () => {
    const owner = await p.user({ skills: ["robotics", "python", "rust"] });
    const base = { title: "Team request", description: "<p>Details here.</p>", teamSize: 3, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    const hack = await mates.createRequest(p.prisma, p.personal(owner.id), { ...base, title: "Robotics hackathon", type: "HACKATHON", skills: ["robotics"], subject: "UEC612" }, tags);
    const proj = await mates.createRequest(p.prisma, p.personal(owner.id), { ...base, title: "Web project", type: "PROJECT", skills: ["web-development"] }, tags);
    if (!hack.ok || !proj.ok) throw new Error("create failed");
    const viewer = await p.user({ skills: ["robotics", "python", "rust"] });
    const ids = async (filters: Parameters<typeof browse>[2]) => (await browse(p.prisma, viewer.id, filters)).map((r) => r.id);
    expect(await ids({ type: "HACKATHON" })).toContain(hack.value.id);
    expect(await ids({ type: "HACKATHON" })).not.toContain(proj.value.id);
    expect(await ids({ skills: ["web-development"] })).toEqual(expect.arrayContaining([proj.value.id]));
    expect(await ids({ skills: ["web-development"] })).not.toContain(hack.value.id);
    expect(await ids({ subject: "uec612" })).toContain(hack.value.id);
    const best = await browse(p.prisma, viewer.id, { sort: "best" });
    expect(best.findIndex((r) => r.id === hack.value.id)).toBeLessThan(best.findIndex((r) => r.id === proj.value.id));
    await p.prisma.mateRequest.update({ where: { id: hack.value.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await ids({})).not.toContain(hack.value.id);
    expect(await mates.respond(p.prisma, p.personal(viewer.id), hack.value.id, { message: "late" })).toMatchObject({ ok: false, code: "INVALID_STATE" });
    expect(await mates.expireRequests(p.prisma)).toBeGreaterThanOrEqual(1);
    expect((await p.prisma.mateRequest.findUniqueOrThrow({ where: { id: hack.value.id } })).status).toBe("EXPIRED");
  });

  it("notifies a rejected responder and lets only the owner close a request", async () => {
    const owner = await p.user();
    const created = await mates.createRequest(p.prisma, p.personal(owner.id), { title: "Study group", description: "<p>Weekly.</p>", type: "CASUAL", skills: ["python"], teamSize: 4, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, tags);
    if (!created.ok) throw new Error("create failed");
    const responder = await p.user();
    const response = await mates.respond(p.prisma, p.personal(responder.id), created.value.id, { message: "Count me in" });
    if (!response.ok) throw new Error("respond failed");
    expect(await p.prisma.notification.count({ where: { recipientId: owner.id, type: "mate.response.received" } })).toBe(1);
    expect((await mates.decide(p.prisma, p.personal(owner.id), created.value.id, response.value.id, { decision: "REJECT" })).ok).toBe(true);
    expect(await p.prisma.notification.count({ where: { recipientId: responder.id, type: "mate.response.rejected" } })).toBe(1);
    expect(await mates.closeRequest(p.prisma, p.personal(responder.id), created.value.id)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect((await mates.closeRequest(p.prisma, p.personal(owner.id), created.value.id)).ok).toBe(true);
  });
});

describe("study material votes (FR-MAT-4)", () => {
  it("counts one vote per student however often they vote", async () => {
    const owner = await p.user();
    const bytes = Buffer.from("%PDF-1.7\n");
    const asset = await p.prisma.asset.create({ data: { ownerId: owner.id, purpose: "STUDY_MATERIAL", originalName: "n.pdf", declaredMime: "application/pdf", declaredSize: bytes.length, sha256Declared: createHash("sha256").update(bytes).digest("hex"), quarantineKey: `q/${Date.now()}`, publishedKey: `p/${Date.now()}`, status: "APPROVED", expiresAt: new Date() }, select: { id: true } });
    const material = await p.prisma.studyMaterial.create({ data: { uploaderId: owner.id, assetId: asset.id, subjectCode: "UMA003", title: "Maths notes", type: "NOTES", semester: 1, branchCode: "COE" }, select: { id: true } });
    const voter = await p.user();
    const results = await Promise.all([1, 2, 3].map(() => setVote(p.prisma, p.personal(voter.id), material.id, true)));
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await p.prisma.studyMaterial.findUniqueOrThrow({ where: { id: material.id } })).upvoteCount).toBe(1);
    await setVote(p.prisma, p.personal(voter.id), material.id, false);
    await setVote(p.prisma, p.personal(voter.id), material.id, false);
    expect((await p.prisma.studyMaterial.findUniqueOrThrow({ where: { id: material.id } })).upvoteCount).toBe(0);
  });
});

describe("faculty search on the official dataset (FR-FAC-1, FR-FAC-2)", () => {
  it("finds people by name with a typo, by department and by research area", async () => {
    const data = JSON.parse(readFileSync("data/faculty-import/thapar-faculty.2026-10-25.json", "utf8")) as { records: Parameters<typeof importFacultyDirectory>[1] };
    await importFacultyDirectory(p.prisma, data.records, { apply: true, fetchedAt: new Date("2026-10-25") });
    const names = async (q: string, department?: string) => (await searchFaculty(p.prisma, { q, department })).items.map((f) => f.name);
    expect(await names("Amrita Kour")).toContain("Dr. Amrita Kaur");
    expect(await names("karun verma")).toContain("Dr. Karun Verma");
    const machine = await searchFaculty(p.prisma, { q: "Power Electronics" });
    expect(machine.items.some((f) => f.specialization?.includes("Power Electronics"))).toBe(true);
    const dept = await searchFaculty(p.prisma, { department: "Department of Biotechnology" });
    expect(dept.total).toBeGreaterThan(0);
    expect(dept.items.every((f) => f.department === "Department of Biotechnology")).toBe(true);
    const all = await searchFaculty(p.prisma, { page: 2 });
    expect(all.items.length).toBeGreaterThan(0);
    expect(all.pages).toBeGreaterThan(1);
  });
});

describe("archive search and screenshots (FR-ARC-1, FR-ARC-3)", () => {
  it("finds approved projects by title words and tags, and refuses someone else's screenshot", async () => {
    const author = await p.user();
    const admin = await p.user({ role: "ADMIN" });
    const created = await submitProject(p.prisma, p.personal(author.id), { title: "Hostel mess tracker", description: "<p>Tracks daily menus and feedback in the hostels.</p>", githubUrl: "https://github.com/example/mess-tracker", tags: ["nextjs"], screenshotAssetIds: [] });
    if (!created.ok) throw new Error("submit failed");
    const { reviewProject } = await import("@/modules/archive");
    await reviewProject(p.prisma, p.platform(admin.id), created.value.id, { decision: "APPROVE" });
    expect((await listProjects(p.prisma, author.id, { q: "mess tracker" })).map((x) => x.id)).toContain(created.value.id);
    expect((await listProjects(p.prisma, author.id, { q: "nextjs" })).map((x) => x.id)).toContain(created.value.id);
    const other = await p.user();
    const foreign = await p.prisma.asset.create({ data: { ownerId: other.id, purpose: "ARCHIVE_SCREENSHOT", originalName: "s.png", declaredMime: "image/png", declaredSize: 10, sha256Declared: "a".repeat(64), quarantineKey: `q/s/${Date.now()}`, publishedKey: `p/s/${Date.now()}`, status: "APPROVED", expiresAt: new Date() }, select: { id: true } });
    expect(await submitProject(p.prisma, p.personal(author.id), { title: "Borrowed screenshots", description: "<p>Uses someone else's screenshot here.</p>", githubUrl: "https://github.com/example/borrowed", tags: [], screenshotAssetIds: [foreign.id] })).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("placement records are admin-only and audited (PLC-1, PLC-5)", () => {
  it("audits create, update and delete, and refuses the personal capacity", async () => {
    const admin = await p.user({ role: "ADMIN" });
    const record = { academicYear: "2024-25", programme: "B.E.", branchCode: "COE", company: "", offerType: "INTERNSHIP", offerCount: 30, sourceCitation: "Test source", sourceDate: "2025-06-30" };
    expect(await upsertRecord(p.prisma, p.personal(admin.id, "ADMIN"), record)).toEqual({ ok: false, code: "FORBIDDEN" });
    const created = await upsertRecord(p.prisma, p.platform(admin.id), record);
    if (!created.ok) throw new Error(JSON.stringify(created));
    await upsertRecord(p.prisma, p.platform(admin.id), { ...record, offerCount: 31 });
    expect((await deleteRecord(p.prisma, p.platform(admin.id), created.value.id)).ok).toBe(true);
    const actions = (await p.prisma.auditLog.findMany({ where: { targetId: created.value.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["placement.record.created", "placement.record.updated", "placement.record.deleted"]);
  });
});

describe("scheduled cleanup and notification scoping", () => {
  it("deletes stories expired for over an hour, keeps live ones (FR-SOC-3)", async () => {
    const head = await p.user();
    const society = await p.society("Omicron", [head.id]);
    const old = await p.prisma.societyPost.create({ data: { societyId: society.id, authorId: head.id, type: "STORY", body: "old", publishedAt: new Date(Date.now() - 2 * 86_400_000), expiresAt: new Date(Date.now() - 3 * 3_600_000) }, select: { id: true } });
    const live = await p.prisma.societyPost.create({ data: { societyId: society.id, authorId: head.id, type: "STORY", body: "live", publishedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) }, select: { id: true } });
    expect(await deleteExpiredStories()).toBeGreaterThanOrEqual(1);
    expect(await p.prisma.societyPost.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await p.prisma.societyPost.findUnique({ where: { id: live.id } })).not.toBeNull();
    expect(await p.prisma.auditLog.count({ where: { action: "societies.story.expired_deleted" } })).toBeGreaterThanOrEqual(1);
  });

  it("marks only the caller's own notifications as read", async () => {
    const a = await p.user();
    const b = await p.user();
    const n = await p.prisma.notification.create({ data: { recipientId: a.id, type: "event.cancelled", payload: { eventId: "x", eventTitle: "y" }, sourceKey: `t:${Date.now()}` }, select: { id: true } });
    expect(await markRead(p.prisma, b.id, [n.id])).toBe(0);
    expect((await p.prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
    expect(await markRead(p.prisma, a.id, [n.id])).toBe(1);
  });
});
