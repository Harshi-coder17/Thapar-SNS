// Keys shared between the web app and the background/realtime service (nudge HMAC, realtime tickets).
// Derived with HKDF-SHA256 from SERVICE_SECRET when set, otherwise from BETTER_AUTH_SECRET, with a
// distinct label per purpose, so one leaked derived key reveals neither the master secret nor the other
// keys. No new value is required in .env for local development.
import { hkdfSync } from "node:crypto";

export type InternalKeyPurpose = "service-nudge" | "realtime-ticket";

const cache = new Map<string, Buffer>();

export function internalKey(purpose: InternalKeyPurpose, source: Record<string, string | undefined> = process.env): Buffer {
  const master = source.SERVICE_SECRET || source.BETTER_AUTH_SECRET;
  if (!master || master.length < 32) throw new Error("SERVICE_SECRET or BETTER_AUTH_SECRET (32+ characters) is required");
  const cacheKey = `${purpose}:${master.length}:${master.slice(0, 4)}`;
  const cached = cache.get(cacheKey);
  if (cached && source === process.env) return cached;
  const key = Buffer.from(hkdfSync("sha256", master, "thapar-sns", `internal:${purpose}`, 32));
  if (source === process.env) cache.set(cacheKey, key);
  return key;
}
