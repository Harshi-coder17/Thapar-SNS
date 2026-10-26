// Society workspace and equal Heads (ADR-0013 / OI-56, owner decisions 2026-10-25): any number of
// Heads with the same full access, at least one per active society (including under concurrent
// requests), atomic handover, immediate revocation without data loss, platform-admin recovery,
// society-only public attribution, on-behalf-of audit records, and faculty-association visibility.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPost, getSocietyBySlug, listManagedSocieties, listSocietyPosts } from "@/modules/societies/queries";
import { getSocietyActor } from "@/modules/societies/service";

import { type Harness, startHarness, type TestUser } from "./harness";

const ADMIN = "heads.admin@thapar.edu";
let h: Harness;
let admin: TestUser;

beforeAll(async () => {
  h = await startHarness(ADMIN);
  admin = await h.user(ADMIN);
});

afterAll(async () => {
  await h?.stop();
});

let counter = 0;
let emailCounter = 0;
/** A fresh fictitious user. */
const person = (label: string, options?: { completeProfile?: boolean }) => {
  emailCounter += 1;
  return h.user(`hd.${label}.${emailCounter}@thapar.edu`, options);
};

async function society(heads: TestUser[], overrides: Record<string, unknown> = {}) {
  counter += 1;
  const response = await h.api.createSociety(h.req(admin.cookie, "POST", { name: `Heads Society ${counter}`, headEmails: heads.map((x) => x.email), ...overrides }));
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
  return ((await response.json()) as { society: { id: string; slug: string } }).society;
}

const activeHeads = async (societyId: string) => (await h.prisma.societyHeadGrant.findMany({ where: { societyId, revokedAt: null }, select: { userId: true } })).map((g) => g.userId).sort();
const postId = async (response: Response) => ((await response.json()) as { post: { id: string } }).post.id;

describe("equal Heads", () => {
  it("HD01: every Head has the same full access (posts, membership, display data, profile, Heads)", async () => {
    const [a, b, c] = [await person("a"), await person("b"), await person("c")];
    const s = await society([a, b, c]);
    for (const head of [a, b, c]) {
      expect((await h.api.createPost(h.req(head.cookie, "POST", { type: "UPDATE", title: `By ${head.email}`, body: "<p>x</p>" }), s.id)).status, head.email).toBe(201);
      expect((await h.api.updateSociety(h.req(head.cookie, "PATCH", { description: `Edited by ${head.email}` }), s.id)).status, head.email).toBe(200);
    }
    const joiner = await person("joiner");
    const sent = (await (await h.api.requestMembership(h.req(joiner.cookie, "POST", {}), s.id)).json()) as { request: { id: string } };
    expect((await h.api.decideMembershipRequest(h.req(c.cookie, "POST", { decision: "APPROVE" }), s.id, sent.request.id)).status).toBe(200);
    expect((await h.api.updateMemberDisplay(h.req(b.cookie, "PATCH", { group: "CORE", position: "Design Lead" }), s.id, joiner.id)).status).toBe(200);
    const fourth = await person("d");
    expect((await h.api.addHead(h.req(b.cookie, "POST", { email: fourth.email }), s.id)).status).toBe(201);
    expect(await activeHeads(s.id)).toEqual([a.id, b.id, c.id, fourth.id].sort());
  });

  it("HD02: content is shown as the society; the individual is visible only to its Heads and platform admins", async () => {
    const [a, b] = [await person("pa"), await person("pb")];
    const s = await society([a, b]);
    const id = await postId(await h.api.createPost(h.req(b.cookie, "POST", { type: "UPDATE", title: "Orientation", body: "<p>Friday</p>" }), s.id));
    const student = await person("reader");
    const view = async (u: TestUser) => {
      const actor = await h.actorOf(u);
      const detail = (await getSocietyBySlug(h.prisma, h.identity, actor, s.slug))!;
      return getPost(h.prisma, h.identity, actor, detail, id);
    };
    expect((await view(student))?.author).toBeNull();
    expect((await view(student))?.society.name).toMatch(/^Heads Society/);
    expect((await view(a))?.author?.id).toBe(b.id);
    expect((await view(admin))?.author?.id).toBe(b.id);
    const listed = await listSocietyPosts(h.prisma, h.identity, await h.actorOf(student), (await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(student), s.slug))!);
    expect(listed.posts.every((p) => p.author === null)).toBe(true);
  });
});

describe("adding and removing Heads", () => {
  it("HD03: Heads and admins add Heads; the incoming person must have signed in; members cannot; duplicates refused", async () => {
    const a = await person("add-a");
    const s = await society([a]);
    const member = await person("add-member");
    await h.prisma.societyMembership.create({ data: { societyId: s.id, userId: member.id, group: "CORE", position: "Secretary" } });
    const target = await person("add-target");
    expect((await h.api.addHead(h.req(member.cookie, "POST", { email: target.email }), s.id)).status).toBe(403);
    const unknown = await h.api.addHead(h.req(a.cookie, "POST", { email: "never.signed.in@thapar.edu" }), s.id);
    expect(unknown.status).toBe(400);
    expect((await h.json(unknown)).error?.fields).toHaveProperty("email");
    expect((await h.api.addHead(h.req(a.cookie, "POST", { email: target.email }), s.id)).status).toBe(201);
    expect((await h.api.addHead(h.req(a.cookie, "POST", { email: target.email }), s.id)).status).toBe(409);
    // An existing member keeps their display data when they become a Head.
    expect((await h.api.addHead(h.req(admin.cookie, "POST", { email: member.email }, { as: "admin" }), s.id)).status).toBe(201);
    expect(await h.prisma.societyMembership.findUniqueOrThrow({ where: { societyId_userId: { societyId: s.id, userId: member.id } } })).toMatchObject({ group: "CORE", position: "Secretary" });
    const grants = await h.prisma.societyHeadGrant.findMany({ where: { societyId: s.id, revokedAt: null }, select: { userId: true, grantReason: true } });
    expect(grants).toEqual(expect.arrayContaining([{ userId: target.id, grantReason: "ADDED" }, { userId: member.id, grantReason: "ADMIN_RECOVERY" }]));
    // An incomplete profile does not stop someone who has signed in from being added.
    const fresh = await person("add-fresh", { completeProfile: false });
    expect((await h.api.addHead(h.req(a.cookie, "POST", { email: fresh.email }), s.id)).status).toBe(201);
  });

  it("HD04: removing Head access revokes it on the next request and keeps account, membership, posts, attribution and history", async () => {
    const [a, b] = [await person("rm-a"), await person("rm-b")];
    const s = await society([a, b]);
    const id = await postId(await h.api.createPost(h.req(b.cookie, "POST", { type: "UPDATE", title: "Kept", body: "<p>x</p>" }), s.id));
    expect((await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(b), s.slug))!.can["workspace.open"]).toBe(true);
    expect((await h.api.removeHead(h.req(a.cookie, "DELETE"), s.id, b.id)).status).toBe(200);
    // The very next protected request is refused.
    expect((await h.api.createPost(h.req(b.cookie, "POST", { type: "UPDATE", title: "After removal", body: "<p>x</p>" }), s.id)).status).toBe(403);
    expect((await h.api.deletePost(h.req(b.cookie, "DELETE"), s.id, id)).status).toBe(403);
    expect((await h.api.addHead(h.req(b.cookie, "POST", { email: b.email }), s.id)).status).toBe(403);
    expect((await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(b), s.slug))!.can["workspace.open"]).toBe(false);
    expect(await getSocietyActor(h.prisma, b.id, s.id)).toBeNull();
    // Nothing was deleted.
    expect(await h.prisma.user.count({ where: { id: b.id } })).toBe(1);
    expect(await h.prisma.societyMembership.count({ where: { societyId: s.id, userId: b.id } })).toBe(1);
    expect(await h.prisma.societyPost.findUniqueOrThrow({ where: { id } })).toMatchObject({ authorId: b.id, title: "Kept" });
    const history = await h.prisma.societyHeadGrant.findFirstOrThrow({ where: { societyId: s.id, userId: b.id } });
    expect(history).toMatchObject({ revokeReason: "REMOVED", revokedById: a.id });
    expect(history.revokedAt).not.toBeNull();
    // Re-adding later creates a new grant; the old one stays as history.
    expect((await h.api.addHead(h.req(a.cookie, "POST", { email: b.email }), s.id)).status).toBe(201);
    expect(await h.prisma.societyHeadGrant.count({ where: { societyId: s.id, userId: b.id } })).toBe(2);
  });

  it("HD05: the last Head of an active society can never be removed; Heads cannot remove themselves", async () => {
    const [a, b] = [await person("last-a"), await person("last-b")];
    const s = await society([a, b]);
    expect((await h.api.removeHead(h.req(a.cookie, "DELETE"), s.id, a.id)).status).toBe(422);
    expect((await h.api.removeHead(h.req(admin.cookie, "DELETE", undefined, { as: "admin" }), s.id, b.id)).status).toBe(200);
    const last = await h.api.removeHead(h.req(admin.cookie, "DELETE", undefined, { as: "admin" }), s.id, a.id);
    expect(last.status).toBe(422);
    expect((await h.json(last)).error?.message).toMatch(/at least one Head/);
    expect(await activeHeads(s.id)).toEqual([a.id]);
  });

  it("HD06: concurrent removals never leave an active society without a Head (row lock)", async () => {
    for (let round = 0; round < 3; round += 1) {
      const [a, b] = [await person(`race-a${round}`), await person(`race-b${round}`)];
      const s = await society([a, b]);
      // Two Heads remove each other at the same moment, while an admin also removes both.
      const results = await Promise.all([
        h.api.removeHead(h.req(a.cookie, "DELETE"), s.id, b.id),
        h.api.removeHead(h.req(b.cookie, "DELETE"), s.id, a.id),
        h.api.removeHead(h.req(admin.cookie, "DELETE", undefined, { as: "admin" }), s.id, a.id),
        h.api.removeHead(h.req(admin.cookie, "DELETE", undefined, { as: "admin" }), s.id, b.id),
      ]);
      expect(results.filter((r) => r.status === 200), `round ${round}`).toHaveLength(1);
      expect(results.every((r) => [200, 403, 404, 422].includes(r.status))).toBe(true);
      expect(await activeHeads(s.id), `round ${round}`).toHaveLength(1);
    }
  });

  it("HD07: a Head of one society has no power over another society's Heads or workspace", async () => {
    const [a, b] = [await person("x-a"), await person("x-b")];
    const sa = await society([a]);
    const sb = await society([b]);
    const intruder = await person("x-target");
    expect((await h.api.addHead(h.req(a.cookie, "POST", { email: intruder.email }), sb.id)).status).toBe(403);
    expect((await h.api.removeHead(h.req(a.cookie, "DELETE"), sb.id, b.id)).status).toBe(403);
    expect((await h.api.handOver(h.req(a.cookie, "POST", { email: intruder.email }), sb.id)).status).toBe(403);
    expect((await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(a), sb.slug))!.can["workspace.open"]).toBe(false);
    expect(await getSocietyActor(h.prisma, a.id, sb.id)).toBeNull();
    expect(await getSocietyActor(h.prisma, a.id, sa.id)).toMatchObject({ id: sa.id });
  });
});

describe("handover", () => {
  it("HD08: handover is atomic: the incoming Head gets access, then the outgoing Head's access ends; audited", async () => {
    const outgoing = await person("ho-out");
    const s = await society([outgoing]);
    const incoming = await person("ho-in");
    expect((await h.api.handOver(h.req(outgoing.cookie, "POST", { email: incoming.email }), s.id)).status).toBe(200);
    expect(await activeHeads(s.id)).toEqual([incoming.id]);
    const grants = await h.prisma.societyHeadGrant.findMany({ where: { societyId: s.id }, orderBy: { grantedAt: "asc" } });
    expect(grants.find((g) => g.userId === outgoing.id)).toMatchObject({ revokeReason: "HANDOVER" });
    expect(grants.find((g) => g.userId === incoming.id)).toMatchObject({ grantReason: "HANDOVER", revokedAt: null });
    // The outgoing Head stays a member; the incoming Head became one.
    expect(await h.prisma.societyMembership.count({ where: { societyId: s.id, userId: { in: [outgoing.id, incoming.id] } } })).toBe(2);
    expect((await h.api.createPost(h.req(outgoing.cookie, "POST", { type: "UPDATE", title: "Old Head", body: "x" }), s.id)).status).toBe(403);
    expect((await h.api.createPost(h.req(incoming.cookie, "POST", { type: "UPDATE", title: "New Head", body: "<p>x</p>" }), s.id)).status).toBe(201);
    const entry = await h.prisma.auditLog.findFirstOrThrow({ where: { action: "societies.head.handed_over", targetId: s.id } });
    expect(entry).toMatchObject({ actorId: outgoing.id, onBehalfOfType: "society", onBehalfOfId: s.id });
    expect(entry.details).toMatchObject({ from: outgoing.id, to: incoming.id });
  });

  it("HD09: a failed handover changes nothing; only a Head can hand over their own seat", async () => {
    const [a, b] = [await person("hof-a"), await person("hof-b")];
    const s = await society([a, b]);
    const before = await activeHeads(s.id);
    expect((await h.api.handOver(h.req(a.cookie, "POST", { email: "never.signed.in@thapar.edu" }), s.id)).status).toBe(400);
    expect((await h.api.handOver(h.req(a.cookie, "POST", { email: a.email }), s.id)).status).toBe(400);
    const outsider = await person("hof-out");
    expect((await h.api.handOver(h.req(outsider.cookie, "POST", { email: outsider.email }), s.id)).status).toBe(403);
    // Platform admins add and remove Heads, but do not hand over someone else's seat.
    expect((await h.api.handOver(h.req(admin.cookie, "POST", { email: outsider.email }), s.id)).status).toBe(403);
    expect(await activeHeads(s.id)).toEqual(before);
    // Handing over to someone who is already a Head simply ends the outgoing Head's access.
    expect((await h.api.handOver(h.req(a.cookie, "POST", { email: b.email }), s.id)).status).toBe(200);
    expect(await activeHeads(s.id)).toEqual([b.id]);
  });

  it("HD10: two simultaneous handovers by both Heads keep the society managed", async () => {
    const [a, b] = [await person("hoc-a"), await person("hoc-b")];
    const s = await society([a, b]);
    const [c, d] = [await person("hoc-c"), await person("hoc-d")];
    const results = await Promise.all([h.api.handOver(h.req(a.cookie, "POST", { email: c.email }), s.id), h.api.handOver(h.req(b.cookie, "POST", { email: d.email }), s.id)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await activeHeads(s.id)).toEqual([c.id, d.id].sort());
  });
});

describe("platform-admin recovery and lifecycle", () => {
  it("HD11: an inactive society may lose its last Head (recovery); it cannot be activated until a Head is added", async () => {
    const a = await person("rec-a");
    const s = await society([a]);
    expect((await h.api.setActive(h.req(admin.cookie, "PUT", { active: false }), s.id)).status).toBe(200);
    expect((await h.api.removeHead(h.req(admin.cookie, "DELETE", undefined, { as: "admin" }), s.id, a.id)).status).toBe(200);
    const detail = (await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(admin), s.slug))!;
    expect(detail.awaitingHead).toBe(true);
    expect((await h.api.setActive(h.req(admin.cookie, "PUT", { active: true }), s.id)).status).toBe(422);
    const replacement = await person("rec-new");
    expect((await h.api.addHead(h.req(admin.cookie, "POST", { email: replacement.email }, { as: "admin" }), s.id)).status).toBe(201);
    expect((await h.api.setActive(h.req(admin.cookie, "PUT", { active: true }), s.id)).status).toBe(200);
    expect(await activeHeads(s.id)).toEqual([replacement.id]);
    // Heads of an inactive society cannot manage Heads (admins recover it); their workspace stays open for deletions.
    expect((await h.api.setActive(h.req(admin.cookie, "PUT", { active: false }), s.id)).status).toBe(200);
    expect((await h.api.addHead(h.req(replacement.cookie, "POST", { email: a.email }), s.id)).status).toBe(403);
    expect((await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(replacement), s.slug))!.can["workspace.open"]).toBe(true);
  });

  it("HD11b: an imported official organisation: read-only, no self-service Head, admin appoints the first Head, access only to that society", async () => {
    const stamp = Date.now();
    const official = await h.prisma.society.create({ data: { name: `Official Org ${stamp}`, slug: `official-org-${stamp}`, isActive: false, sourceKey: `official-org-${stamp}` }, select: { id: true, slug: true } });
    const student = await person("off-student");
    // Read-only until a Head is appointed and the society activated.
    expect((await h.api.follow(h.req(student.cookie, "PUT"), official.id)).status).toBe(422);
    expect((await h.api.requestMembership(h.req(student.cookie, "POST", {}), official.id)).status).not.toBe(201);
    // Claiming affiliation grants nothing: a student cannot appoint a Head, not even themselves.
    expect((await h.api.addHead(h.req(student.cookie, "POST", { email: student.email }), official.id)).status).toBe(403);
    expect((await h.api.addHead(h.req(student.cookie, "POST", { email: student.email }, { as: "admin" }), official.id)).status).toBe(403);
    expect(await activeHeads(official.id)).toEqual([]);
    // The platform admin appoints the first Head (the person has signed in before) and activates it.
    expect((await h.api.addHead(h.req(admin.cookie, "POST", { email: student.email }, { as: "admin" }), official.id)).status).toBe(201);
    expect((await h.api.setActive(h.req(admin.cookie, "PUT", { active: true }), official.id)).status).toBe(200);
    expect((await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(student), official.slug))!.can["workspace.open"]).toBe(true);
    // Head access is per society: nothing in another society.
    const other = await society([await person("off-other-head")]);
    const view = (await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(student), other.slug))!;
    expect(view.can["workspace.open"]).toBe(false);
    expect((await h.api.createPost(h.req(student.cookie, "POST", { type: "UPDATE", title: "Not mine", body: "<p>x</p>" }), other.id)).status).toBe(403);
  });

  it("HD12: getSocietyActor (for Events) requires an active grant on an active society", async () => {
    const a = await person("act-a");
    const s = await society([a]);
    expect(await getSocietyActor(h.prisma, a.id, s.id)).toMatchObject({ id: s.id, slug: s.slug });
    expect(await getSocietyActor(h.prisma, admin.id, s.id)).toBeNull();
    await h.api.setActive(h.req(admin.cookie, "PUT", { active: false }), s.id);
    expect(await getSocietyActor(h.prisma, a.id, s.id)).toBeNull();
  });
});

describe("audit attribution (individual on behalf of the society)", () => {
  it("HD13: workspace actions record the individual, the society, the action and the time; admin actions are not on behalf of the society", async () => {
    const [a, b] = [await person("aud-a"), await person("aud-b")];
    const s = await society([a, b]);
    const since = new Date();
    const id = await postId(await h.api.createPost(h.req(b.cookie, "POST", { type: "UPDATE", title: "Audited", body: "<p>x</p>" }), s.id));
    await h.api.updatePost(h.req(a.cookie, "PATCH", { title: "Audited again", body: "<p>y</p>" }), s.id, id);
    const joiner = await person("aud-j");
    const sent = (await (await h.api.requestMembership(h.req(joiner.cookie, "POST", {}), s.id)).json()) as { request: { id: string } };
    await h.api.decideMembershipRequest(h.req(b.cookie, "POST", { decision: "APPROVE" }), s.id, sent.request.id);
    await h.api.updateMemberDisplay(h.req(a.cookie, "PATCH", { position: "Volunteer" }), s.id, joiner.id);
    await h.api.updateSociety(h.req(b.cookie, "PATCH", { description: "New" }), s.id);
    await h.api.deletePost(h.req(a.cookie, "DELETE"), s.id, id);
    const third = await person("aud-c");
    await h.api.addHead(h.req(admin.cookie, "POST", { email: third.email }, { as: "admin" }), s.id);

    const rows = await h.prisma.auditLog.findMany({ where: { createdAt: { gte: since }, OR: [{ targetId: s.id }, { targetId: id }] }, orderBy: { createdAt: "asc" } });
    const byAction = (action: string) => rows.filter((row) => row.action === action);
    const expectOnBehalf = (action: string, actorId: string) => {
      const row = byAction(action).find((r) => r.actorId === actorId);
      expect(row, action).toBeDefined();
      expect(row).toMatchObject({ actorId, onBehalfOfType: "society", onBehalfOfId: s.id });
      expect(row!.createdAt).toBeInstanceOf(Date);
    };
    expectOnBehalf("societies.post.published", b.id);
    expectOnBehalf("societies.post.updated", a.id);
    expectOnBehalf("societies.membership.approved", b.id);
    expectOnBehalf("societies.member.display_changed", a.id);
    expectOnBehalf("societies.society.updated", b.id);
    expectOnBehalf("societies.post.deleted", a.id);
    // The student's own request is personal; the platform admin acted as the platform.
    expect(byAction("societies.membership.requested")[0]).toMatchObject({ actorId: joiner.id, onBehalfOfType: null, onBehalfOfId: null });
    expect(byAction("societies.head.added").at(-1)).toMatchObject({ actorId: admin.id, onBehalfOfType: null });
  });

  it("HD14: the audit log stays append-only with the new columns", async () => {
    const row = await h.prisma.auditLog.findFirstOrThrow({ where: { onBehalfOfType: "society" } });
    await expect(h.prisma.auditLog.update({ where: { id: row.id }, data: { onBehalfOfId: null } })).rejects.toThrow();
    await expect(h.prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});

describe("faculty associations (admin-visible only until reviewed)", () => {
  it("HD15: unverified associations are hidden from students and Heads; only admins review them", async () => {
    const a = await person("fac-a");
    const s = await society([a]);
    const association = await h.prisma.societyFacultyAssociation.create({
      data: { societyId: s.id, name: "Dr. Example Faculty", department: "Assistant Professor, CSED", email: "faculty.example@thapar.edu", sourceRole: "President", sourceUrl: "https://studentsocieties.thapar.edu/" },
    });
    const student = await person("fac-s");
    const facultyFor = async (u: TestUser) => (await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(u), s.slug))!.faculty;
    expect(await facultyFor(student)).toEqual([]);
    expect(await facultyFor(a)).toEqual([]);
    expect((await facultyFor(admin)).map((f) => [f.name, f.verified])).toEqual([["Dr. Example Faculty", false]]);
    expect((await h.api.reviewFaculty(h.req(a.cookie, "PATCH", { verified: true }), s.id, association.id)).status).toBe(403);
    expect((await h.api.reviewFaculty(h.req(student.cookie, "PATCH", { verified: true }), s.id, association.id)).status).toBe(403);
    expect((await h.api.reviewFaculty(h.req(admin.cookie, "PATCH", { verified: true }), s.id, association.id)).status).toBe(200);
    expect((await facultyFor(student)).map((f) => f.name)).toEqual(["Dr. Example Faculty"]);
    expect(await h.prisma.auditLog.count({ where: { action: "societies.faculty.reviewed", targetId: s.id } })).toBe(1);
  });
});

describe("society-scoped Head access (owner review 2026-10-25)", () => {
  it("HD16: one account heads two societies with one login; revoking one leaves the other; the switcher lists only active grants", async () => {
    const [both, otherA, otherB] = [await person("multi"), await person("multi-a"), await person("multi-b")];
    const sa = await society([both, otherA]);
    const sb = await society([both, otherB]);
    const managed = async (u: TestUser) => (await listManagedSocieties(h.prisma, u.id)).map((m) => m.id).sort();
    expect(await managed(both)).toEqual([sa.id, sb.id].sort());
    expect(await managed(otherA)).toEqual([sa.id]);
    expect(await managed(admin)).toEqual([]); // the platform-admin role adds no workspace entries
    // The same session manages both societies.
    expect((await h.api.createPost(h.req(both.cookie, "POST", { type: "UPDATE", title: "In A", body: "<p>a</p>" }), sa.id)).status).toBe(201);
    expect((await h.api.createPost(h.req(both.cookie, "POST", { type: "UPDATE", title: "In B", body: "<p>b</p>" }), sb.id)).status).toBe(201);
    // Revoking the Head grant in A does not touch B.
    expect((await h.api.removeHead(h.req(otherA.cookie, "DELETE"), sa.id, both.id)).status).toBe(200);
    expect((await h.api.createPost(h.req(both.cookie, "POST", { type: "UPDATE", title: "A again", body: "<p>a</p>" }), sa.id)).status).toBe(403);
    expect((await h.api.createPost(h.req(both.cookie, "POST", { type: "UPDATE", title: "B again", body: "<p>b</p>" }), sb.id)).status).toBe(201);
    expect(await managed(both)).toEqual([sb.id]);
    expect(await getSocietyActor(h.prisma, both.id, sa.id)).toBeNull();
    expect(await getSocietyActor(h.prisma, both.id, sb.id)).toMatchObject({ id: sb.id });
  });

  it("HD17: a Head of A cannot reach B's posts, requests, members or faculty records through A's URLs (swapped ids)", async () => {
    const [a, b] = [await person("swap-a"), await person("swap-b")];
    const sa = await society([a]);
    const sb = await society([b]);
    const bPost = await postId(await h.api.createPost(h.req(b.cookie, "POST", { type: "UPDATE", title: "B only", body: "<p>x</p>" }), sb.id));
    const joiner = await person("swap-j");
    const bRequest = ((await (await h.api.requestMembership(h.req(joiner.cookie, "POST", {}), sb.id)).json()) as { request: { id: string } }).request.id;
    const bMember = await person("swap-m");
    await h.prisma.societyMembership.create({ data: { societyId: sb.id, userId: bMember.id } });
    const bFaculty = await h.prisma.societyFacultyAssociation.create({ data: { societyId: sb.id, name: "Dr. Swap Test", sourceRole: "President" } });
    // B's ids under A's society id: nothing is found in A, so nothing in B changes.
    expect((await h.api.updatePost(h.req(a.cookie, "PATCH", { title: "Hijack", body: "x" }), sa.id, bPost)).status).toBe(404);
    expect((await h.api.deletePost(h.req(a.cookie, "DELETE"), sa.id, bPost)).status).toBe(404);
    expect((await h.api.decideMembershipRequest(h.req(a.cookie, "POST", { decision: "APPROVE" }), sa.id, bRequest)).status).toBe(404);
    expect((await h.api.updateMemberDisplay(h.req(a.cookie, "PATCH", { position: "Hijacked" }), sa.id, bMember.id)).status).toBe(404);
    expect((await h.api.removeMember(h.req(a.cookie, "DELETE"), sa.id, bMember.id)).status).toBe(404);
    expect((await h.api.removeHead(h.req(a.cookie, "DELETE"), sa.id, b.id)).status).toBe(404);
    // B's own ids under B's society id: refused (A is not a Head of B).
    expect((await h.api.decideMembershipRequest(h.req(a.cookie, "POST", { decision: "APPROVE" }), sb.id, bRequest)).status).toBe(403);
    expect((await h.api.updateMemberDisplay(h.req(a.cookie, "PATCH", { position: "Hijacked" }), sb.id, bMember.id)).status).toBe(403);
    expect((await h.api.reviewFaculty(h.req(a.cookie, "PATCH", { verified: true }), sb.id, bFaculty.id)).status).toBe(403);
    expect((await h.api.reviewFaculty(h.req(admin.cookie, "PATCH", { verified: true }), sa.id, bFaculty.id)).status).toBe(404);
    expect(await h.prisma.societyPost.findUniqueOrThrow({ where: { id: bPost } })).toMatchObject({ title: "B only" });
    expect((await h.prisma.societyMembershipRequest.findUniqueOrThrow({ where: { id: bRequest } })).status).toBe("PENDING");
    expect((await h.prisma.societyMembership.findUniqueOrThrow({ where: { societyId_userId: { societyId: sb.id, userId: bMember.id } } })).position).toBeNull();
  });

  it("HD18: platform-admin and Head powers stay separate, also for an account that has both", async () => {
    const [head, other] = [await person("cap-h"), await person("cap-o")];
    const s = await society([head, other]);
    const incoming = await person("cap-in");
    // An admin without a Head grant: no society powers in the default (society) capacity.
    expect((await h.api.addHead(h.req(admin.cookie, "POST", { email: incoming.email }), s.id)).status).toBe(403);
    expect((await h.api.updateSociety(h.req(admin.cookie, "PATCH", { description: "x" }), s.id)).status).toBe(403);
    expect((await h.api.createPost(h.req(admin.cookie, "POST", { type: "UPDATE", title: "Admin post", body: "<p>x</p>" }), s.id)).status).toBe(403);
    expect((await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(admin), s.slug))!.can["workspace.open"]).toBe(false);
    // Asking for the admin capacity on a society-only endpoint is refused, even for an admin.
    expect((await h.api.createPost(h.req(admin.cookie, "POST", { type: "UPDATE", title: "Admin post", body: "<p>x</p>" }, { as: "admin" }), s.id)).status).toBe(403);
    // A Head who is not a platform admin cannot claim the admin capacity.
    expect((await h.api.addHead(h.req(head.cookie, "POST", { email: incoming.email }, { as: "admin" }), s.id)).status).toBe(403);
    expect((await h.api.setActive(h.req(head.cookie, "PUT", { active: false }), s.id)).status).toBe(403);

    // The admin also becomes a Head of this society: both capacities exist, and each is audited as itself.
    expect((await h.api.addHead(h.req(head.cookie, "POST", { email: ADMIN }), s.id)).status).toBe(201);
    const detail = (await getSocietyBySlug(h.prisma, h.identity, await h.actorOf(admin), s.slug))!;
    expect(detail.can["workspace.open"]).toBe(true);
    expect(detail.can["society.setActive"]).toBe(false); // not a Head power
    expect(detail.adminCan["society.setActive"]).toBe(true);
    expect(detail.adminCan["posts.create"]).toBe(false); // not a platform-admin power
    const since = new Date();
    expect((await h.api.createPost(h.req(admin.cookie, "POST", { type: "UPDATE", title: "As Head", body: "<p>x</p>" }), s.id)).status).toBe(201);
    expect((await h.api.addHead(h.req(admin.cookie, "POST", { email: incoming.email }, { as: "admin" }), s.id)).status).toBe(201);
    const rows = await h.prisma.auditLog.findMany({ where: { createdAt: { gte: since }, actorId: admin.id }, orderBy: { createdAt: "asc" } });
    expect(rows.find((r) => r.action === "societies.post.published")).toMatchObject({ onBehalfOfType: "society", onBehalfOfId: s.id });
    expect(rows.find((r) => r.action === "societies.head.added")).toMatchObject({ onBehalfOfType: null, onBehalfOfId: null });
    expect(await h.prisma.societyHeadGrant.findFirstOrThrow({ where: { societyId: s.id, userId: incoming.id, revokedAt: null } })).toMatchObject({ grantReason: "ADMIN_RECOVERY" });
    // As a platform admin (not as a Head), the account may remove its own Head grant; as a Head it may not.
    expect((await h.api.removeHead(h.req(admin.cookie, "DELETE"), s.id, admin.id)).status).toBe(422);
    expect((await h.api.removeHead(h.req(admin.cookie, "DELETE", undefined, { as: "admin" }), s.id, admin.id)).status).toBe(200);
  });
});

