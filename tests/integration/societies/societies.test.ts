// Society Hub (Slice 2a: FR-SOC-1..4, OI-10, OI-11, OI-38; revised model ADR-0013 / OI-56, 2026-10-25)
// against PostgreSQL 17.9 with the committed migrations, through the real HTTP handlers. Users sign
// in through the E2E test sign-in (Better Auth's real ID-token path and identity policy).
import { ownedAssetFor } from "@/modules/assets/service";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { clientAddress, createDatabaseRateLimiter, type RateLimiter } from "@/modules/identity/api-rate-limit";
import type { IdentityAuth } from "@/modules/identity/auth";
import { type IdentityConfig, parseIdentityConfig } from "@/modules/identity/config";
import { findUserByEmail, getUserSummaries } from "@/modules/identity/directory";
import { completeProfile, getProfileOptions } from "@/modules/identity/profile";
import { buildIdentityAuth } from "@/modules/identity/runtime";
import { readCurrentSession } from "@/modules/identity/sessions";
import { installTestGoogleKeys } from "@/modules/identity/test-google";
import { testSignIn } from "@/modules/identity/test-sign-in";
import { type SocietiesHandlers, societiesHandlers, type SocietiesHttpDeps } from "@/modules/societies/http";
import { getPost, getSocietyBySlug, listActiveStories, listFeed, listSocieties, listSocietyPosts } from "@/modules/societies/queries";
import { createPost, type IdentityPort, STORY_LIFETIME_MS } from "@/modules/societies/service";
import { createDbClient, type PrismaClient } from "@/shared/db/client";

import { applyMigrations } from "../../support/migrations";

const POSTGRES_IMAGE = "postgres:17.9-alpine@sha256:c7526c0f6c3f30260a563d7bcf8ad778effac59a44f8ffa86678c35418338609";
const BASE = "http://127.0.0.1:3100";
const ADMIN = "soc.admin@thapar.edu";

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let config: IdentityConfig;
let auth: IdentityAuth;
let identity: IdentityPort;
let deps: SocietiesHttpDeps;
let api: SocietiesHandlers;

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  await applyMigrations(container.getConnectionUri());
  prisma = createDbClient(container.getConnectionUri());
  installTestGoogleKeys();
  config = parseIdentityConfig({
    BETTER_AUTH_URL: BASE,
    BETTER_AUTH_SECRET: "s".repeat(40),
    AUTH_ALLOWED_EMAIL_DOMAIN: "thapar.edu",
    GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    E2E_TEST_AUTH: "1",
    THAPAR_E2E_BUILD: "1",
    ADMIN_EMAILS: ADMIN,
  });
  auth = buildIdentityAuth(config, prisma);
  identity = {
    userByEmail: (email) => findUserByEmail(prisma, email),
    userSummaries: (ids) => getUserSummaries(prisma, ids),
    activeBranches: async () => (await getProfileOptions(prisma)).branches,
  };
  deps = {
    prisma,
    baseURL: BASE,
    identity,
    readSession: (headers) => readCurrentSession(auth, prisma, headers),
    limiter: createDatabaseRateLimiter(prisma),
    clientAddress,
    ownedAsset: (userId, assetId, purpose) => ownedAssetFor(prisma, userId, assetId, purpose),
  };
  // The suite creates many societies and posts per minute. These tests use the real PostgreSQL
  // limiter with 100 times the limits; H02 and H03 test the real limits and fail-closed behaviour.
  const real = createDatabaseRateLimiter(prisma);
  api = societiesHandlers({ ...deps, limiter: (key, rule, now) => real(key, { ...rule, max: rule.max * 100 }, now) });
  for (const level of ["error", "warn"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma?.$disconnect();
  await container?.stop();
});

// ---------- helpers ----------

interface TestUser {
  email: string;
  id: string;
  cookie: string;
}

let ip = 0;
let roll = 0;
/** Signs in a fictitious user and completes their profile (FR-AUTH-2). */
async function user(email: string, options: { completeProfile?: boolean; year?: number } = {}): Promise<TestUser> {
  ip += 1;
  const response = await testSignIn(
    auth,
    config,
    new Request(`${BASE}/api/test-auth/sign-in`, {
      method: "POST",
      headers: { origin: BASE, "content-type": "application/json", "x-forwarded-for": `198.51.100.${ip % 250}` },
      body: JSON.stringify({ email, name: email.split("@")[0]!.replace(/\./g, " ") }),
    }),
  );
  const cookie = response.headers.getSetCookie().find((c) => /^better-auth\.session_token=[^;]/.test(c))?.split(";")[0];
  expect(cookie, email).toBeDefined();
  const row = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  if (options.completeProfile !== false) {
    roll += 1;
    const result = await completeProfile(prisma, row.id, { name: email.split("@")[0], rollNumber: `SOC${String(roll).padStart(6, "0")}`, branchCode: "COE", year: options.year ?? 2, tags: ["python", "rust", "robotics"] });
    expect(result.ok, email).toBe(true);
  }
  return { email, id: row.id, cookie: cookie! };
}

let requestIp = 0;
function req(cookie: string | undefined, method: string, body?: unknown, extra: { origin?: string | null; ip?: string; as?: "admin" } = {}) {
  requestIp += 1;
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": extra.ip ?? `203.0.113.${requestIp % 250}` });
  if (cookie) headers.set("cookie", cookie);
  if (extra.origin !== null) headers.set("origin", extra.origin ?? BASE);
  return new Request(`${BASE}/api/societies${extra.as === "admin" ? "?as=admin" : ""}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const json = async (response: Response) => (await response.json()) as Record<string, unknown> & { error?: { code: string; message: string; fields?: Record<string, string> } };
const actorOf = async (u: TestUser) => {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { role: true } });
  return { userId: u.id, globalRole: row.role };
};

let societyCounter = 0;
/** Creates a society through the API as the admin, with `head` (and optionally more people) as its Heads. */
async function society(admin: TestUser, head: TestUser, overrides: Record<string, unknown> = {}, moreHeads: TestUser[] = []) {
  societyCounter += 1;
  const response = await api.createSociety(
    req(admin.cookie, "POST", {
      name: `Test Society ${societyCounter}`,
      description: "A society for tests.",
      categorySlug: "technical",
      headEmails: [head.email, ...moreHeads.map((u) => u.email)],
      ...overrides,
    }),
  );
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
  return ((await response.json()) as { society: { id: string; slug: string } }).society;
}

const auditActions = async (societyId: string) => (await prisma.auditLog.findMany({ where: { targetId: societyId }, orderBy: { createdAt: "asc" } })).map((row) => row.action);

// ---------- tests ----------

let admin: TestUser;
let head: TestUser;
let student: TestUser;

describe("society creation (FR-SOC-1, OI-10)", () => {
  it("S01: the migration seeds the categories", async () => {
    expect(await prisma.societyCategory.count({ where: { active: true } })).toBeGreaterThanOrEqual(8);
  });

  it("S02: an admin creates a society and appoints its first Head (audited; Head access is an explicit grant)", async () => {
    admin = await user(ADMIN);
    head = await user("soc.head@thapar.edu");
    student = await user("soc.student@thapar.edu");
    expect((await actorOf(admin)).globalRole).toBe("ADMIN");
    const created = await society(admin, head, { name: "Computer Society TIET", links: { website: "https://example.org" } });
    expect(created.slug).toBe("computer-society-tiet");
    const membership = await prisma.societyMembership.findUniqueOrThrow({ where: { societyId_userId: { societyId: created.id, userId: head.id } } });
    expect(membership.group).toBe("CORE");
    expect(await prisma.societyHeadGrant.count({ where: { societyId: created.id, userId: head.id, revokedAt: null, grantReason: "CREATED_WITH_SOCIETY" } })).toBe(1);
    expect((await prisma.society.findUniqueOrThrow({ where: { id: created.id } })).verifiedAt).not.toBeNull();
    expect(await auditActions(created.id)).toEqual(["societies.society.created", "societies.head.added"]);
  });

  it("S03: students cannot create societies; validation and duplicate names are reported per field", async () => {
    const asStudent = await api.createSociety(req(student.cookie, "POST", { name: "Rogue Society", description: "x", categorySlug: "technical", headEmails: [student.email] }));
    expect(asStudent.status).toBe(403);
    const duplicate = await api.createSociety(req(admin.cookie, "POST", { name: "computer SOCIETY tiet", description: "x", categorySlug: "technical", headEmails: [head.email] }));
    expect(duplicate.status).toBe(400);
    expect((await json(duplicate)).error?.fields).toHaveProperty("name");
    // An incoming Head must have signed in at least once (owner requirement); nothing is created otherwise.
    const unknownHead = await api.createSociety(req(admin.cookie, "POST", { name: "Ghost Society", description: "x", headEmails: [head.email, "nobody@thapar.edu"] }));
    expect((await json(unknownHead)).error?.fields?.headEmails).toContain("nobody@thapar.edu");
    expect(await prisma.society.count({ where: { name: "Ghost Society" } })).toBe(0);
    const noHead = await api.createSociety(req(admin.cookie, "POST", { name: "Headless Society", description: "x", headEmails: [] }));
    expect((await json(noHead)).error?.fields).toHaveProperty("headEmails");
    const badCategory = await api.createSociety(req(admin.cookie, "POST", { name: "Odd Society", description: "x", categorySlug: "nope", headEmails: [head.email] }));
    expect((await json(badCategory)).error?.fields).toHaveProperty("categorySlug");
    const massAssign = await api.createSociety(req(admin.cookie, "POST", { name: "Sneaky Society", description: "x", headEmails: [head.email], isActive: false }));
    expect(massAssign.status).toBe(400);
  });

  it("S04: category and description are optional; names up to 150 characters; several initial Heads", async () => {
    const second = await user("soc.cohead.create@thapar.edu");
    const longName = "International Association of Students in Economics and Commercial Sciences (AIESEC) - Patiala Chapter";
    const created = await society(admin, head, { name: longName, categorySlug: undefined, description: undefined, shortName: "AIESEC" }, [second]);
    const row = await prisma.society.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ name: longName, categorySlug: null, description: null, shortName: "AIESEC" });
    expect(await prisma.societyHeadGrant.count({ where: { societyId: created.id, revokedAt: null } })).toBe(2);
    const detail = (await getSocietyBySlug(prisma, identity, await actorOf(student), created.slug))!;
    expect(detail.category).toBeNull();
    expect(detail.heads.map((h) => h.id).sort()).toEqual([head.id, second.id].sort());
  });
});

describe("following (owner decision 2026-10-24)", () => {
  it("F01: any student follows and unfollows without approval; repeating is harmless", async () => {
    const s = await society(admin, head);
    for (let i = 0; i < 2; i += 1) expect((await api.follow(req(student.cookie, "PUT"), s.id)).status).toBe(200);
    expect(await prisma.societyFollow.count({ where: { societyId: s.id } })).toBe(1);
    for (let i = 0; i < 2; i += 1) expect((await api.unfollow(req(student.cookie, "DELETE"), s.id)).status).toBe(200);
    expect(await prisma.societyFollow.count({ where: { societyId: s.id } })).toBe(0);
  });

  it("F02: following grants no membership, no member-only content and no management rights", async () => {
    const s = await society(admin, head);
    const follower = await user("soc.follower@thapar.edu");
    await api.follow(req(follower.cookie, "PUT"), s.id);
    expect(await prisma.societyMembership.count({ where: { societyId: s.id, userId: follower.id } })).toBe(0);
    const membersOnly = await createPost(prisma, identity, await actorOf(head), s.id, { type: "UPDATE", title: "Members meeting", body: "<p>Room 101</p>", visibility: "MEMBERS" });
    expect(membersOnly.ok).toBe(true);
    const detail = (await getSocietyBySlug(prisma, identity, await actorOf(follower), s.slug))!;
    expect(detail.following).toBe(true);
    expect(detail.isMember).toBe(false);
    expect(detail.isHead).toBe(false);
    expect(detail.can["posts.viewMembersOnly"]).toBe(false);
    expect((await listSocietyPosts(prisma, identity, await actorOf(follower), detail)).posts).toEqual([]);
    expect(await getPost(prisma, identity, await actorOf(follower), detail, membersOnly.ok ? membersOnly.value.id : "")).toBeNull();
    expect((await listFeed(prisma, identity, await actorOf(follower))).posts.map((p) => p.id)).not.toContain(membersOnly.ok && membersOnly.value.id);
    const post = await api.createPost(req(follower.cookie, "POST", { type: "UPDATE", title: "Hi", body: "x" }), s.id);
    expect(post.status).toBe(403);
    const request = await prisma.societyMembershipRequest.create({ data: { societyId: s.id, userId: student.id } });
    expect((await api.decideMembershipRequest(req(follower.cookie, "POST", { decision: "APPROVE" }), s.id, request.id)).status).toBe(403);
  });

  it("F03: followers see public posts in their Home feed; non-followers do not", async () => {
    const s = await society(admin, head);
    const follower = await user("soc.feed@thapar.edu");
    const stranger = await user("soc.stranger@thapar.edu");
    await api.follow(req(follower.cookie, "PUT"), s.id);
    const created = await createPost(prisma, identity, await actorOf(head), s.id, { type: "UPDATE", title: "Hackathon this weekend", body: "<p>Join!</p>" });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.value.id : "";
    expect((await listFeed(prisma, identity, await actorOf(follower))).posts.map((p) => p.id)).toContain(id);
    expect((await listFeed(prisma, identity, await actorOf(stranger))).posts.map((p) => p.id)).not.toContain(id);
  });
});

describe("membership (OI-10 as decided 2026-10-24)", () => {
  it("M01: request, a Head approves, student becomes a general member; every step is audited", async () => {
    const s = await society(admin, head);
    const joiner = await user("soc.joiner@thapar.edu");
    const sent = await api.requestMembership(req(joiner.cookie, "POST", { message: "I love <b>coding</b>" }), s.id);
    expect(sent.status).toBe(201);
    const requestId = ((await sent.json()) as { request: { id: string } }).request.id;
    expect((await api.requestMembership(req(joiner.cookie, "POST", {}), s.id)).status).toBe(409);
    expect((await api.decideMembershipRequest(req(head.cookie, "POST", { decision: "APPROVE" }), s.id, requestId)).status).toBe(200);
    expect((await prisma.societyMembership.findUniqueOrThrow({ where: { societyId_userId: { societyId: s.id, userId: joiner.id } } })).group).toBe("GENERAL");
    expect(await prisma.societyHeadGrant.count({ where: { societyId: s.id, userId: joiner.id } })).toBe(0);
    // Decided once: a second decision is a state error, not a second membership.
    expect((await api.decideMembershipRequest(req(head.cookie, "POST", { decision: "REJECT" }), s.id, requestId)).status).toBe(422);
    expect((await api.requestMembership(req(joiner.cookie, "POST", {}), s.id)).status).toBe(409);
    expect(await auditActions(s.id)).toEqual(expect.arrayContaining(["societies.membership.requested", "societies.membership.approved"]));
  });

  it("M02: reject and withdraw leave no membership; only the requester can withdraw", async () => {
    const s = await society(admin, head);
    const a = await user("soc.reject@thapar.edu");
    const b = await user("soc.withdraw@thapar.edu");
    const sentA = (await (await api.requestMembership(req(a.cookie, "POST", {}), s.id)).json()) as { request: { id: string } };
    expect((await api.decideMembershipRequest(req(head.cookie, "POST", { decision: "REJECT" }), s.id, sentA.request.id)).status).toBe(200);
    await api.requestMembership(req(b.cookie, "POST", {}), s.id);
    expect((await api.cancelMembershipRequest(req(student.cookie, "DELETE"), s.id)).status).toBe(404);
    expect((await api.cancelMembershipRequest(req(b.cookie, "DELETE"), s.id)).status).toBe(200);
    expect(await prisma.societyMembership.count({ where: { societyId: s.id, userId: { in: [a.id, b.id] } } })).toBe(0);
    expect(await auditActions(s.id)).toEqual(expect.arrayContaining(["societies.membership.rejected", "societies.membership.cancelled"]));
  });

  it("M03: concurrent duplicate requests create exactly one pending request", async () => {
    const s = await society(admin, head);
    const racer = await user("soc.racer@thapar.edu");
    const results = await Promise.all(Array.from({ length: 8 }, () => api.requestMembership(req(racer.cookie, "POST", {}), s.id)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    expect(await prisma.societyMembershipRequest.count({ where: { societyId: s.id, userId: racer.id, status: "PENDING" } })).toBe(1);
  });

  it("M04: concurrent decisions on one request: exactly one wins", async () => {
    const s = await society(admin, head);
    const target = await user("soc.contested@thapar.edu");
    const sent = (await (await api.requestMembership(req(target.cookie, "POST", {}), s.id)).json()) as { request: { id: string } };
    const results = await Promise.all(["APPROVE", "REJECT", "APPROVE", "REJECT"].map((decision) => api.decideMembershipRequest(req(head.cookie, "POST", { decision }), s.id, sent.request.id)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 422, 422, 422]);
  });

  it("M05: display groups and titles are organisational only: an 'Editor' or core member cannot manage anything", async () => {
    const s = await society(admin, head);
    const titled = await user("soc.titled@thapar.edu");
    await prisma.societyMembership.create({ data: { societyId: s.id, userId: titled.id } });
    expect((await api.updateMemberDisplay(req(head.cookie, "PATCH", { group: "CORE", position: "Editor" }), s.id, titled.id)).status).toBe(200);
    expect(await prisma.societyMembership.findUniqueOrThrow({ where: { societyId_userId: { societyId: s.id, userId: titled.id } } })).toMatchObject({ group: "CORE", position: "Editor" });
    // The title grants nothing: no posting, no decisions, no display edits, no workspace.
    expect((await api.createPost(req(titled.cookie, "POST", { type: "UPDATE", title: "Hello", body: "x" }), s.id)).status).toBe(403);
    const pending = await prisma.societyMembershipRequest.create({ data: { societyId: s.id, userId: student.id } });
    expect((await api.decideMembershipRequest(req(titled.cookie, "POST", { decision: "APPROVE" }), s.id, pending.id)).status).toBe(403);
    expect((await api.updateMemberDisplay(req(titled.cookie, "PATCH", { position: "President" }), s.id, titled.id)).status).toBe(403);
    expect((await getSocietyBySlug(prisma, identity, await actorOf(titled), s.slug))!.can["workspace.open"]).toBe(false);
    // Roles cannot be smuggled in through the display endpoint.
    expect((await api.updateMemberDisplay(req(head.cookie, "PATCH", { role: "HEAD" }), s.id, titled.id)).status).toBe(400);
    expect((await api.updateMemberDisplay(req(head.cookie, "PATCH", { group: "HEAD" }), s.id, titled.id)).status).toBe(400);
    expect(await prisma.societyHeadGrant.count({ where: { societyId: s.id, userId: titled.id } })).toBe(0);
    // Clearing a title.
    expect((await api.updateMemberDisplay(req(head.cookie, "PATCH", { position: null }), s.id, titled.id)).status).toBe(200);
    expect((await prisma.societyMembership.findUniqueOrThrow({ where: { societyId_userId: { societyId: s.id, userId: titled.id } } })).position).toBeNull();
    expect(await auditActions(s.id)).toContain("societies.member.display_changed");
  });

  it("M06: members leave; Heads cannot leave and their membership cannot be removed while they are Heads; Heads remove members", async () => {
    const s = await society(admin, head);
    const leaver = await user("soc.leaver@thapar.edu");
    const removed = await user("soc.removed@thapar.edu");
    await prisma.societyMembership.createMany({ data: [leaver, removed].map((u) => ({ societyId: s.id, userId: u.id })) });
    expect((await api.removeMember(req(leaver.cookie, "DELETE"), s.id, leaver.id)).status).toBe(200);
    expect((await api.removeMember(req(head.cookie, "DELETE"), s.id, head.id)).status).toBe(422);
    expect((await api.removeMember(req(leaver.cookie, "DELETE"), s.id, removed.id)).status).toBe(403);
    expect((await api.removeMember(req(head.cookie, "DELETE"), s.id, removed.id)).status).toBe(200);
    expect(await prisma.user.count({ where: { id: removed.id } })).toBe(1);
    expect(await auditActions(s.id)).toEqual(expect.arrayContaining(["societies.member.left", "societies.member.removed"]));
  });
});

describe("posts (FR-SOC-3, OI-11)", () => {
  it("P01: stored rich text is sanitised (XSS) and stories are plain text", async () => {
    const s = await society(admin, head);
    const response = await api.createPost(req(head.cookie, "POST", { type: "UPDATE", title: "Safe", body: '<p onclick="x">Hi<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">l</a></p>' }), s.id);
    expect(response.status).toBe(201);
    const id = ((await response.json()) as { post: { id: string } }).post.id;
    const stored = await prisma.societyPost.findUniqueOrThrow({ where: { id } });
    expect(stored.body).not.toMatch(/script|onerror|onclick|javascript:|<img/i);
    expect(stored.body).toContain("Hi");
    const story = await api.createPost(req(head.cookie, "POST", { type: "STORY", body: "<b>Tonight</b> 7 pm" }), s.id);
    const storyRow = await prisma.societyPost.findUniqueOrThrow({ where: { id: ((await story.json()) as { post: { id: string } }).post.id } });
    expect(storyRow.body).toBe("<b>Tonight</b> 7 pm"); // kept as text; React escapes it when rendering
    expect(storyRow.visibility).toBe("PUBLIC");
  });

  it("P02: stories are invisible 24 hours after posting (fake clock)", async () => {
    const s = await society(admin, head);
    const t0 = new Date("2026-11-01T10:00:00Z");
    const created = await createPost(prisma, identity, await actorOf(head), s.id, { type: "STORY", body: "Free pizza at the stall" }, t0);
    expect(created.ok).toBe(true);
    const at = (ms: number) => new Date(t0.getTime() + ms);
    const studentActor = await actorOf(student);
    const studentView = (await getSocietyBySlug(prisma, identity, studentActor, s.slug))!;
    const ids = async (now: Date) => (await listActiveStories(prisma, identity, studentActor, { society: studentView }, now)).map((p) => p.id);
    expect(await ids(at(STORY_LIFETIME_MS - 1000))).toHaveLength(1);
    expect(await ids(at(STORY_LIFETIME_MS))).toHaveLength(0);
    const detail = (await getSocietyBySlug(prisma, identity, studentActor, s.slug))!;
    expect(await getPost(prisma, identity, studentActor, detail, created.ok ? created.value.id : "", at(STORY_LIFETIME_MS + 1))).toBeNull();
  });

  it("P03: story, recruitment and visibility rules are enforced", async () => {
    const s = await society(admin, head);
    const cases: [Record<string, unknown>, string][] = [
      [{ type: "STORY", body: "x".repeat(281) }, "body"],
      [{ type: "STORY", body: "Hi", visibility: "MEMBERS" }, "visibility"],
      [{ type: "STORY", body: "Hi", title: "No titles" }, "title"],
      [{ type: "UPDATE", body: "<p>No title</p>" }, "title"],
      [{ type: "UPDATE", title: "Empty", body: "<script>only script</script>" }, "body"],
      [{ type: "RECRUITMENT", title: "No roles", body: "x" }, "rolesSought"],
      [{ type: "RECRUITMENT", title: "Bad branch", body: "x", recruitment: { rolesSought: ["Dev"], eligibleBranchCodes: ["NOPE"] } }, "eligibleBranchCodes"],
      [{ type: "RECRUITMENT", title: "Past deadline", body: "x", recruitment: { rolesSought: ["Dev"], deadline: "2020-01-01T00:00:00+05:30" } }, "deadline"],
      [{ type: "RECRUITMENT", title: "Insecure link", body: "x", recruitment: { rolesSought: ["Dev"], applicationUrl: "http://forms.example" } }, "applicationUrl"],
      [{ type: "UPDATE", title: "Stray fields", body: "x", recruitment: { rolesSought: ["Dev"] } }, "recruitment"],
    ];
    for (const [body, field] of cases) {
      const response = await api.createPost(req(head.cookie, "POST", body), s.id);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect((await json(response)).error?.fields, JSON.stringify(body)).toHaveProperty(field);
    }
    const ok = await api.createPost(
      req(head.cookie, "POST", {
        type: "RECRUITMENT",
        title: "Design team recruitment",
        body: "<p>Apply now</p>",
        recruitment: { rolesSought: ["UI Designer"], eligibleYears: [1, 2], eligibleBranchCodes: ["COE"], deadline: "2099-01-01T18:00:00+05:30", applicationUrl: "https://forms.example/apply" },
      }),
      s.id,
    );
    expect(ok.status).toBe(201);
  });

  it("P04: drafts are visible only to publishers until published", async () => {
    const s = await society(admin, head);
    const member = await user("soc.draftreader@thapar.edu");
    await prisma.societyMembership.create({ data: { societyId: s.id, userId: member.id } });
    const draft = await api.createPost(req(head.cookie, "POST", { type: "UPDATE", title: "Work in progress", body: "<p>Draft</p>", publish: false }), s.id);
    const id = ((await draft.json()) as { post: { id: string } }).post.id;
    const memberActor = await actorOf(member);
    const memberView = (await getSocietyBySlug(prisma, identity, memberActor, s.slug))!;
    expect(await getPost(prisma, identity, memberActor, memberView, id)).toBeNull();
    expect((await api.updatePost(req(member.cookie, "PATCH", { title: "Hijack", body: "x" }), s.id, id)).status).toBe(404);
    const headView = (await getSocietyBySlug(prisma, identity, await actorOf(head), s.slug))!;
    expect((await getPost(prisma, identity, await actorOf(head), headView, id))?.publishedAt).toBeNull();
    expect((await api.updatePost(req(head.cookie, "PATCH", { title: "Now public", body: "<p>Done</p>", publish: true }), s.id, id)).status).toBe(200);
    expect((await getPost(prisma, identity, memberActor, memberView, id))?.title).toBe("Now public");
  });

  it("P05: cross-society access is refused (FR-SOC-3 per-row permissions)", async () => {
    const a = await society(admin, head);
    const otherHead = await user("soc.otherhead@thapar.edu");
    const b = await society(admin, otherHead);
    const postInB = await api.createPost(req(otherHead.cookie, "POST", { type: "UPDATE", title: "B only", body: "<p>x</p>" }), b.id);
    const bPostId = ((await postInB.json()) as { post: { id: string } }).post.id;
    // The Head of A has no rights in B.
    expect((await api.createPost(req(head.cookie, "POST", { type: "UPDATE", title: "Intrusion", body: "x" }), b.id)).status).toBe(403);
    expect((await api.updatePost(req(head.cookie, "PATCH", { title: "Intrusion", body: "x" }), b.id, bPostId)).status).toBe(403);
    expect((await api.deletePost(req(head.cookie, "DELETE"), b.id, bPostId)).status).toBe(403);
    expect((await api.updateSociety(req(head.cookie, "PATCH", { description: "Taken over", categorySlug: "technical" }), b.id)).status).toBe(403);
    // B's post addressed through A's URL does not exist.
    expect((await api.updatePost(req(head.cookie, "PATCH", { title: "Sneaky", body: "x" }), a.id, bPostId)).status).toBe(404);
    expect((await api.deletePost(req(head.cookie, "DELETE"), a.id, bPostId)).status).toBe(404);
    expect(await prisma.societyPost.findUniqueOrThrow({ where: { id: bPostId } })).toMatchObject({ title: "B only" });
  });

  it("P06: deleting a post is audited", async () => {
    const s = await society(admin, head);
    const created = await api.createPost(req(head.cookie, "POST", { type: "UPDATE", title: "Short lived", body: "<p>x</p>" }), s.id);
    const id = ((await created.json()) as { post: { id: string } }).post.id;
    expect((await api.deletePost(req(head.cookie, "DELETE"), s.id, id)).status).toBe(200);
    expect(await prisma.societyPost.count({ where: { id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "societies.post.deleted", targetId: id } })).toBe(1);
  });
});

describe("directory and deactivation (FR-SOC-4, OI-38)", () => {
  it("D01: search and category filter", async () => {
    const h = await user("soc.dirhead@thapar.edu");
    await society(admin, h, { name: "Robotics Guild", description: "Robots and drones.", categorySlug: "technical" });
    await society(admin, h, { name: "Dramatics Club", description: "Theatre, street plays.", categorySlug: "cultural" });
    const actor = await actorOf(student);
    expect((await listSocieties(prisma, actor, { q: "robot" })).map((s) => s.name)).toEqual(["Robotics Guild"]);
    expect((await listSocieties(prisma, actor, { q: "STREET" })).map((s) => s.name)).toEqual(["Dramatics Club"]);
    expect((await listSocieties(prisma, actor, { category: "cultural" })).map((s) => s.name)).toContain("Dramatics Club");
    expect((await listSocieties(prisma, actor, { category: "cultural" })).map((s) => s.name)).not.toContain("Robotics Guild");
    // LIKE wildcards in the search are literal text, not patterns.
    expect(await listSocieties(prisma, actor, { q: "%" })).toEqual([]);
  });

  it("D02: a deactivated society is hidden from the directory, readable by link, and accepts nothing new", async () => {
    const s = await society(admin, head, { name: "Sleeping Society" });
    const waiting = await user("soc.waiting@thapar.edu");
    await api.requestMembership(req(waiting.cookie, "POST", {}), s.id);
    const post = await api.createPost(req(head.cookie, "POST", { type: "UPDATE", title: "Still here", body: "<p>x</p>" }), s.id);
    const postId = ((await post.json()) as { post: { id: string } }).post.id;
    expect((await api.setActive(req(head.cookie, "PUT", { active: false }), s.id)).status).toBe(403);
    expect((await api.setActive(req(admin.cookie, "PUT", { active: false }), s.id)).status).toBe(200);

    const actor = await actorOf(student);
    expect((await listSocieties(prisma, actor, {})).map((x) => x.id)).not.toContain(s.id);
    expect((await listSocieties(prisma, actor, { view: "inactive" })).map((x) => x.id)).not.toContain(s.id); // admins only
    expect((await listSocieties(prisma, await actorOf(admin), { view: "inactive" })).map((x) => x.id)).toContain(s.id);
    const detail = (await getSocietyBySlug(prisma, identity, actor, s.slug))!;
    expect(detail.isActive).toBe(false);
    expect((await getPost(prisma, identity, actor, detail, postId))?.title).toBe("Still here");

    expect((await api.follow(req(student.cookie, "PUT"), s.id)).status).toBe(422);
    expect((await api.requestMembership(req(student.cookie, "POST", {}), s.id)).status).toBe(422);
    expect((await api.createPost(req(head.cookie, "POST", { type: "UPDATE", title: "New", body: "x" }), s.id)).status).toBe(403);
    expect(await prisma.societyMembershipRequest.count({ where: { societyId: s.id, status: "PENDING" } })).toBe(0);
    expect((await api.setActive(req(admin.cookie, "PUT", { active: true }), s.id)).status).toBe(200);
    expect(await auditActions(s.id)).toEqual(expect.arrayContaining(["societies.society.status_changed"]));
  });

  it("D03: only admins rename; any Head edits the profile", async () => {
    const s = await society(admin, head, { name: "Profile Society" });
    expect((await api.updateSociety(req(head.cookie, "PATCH", { description: "New text", categorySlug: "cultural", links: { instagram: "https://instagram.com/x" } }), s.id)).status).toBe(200);
    const renameByHead = await api.updateSociety(req(head.cookie, "PATCH", { name: "Renamed", description: "x", categorySlug: "cultural" }), s.id);
    expect((await json(renameByHead)).error?.fields).toHaveProperty("name");
    expect((await api.updateSociety(req(admin.cookie, "PATCH", { name: "Profile Society Renamed", description: "x", categorySlug: "cultural" }, { as: "admin" }), s.id)).status).toBe(200);
    const row = await prisma.society.findUniqueOrThrow({ where: { id: s.id } });
    expect(row).toMatchObject({ name: "Profile Society Renamed", slug: s.slug, categorySlug: "cultural" });
  });
});

describe("HTTP guards", () => {
  it("H01: CSRF, authentication, profile completion and malformed ids", async () => {
    const s = await society(admin, head);
    expect((await api.follow(req(student.cookie, "PUT", undefined, { origin: null }), s.id)).status).toBe(403);
    expect((await api.follow(req(student.cookie, "PUT", undefined, { origin: "https://evil.example" }), s.id)).status).toBe(403);
    expect((await api.follow(req(undefined, "PUT"), s.id)).status).toBe(401);
    const incomplete = await user("soc.noprofile@thapar.edu", { completeProfile: false });
    const refused = await api.follow(req(incomplete.cookie, "PUT"), s.id);
    expect(refused.status).toBe(403);
    expect((await json(refused)).error?.code).toBe("PROFILE_INCOMPLETE");
    expect((await api.follow(req(student.cookie, "PUT"), "not-a-uuid")).status).toBe(404);
    expect((await api.follow(req(student.cookie, "PUT"), "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    const notJson = new Request(`${BASE}/api/societies`, { method: "POST", headers: { origin: BASE, cookie: student.cookie, "content-type": "application/json" }, body: "{" });
    expect((await api.requestMembership(notJson, s.id)).status).toBe(400);
  });

  it("H02: per-user rate limit returns 429 with Retry-After", async () => {
    const s = await society(admin, head);
    const busy = await user("soc.busy@thapar.edu");
    const statuses: number[] = [];
    const limitedApi = societiesHandlers(deps);
    for (let i = 0; i < 60; i += 1) statuses.push((await limitedApi.follow(req(busy.cookie, "PUT"), s.id)).status);
    expect(statuses.every((status) => status === 200)).toBe(true);
    const limited = await limitedApi.follow(req(busy.cookie, "PUT"), s.id);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("H03: fails closed (503) when the rate-limit store or the session lookup is unavailable", async () => {
    const s = await society(admin, head);
    const broken: RateLimiter = async () => {
      throw new Error("store down");
    };
    expect((await societiesHandlers({ ...deps, limiter: broken }).follow(req(student.cookie, "PUT"), s.id)).status).toBe(503);
    const noSessions = societiesHandlers({ ...deps, readSession: async () => Promise.reject(new Error("db down")) });
    expect((await noSessions.follow(req(student.cookie, "PUT"), s.id)).status).toBe(503);
    expect(await prisma.societyFollow.count({ where: { societyId: s.id, userId: student.id } })).toBe(0);
  });
});
