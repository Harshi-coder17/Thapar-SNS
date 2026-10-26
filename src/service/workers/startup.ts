// Worker-side helpers used by the service entry point (which itself has no module or database access).
import { timingSafeEqual } from "node:crypto";

import { configureStorageCors } from "@/modules/assets";
import { signNudge } from "@/modules/outbox";

export { configureStorageCors };

const NUDGE_MAX_SKEW_MS = 60_000;

/** ADR-0004 §3.2: HMAC over `timestamp.body`, fresh within 60 s, compared in constant time. */
export function validNudge(timestamp: string | undefined, signature: string | undefined, body: string, now = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > NUDGE_MAX_SKEW_MS || !signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signNudge(ts, body), "hex"), Buffer.from(signature, "hex"));
}
