// Production identity module against PostgreSQL 17.9 (Testcontainers) with the committed
// migrations. Re-runs the spike's security tests (T01..T18) on src/modules/identity and adds the
// production behaviour (30-day cap, endpoint allow-list, database rate limits, safe logging).
// Only Google's network endpoints are simulated (tests/support/google-oauth-stub.ts).
import { createHmac, randomBytes } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { IdentityAuth } from "@/modules/identity/auth";
import { ALLOWED_AUTH_PATHS, SIGN_IN_RATE_LIMIT } from "@/modules/identity/auth";
import { parseIdentityConfig, type IdentityConfig } from "@/modules/identity/config";
import { HASHED_TOKEN_MARKER, hashSessionToken } from "@/modules/identity/hashed-session-adapter";
import { dispatchAuthRequest } from "@/modules/identity/request-guard";
import { authEndpointPaths, buildIdentityAuth } from "@/modules/identity/runtime";
import { SESSION_ABSOLUTE_MAX_MS } from "@/modules/identity/session-policy";
import { type ApiDeps, runAction } from "@/shared/http/api-action";
import { readCurrentSession, refreshedSessionCookies, revokeAllSessionsForUser, revokeOtherSessions, revokeSessionById } from "@/modules/identity/sessions";
import { installTestGoogleKeys } from "@/modules/identity/test-google";
import { testSignIn } from "@/modules/identity/test-sign-in";
import { createDbClient, type PrismaClient } from "@/shared/db/client";

import { createGoogleStub, type GoogleClaims, installGoogleStub } from "../../support/google-oauth-stub";
import { applyMigrations } from "../../support/migrations";

const POSTGRES_IMAGE = "postgres:17.9-alpine@sha256:c7526c0f6c3f30260a563d7bcf8ad778effac59a44f8ffa86678c35418338609";
const BASE = "https://sns.test";
const SECRET = randomBytes(32).toString("hex");
const CLIENT_ID = "test-client.apps.googleusercontent.com";
const SESSION_COOKIE = "__Secure-better-auth.session_token";

const stub = createGoogleStub(CLIENT_ID);
let restoreFetch: () => void;
let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let config: IdentityConfig;
let auth: IdentityAuth;
const adapterCalls: string[] = [];
const rawTokens = new Set<string>();
const logged: string[] = [];

function makeConfig(overrides: Record<string, string> = {}) {
  return parseIdentityConfig({
    BETTER_AUTH_URL: BASE,
    BETTER_AUTH_SECRET: SECRET,
    AUTH_ALLOWED_EMAIL_DOMAIN: "thapar.edu",
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    ...overrides,
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  await applyMigrations(container.getConnectionUri());
  prisma = createDbClient(container.getConnectionUri());
  restoreFetch = installGoogleStub(stub);
  config = makeConfig();
  auth = buildIdentityAuth(config, prisma, (method, args) => adapterCalls.push(`${method} ${JSON.stringify(args)}`));
  for (const level of ["error", "warn", "info", "log"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
  }
});

afterAll(async () => {
  vi.restoreAllMocks();
  restoreFetch?.();
  await prisma?.$disconnect();
  await container?.stop();
});

// ---------- helpers ----------

let ipCounter = 0;
const nextIp = () => `198.51.${100 + Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;
const cookiePairs = (setCookies: string[]) => setCookies.map((c) => c.split(";")[0]).join("; ");

/** The production request path (allow-list, Better Auth, safe error handling). */
const handle = (target: IdentityAuth, request: Request) => dispatchAuthRequest(target, config, request);

function req(
  pathname: string,
  init: {
    method?: string;
    cookie?: string;
    origin?: string;
    body?: unknown;
    ip?: string;
  } = {},
) {
  const headers = new Headers({
    "x-forwarded-for": init.ip ?? "203.0.113.10",
    "user-agent": "identity-test",
  });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${BASE}${pathname}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

interface SignIn {
  location: string | null;
  sessionSetCookie?: string;
  cookie?: string;
  rawToken?: string;
  callback: { url: URL; cookie: string; ip: string };
}

async function signIn(
  claims: GoogleClaims,
  opts: {
    target?: IdentityAuth;
    extraCookie?: string;
    tamperState?: boolean;
    /** Simulates login CSRF: the callback arrives in a browser that never started the sign-in. */
    dropStateCookie?: boolean;
  } = {},
): Promise<SignIn> {
  const target = opts.target ?? auth;
  const ip = nextIp();
  const start = await handle(
    target,
    req("/api/auth/sign-in/social", {
      method: "POST",
      origin: BASE,
      ip,
      body: { provider: "google", callbackURL: "/" },
    }),
  );
  expect(start.status).toBe(200);
  const authorize = new URL(((await start.json()) as { url: string }).url);
  const state = authorize.searchParams.get("state")!;
  const redirectUri = authorize.searchParams.get("redirect_uri")!;
  const url = new URL(redirectUri);
  url.searchParams.set("code", stub.issueCode(claims, authorize.searchParams.get("code_challenge")!, redirectUri));
  url.searchParams.set("state", opts.tamperState ? `${state}x` : state);
  const cookie = [opts.dropStateCookie ? "" : cookiePairs(start.headers.getSetCookie()), opts.extraCookie].filter(Boolean).join("; ");
  const done = await handle(target, new Request(url, { headers: { cookie, "x-forwarded-for": ip } }));
  const sessionSetCookie = done.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`) && !/^[^=]+=;/.test(c));
  const result: SignIn = {
    location: done.headers.get("location"),
    sessionSetCookie,
    callback: { url, cookie, ip },
  };
  if (sessionSetCookie) {
    result.cookie = sessionSetCookie.split(";")[0]!;
    result.rawToken = decodeURIComponent(result.cookie.split("=")[1]!).split(".")[0]!;
    rawTokens.add(result.rawToken);
  }
  return result;
}

const current = (cookie: string | undefined, now?: Date, options?: { touch?: boolean }) => readCurrentSession(auth, prisma, new Headers(cookie ? { cookie } : {}), now, options);
const signCookie = (value: string) => `${SESSION_COOKIE}=${encodeURIComponent(`${value}.${createHmac("sha256", SECRET).update(value).digest("base64")}`)}`;

let n = 0;
const student = (overrides: Partial<GoogleClaims> = {}): GoogleClaims => {
  n += 1;
  return {
    sub: `sub-${n}`,
    email: `student${n}@thapar.edu`,
    email_verified: true,
    hd: "thapar.edu",
    name: `Test Student ${n}`,
    ...overrides,
  };
};

// ---------- sessions (ADR-0006, OI-05) ----------

describe("hashed session tokens (ADR-0006)", () => {
  it("P01: the database stores SHA-256(token), never the cookie token", async () => {
    const login = await signIn(student());
    const rows = await prisma.session.findMany({ select: { token: true } });
    expect(rows.some((r) => r.token === login.rawToken)).toBe(false);
    expect(rows.some((r) => r.token === hashSessionToken(login.rawToken!))).toBe(true);
  });

  it("P02: a value copied from the database cannot authenticate, even signed with the real secret", async () => {
    const login = await signIn(student());
    const stored = hashSessionToken(login.rawToken!);
    expect(await current(`${SESSION_COOKIE}=${encodeURIComponent(stored)}`)).toBeNull();
    expect(await current(signCookie(stored))).toBeNull();
    expect(await current(signCookie(`${HASHED_TOKEN_MARKER}${stored}`))).toBeNull();
    expect(signCookie(login.rawToken!)).toBe(login.cookie);
    expect(await current(login.cookie)).not.toBeNull();
  });

  it("P03: the session cookie is __Secure-, HttpOnly, Secure, SameSite=Lax, Path=/, host-only, 7-day Max-Age", async () => {
    const login = await signIn(student());
    const attrs = login.sessionSetCookie!.split(";").map((s) => s.trim().toLowerCase());
    expect(login.sessionSetCookie!.startsWith("__Secure-")).toBe(true);
    for (const attr of ["httponly", "secure", "samesite=lax", "path=/", `max-age=${7 * 24 * 3600}`]) expect(attrs).toContain(attr);
    expect(attrs.some((a) => a.startsWith("domain="))).toBe(false);
  });

  it("P04: expired, deleted and tampered sessions are rejected", async () => {
    const expired = await signIn(student());
    await prisma.session.update({
      where: { token: hashSessionToken(expired.rawToken!) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await current(expired.cookie)).toBeNull();
    const deleted = await signIn(student());
    await prisma.session.delete({
      where: { token: hashSessionToken(deleted.rawToken!) },
    });
    expect(await current(deleted.cookie)).toBeNull();
    const tampered = await signIn(student());
    const decoded = decodeURIComponent(tampered.cookie!.split("=")[1]!);
    // Change a character well inside the signature: the last base64 character before "=" partly
    // encodes padding bits, so changing it can leave the signature bytes unchanged.
    const at = decoded.length - 10;
    const flipped = decoded.slice(0, at) + (decoded[at] === "A" ? "B" : "A") + decoded.slice(at + 1);
    expect(await current(`${SESSION_COOKIE}=${encodeURIComponent(flipped)}`)).toBeNull();
  });

  it("P05: sign-out deletes the session, clears the cookie, and the old cookie stops working", async () => {
    const login = await signIn(student());
    const out = await handle(
      auth,
      req("/api/auth/sign-out", {
        method: "POST",
        cookie: login.cookie,
        origin: BASE,
        body: {},
      }),
    );
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))).toMatch(/max-age=0|expires=thu, 01 jan 1970/i);
    expect(
      await prisma.session.count({
        where: { token: hashSessionToken(login.rawToken!) },
      }),
    ).toBe(0);
    expect(await current(login.cookie)).toBeNull();
  });

  it("P06/P07: revocation by session id, of all sessions, and of other devices takes effect immediately", async () => {
    const claims = student();
    const a = await signIn(claims);
    const b = await signIn(claims);
    const c = await signIn(claims);
    const sessionA = (await current(a.cookie))!;
    expect(
      await revokeOtherSessions(prisma, {
        userId: sessionA.user.id,
        sessionId: sessionA.sessionId,
      }),
    ).toBe(2);
    expect(await current(a.cookie)).not.toBeNull();
    expect(await current(b.cookie)).toBeNull();
    expect(await current(c.cookie)).toBeNull();
    expect(await revokeSessionById(prisma, sessionA.sessionId)).toBe(true);
    expect(await current(a.cookie)).toBeNull();
    const d = await signIn(claims);
    expect(await revokeAllSessionsForUser(prisma, sessionA.user.id)).toBe(1);
    expect(await current(d.cookie)).toBeNull();
  });

  it("P08/P22: sliding refresh extends the database expiry and re-issues the cookie (no token rotation)", async () => {
    const login = await signIn(student());
    const hash = hashSessionToken(login.rawToken!);
    const due = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    await prisma.session.update({
      where: { token: hash },
      data: { expiresAt: due },
    });
    const setCookies = await refreshedSessionCookies(auth, new Headers({ cookie: login.cookie! }));
    const row = await prisma.session.findUniqueOrThrow({
      where: { token: hash },
    });
    expect(row.expiresAt.getTime()).toBeGreaterThan(due.getTime() + 24 * 3600 * 1000);
    const reissued = setCookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(reissued).toBeDefined();
    expect(decodeURIComponent(reissued!.split(";")[0]!.split("=")[1]!).split(".")[0]).toBe(login.rawToken); // same token
    expect(reissued!.toLowerCase()).toContain(`max-age=${7 * 24 * 3600}`);
    // Not yet due: nothing to forward.
    expect(await refreshedSessionCookies(auth, new Headers({ cookie: login.cookie! }))).toEqual([]);
  });

  it("P09: every sign-in issues a new token and a planted cookie is never adopted", async () => {
    const planted = `${SESSION_COOKIE}=${encodeURIComponent("attacker-chosen.sig")}`;
    const claims = student();
    const first = await signIn(claims, { extraCookie: planted });
    const second = await signIn(claims);
    expect(first.rawToken).not.toBe("attacker-chosen");
    expect(first.rawToken).not.toBe(second.rawToken);
    expect(await current(planted)).toBeNull();
  });

  it("P10: on phones, the 30-day absolute maximum is enforced on the server, even for an active session", async () => {
    const login = await signIn(student());
    const hash = hashSessionToken(login.rawToken!);
    // Session policy 2026-10-26: phones keep the OI-05 limits (7-day inactivity, 30-day absolute).
    await prisma.session.update({ where: { token: hash }, data: { userAgent: IPHONE_UA } });
    const session = (await current(login.cookie))!;
    const justInside = new Date(Date.now() + SESSION_ABSOLUTE_MAX_MS - 60_000);
    // Keep the sliding expiry in the future so only the absolute cap applies.
    await prisma.session.update({
      where: { token: hash },
      // Keep the sliding expiry and the 7-day inactivity window clear, so only the absolute cap applies.
      data: { expiresAt: new Date(Date.now() + 40 * 24 * 3600 * 1000), lastActiveAt: new Date(justInside.getTime() - 3600 * 1000) },
    });
    expect(await current(login.cookie, justInside)).not.toBeNull();
    const pastCap = new Date(Date.now() + SESSION_ABSOLUTE_MAX_MS + 60_000);
    expect(await current(login.cookie, pastCap)).toBeNull();
    expect(await prisma.session.count({ where: { id: session.sessionId } })).toBe(0);
  });

  it("P18: the application-facing session view never contains a token", async () => {
    const login = await signIn(student());
    const view = await current(login.cookie);
    const json = JSON.stringify(view);
    expect(json).not.toContain(login.rawToken!);
    expect(json).not.toContain(hashSessionToken(login.rawToken!));
    expect(Object.keys(view!).sort()).toEqual(["absoluteExpiresAt", "deviceClass", "expiresAt", "idleExpiresAt", "profileComplete", "sessionId", "user"]);
  });
});

// ---------- Google sign-in, FR-AUTH-1 (OI-51) ----------

describe("Google sign-in and the @thapar.edu rule", () => {
  it.each([
    ["personal Gmail account", { email: "someone@gmail.com", hd: undefined }],
    ["lookalike domain", { email: "x@thapar.edu.evil.com", hd: "thapar.edu.evil.com" }],
    ["subdomain email", { email: "x@student.thapar.edu", hd: "thapar.edu" }],
    ["unverified email", { email: "unverified@thapar.edu", email_verified: false }],
    ["missing hd claim", { email: "nohd@thapar.edu", hd: undefined }],
  ])("P11: rejects %s with no session, no user record, and a redirect to /login", async (_label, overrides) => {
    const claims = student(overrides as Partial<GoogleClaims>);
    const result = await signIn(claims);
    expect(result.sessionSetCookie).toBeUndefined();
    expect(result.location ?? "").toMatch(/^\/login\?error=|\/login\?error=/);
    expect(
      await prisma.user.count({
        where: { email: claims.email.toLowerCase() },
      }),
    ).toBe(0);
  });

  it("P11: accepts an upper-case @THAPAR.EDU address, stores it lower-cased, role STUDENT, UUID id", async () => {
    const result = await signIn(student({ email: "Upper.Case@THAPAR.EDU" }));
    expect(result.sessionSetCookie).toBeDefined();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "upper.case@thapar.edu" },
    });
    expect(user.role).toBe("STUDENT");
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("P12: cross-origin POSTs are rejected even though NODE_ENV=test (C2)", async () => {
    expect(process.env.NODE_ENV).toBe("test");
    const login = await signIn(student());
    const res = await handle(
      auth,
      req("/api/auth/sign-out", {
        method: "POST",
        cookie: login.cookie,
        origin: "https://evil.example",
        body: {},
      }),
    );
    expect(res.status).toBe(403);
    expect(await current(login.cookie)).not.toBeNull();
  });

  it("P23: state-changing auth requests need the app's own Origin (missing, invalid, untrusted and cross-site rejected) (OI-52)", async () => {
    const login = await signIn(student());
    const cases: Record<string, string>[] = [
      {},
      { origin: "null" },
      { origin: "not a url" },
      { origin: "https://evil.example" },
      { origin: "https://sns.test.evil.example" },
      { origin: "http://sns.test" },
      { origin: BASE, "sec-fetch-site": "cross-site" },
      { origin: BASE, "sec-fetch-site": "same-site" },
    ];
    for (const extra of cases) {
      for (const [path, body] of [
        ["/api/auth/sign-out", {}],
        ["/api/auth/sign-in/social", { provider: "google", callbackURL: "/" }],
      ] as const) {
        const request = req(path, {
          method: "POST",
          cookie: login.cookie,
          body,
          ip: nextIp(),
        });
        for (const [key, value] of Object.entries(extra)) request.headers.set(key, value);
        const res = await handle(auth, request);
        expect(res.status, `${path} ${JSON.stringify(extra)}`).toBe(403);
        expect(res.headers.getSetCookie(), `${path} ${JSON.stringify(extra)}`).toEqual([]);
      }
    }
    expect(await current(login.cookie)).not.toBeNull();
    const sameOrigin = req("/api/auth/sign-out", {
      method: "POST",
      cookie: login.cookie,
      origin: BASE,
      body: {},
    });
    sameOrigin.headers.set("sec-fetch-site", "same-origin");
    expect((await handle(auth, sameOrigin)).status).toBe(200);
    expect(await current(login.cookie)).toBeNull();
  });

  it("P24: the OAuth callback is GET-only and rejects login CSRF (state not started in this browser)", async () => {
    const csrf = await signIn(student(), { dropStateCookie: true });
    expect(csrf.sessionSetCookie).toBeUndefined();
    expect(csrf.location ?? "").toMatch(/\/login\?error=/);
    const ok = await signIn(student());
    const post = await handle(
      auth,
      new Request(ok.callback.url, {
        method: "POST",
        headers: {
          cookie: ok.callback.cookie,
          origin: "https://accounts.google.com",
        },
      }),
    );
    expect(post.status).toBe(404);
  });

  it("P13: PKCE is used, tampered state is rejected, and callbacks cannot be replayed", async () => {
    const ok = await signIn(student());
    expect(stub.tokenRequests.at(-1)).toEqual({
      codeVerifierMatched: true,
      redirectUriMatched: true,
    });
    expect((await signIn(student(), { tamperState: true })).sessionSetCookie).toBeUndefined();
    const replay = await handle(
      auth,
      new Request(ok.callback.url, {
        headers: {
          cookie: ok.callback.cookie,
          "x-forwarded-for": ok.callback.ip,
        },
      }),
    );
    expect(replay.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`) && !/^[^=]+=;/.test(c))).toBe(false);
  });
});

// ---------- endpoint exposure (C3), rate limits (C5), ID-token and test sign-in ----------

describe("attack surface", () => {
  it("P15: every Better Auth endpoint outside the allow-list is unreachable at both layers", async () => {
    const paths = authEndpointPaths(buildIdentityAuth(config, prisma));
    expect(paths.length).toBeGreaterThanOrEqual(30);
    for (const path of paths.filter((p) => !(ALLOWED_AUTH_PATHS as readonly string[]).includes(p))) {
      const concrete = path.replace(/:[a-zA-Z]+/g, "x");
      for (const method of ["GET", "POST"]) {
        expect(
          (
            await handle(
              auth,
              req(`/api/auth${concrete}`, {
                method,
                origin: BASE,
                body: method === "POST" ? {} : undefined,
              }),
            )
          ).status,
          `outer ${method} ${path}`,
        ).toBe(404);
        if (!path.includes(":")) {
          // Inner layer: Better Auth's own disabledPaths, in case the outer guard were bypassed.
          expect(
            (
              await auth.handler(
                req(`/api/auth${path}`, {
                  method,
                  origin: BASE,
                  body: method === "POST" ? {} : undefined,
                }),
              )
            ).status,
            `inner ${method} ${path}`,
          ).toBe(404);
        }
      }
    }
  });

  it("P16: sign-in is rate limited with counters stored in PostgreSQL (C5)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < SIGN_IN_RATE_LIMIT.max + 2; i += 1) {
      statuses.push(
        (
          await handle(
            auth,
            req("/api/auth/sign-in/social", {
              method: "POST",
              origin: BASE,
              ip: "192.0.2.77",
              body: { provider: "google", callbackURL: "/" },
            }),
          )
        ).status,
      );
    }
    expect(statuses.slice(0, SIGN_IN_RATE_LIMIT.max).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(SIGN_IN_RATE_LIMIT.max)).toEqual([429, 429]);
    expect(await prisma.rateLimit.count()).toBeGreaterThan(0);
  });

  it("P21: Google ID-token sign-in is disabled outside E2E test configurations", async () => {
    installTestGoogleKeys();
    const res = await handle(
      auth,
      req("/api/auth/sign-in/social", {
        method: "POST",
        origin: BASE,
        ip: nextIp(),
        body: { provider: "google", idToken: { token: "x.y.z" } },
      }),
    );
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("P20: the E2E test sign-in is 404 unless enabled, and when enabled still enforces the domain rule", async () => {
    installTestGoogleKeys();
    // The test sign-in can only be enabled for an app served from this machine (config guard).
    const LOCAL = "http://127.0.0.1:3100";
    const body = (email: string, extra: Record<string, unknown> = {}, base = LOCAL) =>
      new Request(`${base}/api/test-auth/sign-in`, {
        method: "POST",
        headers: {
          origin: base,
          "content-type": "application/json",
          "x-forwarded-for": nextIp(),
        },
        body: JSON.stringify({ email, ...extra }),
      });
    expect((await testSignIn(auth, config, body("e2e@thapar.edu", {}, BASE))).status).toBe(404);
    // Fails closed: each missing condition (E2E build, loopback URL, no deployment) disables it.
    for (const overrides of <Record<string, string>[]>[
      { E2E_TEST_AUTH: "1", THAPAR_E2E_BUILD: "1" },
      { E2E_TEST_AUTH: "1", BETTER_AUTH_URL: LOCAL },
      { E2E_TEST_AUTH: "1", THAPAR_E2E_BUILD: "1", VERCEL_ENV: "production" },
    ]) {
      const disabled = makeConfig(overrides);
      expect(disabled.testSignInEnabled, JSON.stringify(overrides)).toBe(false);
      expect((await testSignIn(buildIdentityAuth(disabled, prisma), disabled, body("e2e@thapar.edu", {}, disabled.baseURL))).status).toBe(404);
    }

    const e2eConfig = makeConfig({ E2E_TEST_AUTH: "1", THAPAR_E2E_BUILD: "1", BETTER_AUTH_URL: LOCAL });
    const e2eAuth = buildIdentityAuth(e2eConfig, prisma);
    const ok = await testSignIn(e2eAuth, e2eConfig, body("E2E.Student@thapar.edu"));
    // No bypass of session security: same HttpOnly/SameSite cookie, and only the hash is stored.
    const okCookie = ok.headers.getSetCookie().find((c) => /^better-auth\.session_token=[^;]/.test(c));
    expect(okCookie).toMatch(/HttpOnly/i);
    expect(okCookie).toMatch(/SameSite=Lax/i);
    const okToken = decodeURIComponent(okCookie!.split(";")[0]!.split("=")[1]!).split(".")[0]!;
    rawTokens.add(okToken);
    expect(await prisma.session.count({ where: { token: okToken } })).toBe(0);
    expect(await prisma.session.count({ where: { token: hashSessionToken(okToken) } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "e2e.student@thapar.edu" } })).role).toBe("STUDENT");
    for (const [email, extra] of [
      ["e2e@gmail.com", { hd: "gmail.com" }],
      ["unverified@thapar.edu", { emailVerified: false }],
      ["x@thapar.edu.evil.com", { hd: "thapar.edu.evil.com" }],
    ] as const) {
      const res = await testSignIn(e2eAuth, e2eConfig, body(email, extra));
      expect(
        res.headers.getSetCookie().some((c) => /^(__Secure-)?better-auth\.session_token=[^;]/.test(c)),
        email,
      ).toBe(false);
    }
    const crossOrigin = new Request(`${LOCAL}/api/test-auth/sign-in`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect((await testSignIn(e2eAuth, e2eConfig, crossOrigin)).status).toBe(403);
    const noOrigin = body("e2e@thapar.edu");
    noOrigin.headers.delete("origin");
    expect((await testSignIn(e2eAuth, e2eConfig, noOrigin)).status).toBe(403);
    const crossSite = body("e2e@thapar.edu");
    crossSite.headers.set("sec-fetch-site", "cross-site");
    expect((await testSignIn(e2eAuth, e2eConfig, crossSite)).status).toBe(403);
  });
});

// ---------- whole-suite audits (run last) ----------

describe("audits", () => {
  it("P14: no raw session token ever reached the database adapter", () => {
    expect(rawTokens.size).toBeGreaterThan(10);
    for (const raw of rawTokens)
      expect(
        adapterCalls.some((call) => call.includes(raw)),
        "raw token reached the adapter",
      ).toBe(false);
  });

  it("P19: logs contain no session tokens, hashes or rejected email addresses (C7)", () => {
    const all = logged.join("\n");
    for (const raw of rawTokens) {
      expect(all.includes(raw)).toBe(false);
      expect(all.includes(hashSessionToken(raw))).toBe(false);
    }
    expect(all).not.toMatch(/someone@gmail\.com|unverified@thapar\.edu/);
  });
});

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MINUTE = 60_000;

describe("session policy 2026-10-26: desktop 30-minute inactivity and 12-hour limit, phones persistent", () => {
  const setSession = (rawToken: string, data: { userAgent?: string; lastActiveAt?: Date; createdAt?: Date }) => prisma.session.update({ where: { token: hashSessionToken(rawToken) }, data });

  it("SP01: a desktop session ends after 30 minutes without activity and is removed on the server", async () => {
    const login = await signIn(student());
    await setSession(login.rawToken!, { userAgent: DESKTOP_UA, lastActiveAt: new Date(Date.now() - 29 * MINUTE) });
    const view = await current(login.cookie);
    expect(view?.deviceClass).toBe("desktop");
    await setSession(login.rawToken!, { lastActiveAt: new Date(Date.now() - 31 * MINUTE) });
    expect(await current(login.cookie)).toBeNull();
    expect(await prisma.session.count({ where: { token: hashSessionToken(login.rawToken!) } })).toBe(0);
  });

  it("SP02: user activity extends the inactivity limit; background reads do not; neither extends the 12-hour limit", async () => {
    const login = await signIn(student());
    const old = new Date(Date.now() - 20 * MINUTE);
    await setSession(login.rawToken!, { userAgent: DESKTOP_UA, lastActiveAt: old });
    await current(login.cookie); // a background read (no touch)
    expect((await prisma.session.findUniqueOrThrow({ where: { token: hashSessionToken(login.rawToken!) } })).lastActiveAt.getTime()).toBe(old.getTime());
    const touched = (await current(login.cookie, new Date(), { touch: true }))!;
    expect(touched.idleExpiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * MINUTE);
    // Eleven hours and fifty-nine minutes after sign-in, activity cannot push past the 12-hour mark.
    const created = new Date(Date.now() - (12 * 60 - 1) * MINUTE);
    await setSession(login.rawToken!, { createdAt: created, lastActiveAt: new Date(Date.now() - MINUTE) });
    const nearEnd = (await current(login.cookie, new Date(), { touch: true }))!;
    expect(nearEnd.absoluteExpiresAt.getTime()).toBe(created.getTime() + 12 * 60 * MINUTE);
    expect(nearEnd.idleExpiresAt.getTime()).toBeLessThanOrEqual(nearEnd.absoluteExpiresAt.getTime());
    await setSession(login.rawToken!, { createdAt: new Date(Date.now() - (12 * 60 + 1) * MINUTE), lastActiveAt: new Date() });
    expect(await current(login.cookie, new Date(), { touch: true })).toBeNull();
  });

  it("SP03: a phone stays signed in through two days without activity", async () => {
    const login = await signIn(student());
    await setSession(login.rawToken!, { userAgent: IPHONE_UA, lastActiveAt: new Date(Date.now() - 2 * 24 * 60 * MINUTE), createdAt: new Date(Date.now() - 3 * 24 * 60 * MINUTE) });
    const view = await current(login.cookie);
    expect(view?.deviceClass).toBe("mobile");
    await setSession(login.rawToken!, { lastActiveAt: new Date(Date.now() - 8 * 24 * 60 * MINUTE) });
    expect(await current(login.cookie)).toBeNull();
  });

  it("SP04: protected APIs refuse an ended session with 401; changes count as activity, background calls do not", async () => {
    const login = await signIn(student());
    const deps: ApiDeps = { baseURL: BASE, readSession: (headers, options) => readCurrentSession(auth, prisma, headers, new Date(), options), limiter: async () => ({ allowed: true, retryAfterSeconds: 0 }), clientAddress: () => "198.51.100.200" };
    const request = (method: string) => new Request(`${BASE}/api/test`, { method, headers: { cookie: login.cookie!, origin: BASE, "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
    const ok = async () => ({ ok: true as const, value: { done: true } });
    await prisma.user.update({ where: { email: (await prisma.session.findUniqueOrThrow({ where: { token: hashSessionToken(login.rawToken!) }, select: { user: { select: { email: true } } } })).user.email }, data: { name: "Profile Done", rollNumber: `SP${Date.now()}`.slice(0, 15), branchCode: "COE", year: 2, profileCompletedAt: new Date() } });
    const old = new Date(Date.now() - 10 * MINUTE);
    await setSession(login.rawToken!, { userAgent: DESKTOP_UA, lastActiveAt: old });
    const lastActive = async () => (await prisma.session.findUniqueOrThrow({ where: { token: hashSessionToken(login.rawToken!) } })).lastActiveAt.getTime();
    expect((await runAction(deps, request("POST"), { name: "test:bg", rules: { perAddress: { window: 60, max: 999 }, perUser: { window: 60, max: 999 } }, body: true, activity: false, run: ok })).status).toBe(200);
    expect(await lastActive()).toBe(old.getTime());
    expect((await runAction(deps, request("GET"), { name: "test:read", rules: { perAddress: { window: 60, max: 999 }, perUser: { window: 60, max: 999 } }, run: ok })).status).toBe(200);
    expect(await lastActive()).toBe(old.getTime());
    expect((await runAction(deps, request("POST"), { name: "test:change", rules: { perAddress: { window: 60, max: 999 }, perUser: { window: 60, max: 999 } }, body: true, run: ok })).status).toBe(200);
    expect(await lastActive()).toBeGreaterThan(old.getTime());
    await setSession(login.rawToken!, { lastActiveAt: new Date(Date.now() - 31 * MINUTE) });
    expect((await runAction(deps, request("POST"), { name: "test:change", rules: { perAddress: { window: 60, max: 999 }, perUser: { window: 60, max: 999 } }, body: true, run: ok })).status).toBe(401);
  });

  it("SP05: signing out everywhere ends the other sessions on their next request", async () => {
    const claims = student();
    const a = await signIn(claims);
    const b = await signIn(claims);
    const view = (await current(a.cookie))!;
    expect(await current(b.cookie)).not.toBeNull();
    await revokeOtherSessions(prisma, { userId: view.user.id, sessionId: view.sessionId });
    expect(await current(b.cookie)).toBeNull();
    expect(await current(a.cookie)).not.toBeNull();
  });
});

