// AUTH SPIKE (ADR-0005). Better Auth configured as the production design intends:
// Google only, hashed session tokens, no cookie cache, no secondary storage, no telemetry,
// server-side identity policy, rate limiting. Not production-approved.
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import type { PrismaClient } from "./generated/prisma/client";
import { type BaseCallObserver, withHashedSessionTokens } from "./hashed-session-adapter";
import { evaluateIdentity } from "./identity-policy";

export interface SpikeAuthOptions {
  prisma: PrismaClient;
  baseURL: string;
  secret: string;
  googleClientId: string;
  googleClientSecret: string;
  allowedDomain: string;
  observe?: BaseCallObserver;
  disabledPaths?: string[];
  signInRateLimit?: number;
}

const DAY = 60 * 60 * 24;

export function createSpikeAuth(options: SpikeAuthOptions) {
  const { prisma, allowedDomain } = options;
  return betterAuth({
    appName: "Thapar SNS (auth spike)",
    baseURL: options.baseURL,
    secret: options.secret,
    database: withHashedSessionTokens(prismaAdapter(prisma, { provider: "postgresql" }), options.observe),
    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: options.googleClientId,
        clientSecret: options.googleClientSecret,
        hd: allowedDomain, // Google-side restriction; checked again on the server below.
        prompt: "select_account",
      },
    },
    session: {
      expiresIn: 7 * DAY, // sliding expiry
      updateAge: DAY,
      cookieCache: { enabled: false }, // revocation must take effect immediately (T06)
    },
    advanced: {
      useSecureCookies: true,
      // Better Auth turns origin/CSRF checks OFF automatically when NODE_ENV=test or TEST is set
      // (create-context.mjs). Pin them ON so no environment variable can silently disable them.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    trustedOrigins: [options.baseURL],
    disabledPaths: options.disabledPaths,
    rateLimit: {
      enabled: true,
      storage: "memory", // spike only; production needs shared storage (finding F-09)
      window: 60,
      max: 100,
      customRules: { "/sign-in/social": { window: 60, max: options.signInRateLimit ?? 10 } },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const decision = evaluateIdentity(user, allowedDomain);
            if (!decision.allowed) return false;
            return { data: { ...user, email: decision.email } };
          },
        },
      },
      session: {
        create: {
          // Re-checks the stored user on every sign-in, not only at first sign-up.
          before: async (session) => {
            const user = await prisma.user.findUnique({ where: { id: session.userId } });
            return evaluateIdentity(user ?? {}, allowedDomain).allowed ? undefined : false;
          },
        },
      },
    },
  });
}

export type SpikeAuth = ReturnType<typeof createSpikeAuth>;
