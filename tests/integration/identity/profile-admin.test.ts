// Profile completion (FR-AUTH-2), admin bootstrap (OI-09), admin session revocation (FR-AUTH-4) and
// the append-only audit log, against PostgreSQL 17.9 with the committed migrations. Users sign in
// through the E2E test sign-in, which uses Better Auth's real ID-token path and identity policy.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { IdentityAuth } from "@/modules/identity/auth";
import { type IdentityConfig, parseIdentityConfig } from "@/modules/identity/config";
import { createDatabaseRateLimiter, IDENTITY_API_LIMITS, type RateLimiter } from "@/modules/identity/api-rate-limit";
import { handleAdminRevoke, handleCompleteProfile, handleMe, type IdentityHttpDeps } from "@/modules/identity/http";
import { buildIdentityAuth } from "@/modules/identity/runtime";
import { installTestGoogleKeys } from "@/modules/identity/test-google";
import { testSignIn } from "@/modules/identity/test-sign-in";
import { createDbClient, type PrismaClient } from "@/shared/db/client";

import { applyMigrations } from "../../support/migrations";

const POSTGRES_IMAGE = "postgres:17.9-alpine@sha256:c7526c0f6c3f30260a563d7bcf8ad778effac59a44f8ffa86678c35418338609";
const BASE = "http://127.0.0.1:3100";
const ADMIN = "first.admin@thapar.edu";
/** A second admin used only by the rate-limit test, so earlier tests do not consume its window. */
const RATE_ADMIN = "rate.admin@thapar.edu";

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let config: IdentityConfig;
let auth: IdentityAuth;
let deps: IdentityHttpDeps;

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  await applyMigrations(container.getConnectionUri());
  prisma = createDbClient(container.getConnectionUri());
  installTestGoogleKeys();
  config = parseIdentityConfig({
    BETTER_AUTH_URL: BASE,
    BETTER_AUTH_SECRET: "p".repeat(40),
    AUTH_ALLOWED_EMAIL_DOMAIN: "thapar.edu",
    GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    E2E_TEST_AUTH: "1",
    THAPAR_E2E_BUILD: "1",
    ADMIN_EMAILS: ` ${ADMIN.toUpperCase()} , ${RATE_ADMIN}`,
  });
  auth = buildIdentityAuth(config, prisma);
  deps = { auth, prisma, config };
  for (const level of ["error", "warn"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma?.$disconnect();
  await container?.stop();
});

// ---------- helpers ----------

let ip = 0;
async function signInAs(email: string): Promise<string> {
  ip += 1;
  const response = await testSignIn(
    auth,
    config,
    new Request(`${BASE}/api/test-auth/sign-in`, {
      method: "POST",
      headers: { origin: BASE, "content-type": "application/json", "x-forwarded-for": `198.51.100.${ip}` },
      body: JSON.stringify({ email, name: "Test Student" }),
    }),
  );
  const cookie = response.headers.getSetCookie().find((c) => /^better-auth\.session_token=[^;]/.test(c));
  expect(cookie, email).toBeDefined();
  return cookie!.split(";")[0]!;
}

function api(path: string, init: { method?: string; cookie?: string; body?: unknown; origin?: string | null; fetchSite?: string; ip?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.ip) headers.set("x-forwarded-for", init.ip);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.origin !== null) headers.set("origin", init.origin ?? BASE);
  if (init.fetchSite) headers.set("sec-fetch-site", init.fetchSite);
  return new Request(`${BASE}${path}`, { method: init.method ?? "POST", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

const validProfile = (overrides: Record<string, unknown> = {}) => ({
  name: "Test Student",
  rollNumber: `10${Math.floor(Math.random() * 1e8)}`.padEnd(9, "0"),
  branchCode: "COE",
  year: 2,
  tags: ["python", "machine-learning", "web-development"],
  ...overrides,
});
const me = (cookie?: string, ip?: string) => handleMe(deps, api("/api/identity/me", { method: "GET", cookie, ip }));
const complete = (cookie: string, body: unknown, extra: Parameters<typeof api>[1] = {}) => handleCompleteProfile(deps, api("/api/identity/profile", { cookie, body, ...extra }));
const revoke = (cookie: string, body: unknown, extra: Parameters<typeof api>[1] = {}) => handleAdminRevoke(deps, api("/api/identity/admin/sessions/revoke", { cookie, body, ...extra }));
const errorOf = async (response: Response) => ((await response.json()) as { error: { code: string; fields?: Record<string, string> } }).error;

// ---------- profile completion (FR-AUTH-2) ----------

describe("profile completion (FR-AUTH-2)", () => {
  it("PR01: the migration seeds the branch list and the controlled tag vocabulary", async () => {
    expect(await prisma.branch.count({ where: { active: true } })).toBeGreaterThanOrEqual(10);
    expect(await prisma.skillTag.count({ where: { active: true } })).toBeGreaterThanOrEqual(50);
  });

  it("PR02: a new user starts incomplete; completing stores the profile and unlocks the app", async () => {
    const cookie = await signInAs("profile.happy@thapar.edu");
    expect(((await (await me(cookie)).json()) as { profileComplete: boolean }).profileComplete).toBe(false);
    const res = await complete(cookie, validProfile({ rollNumber: "102203abc", tags: ["python", "python", "rust", "robotics"] }));
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "profile.happy@thapar.edu" }, include: { skills: true } });
    expect(user.rollNumber).toBe("102203ABC");
    expect(user.profileCompletedAt).not.toBeNull();
    expect(user.skills.map((s) => s.tagSlug).sort()).toEqual(["python", "robotics", "rust"]);
    const body = (await (await me(cookie)).json()) as { profileComplete: boolean; user: Record<string, unknown> };
    expect(body.profileComplete).toBe(true);
    expect(body.user).not.toHaveProperty("rollNumber"); // OI-27: not part of the session view
  });

  it.each([
    ["fewer than 3 tags", { tags: ["python", "rust"] }, "tags"],
    ["more than 10 tags", { tags: ["c", "cpp", "java", "python", "javascript", "typescript", "go", "rust", "kotlin", "swift", "devops"] }, "tags"],
    ["unknown tag", { tags: ["python", "rust", "not-a-tag"] }, "tags"],
    ["unknown branch", { branchCode: "XYZ" }, "branchCode"],
    ["bad roll number", { rollNumber: "12-34" }, "rollNumber"],
    ["year out of range", { year: 6 }, "year"],
    ["missing name", { name: " " }, "name"],
  ])("PR03: rejects %s with a field error and stores nothing", async (_label, overrides, field) => {
    const email = `profile.invalid.${field.toLowerCase()}.${Math.random().toString(36).slice(2, 8)}@thapar.edu`;
    const cookie = await signInAs(email);
    const res = await complete(cookie, validProfile(overrides));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).fields).toHaveProperty(field);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { skills: true } });
    expect(user.profileCompletedAt).toBeNull();
    expect(user.skills).toEqual([]);
  });

  it("PR04: roll numbers are unique and a profile can be completed only once", async () => {
    const a = await signInAs("profile.first@thapar.edu");
    const b = await signInAs("profile.second@thapar.edu");
    expect((await complete(a, validProfile({ rollNumber: "UNIQUE123" }))).status).toBe(200);
    const duplicate = await complete(b, validProfile({ rollNumber: "unique123" }));
    expect(duplicate.status).toBe(409);
    expect((await errorOf(duplicate)).code).toBe("ROLL_NUMBER_TAKEN");
    const again = await complete(a, validProfile());
    expect(again.status).toBe(409);
    expect((await errorOf(again)).code).toBe("ALREADY_COMPLETED");
  });

  it("PR05: the database refuses a completed profile without its required fields", async () => {
    const cookie = await signInAs("profile.db@thapar.edu");
    expect(cookie).toBeTruthy();
    await expect(prisma.user.update({ where: { email: "profile.db@thapar.edu" }, data: { profileCompletedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.user.update({ where: { email: "profile.db@thapar.edu" }, data: { year: 9 } })).rejects.toThrow();
  });

  it("PR06: the profile endpoint needs a session and the app's own origin (OI-52)", async () => {
    expect((await complete("", validProfile())).status).toBe(401);
    const cookie = await signInAs("profile.csrf@thapar.edu");
    for (const extra of [{ origin: null }, { origin: "https://evil.example" }, { origin: "null" }, { fetchSite: "cross-site" }] as const) {
      const res = await complete(cookie, validProfile(), extra);
      expect(res.status, JSON.stringify(extra)).toBe(403);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "profile.csrf@thapar.edu" } })).profileCompletedAt).toBeNull();
    expect((await me()).status).toBe(401);
  });
});

// ---------- admin bootstrap, revocation (FR-AUTH-4), audit log ----------

describe("administration (FR-AUTH-4, OI-09)", () => {
  it("AD01: an ADMIN_EMAILS address becomes ADMIN at sign-in; older sessions are revoked and it is audited", async () => {
    // First sign-in creates the user as STUDENT, then the bootstrap promotes them while creating the session.
    const first = await signInAs(ADMIN);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } });
    expect(admin.role).toBe("ADMIN");
    expect((await me(first)).status).toBe(200);
    const entries = await prisma.auditLog.findMany({ where: { action: "identity.role.granted", targetId: admin.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.actorId).toBeNull();
    // Already ADMIN: a second sign-in neither re-audits nor revokes the first session.
    const second = await signInAs(ADMIN);
    expect((await me(first)).status).toBe(200);
    expect((await me(second)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "identity.role.granted", targetId: admin.id } })).toBe(1);
    await signInAs("not.an.admin@thapar.edu");
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "not.an.admin@thapar.edu" } })).role).toBe("STUDENT");
  });

  it("AD02: an admin revokes all of a user's sessions; the user's next request is 401; the action is audited", async () => {
    const adminCookie = await signInAs(ADMIN);
    const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } })).id;
    const phone = await signInAs("revoke.target@thapar.edu");
    const laptop = await signInAs("revoke.target@thapar.edu");
    const target = await prisma.user.findUniqueOrThrow({ where: { email: "revoke.target@thapar.edu" } });
    const res = await revoke(adminCookie, { userId: target.id });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: 2 });
    expect((await me(phone)).status).toBe(401);
    expect((await me(laptop)).status).toBe(401);
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: "identity.sessions.revoked", targetId: target.id } });
    expect(entry).toMatchObject({ actorId: adminId, targetType: "user", details: { scope: "all", count: 2 } });
  });

  it("AD03: an admin revokes one session; the user's other sessions stay valid", async () => {
    const adminCookie = await signInAs(ADMIN);
    const keep = await signInAs("revoke.one@thapar.edu");
    const drop = await signInAs("revoke.one@thapar.edu");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "revoke.one@thapar.edu" }, include: { sessions: { orderBy: { createdAt: "asc" } } } });
    expect((await revoke(adminCookie, { sessionId: user.sessions.at(-1)!.id })).status).toBe(200);
    expect((await me(drop)).status).toBe(401);
    expect((await me(keep)).status).toBe(200);
  });

  it("AD04: non-admins, signed-out callers, cross-origin requests and bad input are refused", async () => {
    const adminCookie = await signInAs(ADMIN);
    const student = await signInAs("plain.student@thapar.edu");
    const studentId = (await prisma.user.findUniqueOrThrow({ where: { email: "plain.student@thapar.edu" } })).id;
    expect((await revoke(student, { userId: studentId })).status).toBe(403);
    expect((await revoke("", { userId: studentId })).status).toBe(401);
    expect((await revoke(adminCookie, { userId: studentId }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await revoke(adminCookie, { userId: studentId }, { origin: null })).status).toBe(403);
    expect((await revoke(adminCookie, { userId: "not-a-uuid" })).status).toBe(400);
    expect((await revoke(adminCookie, { userId: studentId, sessionId: studentId })).status).toBe(400);
    expect((await revoke(adminCookie, { userId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    expect((await me(student)).status).toBe(200);
  });

  it("AU01: the audit log is append-only (updates, deletes and truncation fail)", async () => {
    const entry = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: entry.id }, data: { action: "tampered" } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow();
    await expect(prisma.$executeRaw`TRUNCATE admin_audit_logs`).rejects.toThrow();
    expect((await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } })).action).toBe(entry.action);
  });
});

// ---------- rate limits and fail-safe behaviour ----------

describe("rate limits and fail-safe behaviour (/api/identity/*)", () => {
  it("RL01: profile submissions are limited per user (429 with Retry-After); other users are unaffected", async () => {
    const cookie = await signInAs("limit.profile@thapar.edu");
    const max = IDENTITY_API_LIMITS.profile.perUser.max;
    for (let i = 0; i < max; i++) expect((await complete(cookie, { tags: [] }, { ip: `192.0.2.${i + 1}` })).status).toBe(400);
    const limited = await complete(cookie, validProfile(), { ip: "192.0.2.200" });
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("RATE_LIMITED");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "limit.profile@thapar.edu" } })).profileCompletedAt).toBeNull();
    const other = await signInAs("limit.other@thapar.edu");
    expect((await complete(other, { tags: [] }, { ip: "192.0.2.201" })).status).toBe(400);
  });

  it("RL02: requests are limited per client address before authentication", async () => {
    const max = IDENTITY_API_LIMITS.me.perAddress.max;
    for (let i = 0; i < max; i++) expect((await me(undefined, "198.18.0.1")).status).toBe(401);
    expect((await me(undefined, "198.18.0.1")).status).toBe(429);
    expect((await me(undefined, "198.18.0.2")).status).toBe(401);
  });

  it("RL03: administrative revocation is limited per admin", async () => {
    const adminCookie = await signInAs(RATE_ADMIN);
    const max = IDENTITY_API_LIMITS.adminRevoke.perUser.max;
    const missing = { userId: "00000000-0000-4000-8000-000000000001" };
    for (let i = 0; i < max; i++) expect((await revoke(adminCookie, missing, { ip: `198.18.1.${i + 1}` })).status).toBe(404);
    expect((await revoke(adminCookie, missing, { ip: "198.18.1.250" })).status).toBe(429);
  });

  it("RL04: windows are fixed, shared through the database, and reset in the next window", async () => {
    const limiter = createDatabaseRateLimiter(prisma);
    const rule = { window: 60, max: 2 };
    const t0 = 1_800_000_000_000; // a window boundary (multiple of 60 s)
    expect(await limiter("rl04", rule, t0)).toEqual({ allowed: true });
    expect(await createDatabaseRateLimiter(prisma)("rl04", rule, t0 + 1000)).toEqual({ allowed: true }); // another "instance"
    expect(await limiter("rl04", rule, t0 + 2000)).toEqual({ allowed: false, retryAfterSeconds: 58 });
    expect(await limiter("rl04", rule, t0 + 60_000)).toEqual({ allowed: true });
    const concurrent = await Promise.all(Array.from({ length: 20 }, () => limiter("rl04-concurrent", { window: 60, max: 5 }, t0)));
    expect(concurrent.filter((d) => d.allowed)).toHaveLength(5);
    // Better Auth's own keys are untouched by this module's prefix.
    expect(await prisma.rateLimit.count({ where: { key: { startsWith: "identity-api:" } } })).toBeGreaterThan(0);
  });

  it("RL05: if the rate-limit store fails, every identity endpoint refuses the request (503) and changes nothing", async () => {
    const broken: RateLimiter = () => Promise.reject(new Error("store down"));
    const failing = { ...deps, limiter: broken };
    const cookie = await signInAs("limit.down@thapar.edu");
    const adminCookie = await signInAs(ADMIN);
    const target = await signInAs("limit.down.target@thapar.edu");
    const targetId = (await prisma.user.findUniqueOrThrow({ where: { email: "limit.down.target@thapar.edu" } })).id;
    expect((await handleMe(failing, api("/api/identity/me", { method: "GET", cookie }))).status).toBe(503);
    expect((await handleCompleteProfile(failing, api("/api/identity/profile", { cookie, body: validProfile() }))).status).toBe(503);
    expect((await handleAdminRevoke(failing, api("/api/identity/admin/sessions/revoke", { cookie: adminCookie, body: { userId: targetId } }))).status).toBe(503);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "limit.down@thapar.edu" } })).profileCompletedAt).toBeNull();
    expect((await me(target, "198.18.2.1")).status).toBe(200);
  });

  it("RL06: if the permission data cannot be read, administrative revocation is refused (503), not allowed", async () => {
    const adminCookie = await signInAs(ADMIN);
    const target = await signInAs("authz.down.target@thapar.edu");
    const targetId = (await prisma.user.findUniqueOrThrow({ where: { email: "authz.down.target@thapar.edu" } })).id;
    const unreachable = createDbClient("postgresql://nobody:nothing@127.0.0.1:1/none");
    const allowAll: RateLimiter = async () => ({ allowed: true });
    try {
      const res = await handleAdminRevoke({ ...deps, prisma: unreachable, limiter: allowAll }, api("/api/identity/admin/sessions/revoke", { cookie: adminCookie, body: { userId: targetId } }));
      expect(res.status).toBe(503);
      expect(JSON.stringify(await res.json())).not.toMatch(/postgres|nobody|127\.0\.0\.1/);
    } finally {
      await unreachable.$disconnect();
    }
    expect((await me(target, "198.18.2.2")).status).toBe(200);
  });
});
