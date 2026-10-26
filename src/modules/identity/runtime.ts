import "server-only";

import { getDb } from "@/shared/db/client";

import { ALLOWED_AUTH_PATHS, createIdentityAuth, type IdentityAuth } from "./auth";
import { type IdentityConfig, parseIdentityConfig } from "./config";

/** Every endpoint path Better Auth registers (read from a probe instance). */
export function authEndpointPaths(auth: { api: Record<string, unknown> }): string[] {
  const paths = Object.values(auth.api).map((endpoint) => (endpoint as { path?: unknown } | undefined)?.path);
  return [...new Set(paths.filter((p): p is string => typeof p === "string"))].sort();
}

/** Builds the auth instance with every non-allowed Better Auth endpoint disabled (C3). */
export function buildIdentityAuth(config: IdentityConfig, prisma: Parameters<typeof createIdentityAuth>[0]["prisma"], observe?: Parameters<typeof createIdentityAuth>[0]["observe"]): IdentityAuth {
  const probe = createIdentityAuth({ config, prisma, disabledPaths: [] });
  const allowed = new Set<string>(ALLOWED_AUTH_PATHS);
  const disabledPaths = authEndpointPaths(probe).filter((path) => !allowed.has(path));
  return createIdentityAuth({ config, prisma, disabledPaths, observe });
}

interface IdentityRuntime {
  config: IdentityConfig;
  auth: IdentityAuth;
}

const globalForIdentity = globalThis as typeof globalThis & { thaparSnsIdentity?: IdentityRuntime };

/** The process-wide identity runtime, configured from the environment on first use. */
export function getIdentityRuntime(): IdentityRuntime {
  if (!globalForIdentity.thaparSnsIdentity) {
    // THAPAR_E2E_BUILD is replaced at build time (next.config.ts `env`), so a runtime environment
    // variable of the same name cannot turn an ordinary build into an E2E build.
    const config = parseIdentityConfig({ ...process.env, THAPAR_E2E_BUILD: process.env.THAPAR_E2E_BUILD });
    if (process.env.E2E_TEST_AUTH && !config.testSignInEnabled) {
      console.warn("[identity] E2E_TEST_AUTH ignored: the test sign-in is disabled outside local E2E builds");
    }
    globalForIdentity.thaparSnsIdentity = { config, auth: buildIdentityAuth(config, getDb()) };
  }
  return globalForIdentity.thaparSnsIdentity;
}
