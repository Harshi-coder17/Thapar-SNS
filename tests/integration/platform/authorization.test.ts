// Capacity separation, society-scoped Head powers, IDOR and concurrency for the platform modules
// (owner security requirements 2026-10-25; ADR-0013 §3.4, §3.7; FR-EVT-5; SPEC-MATE-COUNT; ADR-0010).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addComment, reviewProject, submitProject } from "@/modules/archive";
import { createEntry, deleteEntry, listRange } from "@/modules/calendar";
import * as events from "@/modules/events/service";
import { decideClaim, requestClaim, editOwnProfile, revokeClaim } from "@/modules/faculty";
import * as mates from "@/modules/findmates/service";
import { createReport } from "@/modules/admin";
import type { TargetHandlers } from "@/modules/admin";

import { future, type Platform, startPlatform } from "./setup";

let p: Platform;
const description = "<p>A friendly gathering with talks and demos.</p>";

beforeAll(async () => {
  p = await startPlatform();
});
afterAll(async () => {
  await p?.stop();
});

const newEvent = (societyId: string | undefined, capacity = 10, publish = true) => ({ ...(societyId ? { societyId } : {}), title: "Tech talk", description, venue: "Main auditorium", ...future(7), capacity, registrationSchema: [], publish });

describe("events: one explicit capacity per request (ADR-0013 §3.4, §3.7)", () => {
  it("a Head acts for their own society only; ids of another society are refused", async () => {
    const headA = await p.user();
    const headB = await p.user();
    const a = await p.society("Alpha", [headA.id]);
    const b = await p.society("Beta", [headB.id]);
    const created = await events.createEvent(p.prisma, p.personal(headA.id), newEvent(a.id));
    expect(created.ok).toBe(true);
    expect(await events.createEvent(p.prisma, p.personal(headA.id), newEvent(b.id))).toEqual({ ok: false, code: "FORBIDDEN" });
    if (!created.ok) return;
    // Another society's Head cannot edit, publish or cancel A's event.
    expect((await events.cancelEvent(p.prisma, p.personal(headB.id), created.value.id, { reason: "not mine" })).ok).toBe(false);
    const audit = await p.prisma.auditLog.findFirstOrThrow({ where: { targetId: created.value.id, action: "events.event.published" } });
    expect(audit.actorId).toBe(headA.id);
    expect(audit.onBehalfOfType).toBe("society");
    expect(audit.onBehalfOfId).toBe(a.id);
  });

  it("an admin without a Head grant cannot act as a Head, and capacities never combine", async () => {
    const admin = await p.user({ role: "ADMIN" });
    const head = await p.user();
    const society = await p.society("Gamma", [head.id]);
    // Personal capacity: the ADMIN role adds nothing.
    expect(await events.createEvent(p.prisma, p.personal(admin.id, "ADMIN"), newEvent(society.id))).toEqual({ ok: false, code: "FORBIDDEN" });
    // Platform capacity: no society powers either.
    expect(await events.createEvent(p.prisma, p.platform(admin.id), newEvent(society.id))).toEqual({ ok: false, code: "FORBIDDEN" });
    // A Head who is also ADMIN, in the platform capacity, does not get society powers.
    const adminHead = await p.user({ role: "ADMIN" });
    const own = await p.society("Delta", [adminHead.id]);
    expect(await events.createEvent(p.prisma, p.platform(adminHead.id), newEvent(own.id))).toEqual({ ok: false, code: "FORBIDDEN" });
    expect((await events.createEvent(p.prisma, p.personal(adminHead.id, "ADMIN"), newEvent(own.id))).ok).toBe(true);
    // Campus events: platform capacity only, audited without a society.
    expect(await events.createEvent(p.prisma, p.personal(admin.id, "ADMIN"), newEvent(undefined))).toEqual({ ok: false, code: "FORBIDDEN" });
    const campus = await events.createEvent(p.prisma, p.platform(admin.id), newEvent(undefined));
    expect(campus.ok).toBe(true);
    if (campus.ok) expect((await p.prisma.auditLog.findFirstOrThrow({ where: { targetId: campus.value.id } })).onBehalfOfType).toBeNull();
  });

  it("a revoked Head is refused on the very next request, for that society only", async () => {
    const head = await p.user();
    const one = await p.society("Epsilon", [head.id]);
    const two = await p.society("Zeta", [head.id]);
    await p.prisma.societyHeadGrant.updateMany({ where: { societyId: one.id, userId: head.id }, data: { revokedAt: new Date(), revokeReason: "REMOVED" } });
    expect(await events.createEvent(p.prisma, p.personal(head.id), newEvent(one.id))).toEqual({ ok: false, code: "FORBIDDEN" });
    expect((await events.createEvent(p.prisma, p.personal(head.id), newEvent(two.id))).ok).toBe(true);
  });

  it("an inactive society's Head cannot create events", async () => {
    const head = await p.user();
    const society = await p.society("Eta", [head.id], { active: false });
    expect(await events.createEvent(p.prisma, p.personal(head.id), newEvent(society.id))).toEqual({ ok: false, code: "FORBIDDEN" });
  });
});

describe("event registration (UC-07, FR-EVT-5, OI-14)", () => {
  it("never exceeds capacity under 50 concurrent registrations (10 places)", async () => {
    const head = await p.user();
    const society = await p.society("Theta", [head.id]);
    const created = await events.createEvent(p.prisma, p.personal(head.id), newEvent(society.id, 10));
    if (!created.ok) throw new Error("create failed");
    const students = await Promise.all(Array.from({ length: 50 }, () => p.user()));
    const results = await Promise.all(students.map((s) => events.register(p.prisma, p.personal(s.id), created.value.id, { responses: {} })));
    expect(results.every((r) => r.ok)).toBe(true);
    const statuses = results.map((r) => (r.ok ? r.value.status : "ERROR"));
    expect(statuses.filter((s) => s === "REGISTERED")).toHaveLength(10);
    expect(statuses.filter((s) => s === "WAITLISTED")).toHaveLength(40);
    const event = await p.prisma.event.findUniqueOrThrow({ where: { id: created.value.id } });
    expect(event.registeredCount).toBe(10);
    expect(await p.prisma.eventRegistration.count({ where: { eventId: event.id, status: "REGISTERED" } })).toBe(10);
  });

  it("is idempotent, promotes the waitlist first come first served, and closes on cancellation", async () => {
    const head = await p.user();
    const society = await p.society("Iota", [head.id]);
    const created = await events.createEvent(p.prisma, p.personal(head.id), newEvent(society.id, 1));
    if (!created.ok) throw new Error("create failed");
    const [first, second, third] = [await p.user(), await p.user(), await p.user()];
    expect((await events.register(p.prisma, p.personal(first.id), created.value.id, {})) as unknown).toMatchObject({ ok: true, value: { status: "REGISTERED", already: false } });
    expect(await events.register(p.prisma, p.personal(first.id), created.value.id, {})).toMatchObject({ ok: true, value: { status: "REGISTERED", already: true } });
    expect(await events.register(p.prisma, p.personal(second.id), created.value.id, {})).toMatchObject({ value: { status: "WAITLISTED" } });
    expect(await events.register(p.prisma, p.personal(third.id), created.value.id, {})).toMatchObject({ value: { status: "WAITLISTED" } });
    expect(await p.prisma.notification.count({ where: { recipientId: first.id, type: "event.registration.confirmed" } })).toBe(1);
    expect((await events.cancelRegistration(p.prisma, p.personal(first.id), created.value.id)).ok).toBe(true);
    const promoted = await p.prisma.eventRegistration.findUniqueOrThrow({ where: { eventId_userId: { eventId: created.value.id, userId: second.id } } });
    expect(promoted.status).toBe("REGISTERED");
    expect(await p.prisma.notification.count({ where: { recipientId: second.id, type: "event.registration.promoted" } })).toBe(1);
    expect((await events.cancelEvent(p.prisma, p.personal(head.id), created.value.id, { reason: "Speaker unavailable" })).ok).toBe(true);
    expect(await p.prisma.notification.count({ where: { type: "event.cancelled", recipientId: { in: [second.id, third.id] } } })).toBe(2);
    const late = await p.user();
    expect(await events.register(p.prisma, p.personal(late.id), created.value.id, {})).toMatchObject({ ok: false, code: "INVALID_STATE" });
  });

  it("drafts are invisible to students and registration requires the platform-free personal capacity", async () => {
    const head = await p.user();
    const society = await p.society("Kappa", [head.id]);
    const draft = await events.createEvent(p.prisma, p.personal(head.id), newEvent(society.id, 5, false));
    if (!draft.ok) throw new Error("create failed");
    const student = await p.user();
    expect(await events.register(p.prisma, p.personal(student.id), draft.value.id, {})).toEqual({ ok: false, code: "NOT_FOUND" });
    const admin = await p.user({ role: "ADMIN" });
    expect(await events.register(p.prisma, p.platform(admin.id), draft.value.id, {})).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("interest is one per student and queues a versioned realtime update", async () => {
    const head = await p.user();
    const society = await p.society("Lambda", [head.id]);
    const created = await events.createEvent(p.prisma, p.personal(head.id), newEvent(society.id));
    if (!created.ok) throw new Error("create failed");
    const s = await p.user();
    await events.setInterest(p.prisma, p.personal(s.id), created.value.id, { interested: true });
    const again = await events.setInterest(p.prisma, p.personal(s.id), created.value.id, { interested: true });
    expect(again).toMatchObject({ ok: true, value: { interestCount: 1 } });
    expect(await p.prisma.outboxEvent.count({ where: { eventType: "realtime.publish", dedupeKey: { startsWith: `event.interest:${created.value.id}:` } } })).toBe(1);
  });
});

describe("Find Mates and chat (SPEC-MATE-COUNT, ACT-1..9, IDOR)", () => {
  const request = { title: "Hackathon team", description: "<p>Building a robotics demo.</p>", type: "HACKATHON", skills: ["robotics"], teamSize: 2, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
  const tags = async () => new Set(["robotics", "python", "rust"]);

  it("accepts exactly one responder for the last place under concurrency, then closes", async () => {
    const owner = await p.user();
    const created = await mates.createRequest(p.prisma, p.personal(owner.id), request, tags);
    if (!created.ok) throw new Error(JSON.stringify(created));
    const responders = await Promise.all(Array.from({ length: 5 }, () => p.user()));
    const responses = [];
    for (const r of responders) {
      const res = await mates.respond(p.prisma, p.personal(r.id), created.value.id, { message: "I can help" });
      if (!res.ok) throw new Error("respond failed");
      responses.push(res.value.id);
    }
    const decisions = await Promise.all(responses.map((id) => mates.decide(p.prisma, p.personal(owner.id), created.value.id, id, { decision: "ACCEPT" })));
    expect(decisions.filter((d) => d.ok)).toHaveLength(1);
    const row = await p.prisma.mateRequest.findUniqueOrThrow({ where: { id: created.value.id } });
    expect(row.currentCount).toBe(2);
    expect(row.status).toBe("CLOSED");
    expect(await p.prisma.mateConnection.count({ where: { requestId: row.id } })).toBe(1);
  });

  it("refuses responding to one's own request, duplicates, and decisions by others", async () => {
    const owner = await p.user();
    const created = await mates.createRequest(p.prisma, p.personal(owner.id), { ...request, teamSize: 4 }, tags);
    if (!created.ok) throw new Error("create failed");
    expect(await mates.respond(p.prisma, p.personal(owner.id), created.value.id, { message: "me" })).toMatchObject({ ok: false, code: "INVALID_STATE" });
    const r = await p.user();
    const first = await mates.respond(p.prisma, p.personal(r.id), created.value.id, { message: "hi" });
    expect(await mates.respond(p.prisma, p.personal(r.id), created.value.id, { message: "again" })).toMatchObject({ ok: false, code: "CONFLICT" });
    const stranger = await p.user();
    if (!first.ok) throw new Error("respond failed");
    expect(await mates.decide(p.prisma, p.personal(stranger.id), created.value.id, first.value.id, { decision: "ACCEPT" })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await mates.createRequest(p.prisma, p.personal(owner.id), { ...request, teamSize: 11 }, tags)).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("chat is readable and writable by its two participants only (404 for anyone else)", async () => {
    const owner = await p.user();
    const created = await mates.createRequest(p.prisma, p.personal(owner.id), { ...request, teamSize: 3 }, tags);
    if (!created.ok) throw new Error("create failed");
    const member = await p.user();
    const response = await mates.respond(p.prisma, p.personal(member.id), created.value.id, { message: "hi" });
    if (!response.ok) throw new Error("respond failed");
    const accepted = await mates.decide(p.prisma, p.personal(owner.id), created.value.id, response.value.id, { decision: "ACCEPT" });
    if (!accepted.ok || !accepted.value.connectionId) throw new Error("accept failed");
    const connectionId = accepted.value.connectionId;
    expect((await mates.sendMessage(p.prisma, p.personal(member.id), connectionId, { body: "<b>Hello</b>\u202e team" })).ok).toBe(true);
    const outsider = await p.user();
    expect(await mates.listMessages(p.prisma, outsider.id, connectionId)).toBeNull();
    expect(await mates.sendMessage(p.prisma, p.personal(outsider.id), connectionId, { body: "let me in" })).toEqual({ ok: false, code: "NOT_FOUND" });
    const messages = await mates.listMessages(p.prisma, owner.id, connectionId);
    expect(messages).toHaveLength(1);
    // Plain text: stored as typed and rendered as text (escaped), with bidi-override characters removed.
    expect(messages![0]!.body).toBe("<b>Hello</b> team");
    expect(await p.prisma.notification.count({ where: { recipientId: owner.id, type: "chat.message" } })).toBe(1);
  });
});

describe("faculty claims (ADR-0010)", () => {
  it("allows one pending claim, needs the platform capacity, refuses self-decision, and grants FACULTY atomically", async () => {
    const profile = await p.prisma.facultyProfile.create({ data: { name: "Dr. Test Person", department: "Department of Computer Science & Engineering", designation: "Assistant Professor", sourceUrl: "https://www.thapar.edu/faculties", sourceKey: `test-${Date.now()}@thapar.edu` }, select: { id: true } });
    const claimant = await p.user();
    const other = await p.user();
    const claim = await requestClaim(p.prisma, p.personal(claimant.id), profile.id, { message: "This is me" });
    if (!claim.ok) throw new Error("claim failed");
    expect(await requestClaim(p.prisma, p.personal(other.id), profile.id, {})).toMatchObject({ ok: false, code: "CONFLICT" });
    const admin = await p.user({ role: "ADMIN" });
    expect(await decideClaim(p.prisma, p.personal(admin.id, "ADMIN"), claim.value.id, { decision: "APPROVE", reason: "Checked" })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await decideClaim(p.prisma, p.platform(claimant.id), claim.value.id, { decision: "APPROVE", reason: "Mine" })).toEqual({ ok: false, code: "FORBIDDEN" });
    await p.prisma.session.create({ data: { token: `t-${Date.now()}`, userId: claimant.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    expect((await decideClaim(p.prisma, p.platform(admin.id), claim.value.id, { decision: "APPROVE", reason: "Email matches" })).ok).toBe(true);
    const user = await p.prisma.user.findUniqueOrThrow({ where: { id: claimant.id } });
    expect(user.role).toBe("FACULTY");
    expect(await p.prisma.session.count({ where: { userId: claimant.id } })).toBe(0);
    const linked = await p.prisma.facultyProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(linked.userId).toBe(claimant.id);
    expect(linked.isVerified).toBe(true);
    expect(await p.prisma.auditLog.count({ where: { action: "faculty.claim.approved", targetId: claim.value.id, actorId: admin.id } })).toBe(1);
  });
});

describe("faculty claims by students (owner question 2026-10-26)", () => {
  it("a claim grants nothing until approved, one account holds at most one pending claim, and only the linked member edits", async () => {
    const stamp = Date.now();
    const mk = (n: number) => p.prisma.facultyProfile.create({ data: { name: `Dr. Claim Test ${n}`, department: "Department of Computer Science & Engineering", designation: "Professor", sourceUrl: "https://www.thapar.edu/faculties", sourceKey: `claim-${stamp}-${n}@thapar.edu` }, select: { id: true } });
    const [first, second] = [await mk(1), await mk(2)];
    const student = await p.user();
    const claim = await requestClaim(p.prisma, p.personal(student.id), first.id, {});
    expect(claim.ok).toBe(true);
    // Requesting changes neither the role nor the profile.
    expect((await p.prisma.user.findUniqueOrThrow({ where: { id: student.id } })).role).toBe("STUDENT");
    expect(await p.prisma.facultyProfile.findUniqueOrThrow({ where: { id: first.id }, select: { userId: true, isVerified: true } })).toEqual({ userId: null, isVerified: false });
    // A second pending claim from the same account is refused (service check and unique index).
    expect(await requestClaim(p.prisma, p.personal(student.id), second.id, {})).toMatchObject({ ok: false, code: "CONFLICT" });
    await expect(p.prisma.facultyClaim.create({ data: { profileId: second.id, claimantId: student.id } })).rejects.toMatchObject({ code: "P2002" });
    // No faculty data can be changed without an approved link, and only admins revoke.
    expect(await editOwnProfile(p.prisma, p.personal(student.id), first.id, { cabin: "X", officeHours: null, specialization: null })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await revokeClaim(p.prisma, p.personal(student.id), first.id, { reason: "Not mine" })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect((await p.prisma.facultyProfile.findUniqueOrThrow({ where: { id: first.id } })).cabin).toBeNull();
    // After a rejection the account may claim again.
    const admin = await p.user({ role: "ADMIN" });
    expect((await decideClaim(p.prisma, p.platform(admin.id), (claim as { ok: true; value: { id: string } }).value.id, { decision: "REJECT", reason: "Not this person" })).ok).toBe(true);
    expect((await requestClaim(p.prisma, p.personal(student.id), second.id, {})).ok).toBe(true);
  });
});

describe("archive (FR-ARC-2/3)", () => {
  it("hides unreviewed projects, needs an admin review, and limits replies to depth 3", async () => {
    const author = await p.user();
    const project = await submitProject(p.prisma, p.personal(author.id), { title: "Campus map", description: "<p>An interactive campus map for new students.</p>", githubUrl: "https://github.com/example/campus-map.git", tags: ["react"], screenshotAssetIds: [] });
    if (!project.ok) throw new Error(JSON.stringify(project));
    const reader = await p.user();
    expect(await addComment(p.prisma, p.personal(reader.id), project.value.id, { body: "Nice" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await reviewProject(p.prisma, p.platform(author.id), project.value.id, { decision: "APPROVE" })).toEqual({ ok: false, code: "FORBIDDEN" });
    const admin = await p.user({ role: "ADMIN" });
    expect(await reviewProject(p.prisma, p.personal(admin.id, "ADMIN"), project.value.id, { decision: "APPROVE" })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect((await reviewProject(p.prisma, p.platform(admin.id), project.value.id, { decision: "APPROVE" })).ok).toBe(true);
    let parent: string | undefined;
    for (let depth = 1; depth <= 3; depth++) {
      const c = await addComment(p.prisma, p.personal(reader.id), project.value.id, { body: `level ${depth}`, ...(parent ? { parentId: parent } : {}) });
      if (!c.ok) throw new Error(`depth ${depth}`);
      parent = c.value.id;
    }
    expect(await addComment(p.prisma, p.personal(reader.id), project.value.id, { body: "level 4", parentId: parent })).toMatchObject({ ok: false, code: "INVALID_STATE" });
    // A parent from another project is refused as not found (cross-object id).
    const other = await submitProject(p.prisma, p.personal(author.id), { title: "Other project", description: "<p>Another project description here.</p>", githubUrl: "https://github.com/example/other", tags: [], screenshotAssetIds: [] });
    if (!other.ok) throw new Error("submit failed");
    await reviewProject(p.prisma, p.platform(admin.id), other.value.id, { decision: "APPROVE" });
    expect(await addComment(p.prisma, p.personal(reader.id), other.value.id, { body: "x", parentId: parent })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("calendar layers (FR-CAL-1)", () => {
  it("keeps personal entries private and academic entries admin-only", async () => {
    const a = await p.user();
    const b = await p.user();
    const start = new Date(Date.now() + 86_400_000);
    const entry = await createEntry(p.prisma, p.personal(a.id), { layer: "PERSONAL", title: "Study group", startAt: start.toISOString(), endAt: new Date(start.getTime() + 3_600_000).toISOString(), rrule: "FREQ=WEEKLY;COUNT=4" });
    if (!entry.ok) throw new Error(JSON.stringify(entry));
    const window = [new Date(), new Date(Date.now() + 60 * 86_400_000)] as const;
    expect((await listRange(p.prisma, p.personal(a.id), ...window, ["PERSONAL"])).filter((i) => i.entryId === entry.value.id)).toHaveLength(4);
    expect((await listRange(p.prisma, p.personal(b.id), ...window, ["PERSONAL"])).filter((i) => i.entryId === entry.value.id)).toHaveLength(0);
    expect(await deleteEntry(p.prisma, p.personal(b.id), entry.value.id)).toEqual({ ok: false, code: "NOT_FOUND" });
    const academic = { layer: "ACADEMIC", title: "Mid-semester exams", startAt: start.toISOString(), endAt: new Date(start.getTime() + 3_600_000).toISOString() };
    expect(await createEntry(p.prisma, p.personal(b.id), academic)).toEqual({ ok: false, code: "FORBIDDEN" });
    const admin = await p.user({ role: "ADMIN" });
    expect(await createEntry(p.prisma, p.personal(admin.id, "ADMIN"), academic)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect((await createEntry(p.prisma, p.platform(admin.id), academic)).ok).toBe(true);
  });
});

describe("moderation reports (Slice 5)", () => {
  it("refuses reports on content the reporter cannot see", async () => {
    const reporter = await p.user();
    const visible = new Set<string>(["11111111-1111-4111-8111-111111111111"]);
    const handler = { visibleTo: async (id: string) => visible.has(id), hide: async () => true, preview: async () => "x" };
    const targets = Object.fromEntries(["SOCIETY_POST", "STUDY_MATERIAL", "ARCHIVE_PROJECT", "ARCHIVE_COMMENT", "CHAT_MESSAGE"].map((k) => [k, handler])) as unknown as TargetHandlers;
    expect(await createReport(p.prisma, targets, p.personal(reporter.id), { targetType: "CHAT_MESSAGE", targetId: "22222222-2222-4222-8222-222222222222", reason: "Spam message" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect((await createReport(p.prisma, targets, p.personal(reporter.id), { targetType: "CHAT_MESSAGE", targetId: "11111111-1111-4111-8111-111111111111", reason: "Spam message" })).ok).toBe(true);
    expect(await createReport(p.prisma, targets, p.personal(reporter.id), { targetType: "CHAT_MESSAGE", targetId: "11111111-1111-4111-8111-111111111111", reason: "Spam again" })).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});

describe("official imported societies (ADR-0013 §5, owner decision 2026-10-25)", () => {
  it("are listed and readable by students, read-only until a Head is appointed, with only officially matched faculty shown", async () => {
    const { getSocietyBySlug, listOfficialAwaitingHead, listSocieties } = await import("@/modules/societies/queries");
    const { followSociety, requestMembership } = await import("@/modules/societies/service");
    const { findUserByEmail, getUserSummaries } = await import("@/modules/identity/directory");
    const { getProfileOptions } = await import("@/modules/identity/profile");
    const identity = { userByEmail: (e: string) => findUserByEmail(p.prisma, e), userSummaries: (ids: readonly string[]) => getUserSummaries(p.prisma, ids), activeBranches: async () => (await getProfileOptions(p.prisma)).branches };
    const stamp = Date.now();
    const imported = await p.prisma.society.create({ data: { name: `Imported Club ${stamp}`, slug: `imported-club-${stamp}`, isActive: false, sourceKey: `imported-${stamp}`, description: "As officially published." }, select: { slug: true, id: true } });
    const profile = await p.prisma.facultyProfile.create({ data: { name: "Dr. Official Person", department: "Department of Biotechnology", designation: "Professor", sourceUrl: "https://www.thapar.edu/faculties", sourceKey: `official-${stamp}@thapar.edu` }, select: { id: true } });
    await p.prisma.societyFacultyAssociation.createMany({
      data: [
        { societyId: imported.id, name: "Dr. Official Person", sourceRole: "Faculty Advisor", facultyProfileId: profile.id, matchBasis: "institutional_email" },
        { societyId: imported.id, name: "Dr. Unmatched Person", sourceRole: "Faculty Coordinator" },
      ],
    });
    const student = await p.user();
    const actor = { userId: student.id, globalRole: "STUDENT" as const };
    expect((await listOfficialAwaitingHead(p.prisma, actor, {})).map((s) => s.slug)).toContain(imported.slug);
    expect((await listSocieties(p.prisma, actor, {})).map((s) => s.slug)).not.toContain(imported.slug);
    expect(await listOfficialAwaitingHead(p.prisma, actor, { category: "technical" })).toEqual([]);
    const detail = await getSocietyBySlug(p.prisma, identity, actor, imported.slug);
    expect(detail?.awaitingHead).toBe(true);
    expect(detail?.faculty.map((f) => f.name)).toEqual(["Dr. Official Person"]);
    expect((await followSociety(p.prisma, actor, imported.id)).ok).toBe(false);
    expect((await requestMembership(p.prisma, actor, imported.id, {})).ok).toBe(false);
    const admin = await p.user({ role: "ADMIN" });
    const adminView = await getSocietyBySlug(p.prisma, identity, { userId: admin.id, globalRole: "ADMIN" }, imported.slug);
    expect(adminView?.faculty.map((f) => f.name).sort()).toEqual(["Dr. Official Person", "Dr. Unmatched Person"]);
    // Display only: the association grants the faculty member nothing.
    expect(await p.prisma.societyHeadGrant.count({ where: { societyId: imported.id } })).toBe(0);
    expect(detail?.can["posts.create"]).toBe(false);
  });
});

describe("society categories for official listings (OI-55, owner 2026-10-26)", () => {
  it("lists an official organisation under its mapped category only, keeps it under All, and never under Following or My societies", async () => {
    const { listOfficialAwaitingHead, listSocieties } = await import("@/modules/societies/queries");
    const stamp = Date.now();
    const technical = await p.prisma.society.create({ data: { name: `Official Tech ${stamp}`, slug: `official-tech-${stamp}`, isActive: false, sourceKey: `official-tech-${stamp}`, sourceType: "society", sourceSubtype: "technical-/-academic", categorySlug: "technical" }, select: { slug: true } });
    const uncategorised = await p.prisma.society.create({ data: { name: `Official Unknown ${stamp}`, slug: `official-unknown-${stamp}`, isActive: false, sourceKey: `official-unknown-${stamp}` }, select: { slug: true } });
    const student = await p.user();
    const actor = { userId: student.id, globalRole: "STUDENT" as const };
    const slugs = async (filters: Parameters<typeof listOfficialAwaitingHead>[2]) => (await listOfficialAwaitingHead(p.prisma, actor, filters)).map((s) => s.slug);
    expect(await slugs({})).toEqual(expect.arrayContaining([technical.slug, uncategorised.slug]));
    expect(await slugs({ category: "technical" })).toContain(technical.slug);
    expect(await slugs({ category: "technical" })).not.toContain(uncategorised.slug);
    expect(await slugs({ category: "cultural" })).not.toContain(technical.slug);
    expect(await slugs({ q: "Official Tech", category: "technical" })).toEqual([technical.slug]);
    expect((await listSocieties(p.prisma, actor, { view: "following" })).map((s) => s.slug)).not.toContain(technical.slug);
    expect((await listSocieties(p.prisma, actor, { view: "mine" })).map((s) => s.slug)).not.toContain(technical.slug);
  });
});
