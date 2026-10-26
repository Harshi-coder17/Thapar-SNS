import { describe, expect, it, vi } from "vitest";

// Test-only key material for the HKDF-derived service keys (never a real secret).
vi.stubEnv("BETTER_AUTH_SECRET", "unit-test-secret-unit-test-secret-0123456789");

import { backoffMs, MAX_ATTEMPTS, signNudge } from "@/modules/outbox";
import { signTicket, TICKET_TTL_SECONDS, verifyTicket } from "@/shared/security/realtime-ticket";
import { validNudge } from "@/service/workers/startup";

const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 8);

describe("outbox retry schedule (background-jobs.md §4.5)", () => {
  it("doubles from 15 s, caps at 32 min, with jitter of at most 20 %", () => {
    expect(backoffMs(1, () => 0.5)).toBe(15_000);
    expect(backoffMs(2, () => 0.5)).toBe(30_000);
    expect(backoffMs(20, () => 0.5)).toBe(32 * 60_000);
    expect(backoffMs(1, () => 0)).toBe(12_000);
    expect(backoffMs(1, () => 1)).toBe(18_000);
    expect(MAX_ATTEMPTS).toBe(8);
  });
});

describe("service nudge signature (ADR-0004 §3.2)", () => {
  it("accepts a fresh, correctly signed nudge only", () => {
    const now = 1_800_000_000_000;
    const body = '{"at":1}';
    const signature = signNudge(now, body);
    expect(validNudge(String(now), signature, body, now)).toBe(true);
    expect(validNudge(String(now), signature, '{"at":2}', now)).toBe(false);
    expect(validNudge(String(now - 120_000), signNudge(now - 120_000, body), body, now)).toBe(false);
    expect(validNudge(String(now), "0".repeat(64), body, now)).toBe(false);
    expect(validNudge(undefined, signature, body, now)).toBe(false);
  });
});

describe("realtime tickets (ADR-0012)", () => {
  it("round-trips claims and expires after 30 seconds", () => {
    const now = 1_800_000_000_000;
    const token = signTicket("user-1", ["user:user-1", "event:e"], now, key);
    const claims = verifyTicket(token, now + 1_000, key);
    expect(claims?.sub).toBe("user-1");
    expect(claims?.channels).toEqual(["user:user-1", "event:e"]);
    expect(verifyTicket(token, now + (TICKET_TTL_SECONDS + 1) * 1000, key)).toBeNull();
  });

  it("refuses tampered tokens and tokens signed with another key", () => {
    const now = 1_800_000_000_000;
    const token = signTicket("user-1", ["user:user-1"], now, key);
    const [header, payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), channels: ["connection:someone-else"] })).toString("base64url");
    expect(verifyTicket(`${header}.${forged}.${signature}`, now, key)).toBeNull();
    expect(verifyTicket(token, now, otherKey)).toBeNull();
    expect(verifyTicket("garbage", now, key)).toBeNull();
  });
});
