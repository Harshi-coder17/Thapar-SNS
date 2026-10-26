import "server-only";

// Public interface of the identity module (docs/architecture/modules.md). Other code imports only
// from this file.
import { getDb } from "@/shared/db/client";
import { type ApiDeps, RATE, runAction } from "@/shared/http/api-action";

import { banUser, changeRole } from "./admin-users";
import { listUsersForAdmin, sessionsByUser, setUserBan, setUserRole, userCounts } from "./accounts";
import { clientAddress, createDatabaseRateLimiter, type RateLimiter } from "./api-rate-limit";
import { findUserByEmail, getStudentFacts, getUserSkillSlugs, getUserSummaries } from "./directory";
import { handleAdminRevoke, handleCompleteProfile, handleMe, type IdentityHttpDeps } from "./http";
import { getProfileOptions, getPublicProfile, MAX_SKILL_TAGS, MIN_SKILL_TAGS, updateProfile } from "./profile";
import { dispatchAuthRequest } from "./request-guard";
import { logIdentityError } from "./safe-log";
import { getIdentityRuntime } from "./runtime";
import { deleteStaleSessions, readCurrentSession, type ReadSessionOptions, refreshedSessionCookies, revokeAllSessionsForUser, revokeOtherSessions, revokeSessionById } from "./sessions";

export type { CurrentSession, ReadSessionOptions } from "./sessions";
export type { ProfileOptions, PublicProfile } from "./profile";
export type { UserSummary } from "./directory";
export type { RateLimitDecision, RateLimiter, RateRule } from "./api-rate-limit";
export { MAX_SKILL_TAGS, MIN_SKILL_TAGS };
export { describeSignInError } from "./sign-in-errors";

/** The signed-in user's session, read on the server, or null. Enforces the 30-day absolute cap. */
export async function getCurrentSession(headers: Headers, options?: ReadSessionOptions) {
  const { auth } = getIdentityRuntime();
  return readCurrentSession(auth, getDb(), headers, new Date(), options);
}

/** The app's public origin (BETTER_AUTH_URL), used by other modules for the strict Origin check (OI-52). */
export const appBaseURL = (): string => getIdentityRuntime().config.baseURL;

/** True when Google OAuth credentials are configured on this server. */
export function isGoogleSignInConfigured(): boolean {
  try {
    return getIdentityRuntime().config.google !== null;
  } catch {
    return false; // missing or invalid identity configuration: sign-in is unavailable
  }
}

/** Handles /api/auth/*: only allow-listed requests reach Better Auth (C3). */
export async function handleAuthRequest(request: Request): Promise<Response> {
  const { auth, config } = getIdentityRuntime();
  return dispatchAuthRequest(auth, config, request);
}

function httpDeps(): IdentityHttpDeps {
  const { auth, config } = getIdentityRuntime();
  return { auth, config, prisma: getDb() };
}

/** Route handlers for /api/identity/* (docs/api/identity.md). */
export const handleMeRequest = (request: Request) => handleMe(httpDeps(), request);
export const handleCompleteProfileRequest = (request: Request) => handleCompleteProfile(httpDeps(), request);
export const handleAdminRevokeRequest = (request: Request) => handleAdminRevoke(httpDeps(), request);

/** Active branches and skill tags for the profile form (FR-AUTH-2). */
export const profileOptions = () => getProfileOptions(getDb());

/** UCD-2 / OI-35: one public profile (no roll number, no email), or null. */
export const publicProfile = (userId: string) => getPublicProfile(getDb(), userId);

/** PATCH /api/identity/profile: the owner edits name, branch, year and skills (OI-35). */
export const handleUpdateProfileRequest = (request: Request) =>
  runAction(apiDeps(), request, {
    name: "identity:profile",
    rules: RATE.write,
    body: true,
    run: async (actor, body) => {
      const result = await updateProfile(getDb(), actor.userId, body);
      return result.ok ? { ok: true, value: undefined } : { ok: false, code: "VALIDATION", fields: result.fields };
    },
  });

/** Public profiles of users, by id (OI-27: no roll number, no email). */
export const userSummaries = (ids: readonly string[]) => getUserSummaries(getDb(), ids);
/** Skill tag slugs of users (public profile data), e.g. for Find Mates match scores. */
export const userSkillSlugs = (ids: readonly string[]) => getUserSkillSlugs(getDb(), ids);
/** A user who has signed in at least once, by email; used by admin actions (e.g. appointing a Head). */
export const userByEmail = (email: string) => findUserByEmail(getDb(), email);
/** A student's year and branch code (recruitment eligibility). */
export const studentFacts = (userId: string) => getStudentFacts(getDb(), userId);

/**
 * Shared API rate limiter for other modules' route handlers. Counters live in the identity module's
 * rate-limit table (fixed windows, atomic upsert); callers prefix their keys with their module name
 * and must fail closed if it throws.
 */
export const apiRateLimiter = (): RateLimiter => createDatabaseRateLimiter(getDb());
export { clientAddress };

/**
 * Everything a module's route handler needs for the shared request guard (src/shared/http/api-action.ts):
 * the app origin for the Origin check, the server-side session reader, the shared rate limiter and the
 * client address. Sessions and roles are always read from the database.
 */
export function apiDeps(): ApiDeps {
  return { baseURL: appBaseURL(), readSession: getCurrentSession, limiter: apiRateLimiter(), clientAddress };
}

/** Account administration (Slice 5, ADR-0010). Pass the caller's transaction so the audit entry commits with it. */
export { setUserBan, setUserRole };
export type { AdminSessionRow, AdminUserRow, UserRole } from "./accounts";
export const adminSessionsByUser = (userIds: string[]) => sessionsByUser(getDb(), userIds);
export const listUsers = (q?: string) => listUsersForAdmin(getDb(), q);
export const accountCounts = (since: Date) => userCounts(getDb(), since);
/** Housekeeping job: sessions past the sliding expiry or the 30-day cap. */
export const purgeStaleSessions = (now?: Date) => deleteStaleSessions(getDb(), now);

/** FR-AUTH-4 and "sign out other devices": server-side revocation by session id. */
export const revokeSession = (sessionId: string) => revokeSessionById(getDb(), sessionId);
export const revokeAllSessions = (userId: string) => revokeAllSessionsForUser(getDb(), userId);
export const revokeOtherSessionsOf = (current: { userId: string; sessionId: string }) => revokeOtherSessions(getDb(), current);

/** True when the request carries a Better Auth session cookie (cheap check; no database access). */
export function hasSessionCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) => name === "better-auth.session_token" || name === "__Secure-better-auth.session_token");
}

/** Set-Cookie values that slide the session cookie with its database expiry (used by the proxy). */
export async function sessionCookieRefresh(headers: Headers): Promise<string[]> {
  try {
    return await refreshedSessionCookies(getIdentityRuntime().auth, headers);
  } catch (error) {
    logIdentityError("session cookie refresh failed", error);
    return []; // the page itself re-validates the session; never block rendering here
  }
}

/** Route handlers for /api/admin/users/* (platform capacity: ?as=admin). */
export const adminUsersApi = {
  ban: (request: Request, userId: string) => runAction(apiDeps(), request, { name: "admin:ban", rules: RATE.admin, ids: [userId], body: true, capacity: "platform", run: (actor, body) => banUser(getDb(), actor, userId, body) }),
  role: (request: Request, userId: string) => runAction(apiDeps(), request, { name: "admin:role", rules: RATE.admin, ids: [userId], body: true, capacity: "platform", run: (actor, body) => changeRole(getDb(), actor, userId, body) }),
};

/** Session status for the browser's expiry warnings (docs/auth/session-policy.md). */
const sessionStatus = (session: { deviceClass: string; idleExpiresAt: Date; absoluteExpiresAt: Date }) => ({
  deviceClass: session.deviceClass,
  idleExpiresAt: session.idleExpiresAt.toISOString(),
  absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
  serverNow: new Date().toISOString(),
});

/**
 * GET /api/identity/session: when the current session ends (read only; never extends it).
 * POST /api/identity/activity: the user is present (pointer, keyboard, touch); extends the inactivity
 * limit, never the absolute one. Both refuse an ended session with 401.
 */
export const sessionApi = {
  status: (request: Request) =>
    runAction(apiDeps(), request, {
      name: "identity:session",
      rules: RATE.read,
      allowIncompleteProfile: true,
      activity: false,
      run: async () => {
        const session = await getCurrentSession(request.headers);
        return session ? { ok: true, value: sessionStatus(session) } : { ok: false, code: "NOT_FOUND" };
      },
    }),
  activity: (request: Request) =>
    runAction(apiDeps(), request, {
      name: "identity:activity",
      rules: RATE.read,
      allowIncompleteProfile: true,
      activity: true,
      run: async () => {
        const session = await getCurrentSession(request.headers);
        return session ? { ok: true, value: sessionStatus(session) } : { ok: false, code: "NOT_FOUND" };
      },
    }),
};
