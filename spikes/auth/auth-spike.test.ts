// AUTH SPIKE tests T01..T18 (docs/auth/authentication-evaluation.md §8, spike-findings.md).
// Real Better Auth 1.7.10 HTTP handler + real Prisma adapter + PostgreSQL (Testcontainers).
// Only Google's token and key endpoints are simulated (google-stub.ts). Requires Docker.
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSpikeAuth, type SpikeAuth, type SpikeAuthOptions } from "./create-spike-auth";
import { PrismaClient } from "./generated/prisma/client";
import { createGoogleStub, type GoogleClaims, installGoogleStub } from "./google-stub";
import { HASHED_TOKEN_MARKER, hashSessionToken, withHashedSessionTokens } from "./hashed-session-adapter";
import { evaluateIdentity } from "./identity-policy";

const POSTGRES_IMAGE = "postgres:17.9-alpine@sha256:c7526c0f6c3f30260a563d7bcf8ad778effac59a44f8ffa86678c35418338609";
const BASE = "https://sns.test";
const SECRET = randomBytes(32).toString("hex");
const CLIENT_ID = "spike-client.apps.googleusercontent.com";
const CLIENT_IP = "203.0.113.10"; // TEST-NET-3 documentation address
// Each simulated sign-in comes from its own documentation-range address, like separate users.
// (Better Auth's in-memory rate limit store is shared by every instance in the process.)
let ipCounter = 0;
const nextClientIp = () => {
  ipCounter += 1;
  return `198.51.${100 + Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};
const SESSION_COOKIE = "__Secure-better-auth.session_token";

const stub = createGoogleStub(CLIENT_ID);
let restoreFetch: () => void;
let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let auth: SpikeAuth;
const baseCalls: Array<{ method: string; args: string }> = [];
const rawTokensSeen = new Set<string>();

function makeAuth(overrides: Partial<SpikeAuthOptions> = {}) {
  return createSpikeAuth({
    prisma,
    baseURL: BASE,
    secret: SECRET,
    googleClientId: CLIENT_ID,
    googleClientSecret: "spike-client-secret",
    allowedDomain: "thapar.edu",
    observe: (method, args) => baseCalls.push({ method, args: JSON.stringify(args) }),
    ...overrides,
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  // Schema setup through the plain driver (trusted, file-based SQL); app code never uses raw SQL strings.
  const setup = new pg.Client({ connectionString: container.getConnectionUri() });
  await setup.connect();
  await setup.query(readFileSync(path.join(import.meta.dirname, "prisma/init.sql"), "utf8"));
  await setup.end();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: container.getConnectionUri() }) });
  restoreFetch = installGoogleStub(stub);
  auth = makeAuth();
});

afterAll(async () => {
  restoreFetch?.();
  await prisma?.$disconnect();
  await container?.stop();
});

// ---------- HTTP helpers ----------

const cookiePairs = (setCookies: string[]) => setCookies.map((c) => c.split(";")[0]).join("; ");

function request(target: SpikeAuth, pathname: string, init: { method?: string; cookie?: string; origin?: string; body?: unknown; ip?: string } = {}) {
  const headers = new Headers({ "x-forwarded-for": init.ip ?? CLIENT_IP, "user-agent": "spike-test" });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return target.handler(new Request(`${BASE}${pathname}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }));
}

interface SignInResult {
  location: string | null;
  setCookies: string[];
  sessionSetCookie?: string;
  cookie?: string; // "name=value" ready for a Cookie header
  rawToken?: string;
  callback: { url: URL; cookie: string };
}

async function signIn(claims: GoogleClaims, opts: { target?: SpikeAuth; extraCookie?: string; tamperState?: boolean } = {}): Promise<SignInResult> {
  const target = opts.target ?? auth;
  const ip = nextClientIp();
  const start = await request(target, "/api/auth/sign-in/social", { method: "POST", origin: BASE, ip, body: { provider: "google", callbackURL: "/" } });
  expect(start.status).toBe(200);
  const authorizeUrl = new URL(((await start.json()) as { url: string }).url);
  const state = authorizeUrl.searchParams.get("state")!;
  const redirectUri = authorizeUrl.searchParams.get("redirect_uri")!;
  const code = stub.issueCode(claims, authorizeUrl.searchParams.get("code_challenge")!, redirectUri);
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  url.searchParams.set("state", opts.tamperState ? `${state}x` : state);
  const cookie = [cookiePairs(start.headers.getSetCookie()), opts.extraCookie].filter(Boolean).join("; ");
  const done = await target.handler(new Request(url, { headers: { cookie, "x-forwarded-for": ip, "user-agent": "spike-test" } }));
  const setCookies = done.headers.getSetCookie();
  const sessionSetCookie = setCookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`) && !/^[^=]+=;/.test(c));
  const result: SignInResult = { location: done.headers.get("location"), setCookies, sessionSetCookie, callback: { url, cookie } };
  if (sessionSetCookie) {
    result.cookie = sessionSetCookie.split(";")[0]!;
    result.rawToken = decodeURIComponent(result.cookie.split("=")[1]!).split(".")[0]!;
    rawTokensSeen.add(result.rawToken);
  }
  return result;
}

async function getSession(cookie: string | undefined, target: SpikeAuth = auth) {
  const res = await request(target, "/api/auth/get-session", { cookie });
  return (await res.json()) as { session: { id: string; token?: string; expiresAt: string; userId: string }; user: { email: string } } | null;
}

/** Signs a cookie value exactly as better-call does: HMAC-SHA256, base64, URL-encoded. */
const signCookie = (value: string) => `${SESSION_COOKIE}=${encodeURIComponent(`${value}.${createHmac("sha256", SECRET).update(value).digest("base64")}`)}`;

let userCounter = 0;
function student(overrides: Partial<GoogleClaims> = {}): GoogleClaims {
  userCounter += 1;
  return { sub: `sub-${userCounter}`, email: `student${userCounter}@thapar.edu`, email_verified: true, hd: "thapar.edu", name: `Test Student ${userCounter}`, ...overrides };
}

// ---------- Pure units (no database) ----------

describe("identity policy and hashing (units)", () => {
  it.each([
    ["a@thapar.edu", true, true],
    ["  Mixed.Case@THAPAR.EDU ", true, true],
    ["a@gmail.com", true, false],
    ["a@thapar.edu.evil.com", true, false],
    ["a@student.thapar.edu", true, false],
    ["a@b@thapar.edu", true, false],
    ["a@thapar.edu", false, false],
    ["", true, false],
  ])("evaluateIdentity(%s, verified=%s) allowed=%s", (email, emailVerified, allowed) => {
    expect(evaluateIdentity({ email, emailVerified }, "thapar.edu").allowed).toBe(allowed);
  });

  it("hashes tokens to unpadded base64url SHA-256", () => {
    expect(hashSessionToken("abc")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  });

  it("T15: refuses to wrap an adapter with unreviewed members (fails closed on upgrades)", () => {
    const factory = withHashedSessionTokens(() => ({ id: "x", create: async () => null, brandNewMethod: async () => null }) as never);
    expect(() => factory({} as never)).toThrow(/unreviewed adapter members brandNewMethod/);
  });

  it("T15: better-auth is pinned to the reviewed version", () => {
    const pkg = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../package.json"), "utf8"));
    expect(pkg.devDependencies["better-auth"] ?? pkg.dependencies?.["better-auth"]).toBe("1.7.10");
  });
});

// ---------- Session security (T01..T09, T17, T18) ----------

describe("sessions with hashed tokens", () => {
  it("T01: the database never stores the cookie's token; it stores SHA-256(token)", async () => {
    const login = await signIn(student());
    expect(login.rawToken).toBeTruthy();
    expect(login.rawToken!.length).toBeGreaterThanOrEqual(32);
    const rows = await prisma.session.findMany();
    expect(rows.some((r) => r.token === login.rawToken)).toBe(false);
    expect(rows.some((r) => r.token === hashSessionToken(login.rawToken!))).toBe(true);
  });

  it("T02: a value copied from the database cannot authenticate, even when signed with the real secret", async () => {
    const login = await signIn(student());
    const stored = hashSessionToken(login.rawToken!);
    expect(await getSession(`${SESSION_COOKIE}=${encodeURIComponent(stored)}`)).toBeNull(); // unsigned
    expect(await getSession(signCookie(stored))).toBeNull(); // attacker also holds the secret
    expect(await getSession(signCookie(`${HASHED_TOKEN_MARKER}${stored}`))).toBeNull(); // marker form
    expect(signCookie(login.rawToken!)).toBe(login.cookie); // the signing helper matches the real cookie
    expect(await getSession(login.cookie)).not.toBeNull();
  });

  it("T03: session cookie is __Secure-, HttpOnly, Secure, SameSite=Lax, Path=/, host-only", async () => {
    const login = await signIn(student());
    const attrs = login.sessionSetCookie!.split(";").map((s) => s.trim().toLowerCase());
    expect(login.sessionSetCookie!.startsWith("__Secure-")).toBe(true);
    expect(attrs).toContain("httponly");
    expect(attrs).toContain("secure");
    expect(attrs).toContain("samesite=lax");
    expect(attrs).toContain("path=/");
    expect(attrs.some((a) => a.startsWith("domain="))).toBe(false);
  });

  it("T04: rejects expired, deleted and tampered-signature sessions", async () => {
    const expired = await signIn(student());
    await prisma.session.update({ where: { token: hashSessionToken(expired.rawToken!) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getSession(expired.cookie)).toBeNull();

    const deleted = await signIn(student());
    await prisma.session.delete({ where: { token: hashSessionToken(deleted.rawToken!) } });
    expect(await getSession(deleted.cookie)).toBeNull();

    const tampered = await signIn(student());
    const [name, value] = tampered.cookie!.split("=");
    const decoded = decodeURIComponent(value!);
    // Change a character well inside the signature (the last one before "=" partly encodes padding bits).
    const at = decoded.length - 10;
    const flipped = decoded.slice(0, at) + (decoded[at] === "A" ? "B" : "A") + decoded.slice(at + 1);
    expect(await getSession(`${name}=${encodeURIComponent(flipped)}`)).toBeNull();
  });

  it("T05: sign-out deletes the session server-side, clears the cookie, and the old cookie stops working", async () => {
    const login = await signIn(student());
    const out = await request(auth, "/api/auth/sign-out", { method: "POST", cookie: login.cookie, origin: BASE, body: {} });
    expect(out.status).toBe(200);
    const cleared = out.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(cleared).toMatch(/max-age=0|expires=thu, 01 jan 1970/i);
    expect(await prisma.session.count({ where: { token: hashSessionToken(login.rawToken!) } })).toBe(0);
    expect(await getSession(login.cookie)).toBeNull();
  });

  it("T06: revoking a session by id (admin path) takes effect on the next request", async () => {
    const login = await signIn(student());
    const row = await prisma.session.findUniqueOrThrow({ where: { token: hashSessionToken(login.rawToken!) } });
    await prisma.session.delete({ where: { id: row.id } });
    expect(await getSession(login.cookie)).toBeNull();
  });

  it("T07: revoking all of a user's sessions (ban or role change) signs out every device", async () => {
    const claims = student();
    const a = await signIn(claims);
    const b = await signIn(claims);
    const ctx = await auth.$context;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: claims.email } });
    await ctx.internalAdapter.deleteUserSessions(user.id);
    expect(await getSession(a.cookie)).toBeNull();
    expect(await getSession(b.cookie)).toBeNull();
  });

  it("T08 + T17: sliding refresh works with hashed storage; the token itself is not rotated", async () => {
    const login = await signIn(student());
    const hash = hashSessionToken(login.rawToken!);
    const nearlyDue = new Date(Date.now() + 5 * 24 * 3600 * 1000); // past the 1-day updateAge
    await prisma.session.update({ where: { token: hash }, data: { expiresAt: nearlyDue } });
    const res = await request(auth, "/api/auth/get-session", { cookie: login.cookie });
    expect(res.status).toBe(200);
    const row = await prisma.session.findUniqueOrThrow({ where: { token: hash } });
    expect(row.expiresAt.getTime()).toBeGreaterThan(nearlyDue.getTime() + 24 * 3600 * 1000);
    const reissued = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    const sameToken = reissued ? decodeURIComponent(reissued.split(";")[0]!.split("=")[1]!).split(".")[0] === login.rawToken : true;
    console.info(`[T17] refresh re-sent cookie: ${Boolean(reissued)}; token unchanged: ${sameToken}`);
    expect(sameToken).toBe(true);
  });

  it("T09: every sign-in issues a new token and a planted cookie is never adopted", async () => {
    const planted = `${SESSION_COOKIE}=${encodeURIComponent("attacker-chosen-value.sig")}`;
    const claims = student();
    const first = await signIn(claims, { extraCookie: planted });
    const second = await signIn(claims);
    expect(first.rawToken).not.toBe("attacker-chosen-value");
    expect(first.rawToken).not.toBe(second.rawToken);
    expect(await getSession(planted)).toBeNull();
  });

  it("T18: Better Auth's /get-session response exposes the raw session token to browser JavaScript", async () => {
    const login = await signIn(student());
    const body = await getSession(login.cookie);
    const exposed = body?.session.token === login.rawToken;
    console.info(`[T18] /get-session returns the raw session token in JSON: ${exposed}`);
    expect(exposed).toBe(true); // documents the finding; mitigation tested below
  });

  it("T18 mitigation: disabling the HTTP route keeps server-side session reads working", async () => {
    const locked = makeAuth({ disabledPaths: ["/get-session", "/list-sessions", "/revoke-session"] });
    const login = await signIn(student(), { target: locked });
    expect((await request(locked, "/api/auth/get-session", { cookie: login.cookie })).status).toBe(404);
    expect((await request(locked, "/api/auth/list-sessions", { cookie: login.cookie })).status).toBe(404);
    const serverSide = await locked.api.getSession({ headers: new Headers({ cookie: login.cookie! }) });
    expect(serverSide?.user.email).toMatch(/@thapar\.edu$/);
  });
});

// ---------- Session management endpoints with hashed storage ----------

describe("session list and revoke endpoints", () => {
  it("list-sessions returns no raw tokens (stored hashes are marked, not usable)", async () => {
    const claims = student();
    const a = await signIn(claims);
    await signIn(claims);
    const res = await request(auth, "/api/auth/list-sessions", { cookie: a.cookie });
    const list = (await res.json()) as Array<{ token: string }>;
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const s of list) {
      expect(s.token.startsWith(HASHED_TOKEN_MARKER)).toBe(true);
      expect(rawTokensSeen.has(s.token)).toBe(false);
    }
  });

  it("revoke-other-sessions does not work with hashed storage (fails closed: compatibility gap F-04)", async () => {
    const claims = student();
    const current = await signIn(claims);
    const other = await signIn(claims);
    const res = await request(auth, "/api/auth/revoke-other-sessions", { method: "POST", cookie: current.cookie, origin: BASE, body: {} });
    expect(res.status).toBe(200); // Better Auth reports success...
    expect(await getSession(other.cookie)).not.toBeNull(); // ...but nothing was revoked
  });

  it("id-based 'sign out other devices' (planned replacement) revokes only the other sessions", async () => {
    const claims = student();
    const current = await signIn(claims);
    const other = await signIn(claims);
    const me = (await getSession(current.cookie))!;
    await prisma.session.deleteMany({ where: { userId: me.session.userId, id: { not: me.session.id } } });
    expect(await getSession(current.cookie)).not.toBeNull();
    expect(await getSession(other.cookie)).toBeNull();
  });

  it("revoke-session cannot use tokens from list-sessions (compatibility gap: use id-based revocation)", async () => {
    const claims = student();
    const current = await signIn(claims);
    const other = await signIn(claims);
    const list = (await (await request(auth, "/api/auth/list-sessions", { cookie: current.cookie })).json()) as Array<{ token: string; id: string }>;
    const otherEntry = list.find((s) => s.token === `${HASHED_TOKEN_MARKER}${hashSessionToken(other.rawToken!)}`)!;
    await request(auth, "/api/auth/revoke-session", { method: "POST", cookie: current.cookie, origin: BASE, body: { token: otherEntry.token } });
    expect(await getSession(other.cookie)).not.toBeNull(); // not revoked: fails closed, needs our own endpoint
  });
});

// ---------- OAuth flow (T11..T13, T16) ----------

describe("Google sign-in flow", () => {
  it.each([
    ["personal Gmail account", { email: "someone@gmail.com", hd: undefined }],
    ["lookalike domain", { email: "x@thapar.edu.evil.com", hd: "thapar.edu.evil.com" }],
    ["subdomain email", { email: "x@student.thapar.edu", hd: "thapar.edu" }],
    ["unverified email", { email: "unverified@thapar.edu", email_verified: false }],
    ["missing hd claim", { email: "nohd@thapar.edu", hd: undefined }],
  ])("T11: rejects %s: no session and no user record", async (_label, overrides) => {
    const claims = student(overrides as Partial<GoogleClaims>);
    const result = await signIn(claims);
    expect(result.sessionSetCookie).toBeUndefined();
    expect(result.location ?? "").toMatch(/error/);
    expect(await prisma.user.count({ where: { email: claims.email.toLowerCase() } })).toBe(0);
  });

  it("T11: accepts an upper-case @THAPAR.EDU address and stores it lower-cased", async () => {
    const result = await signIn(student({ email: "Upper.Case@THAPAR.EDU" }));
    expect(result.sessionSetCookie).toBeDefined();
    expect(await prisma.user.count({ where: { email: "upper.case@thapar.edu" } })).toBe(1);
  });

  it("T11: the allowed domain is configuration, not hardcoded", async () => {
    const other = makeAuth({ allowedDomain: "example.edu" });
    expect((await signIn(student(), { target: other })).sessionSetCookie).toBeUndefined();
    expect((await signIn(student({ email: "x@example.edu", hd: "example.edu" }), { target: other })).sessionSetCookie).toBeDefined();
  });

  it("T12: cross-origin POSTs to auth endpoints are rejected", async () => {
    const login = await signIn(student());
    const res = await request(auth, "/api/auth/sign-out", { method: "POST", cookie: login.cookie, origin: "https://evil.example", body: {} });
    expect(res.status).toBe(403);
    expect(await getSession(login.cookie)).not.toBeNull();
  });

  it("T13: PKCE is used, tampered state is rejected, and callbacks cannot be replayed", async () => {
    const ok = await signIn(student());
    expect(stub.tokenRequests.at(-1)).toEqual({ codeVerifierMatched: true, redirectUriMatched: true });

    const tampered = await signIn(student(), { tamperState: true });
    expect(tampered.sessionSetCookie).toBeUndefined();

    const replay = await auth.handler(new Request(ok.callback.url, { headers: { cookie: ok.callback.cookie, "x-forwarded-for": CLIENT_IP } }));
    expect(replay.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`) && !/^[^=]+=;/.test(c))).toBe(false);
  });

  it("T16: sign-in attempts are rate limited", async () => {
    const limited = makeAuth({ signInRateLimit: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await request(limited, "/api/auth/sign-in/social", { method: "POST", origin: BASE, ip: "192.0.2.99", body: { provider: "google", callbackURL: "/" } })).status);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });
});

// ---------- T14: whole-suite audit of what reached the database adapter ----------

describe("T14: adapter audit", () => {
  it("no raw session token ever reached the database adapter", () => {
    expect(rawTokensSeen.size).toBeGreaterThan(10);
    expect(baseCalls.length).toBeGreaterThan(50);
    const methods = new Set(baseCalls.map((c) => c.method));
    console.info(`[T14] ${baseCalls.length} adapter calls (${[...methods].join(", ")}), ${rawTokensSeen.size} raw tokens checked`);
    for (const raw of rawTokensSeen) {
      expect(baseCalls.some((c) => c.args.includes(raw)), "raw token passed to adapter").toBe(false);
    }
  });

  it.todo("T10: absolute session lifetime cap (blocked on owner decision OI-05)");
});
