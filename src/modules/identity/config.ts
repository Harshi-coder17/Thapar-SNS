import { z } from "zod";

/**
 * Identity configuration from environment variables (docs/auth/google-oauth-setup.md §3).
 * Validated on first use, never at import time, so builds do not need secrets.
 * Error messages name variables, never their values.
 */
const schema = z.object({
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  BETTER_AUTH_SECRET: z.string().min(32),
  AUTH_ALLOWED_EMAIL_DOMAIN: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  E2E_TEST_AUTH: z.string().optional(),
  THAPAR_E2E_BUILD: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
});

export interface IdentityConfig {
  baseURL: string;
  secret: string;
  allowedDomain: string;
  google: { clientId: string; clientSecret: string } | null;
  /**
   * E2E-only sign-in (tests/e2e, OI-53). Fails closed: true only when ALL hold: an E2E build
   * (THAPAR_E2E_BUILD=1, fixed at build time), E2E_TEST_AUTH=1, a loopback BETTER_AUTH_URL, and not
   * a Vercel production or preview deployment. Any other combination leaves it disabled.
   */
  testSignInEnabled: boolean;
  secureCookies: boolean;
  /** Admin bootstrap (OI-09): these addresses receive the ADMIN role when they sign in. */
  adminEmails: string[];
}

/** The domain FR-AUTH-1 requires; deployments must use it (OI-51, approved 2026-10-24). */
export const REQUIRED_PRODUCTION_DOMAIN = "thapar.edu";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const blank = (value: string | undefined) => (value === undefined || value.trim() === "" ? undefined : value);

export function parseIdentityConfig(source: Record<string, string | undefined>): IdentityConfig {
  const cleaned = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, blank(value)]));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))].sort();
    throw new Error(`Invalid or missing identity configuration: ${keys.join(", ")}`);
  }
  const env = result.data;
  const deployed = env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
  const https = env.BETTER_AUTH_URL.startsWith("https://");
  const allowedDomain = env.AUTH_ALLOWED_EMAIL_DOMAIN.toLowerCase();

  if (deployed && !https) throw new Error("BETTER_AUTH_URL must use https on a deployment");
  if (env.VERCEL_ENV === "production" && allowedDomain !== REQUIRED_PRODUCTION_DOMAIN) {
    throw new Error(`AUTH_ALLOWED_EMAIL_DOMAIN must be ${REQUIRED_PRODUCTION_DOMAIN} in production (FR-AUTH-1)`);
  }
  const adminEmails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.some((email) => !/^[^@\s]+@[^@\s]+$/.test(email) || email.split("@")[1] !== allowedDomain)) {
    throw new Error(`ADMIN_EMAILS must list @${allowedDomain} addresses separated by commas`);
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    throw new Error("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither");
  }

  return {
    baseURL: env.BETTER_AUTH_URL.replace(/\/+$/, ""),
    secret: env.BETTER_AUTH_SECRET,
    allowedDomain,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }
        : null,
    // The loopback check is host-independent: no reachable deployment, on any platform, has one.
    testSignInEnabled: env.THAPAR_E2E_BUILD === "1" && env.E2E_TEST_AUTH === "1" && !deployed && LOOPBACK_HOSTS.has(new URL(env.BETTER_AUTH_URL).hostname),
    secureCookies: https,
    adminEmails,
  };
}
