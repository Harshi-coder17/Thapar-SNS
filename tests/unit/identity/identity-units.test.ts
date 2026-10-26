import { describe, expect, it } from "vitest";

import { parseIdentityConfig } from "@/modules/identity/config";
import { HASHED_TOKEN_MARKER, hashSessionToken, withHashedSessionTokens } from "@/modules/identity/hashed-session-adapter";
import { evaluateIdentity } from "@/modules/identity/identity-policy";
import { isAllowedAuthRequest } from "@/modules/identity/request-guard";
import { isWithinAbsoluteLifetime, SESSION_ABSOLUTE_MAX_MS } from "@/modules/identity/session-policy";
import { describeSignInError, GENERIC_SIGN_IN_ERROR } from "@/modules/identity/sign-in-errors";

const SECRET = "s".repeat(40);
const base = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: SECRET,
  AUTH_ALLOWED_EMAIL_DOMAIN: "thapar.edu",
};

describe("identity configuration guards", () => {
  it("parses a local configuration without Google credentials", () => {
    const config = parseIdentityConfig(base);
    expect(config.google).toBeNull();
    expect(config.secureCookies).toBe(false);
    expect(config.testSignInEnabled).toBe(false);
  });

  it("treats empty values as missing and names keys without echoing values", () => {
    expect(() => parseIdentityConfig({ ...base, BETTER_AUTH_SECRET: "  " })).toThrow("Invalid or missing identity configuration: BETTER_AUTH_SECRET");
    try {
      parseIdentityConfig({ ...base, BETTER_AUTH_SECRET: "too-short-secret" });
    } catch (error) {
      expect(String(error)).not.toContain("too-short-secret");
    }
  });

  it("requires both Google credentials or neither", () => {
    expect(() => parseIdentityConfig({ ...base, GOOGLE_CLIENT_ID: "id" })).toThrow(/both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);
    expect(
      parseIdentityConfig({
        ...base,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
      }).google,
    ).toEqual({ clientId: "id", clientSecret: "secret" });
  });

  describe("E2E test sign-in fails closed (OI-53)", () => {
    const e2e = { ...base, BETTER_AUTH_URL: "http://127.0.0.1:3100", E2E_TEST_AUTH: "1", THAPAR_E2E_BUILD: "1" };
    const enabled = (overrides: Record<string, string | undefined>) => parseIdentityConfig({ ...e2e, ...overrides }).testSignInEnabled;

    it("is enabled only in an E2E build, with the flag, on a loopback URL, off any deployment", () => {
      expect(enabled({})).toBe(true);
      expect(enabled({ BETTER_AUTH_URL: "http://localhost:3000" })).toBe(true);
    });

    it.each([
      ["no E2E build", { THAPAR_E2E_BUILD: undefined }],
      ["normal build", { THAPAR_E2E_BUILD: "0" }],
      ["flag missing", { E2E_TEST_AUTH: undefined }],
      ["flag not exactly 1", { E2E_TEST_AUTH: "true" }],
      ["production deployment", { VERCEL_ENV: "production", BETTER_AUTH_URL: "https://sns.example" }],
      ["preview deployment", { VERCEL_ENV: "preview", BETTER_AUTH_URL: "https://sns.example" }],
      ["public https URL", { BETTER_AUTH_URL: "https://sns.example" }],
      ["private network URL", { BETTER_AUTH_URL: "http://10.0.0.5:3000" }],
      ["lookalike localhost host", { BETTER_AUTH_URL: "http://localhost.evil.example" }],
    ])("stays disabled with %s", (_label, overrides) => {
      expect(enabled(overrides)).toBe(false);
    });
  });

  it("parses ADMIN_EMAILS (OI-09) and accepts only addresses in the allowed domain", () => {
    expect(parseIdentityConfig({ ...base, ADMIN_EMAILS: " A.Admin@Thapar.edu , b.admin@thapar.edu ," }).adminEmails).toEqual(["a.admin@thapar.edu", "b.admin@thapar.edu"]);
    expect(parseIdentityConfig(base).adminEmails).toEqual([]);
    for (const bad of ["someone@gmail.com", "x@thapar.edu.evil.com", "not-an-email", "a@b@thapar.edu"]) {
      expect(() => parseIdentityConfig({ ...base, ADMIN_EMAILS: bad }), bad).toThrow(/ADMIN_EMAILS must list @thapar\.edu addresses/);
    }
  });

  it("requires https on deployments and uses Secure cookies with https", () => {
    expect(() => parseIdentityConfig({ ...base, VERCEL_ENV: "preview" })).toThrow(/https/);
    expect(
      parseIdentityConfig({
        ...base,
        BETTER_AUTH_URL: "https://sns.example",
        VERCEL_ENV: "preview",
      }).secureCookies,
    ).toBe(true);
  });

  it("requires thapar.edu in production (FR-AUTH-1)", () => {
    expect(() =>
      parseIdentityConfig({
        ...base,
        BETTER_AUTH_URL: "https://sns.example",
        VERCEL_ENV: "production",
        AUTH_ALLOWED_EMAIL_DOMAIN: "example.edu",
      }),
    ).toThrow(/thapar\.edu in production/);
    expect(
      parseIdentityConfig({
        ...base,
        BETTER_AUTH_URL: "https://sns.example",
        VERCEL_ENV: "production",
        AUTH_ALLOWED_EMAIL_DOMAIN: "THAPAR.EDU",
      }).allowedDomain,
    ).toBe("thapar.edu");
  });
});

describe("identity policy (FR-AUTH-1, OI-51)", () => {
  it.each([
    ["a@thapar.edu", true, true],
    ["  Mixed.Case@THAPAR.EDU ", true, true],
    ["a@gmail.com", true, false],
    ["a@thapar.edu.evil.com", true, false],
    ["a@student.thapar.edu", true, false],
    ["a@evilthapar.edu", true, false],
    ["a@b@thapar.edu", true, false],
    ["a@thapar.edu", false, false],
    ["a@thapar.edu", "true", false],
    ["", true, false],
  ])("evaluateIdentity(%j, verified=%j) -> allowed=%s", (email, emailVerified, allowed) => {
    expect(evaluateIdentity({ email, emailVerified }, "thapar.edu").allowed).toBe(allowed);
  });

  it("returns the lower-cased email", () => {
    expect(evaluateIdentity({ email: "X.Y@Thapar.Edu", emailVerified: true }, "thapar.edu")).toEqual({ allowed: true, email: "x.y@thapar.edu" });
  });
});

describe("session absolute lifetime (OI-05)", () => {
  const created = new Date("2026-10-01T00:00:00Z");
  it("allows sessions younger than 30 days and rejects at exactly 30 days", () => {
    expect(isWithinAbsoluteLifetime(created, new Date(created.getTime() + SESSION_ABSOLUTE_MAX_MS - 1))).toBe(true);
    expect(isWithinAbsoluteLifetime(created, new Date(created.getTime() + SESSION_ABSOLUTE_MAX_MS))).toBe(false);
  });
});

describe("auth request allow-list (C3)", () => {
  it.each([
    ["POST", "/api/auth/sign-in/social", true, true],
    ["POST", "/api/auth/sign-in/social", false, false],
    ["GET", "/api/auth/sign-in/social", true, false],
    ["GET", "/api/auth/callback/google", true, true],
    ["POST", "/api/auth/callback/google", true, false],
    ["GET", "/api/auth/callback/github", true, false],
    ["POST", "/api/auth/sign-out", false, true],
    ["GET", "/api/auth/get-session", true, false],
    ["POST", "/api/auth/list-sessions", true, false],
    ["POST", "/api/auth/reset-password/abc", true, false],
    ["GET", "/api/auth/get-access-token", true, false],
    ["POST", "/api/auth/update-user", true, false],
    ["GET", "/api/other", true, false],
  ])("%s %s (google configured=%s) -> allowed=%s", (method, path, google, allowed) => {
    expect(isAllowedAuthRequest(method, path, google)).toBe(allowed);
  });
});

describe("sign-in error messages", () => {
  it("maps known codes and falls back to a generic message", () => {
    expect(describeSignInError("unable_to_create_user")).toMatch(/@thapar\.edu/);
    expect(describeSignInError("something_else")).toBe(GENERIC_SIGN_IN_ERROR);
    expect(describeSignInError(undefined)).toBeNull();
  });
});

describe("hashed session adapter", () => {
  type Call = { method: string; args: Record<string, unknown> };
  function fakeAdapter(extra: Record<string, unknown> = {}) {
    const calls: Call[] = [];
    const record = (method: string) => async (args: Record<string, unknown>) => {
      calls.push({ method, args });
      if (method === "create") return { id: "s1", ...(args.data as object) };
      if (method === "findMany") return [{ id: "s1", token: "stored-hash-without-raw" }];
      return {
        id: "s1",
        token: (args.where as Array<{ value: unknown }>)?.[0]?.value,
      };
    };
    const adapter: Record<string, unknown> = {
      id: "fake",
      create: record("create"),
      findOne: record("findOne"),
      findMany: record("findMany"),
      count: record("count"),
      update: record("update"),
      updateMany: record("updateMany"),
      delete: record("delete"),
      deleteMany: record("deleteMany"),
      consumeOne: record("consumeOne"),
      incrementOne: record("incrementOne"),
      transaction: async (cb: (trx: unknown) => Promise<unknown>) => cb(adapter),
      ...extra,
    };
    return { adapter, calls };
  }
  const wrap = (adapter: Record<string, unknown>) =>
    withHashedSessionTokens(() => adapter as never)({} as never) as unknown as Record<string, (args: unknown) => Promise<unknown>>;

  it("stores the hash on create and returns the raw token to Better Auth", async () => {
    const { adapter, calls } = fakeAdapter();
    const result = (await wrap(adapter).create!({
      model: "session",
      data: { token: "raw-token" },
    })) as { token: string };
    expect(calls[0]?.args.data).toEqual({
      token: hashSessionToken("raw-token"),
    });
    expect(result.token).toBe("raw-token");
  });

  it("hashes token filters (eq and in) and leaves other models alone", async () => {
    const { adapter, calls } = fakeAdapter();
    const w = wrap(adapter);
    await w.findOne!({
      model: "session",
      where: [{ field: "token", value: "raw" }],
    });
    await w.deleteMany!({
      model: "session",
      where: [{ field: "token", operator: "in", value: ["a", "b"] }],
    });
    await w.findOne!({
      model: "user",
      where: [{ field: "token", value: "not-a-session" }],
    });
    expect((calls[0]?.args.where as Array<{ value: unknown }>)[0]?.value).toBe(hashSessionToken("raw"));
    expect((calls[1]?.args.where as Array<{ value: unknown }>)[0]?.value).toEqual([hashSessionToken("a"), hashSessionToken("b")]);
    expect((calls[2]?.args.where as Array<{ value: unknown }>)[0]?.value).toBe("not-a-session");
  });

  it("marks stored hashes it cannot map back, and hashes marked values again (never matches)", async () => {
    const { adapter, calls } = fakeAdapter();
    const w = wrap(adapter);
    const listed = (await w.findMany!({
      model: "session",
      where: [{ field: "userId", value: "u1" }],
    })) as Array<{ token: string }>;
    expect(listed[0]?.token).toBe(`${HASHED_TOKEN_MARKER}stored-hash-without-raw`);
    await w.findOne!({
      model: "session",
      where: [{ field: "token", value: listed[0]!.token }],
    });
    expect((calls[1]?.args.where as Array<{ value: unknown }>)[0]?.value).toBe(hashSessionToken(listed[0]!.token));
  });

  it("rejects pattern operators on the token and sessions without a token", async () => {
    const w = wrap(fakeAdapter().adapter);
    await expect(
      w.findMany!({
        model: "session",
        where: [{ field: "token", operator: "starts_with", value: "x" }],
      }),
    ).rejects.toThrow(/not allowed/);
    await expect(w.create!({ model: "session", data: { userId: "u1" } })).rejects.toThrow(/without a token/);
  });

  it("wraps the transaction adapter too", async () => {
    const { adapter, calls } = fakeAdapter();
    await wrap(adapter).transaction!(async (trx: unknown) =>
      (trx as Record<string, (a: unknown) => Promise<unknown>>).findOne!({
        model: "session",
        where: [{ field: "token", value: "raw" }],
      }),
    );
    expect((calls[0]?.args.where as Array<{ value: unknown }>)[0]?.value).toBe(hashSessionToken("raw"));
  });

  it("fails closed on adapter members it has not reviewed", () => {
    expect(() => wrap(fakeAdapter({ upsert: async () => null }).adapter)).toThrow(/unreviewed adapter members upsert/);
  });
});
