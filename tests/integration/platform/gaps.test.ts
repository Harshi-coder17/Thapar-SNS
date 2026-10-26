// Acceptance criteria that lacked automated tests (traceability.md, 2026-10-25): study material search
// and semester filter, archive screenshots, the daily calendar job, upload auto-expiry, moderation
// resolve/dismiss/restore, bans and role changes, profile editing, society images, time to match.
import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openReports, resolveReport, restoreTarget, createReport } from "@/modules/admin";
import { archive, reviewProject, submitProject } from "@/modules/archive";
import { expireStaleUploads } from "@/modules/assets/service";
import { createEntry, extendWindows } from "@/modules/calendar";
import * as mates from "@/modules/findmates/service";
import { timeToMatchHours } from "@/modules/findmates/queries";
import { banUser, changeRole } from "@/modules/identity/admin-users";
import { readCurrentSession } from "@/modules/identity/sessions";
import { updateProfile } from "@/modules/identity/profile";
import { setSocietyImage } from "@/modules/societies/service";
import { ownedAssetFor } from "@/modules/assets/service";
import { listMaterials } from "@/modules/studymaterial";
import type { Storage } from "@/shared/storage/s3";

import { moderationTargets } from "@/app/(app)/_lib/moderation-targets";

import { type Platform, startPlatform } from "./setup";

let p: Platform;
beforeAll(async () => {
  p = await startPlatform();
});
afterAll(async () => {
  await p?.stop();
});

let seq = 0;
async function approvedAsset(ownerId: string | null, purpose: "STUDY_MATERIAL" | "ARCHIVE_SCREENSHOT" | "SOCIETY_LOGO" | "SOCIETY_BANNER", status: "APPROVED" | "AWAITING_UPLOAD" = "APPROVED", expiresAt = new Date(Date.now() + 3_600_000)) {
  seq += 1;
  const bytes = Buffer.from(`asset-${seq}-${Date.now()}`);
  return p.prisma.asset.create({
    data: { ownerId, purpose, originalName: `f${seq}.png`, declaredMime: "image/png", declaredSize: bytes.length, sha256Declared: createHash("sha256").update(bytes).digest("hex"), quarantineKey: `quarantine/t${seq}-${Date.now()}`, publishedKey: status === "APPROVED" ? `published/t${seq}-${Date.now()}` : null, status, expiresAt },
    select: { id: true },
  });
}
const names = async () => new Map<string, { name: string }>();

describe("study material search (FR-MAT-3)", () => {
  it("finds approved material by title words, description and subject-code prefix, and filters by semester", async () => {
    const owner = await p.user();
    const make = async (title: string, subjectCode: string, semester: number, description?: string) => {
      const asset = await approvedAsset(owner.id, "STUDY_MATERIAL");
      return p.prisma.studyMaterial.create({ data: { uploaderId: owner.id, assetId: asset.id, subjectCode, title, description, type: "NOTES", semester, branchCode: "COE" }, select: { id: true } });
    };
    const dbms = await make("Database normalisation notes", "UCS310", 4, "Covers BCNF and 3NF with examples");
    const os = await make("Operating systems scheduling", "UCS303", 5);
    const ids = async (filters: Parameters<typeof listMaterials>[2]) => (await listMaterials(p.prisma, owner.id, filters, names)).map((m) => m.id);
    expect(await ids({ q: "normalisation" })).toEqual([dbms.id]);
    expect(await ids({ q: "BCNF" })).toEqual([dbms.id]);
    expect(await ids({ q: "ucs30" })).toEqual([os.id]);
    expect(await ids({ semester: 5 })).toContain(os.id);
    expect(await ids({ semester: 5 })).not.toContain(dbms.id);
    expect(await ids({ q: "%" })).toEqual([]);
  });
});

describe("archive screenshots (FR-ARC-1)", () => {
  it("attaches the submitter's own approved screenshots and serves them only while the project is visible", async () => {
    const author = await p.user();
    const shot = await approvedAsset(author.id, "ARCHIVE_SCREENSHOT");
    const project = await submitProject(p.prisma, p.personal(author.id), { title: "Bus tracker", description: "<p>Live campus shuttle locations for students.</p>", githubUrl: "https://github.com/example/bus-tracker", tags: [], screenshotAssetIds: [shot.id] });
    if (!project.ok) throw new Error(JSON.stringify(project));
    const reader = await p.user();
    expect(await archive.screenshotVisible(reader.id, false, project.value.id, shot.id)).toBe(false);
    expect(await archive.screenshotVisible(author.id, false, project.value.id, shot.id)).toBe(true);
    const admin = await p.user({ role: "ADMIN" });
    await reviewProject(p.prisma, p.platform(admin.id), project.value.id, { decision: "APPROVE" });
    expect(await archive.screenshotVisible(reader.id, false, project.value.id, shot.id)).toBe(true);
    const detail = await archive.get(reader.id, false, project.value.id);
    expect(detail?.screenshots).toEqual([shot.id]);
    expect(detail?.coverAssetId).toBe(shot.id);
    // The same screenshot cannot be reused by another project.
    expect(await submitProject(p.prisma, p.personal(author.id), { title: "Bus tracker copy", description: "<p>Live campus shuttle locations again.</p>", githubUrl: "https://github.com/example/bus-tracker-2", tags: [], screenshotAssetIds: [shot.id] })).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("scheduled jobs (FR-CAL-2, UC-13 E1)", () => {
  it("extends a recurring entry's occurrence window and is idempotent", async () => {
    const user = await p.user();
    const start = new Date("2026-11-02T04:30:00Z");
    const created = await createEntry(p.prisma, p.personal(user.id), { layer: "PERSONAL", title: "Weekly lab", startAt: start.toISOString(), endAt: new Date(start.getTime() + 3_600_000).toISOString(), rrule: "FREQ=WEEKLY" }, new Date("2026-10-26T00:00:00Z"));
    if (!created.ok) throw new Error("create failed");
    const before = await p.prisma.calendarOccurrence.count({ where: { entryId: created.value.id } });
    const later = new Date("2027-01-15T00:00:00Z");
    expect(await extendWindows(p.prisma, later)).toBeGreaterThanOrEqual(1);
    const after = await p.prisma.calendarOccurrence.count({ where: { entryId: created.value.id } });
    expect(after).toBeGreaterThan(before);
    const last = await p.prisma.calendarOccurrence.findFirstOrThrow({ where: { entryId: created.value.id }, orderBy: { startsAt: "desc" } });
    expect(last.startsAt.getTime()).toBeGreaterThan(later.getTime() + 80 * 86_400_000);
    expect(await extendWindows(p.prisma, later)).toBe(0);
    expect(await p.prisma.calendarOccurrence.count({ where: { entryId: created.value.id } })).toBe(after);
  });

  it("expires uploads never completed within an hour and deletes any stray object", async () => {
    const owner = await p.user();
    const stale = await approvedAsset(owner.id, "STUDY_MATERIAL", "AWAITING_UPLOAD", new Date(Date.now() - 1000));
    const fresh = await approvedAsset(owner.id, "STUDY_MATERIAL", "AWAITING_UPLOAD");
    const removed: string[] = [];
    const storage = { remove: async (key: string) => void removed.push(key) } as unknown as Storage;
    expect(await expireStaleUploads(p.prisma, storage)).toBeGreaterThanOrEqual(1);
    expect((await p.prisma.asset.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("EXPIRED");
    expect((await p.prisma.asset.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("AWAITING_UPLOAD");
    expect(removed.length).toBeGreaterThanOrEqual(1);
  });
});

describe("moderation (UCD-20)", () => {
  it("hides reported material for everyone, dismisses other reports, restores, and audits each decision", async () => {
    const owner = await p.user();
    const asset = await approvedAsset(owner.id, "STUDY_MATERIAL");
    const material = await p.prisma.studyMaterial.create({ data: { uploaderId: owner.id, assetId: asset.id, subjectCode: "UHU005", title: "Reported notes", type: "NOTES", semester: 2, branchCode: "COE" }, select: { id: true } });
    const [r1, r2] = [await p.user(), await p.user()];
    for (const r of [r1, r2]) expect((await createReport(p.prisma, moderationTargets, p.personal(r.id), { targetType: "STUDY_MATERIAL", targetId: material.id, reason: "Copied from a paid book" })).ok).toBe(true);
    const groups = await openReports(p.prisma, moderationTargets);
    const group = groups.find((g) => g.targetId === material.id)!;
    expect(group.count).toBe(2);
    expect(group.preview).toBe("UHU005: Reported notes");
    const admin = await p.user({ role: "ADMIN" });
    expect(await resolveReport(p.prisma, moderationTargets, p.personal(admin.id, "ADMIN"), group.reportId, { action: "HIDE", note: "Copyright" })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect((await resolveReport(p.prisma, moderationTargets, p.platform(admin.id), group.reportId, { action: "HIDE", note: "Copyright" })).ok).toBe(true);
    expect(await p.prisma.moderationReport.count({ where: { targetId: material.id, status: "RESOLVED" } })).toBe(2);
    expect((await listMaterials(p.prisma, r1.id, { subjectCode: "UHU005" }, names)).length).toBe(0);
    expect(await resolveReport(p.prisma, moderationTargets, p.platform(admin.id), group.reportId, { action: "DISMISS", note: "again" })).toMatchObject({ ok: false, code: "INVALID_STATE" });
    expect((await restoreTarget(p.prisma, moderationTargets, p.platform(admin.id), { targetType: "STUDY_MATERIAL", targetId: material.id, note: "Licence confirmed" })).ok).toBe(true);
    expect((await listMaterials(p.prisma, r1.id, { subjectCode: "UHU005" }, names)).length).toBe(1);
    const actions = (await p.prisma.auditLog.findMany({ where: { targetId: material.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["admin.moderation.hidden", "admin.moderation.restored"]);
  });
});

describe("bans and role changes (FR-AUTH-4, UCD-19)", () => {
  it("bans revoke every session and block new ones; admins cannot change themselves or remove the last admin", async () => {
    const admin = await p.user({ role: "ADMIN" });
    const target = await p.user();
    await p.prisma.session.create({ data: { token: `ban-${Date.now()}`, userId: target.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    expect(await banUser(p.prisma, p.personal(admin.id, "ADMIN"), target.id, { banned: true, reason: "Spam" })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await banUser(p.prisma, p.platform(admin.id), target.id, { banned: true })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect((await banUser(p.prisma, p.platform(admin.id), target.id, { banned: true, reason: "Spam" })).ok).toBe(true);
    expect(await p.prisma.session.count({ where: { userId: target.id } })).toBe(0);
    expect((await p.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).bannedAt).not.toBeNull();
    expect((await banUser(p.prisma, p.platform(admin.id), target.id, { banned: false })).ok).toBe(true);
    expect((await p.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).bannedAt).toBeNull();
    expect(await banUser(p.prisma, p.platform(admin.id), admin.id, { banned: true, reason: "self" })).toMatchObject({ ok: false, code: "INVALID_STATE" });
    expect((await changeRole(p.prisma, p.platform(admin.id), target.id, { role: "FACULTY" })).ok).toBe(true);
    expect((await p.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("FACULTY");
    const actions = (await p.prisma.auditLog.findMany({ where: { targetId: target.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["identity.user.banned", "identity.user.unbanned", "identity.role.changed"]);
  });

  it("never demotes or bans the last active admin, even with two concurrent attempts", async () => {
    // Make every other admin in this database inactive for the purpose of the test by banning them first.
    const a = await p.user({ role: "ADMIN" });
    const b = await p.user({ role: "ADMIN" });
    const others = await p.prisma.user.findMany({ where: { role: "ADMIN", bannedAt: null, id: { notIn: [a.id, b.id] } }, select: { id: true } });
    await p.prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { bannedAt: new Date(), bannedReason: "test isolation" } });
    const [x, y] = await Promise.all([changeRole(p.prisma, p.platform(a.id), b.id, { role: "STUDENT" }), changeRole(p.prisma, p.platform(b.id), a.id, { role: "STUDENT" })]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(await p.prisma.user.count({ where: { role: "ADMIN", bannedAt: null } })).toBe(1);
    await p.prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { bannedAt: null, bannedReason: null } });
  });

  it("a banned user's existing session is refused on the next request", async () => {
    const user = await p.user();
    await p.prisma.user.update({ where: { id: user.id }, data: { bannedAt: new Date(), bannedReason: "test" } });
    const session = await p.prisma.session.create({ data: { token: `s-${Date.now()}`, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const auth = { api: { getSession: async () => ({ session: { id: session.id, createdAt: new Date(), expiresAt: session.expiresAt }, user: { id: user.id, name: "x", email: user.email, image: null } }) } };
    expect(await readCurrentSession(auth as never, p.prisma, new Headers())).toBeNull();
    expect(await p.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("profile editing (OI-35)", () => {
  it("updates name, branch, year and skills; never the roll number; validates against the vocabulary", async () => {
    const user = await p.user();
    const before = await p.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { rollNumber: true } });
    expect(await updateProfile(p.prisma, user.id, { name: "New Name", branchCode: "COE", year: 3, tags: ["python", "rust", "robotics", "machine-learning"], rollNumber: "HACKED0001" })).toEqual({ ok: true });
    const after = await p.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, year: true, rollNumber: true, skills: { select: { tagSlug: true } } } });
    expect(after.name).toBe("New Name");
    expect(after.year).toBe(3);
    expect(after.rollNumber).toBe(before.rollNumber);
    expect(after.skills.map((s) => s.tagSlug).sort()).toEqual(["machine-learning", "python", "robotics", "rust"]);
    expect(await updateProfile(p.prisma, user.id, { name: "N", branchCode: "NOPE", year: 3, tags: ["python", "rust", "robotics"] })).toMatchObject({ ok: false });
    expect(await updateProfile(p.prisma, user.id, { name: "Name Ok", branchCode: "COE", year: 3, tags: ["python"] })).toMatchObject({ ok: false });
  });
});

describe("society images (FR-SOC-1, Slice 2d)", () => {
  it("lets a Head of that society attach their own image, refuses others, and audits on behalf of the society", async () => {
    const head = await p.user();
    const otherHead = await p.user();
    const society = await p.society("Sigma", [head.id]);
    await p.society("Tau", [otherHead.id]);
    const owned = (userId: string, assetId: string, purpose: "SOCIETY_LOGO" | "SOCIETY_BANNER") => ownedAssetFor(p.prisma, userId, assetId, purpose);
    const logo = await approvedAsset(head.id, "SOCIETY_LOGO");
    const someoneElses = await approvedAsset(otherHead.id, "SOCIETY_LOGO");
    const headActor = { userId: head.id, globalRole: "STUDENT" as const };
    expect((await setSocietyImage(p.prisma, headActor, society.id, { kind: "logo", assetId: logo.id }, owned)).ok).toBe(true);
    expect((await p.prisma.society.findUniqueOrThrow({ where: { id: society.id } })).logoAssetId).toBe(logo.id);
    expect((await setSocietyImage(p.prisma, headActor, society.id, { kind: "logo", assetId: someoneElses.id }, owned)).ok).toBe(false);
    const banner = await approvedAsset(otherHead.id, "SOCIETY_BANNER");
    expect(await setSocietyImage(p.prisma, { userId: otherHead.id, globalRole: "STUDENT" }, society.id, { kind: "banner", assetId: banner.id }, owned)).toEqual({ ok: false, code: "FORBIDDEN" });
    const wrongPurpose = await approvedAsset(head.id, "SOCIETY_BANNER");
    expect((await setSocietyImage(p.prisma, headActor, society.id, { kind: "logo", assetId: wrongPurpose.id }, owned)).ok).toBe(false);
    const audit = await p.prisma.auditLog.findFirstOrThrow({ where: { targetId: society.id, action: "societies.society.logo.set" } });
    expect(audit.onBehalfOfId).toBe(society.id);
    expect((await setSocietyImage(p.prisma, headActor, society.id, { kind: "logo", assetId: null }, owned)).ok).toBe(true);
    expect((await p.prisma.society.findUniqueOrThrow({ where: { id: society.id } })).logoAssetId).toBeNull();
  });
});

describe("time to first match (MET-1)", () => {
  it("reports hours from creation to the first accepted response", async () => {
    const owner = await p.user();
    const created = await mates.createRequest(p.prisma, p.personal(owner.id), { title: "Metric team", description: "<p>Metric.</p>", type: "CASUAL", skills: ["python"], teamSize: 3, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, async () => new Set(["python"]));
    if (!created.ok) throw new Error("create failed");
    await p.prisma.mateRequest.update({ where: { id: created.value.id }, data: { createdAt: new Date(Date.now() - 5 * 3_600_000) } });
    const member = await p.user();
    const response = await mates.respond(p.prisma, p.personal(member.id), created.value.id, { message: "hi" });
    if (!response.ok) throw new Error("respond failed");
    await mates.decide(p.prisma, p.personal(owner.id), created.value.id, response.value.id, { decision: "ACCEPT" });
    const hours = await timeToMatchHours(p.prisma, new Date(Date.now() - 86_400_000));
    expect(hours.some((h) => h > 4.9 && h < 5.1)).toBe(true);
  });
});
