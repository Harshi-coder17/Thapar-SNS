import { describe, expect, it } from "vitest";

import { checkSession, classifyDevice, SESSION_LIMITS } from "@/modules/identity/session-policy";

const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("device classes (session policy 2026-10-26)", () => {
  it("treats phones as mobile and computers, tablets and unknown agents as desktop", () => {
    expect(classifyDevice(IPHONE)).toBe("mobile");
    expect(classifyDevice(ANDROID_PHONE)).toBe("mobile");
    expect(classifyDevice(DESKTOP)).toBe("desktop");
    expect(classifyDevice(ANDROID_TABLET)).toBe("desktop");
    expect(classifyDevice(IPAD)).toBe("desktop");
    expect(classifyDevice(null)).toBe("desktop");
  });

  it("uses 30 minutes and 12 hours on desktop, 7 days and 30 days on mobile", () => {
    expect(SESSION_LIMITS.desktop).toMatchObject({ idleMs: 30 * MIN, absoluteMs: 12 * HOUR, idleWarningMs: 2 * MIN, absoluteWarningMs: 10 * MIN });
    expect(SESSION_LIMITS.mobile).toMatchObject({ idleMs: 7 * 24 * HOUR, absoluteMs: 30 * 24 * HOUR });
  });
});

describe("checkSession", () => {
  const created = new Date("2026-10-26T08:00:00Z");
  it("ends a desktop session after 30 minutes without activity", () => {
    const s = { createdAt: created, lastActiveAt: created, userAgent: DESKTOP };
    expect(checkSession(s, new Date(created.getTime() + 29 * MIN)).ok).toBe(true);
    expect(checkSession(s, new Date(created.getTime() + 30 * MIN))).toEqual({ ok: false, reason: "idle", deviceClass: "desktop" });
  });

  it("ends a desktop session 12 hours after sign-in however active it is", () => {
    const now = new Date(created.getTime() + 12 * HOUR);
    expect(checkSession({ createdAt: created, lastActiveAt: new Date(now.getTime() - MIN), userAgent: DESKTOP }, now)).toEqual({ ok: false, reason: "absolute", deviceClass: "desktop" });
    const before = checkSession({ createdAt: created, lastActiveAt: new Date(created.getTime() + 11 * HOUR + 50 * MIN), userAgent: DESKTOP }, new Date(created.getTime() + 11 * HOUR + 55 * MIN));
    expect(before.ok).toBe(true);
    // Activity never pushes the inactivity deadline past the absolute one.
    if (before.ok) expect(before.idleExpiresAt.getTime()).toBe(created.getTime() + 12 * HOUR);
  });

  it("keeps a phone signed in through days of inactivity, up to the 30-day cap", () => {
    expect(checkSession({ createdAt: created, lastActiveAt: created, userAgent: IPHONE }, new Date(created.getTime() + 6 * 24 * HOUR)).ok).toBe(true);
    expect(checkSession({ createdAt: created, lastActiveAt: created, userAgent: IPHONE }, new Date(created.getTime() + 7 * 24 * HOUR)).ok).toBe(false);
    const active = new Date(created.getTime() + 29 * 24 * HOUR);
    expect(checkSession({ createdAt: created, lastActiveAt: active, userAgent: IPHONE }, new Date(active.getTime() + HOUR)).ok).toBe(true);
    expect(checkSession({ createdAt: created, lastActiveAt: active, userAgent: IPHONE }, new Date(created.getTime() + 30 * 24 * HOUR))).toEqual({ ok: false, reason: "absolute", deviceClass: "mobile" });
  });
});
