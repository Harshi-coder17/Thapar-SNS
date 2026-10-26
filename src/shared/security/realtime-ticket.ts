// Realtime connection tickets (SPEC-RT, ADR-0012): a compact HS256 JWT with a 30-second expiry, a
// single-use nonce, the user id and the channels the web app has authorised. The realtime service
// verifies the signature, expiry and audience, and consumes the nonce atomically in Redis; it never
// queries the database. Cookies are not used on the WebSocket.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { internalKey } from "./internal-keys";

export const TICKET_TTL_SECONDS = 30;
const AUDIENCE = "thapar-sns-realtime";

export interface TicketClaims {
  sub: string;
  channels: string[];
  nonce: string;
  aud: string;
  iat: number;
  exp: number;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function signTicket(userId: string, channels: string[], now = Date.now(), key = internalKey("realtime-ticket")): string {
  const iat = Math.floor(now / 1000);
  const claims: TicketClaims = { sub: userId, channels, nonce: randomUUID(), aud: AUDIENCE, iat, exp: iat + TICKET_TTL_SECONDS };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const signature = createHmac("sha256", key).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${signature}`;
}

/** Verifies a ticket; returns its claims, or null when the signature, audience or expiry is wrong. */
export function verifyTicket(token: string, now = Date.now(), key = internalKey("realtime-ticket")): TicketClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts as [string, string, string];
  const expected = createHmac("sha256", key).update(`${head}.${body}`).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TicketClaims;
    if (claims.aud !== AUDIENCE || typeof claims.sub !== "string" || !Array.isArray(claims.channels) || typeof claims.nonce !== "string") return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
