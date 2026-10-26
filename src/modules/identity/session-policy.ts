// Session lifetime rules (OI-05, approved 2026-10-24; ADR-0006).

const DAY_SECONDS = 24 * 60 * 60;

/** Sliding expiry: each use within the window pushes expiry 7 days ahead. */
export const SESSION_SLIDING_SECONDS = 7 * DAY_SECONDS;
/** How often a used session's expiry is extended. */
export const SESSION_UPDATE_AGE_SECONDS = DAY_SECONDS;
/** Hard maximum from sign-in, regardless of activity; enforced on the server. */
export const SESSION_ABSOLUTE_MAX_MS = 30 * DAY_SECONDS * 1000;

/** True while a session created at `createdAt` is inside the 30-day absolute lifetime. */
export function isWithinAbsoluteLifetime(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() < SESSION_ABSOLUTE_MAX_MS;
}

// ------------------------------------------------------------------------------------------------
// Device-specific limits (owner decision 2026-10-26; docs/auth/session-policy.md). Enforced on the
// server on every protected request; the browser only shows warnings.
// ------------------------------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export type DeviceClass = "desktop" | "mobile";

export interface SessionLimits {
  /** Ends the session after this long without user activity. */
  idleMs: number;
  /** Ends the session this long after sign-in, whatever the activity. */
  absoluteMs: number;
  /** Warn this long before the inactivity limit. */
  idleWarningMs: number;
  /** Warn this long before the absolute limit. */
  absoluteWarningMs: number;
}

export const SESSION_LIMITS: Record<DeviceClass, SessionLimits> = {
  // Computers (including shared and lab machines) and tablets.
  desktop: { idleMs: 30 * MINUTE_MS, absoluteMs: 12 * HOUR_MS, idleWarningMs: 2 * MINUTE_MS, absoluteWarningMs: 10 * MINUTE_MS },
  // Phones: personal devices, so a persistent but bounded sign-in (the OI-05 limits).
  mobile: { idleMs: SESSION_SLIDING_SECONDS * 1000, absoluteMs: SESSION_ABSOLUTE_MAX_MS, idleWarningMs: 0, absoluteWarningMs: 10 * MINUTE_MS },
};

/** Activity writes are throttled: a session's last-activity time is updated at most this often. */
export const ACTIVITY_WRITE_INTERVAL_MS = 30 * 1000;

/**
 * Phone or not, from the user agent stored when the session was created. Phones identify themselves
 * ("Mobi", iPhone, iPod, Android ... Mobile); tablets, iPads (which present a desktop Safari agent) and
 * computers get the desktop limits. An unknown or missing agent gets the stricter desktop limits.
 */
export function classifyDevice(userAgent: string | null | undefined): DeviceClass {
  if (!userAgent) return "desktop";
  return /\bMobi|\biPhone\b|\biPod\b|Android.*\bMobile\b|Windows Phone/i.test(userAgent) ? "mobile" : "desktop";
}

export type SessionCheck =
  | { ok: true; deviceClass: DeviceClass; idleExpiresAt: Date; absoluteExpiresAt: Date; limits: SessionLimits }
  | { ok: false; reason: "idle" | "absolute"; deviceClass: DeviceClass };

/** Whether a session is still valid at `now`, and when it will end. */
export function checkSession(session: { createdAt: Date; lastActiveAt: Date; userAgent: string | null }, now: Date = new Date()): SessionCheck {
  const deviceClass = classifyDevice(session.userAgent);
  const limits = SESSION_LIMITS[deviceClass];
  const absoluteExpiresAt = new Date(session.createdAt.getTime() + limits.absoluteMs);
  const idleExpiresAt = new Date(Math.min(session.lastActiveAt.getTime() + limits.idleMs, absoluteExpiresAt.getTime()));
  if (now >= absoluteExpiresAt) return { ok: false, reason: "absolute", deviceClass };
  if (now.getTime() >= session.lastActiveAt.getTime() + limits.idleMs) return { ok: false, reason: "idle", deviceClass };
  return { ok: true, deviceClass, idleExpiresAt, absoluteExpiresAt, limits };
}
