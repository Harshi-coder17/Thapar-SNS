import "server-only";

// Better Auth configuration (ADR-0005, approved 2026-10-24 with spike conditions C1 to C7).
// Each condition is marked where it is applied. Changes here need the identity tests rerun
// (tests/integration/identity/*) and a review against docs/auth/spike-findings.md.
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { audit } from "@/modules/admin";
import type { PrismaClient } from "@/shared/db/client";

import type { IdentityConfig } from "./config";
import { type BaseCallObserver, withHashedSessionTokens } from "./hashed-session-adapter";
import { evaluateIdentity } from "./identity-policy";
import { SESSION_SLIDING_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "./session-policy";

/**
 * Better Auth HTTP endpoints that stay reachable (C3). Everything else Better Auth exposes is
 * disabled: several return raw session tokens or provider access tokens to the browser (F-03),
 * and token-based revocation cannot work with hashed storage (F-04). Session reads and revocation
 * go through this module's server-side functions instead.
 */
export const ALLOWED_AUTH_PATHS = ["/sign-in/social", "/callback/:id", "/sign-out"] as const;

/** Sign-in attempts allowed per client address per minute (C5). */
export const SIGN_IN_RATE_LIMIT = { window: 60, max: 10 } as const;

export interface CreateIdentityAuthOptions {
  config: IdentityConfig;
  prisma: PrismaClient;
  /** Every endpoint path Better Auth registers, used to disable all non-allowed ones (C3). */
  disabledPaths: string[];
  /** Test hook: observes calls reaching the database adapter. */
  observe?: BaseCallObserver;
}

// C7: Better Auth log messages are forwarded without their data arguments, so session objects,
// tokens and request details are never written to logs.
function safeLog(level: "debug" | "info" | "warn" | "error", message: string): void {
  const line = `[auth] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
}

export function createIdentityAuth({ config, prisma, disabledPaths, observe }: CreateIdentityAuthOptions) {
  const { allowedDomain } = config;
  return betterAuth({
    appName: "Thapar SNS",
    baseURL: config.baseURL,
    secret: config.secret,
    // C1: session tokens are stored as SHA-256 hashes.
    database: withHashedSessionTokens(prismaAdapter(prisma, { provider: "postgresql" }), observe),
    telemetry: { enabled: false },
    logger: { level: "warn", log: safeLog },
    emailAndPassword: { enabled: false },
    socialProviders: config.google
      ? {
          google: {
            clientId: config.google.clientId,
            clientSecret: config.google.clientSecret,
            // C4: Google-side hosted-domain restriction; re-checked on the server below.
            hd: allowedDomain,
            prompt: "select_account",
            // Only the redirect flow is offered. ID-token sign-in is enabled solely for the
            // E2E test sign-in, which can never run on a deployment (config.ts).
            disableIdTokenSignIn: !config.testSignInEnabled,
          },
        }
      : {},
    // skipStateCookieCheck pinned off: OAuth state must match a signed cookie in the same browser,
    // which blocks login CSRF on the callback (OI-52).
    account: { accountLinking: { enabled: false }, skipStateCookieCheck: false },
    user: {
      additionalFields: {
        role: { type: "string", input: false, required: false, defaultValue: "STUDENT" },
      },
    },
    session: {
      expiresIn: SESSION_SLIDING_SECONDS, // 7-day sliding (OI-05)
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      // Revocation must take effect on the next request (ADR-0006).
      cookieCache: { enabled: false },
      // The 30-day absolute maximum is enforced in sessions.ts (Better Auth has no such option).
    },
    advanced: {
      useSecureCookies: config.secureCookies,
      // C2: Better Auth disables these checks when NODE_ENV=test or TEST is set; pin them on.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: "uuid" }, // UUID primary keys [SPEC]
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    trustedOrigins: [config.baseURL],
    disabledPaths,
    // Unexpected (non-HTTP) errors are re-thrown to dispatchAuthRequest instead of being printed
    // raw by the router, which would log full error objects (C7). HTTP errors and redirects are
    // unaffected.
    onAPIError: { errorURL: "/login", throw: true },
    // C5: shared counters in Postgres (never "memory" or secondary storage).
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: { "/sign-in/social": { ...SIGN_IN_RATE_LIMIT } },
    },
    databaseHooks: {
      user: {
        create: {
          // C4: FR-AUTH-1 on the server: verified email, exact allowed domain, lower-cased.
          before: async (user) => {
            const decision = evaluateIdentity(user, allowedDomain);
            if (!decision.allowed) return false;
            return { data: { ...user, email: decision.email } };
          },
        },
      },
      session: {
        create: {
          // Re-checked on every sign-in, so a stored user who no longer qualifies cannot sign in.
          before: async (session) => {
            const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true, emailVerified: true, role: true, bannedAt: true } });
            if (!user || !evaluateIdentity(user, allowedDomain).allowed) return false;
            // Slice 5: banned accounts cannot start a session.
            if (user.bannedAt) return false;
            if (config.adminEmails.includes(user.email) && user.role !== "ADMIN") await grantBootstrapAdmin(prisma, session.userId);
            return undefined;
          },
        },
      },
    },
  });
}

export type IdentityAuth = ReturnType<typeof createIdentityAuth>;

/**
 * Admin bootstrap (OI-09 recommended default): an ADMIN_EMAILS address becomes ADMIN when it signs
 * in. A privilege change revokes the user's existing sessions, so only the new session (created
 * right after this hook) carries the new role. Removing an address later does not demote; admins
 * manage roles (Slice 5). Audited as a system action.
 */
async function grantBootstrapAdmin(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    const revoked = await tx.session.deleteMany({ where: { userId } });
    await audit(tx, { actorId: null, action: "identity.role.granted", targetType: "user", targetId: userId, details: { role: "ADMIN", source: "ADMIN_EMAILS", sessionsRevoked: revoked.count } });
  });
}
