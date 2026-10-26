import "server-only";

// Rate limits for this module's own API (/api/identity/*). Counters live in PostgreSQL, in the same
// table as Better Auth's auth limits (identity_rate_limits, condition C5), so every server instance
// shares them. Keys carry their own prefix, so they never collide with Better Auth's keys.
// Fixed windows; the increment is a single atomic upsert, so concurrent requests cannot overshoot.
import type { Db } from "@/shared/db/client";

export interface RateRule {
  /** Window length in seconds. */
  window: number;
  max: number;
}

/** Limits per client address (before authentication) and per user (after it). */
export const IDENTITY_API_LIMITS = {
  me: { perAddress: { window: 60, max: 120 } },
  profile: { perAddress: { window: 60, max: 30 }, perUser: { window: 60, max: 10 } },
  adminRevoke: { perAddress: { window: 60, max: 60 }, perUser: { window: 60, max: 30 } },
} as const satisfies Record<string, { perAddress: RateRule; perUser?: RateRule }>;

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Consumes one request from `key`'s current window. Throws if the store is unavailable (callers fail closed). */
export type RateLimiter = (key: string, rule: RateRule, now?: number) => Promise<RateLimitDecision>;

const KEY_PREFIX = "identity-api:";

export function createDatabaseRateLimiter(db: Db): RateLimiter {
  return async (key, rule, now = Date.now()) => {
    const windowMs = rule.window * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "identity_rate_limits" ("id", "key", "count", "lastRequest")
      VALUES (gen_random_uuid(), ${KEY_PREFIX + key}, 1, ${BigInt(windowStart)})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "identity_rate_limits"."lastRequest" = EXCLUDED."lastRequest" THEN "identity_rate_limits"."count" + 1 ELSE 1 END,
        "lastRequest" = EXCLUDED."lastRequest"
      RETURNING "count"`;
    const count = Number(rows[0]?.count);
    if (!Number.isFinite(count)) throw new Error("rate limit store returned no count");
    if (count <= rule.max) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
  };
}

/**
 * The client address used for per-address limits: the first `x-forwarded-for` entry, as for the
 * Better Auth limits. Its trustworthiness depends on the hosting platform (OI-54, verified at G-1c).
 */
export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
