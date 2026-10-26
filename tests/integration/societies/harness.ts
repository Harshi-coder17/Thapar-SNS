// Shared setup for the societies integration suites: PostgreSQL 17.9 in a container with the
// committed migrations, the real identity module (test sign-in through Better Auth's ID-token path)
// and the real societies HTTP handlers.
import { ownedAssetFor } from "@/modules/assets/service";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { expect, vi } from "vitest";

import { clientAddress, createDatabaseRateLimiter } from "@/modules/identity/api-rate-limit";
import type { IdentityAuth } from "@/modules/identity/auth";
import { type IdentityConfig, parseIdentityConfig } from "@/modules/identity/config";
import { findUserByEmail, getUserSummaries } from "@/modules/identity/directory";
import { completeProfile, getProfileOptions } from "@/modules/identity/profile";
import { buildIdentityAuth } from "@/modules/identity/runtime";
import { readCurrentSession } from "@/modules/identity/sessions";
import { installTestGoogleKeys } from "@/modules/identity/test-google";
import { testSignIn } from "@/modules/identity/test-sign-in";
import { type SocietiesHandlers, societiesHandlers, type SocietiesHttpDeps } from "@/modules/societies/http";
import type { Actor, IdentityPort } from "@/modules/societies/service";
import { createDbClient, type PrismaClient } from "@/shared/db/client";

import { applyMigrations } from "../../support/migrations";

export const POSTGRES_IMAGE = "postgres:17.9-alpine@sha256:c7526c0f6c3f30260a563d7bcf8ad778effac59a44f8ffa86678c35418338609";
const BASE = "http://127.0.0.1:3100";

export interface TestUser {
  email: string;
  id: string;
  cookie: string;
}

export interface Harness {
  prisma: PrismaClient;
  identity: IdentityPort;
  deps: SocietiesHttpDeps;
  /** Handlers with the real PostgreSQL rate limiter at 100 times the limits (many requests per test). */
  api: SocietiesHandlers;
  user(email: string, options?: { completeProfile?: boolean }): Promise<TestUser>;
  /** A same-origin API request. `as: "admin"` asks for the platform-admin capacity (`?as=admin`). */
  req(cookie: string | undefined, method: string, body?: unknown, options?: { as?: "admin" }): Request;
  json(response: Response): Promise<Record<string, unknown> & { error?: { code: string; message: string; fields?: Record<string, string> } }>;
  actorOf(user: TestUser): Promise<Actor>;
  stop(): Promise<void>;
}

export async function startHarness(adminEmails: string): Promise<Harness> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  await applyMigrations(container.getConnectionUri());
  const prisma = createDbClient(container.getConnectionUri());
  installTestGoogleKeys();
  const config: IdentityConfig = parseIdentityConfig({
    BETTER_AUTH_URL: BASE,
    BETTER_AUTH_SECRET: "h".repeat(40),
    AUTH_ALLOWED_EMAIL_DOMAIN: "thapar.edu",
    GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    E2E_TEST_AUTH: "1",
    THAPAR_E2E_BUILD: "1",
    ADMIN_EMAILS: adminEmails,
  });
  const auth: IdentityAuth = buildIdentityAuth(config, prisma);
  const identity: IdentityPort = {
    userByEmail: (email) => findUserByEmail(prisma, email),
    userSummaries: (ids) => getUserSummaries(prisma, ids),
    activeBranches: async () => (await getProfileOptions(prisma)).branches,
  };
  const deps: SocietiesHttpDeps = { prisma, baseURL: BASE, identity, readSession: (headers) => readCurrentSession(auth, prisma, headers), limiter: createDatabaseRateLimiter(prisma), clientAddress, ownedAsset: (userId, assetId, purpose) => ownedAssetFor(prisma, userId, assetId, purpose) };
  const real = createDatabaseRateLimiter(prisma);
  const api = societiesHandlers({ ...deps, limiter: (key, rule, now) => real(key, { ...rule, max: rule.max * 100 }, now) });
  for (const level of ["error", "warn"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);

  let ip = 0;
  let roll = 0;
  let requestIp = 0;
  return {
    prisma,
    identity,
    deps,
    api,
    async user(email, options = {}) {
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
        const done = await completeProfile(prisma, row.id, { name: email.split("@")[0], rollNumber: `HD${String(roll).padStart(7, "0")}`, branchCode: "COE", year: 2, tags: ["python", "rust", "robotics"] });
        expect(done.ok, email).toBe(true);
      }
      return { email, id: row.id, cookie: cookie! };
    },
    req(cookie, method, body, options) {
      requestIp += 1;
      const headers = new Headers({ "content-type": "application/json", origin: BASE, "x-forwarded-for": `203.0.113.${requestIp % 250}` });
      if (cookie) headers.set("cookie", cookie);
      return new Request(`${BASE}/api/societies${options?.as === "admin" ? "?as=admin" : ""}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    },
    json: async (response) => (await response.json()) as Record<string, unknown> & { error?: { code: string; message: string; fields?: Record<string, string> } },
    async actorOf(u) {
      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { role: true } });
      return { userId: u.id, globalRole: row.role };
    },
    async stop() {
      vi.restoreAllMocks();
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
