import "server-only";

// HTTP handlers for the identity API (docs/api/identity.md). Order for every request: strict
// Origin check for state-changing methods (OI-52), per-address rate limit, session, per-user rate
// limit, then the service (which re-checks permissions from the database). Fails closed: if the
// rate-limit store, the session lookup or the permission lookup is unavailable, the request is
// refused (503) and nothing is changed.
import type { PrismaClient } from "@/shared/db/client";
import { jsonError, rejectCrossOrigin } from "@/shared/http/responses";

import { adminRevokeSessions } from "./admin-sessions";
import { clientAddress, createDatabaseRateLimiter, IDENTITY_API_LIMITS, type RateLimiter, type RateRule } from "./api-rate-limit";
import type { IdentityAuth } from "./auth";
import type { IdentityConfig } from "./config";
import { completeProfile } from "./profile";
import { logIdentityError } from "./safe-log";
import { type CurrentSession, readCurrentSession } from "./sessions";

export interface IdentityHttpDeps {
  auth: IdentityAuth;
  prisma: PrismaClient;
  config: Pick<IdentityConfig, "baseURL">;
  /** Defaults to the PostgreSQL limiter; tests inject failures. */
  limiter?: RateLimiter;
}

const NO_STORE = { "cache-control": "no-store" };
const unauthenticated = () => jsonError(401, "UNAUTHENTICATED", "Sign in to continue.");
const unavailable = () => jsonError(503, "UNAVAILABLE", "The service is temporarily unavailable. Please try again.");
const readJson = (request: Request) => request.json().catch(() => undefined) as Promise<unknown>;

class Refused {
  constructor(readonly response: Response) {}
}

async function limit(deps: IdentityHttpDeps, key: string, rule: RateRule): Promise<void> {
  const limiter = deps.limiter ?? createDatabaseRateLimiter(deps.prisma);
  const decision = await limiter(key, rule);
  if (!decision.allowed) {
    const response = jsonError(429, "RATE_LIMITED", "Too many requests. Please wait and try again.");
    response.headers.set("retry-after", String(decision.retryAfterSeconds));
    throw new Refused(response);
  }
}

/** Runs a handler step by step; any refusal becomes its response, any failure a safe 503 (C7 logging). */
async function guarded(name: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Refused) return error.response;
    logIdentityError(`${name} failed`, error);
    return unavailable();
  }
}

async function requireSession(deps: IdentityHttpDeps, request: Request): Promise<CurrentSession> {
  const session = await readCurrentSession(deps.auth, deps.prisma, request.headers);
  if (!session) throw new Refused(unauthenticated());
  return session;
}

function requireSameOrigin(deps: IdentityHttpDeps, request: Request): void {
  const rejected = rejectCrossOrigin(request, deps.config.baseURL);
  if (rejected) throw new Refused(rejected);
}

/** GET /api/identity/me: the signed-in user (never a token or roll number), or 401. */
export function handleMe(deps: IdentityHttpDeps, request: Request): Promise<Response> {
  return guarded("me", async () => {
    await limit(deps, `me:addr:${clientAddress(request.headers)}`, IDENTITY_API_LIMITS.me.perAddress);
    const session = await requireSession(deps, request);
    return Response.json({ user: session.user, profileComplete: session.profileComplete }, { headers: NO_STORE });
  });
}

/** POST /api/identity/profile: first-time profile completion (FR-AUTH-2). */
export function handleCompleteProfile(deps: IdentityHttpDeps, request: Request): Promise<Response> {
  return guarded("profile", async () => {
    requireSameOrigin(deps, request);
    const rules = IDENTITY_API_LIMITS.profile;
    await limit(deps, `profile:addr:${clientAddress(request.headers)}`, rules.perAddress);
    const session = await requireSession(deps, request);
    await limit(deps, `profile:user:${session.user.id}`, rules.perUser);
    const result = await completeProfile(deps.prisma, session.user.id, await readJson(request));
    if (result.ok) return Response.json({ ok: true }, { headers: NO_STORE });
    switch (result.code) {
      case "VALIDATION":
        return jsonError(400, "VALIDATION", "Check the highlighted fields.", result.fields);
      case "ROLL_NUMBER_TAKEN":
        return jsonError(409, "ROLL_NUMBER_TAKEN", "This roll number is already registered.", { rollNumber: "This roll number is already registered." });
      case "ALREADY_COMPLETED":
        return jsonError(409, "ALREADY_COMPLETED", "Your profile is already complete.");
    }
  });
}

/** POST /api/identity/admin/sessions/revoke: admin revokes a user's sessions or one session (FR-AUTH-4). */
export function handleAdminRevoke(deps: IdentityHttpDeps, request: Request): Promise<Response> {
  return guarded("admin revoke", async () => {
    requireSameOrigin(deps, request);
    const rules = IDENTITY_API_LIMITS.adminRevoke;
    await limit(deps, `admin-revoke:addr:${clientAddress(request.headers)}`, rules.perAddress);
    const session = await requireSession(deps, request);
    await limit(deps, `admin-revoke:user:${session.user.id}`, rules.perUser);
    // The ADMIN role is re-read from the database inside the service on every request.
    const result = await adminRevokeSessions(deps.prisma, { userId: session.user.id }, await readJson(request));
    if (result.ok) return Response.json({ revoked: result.revoked }, { headers: NO_STORE });
    switch (result.code) {
      case "FORBIDDEN":
        return jsonError(403, "FORBIDDEN", "Administrator access is required.");
      case "VALIDATION":
        return jsonError(400, "VALIDATION", "Send either userId or sessionId.");
      case "NOT_FOUND":
        return jsonError(404, "NOT_FOUND", "No such user or session.");
    }
  });
}
