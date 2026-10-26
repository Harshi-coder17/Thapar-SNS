// CSRF protection for state-changing requests (threat model §4, OI-52): the request must carry an
// Origin header equal to the app's own origin. A missing, opaque ("null"), malformed or foreign
// Origin is rejected, as is any request the browser labels cross-site or same-site (Fetch Metadata).
// Session cookies are SameSite=Lax as a second layer.

export type OriginCheck = "ok" | "missing" | "invalid" | "untrusted" | "cross-site";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const isStateChangingMethod = (method: string) => !SAFE_METHODS.has(method.toUpperCase());

export function checkRequestOrigin(request: Request, trustedOrigin: string): OriginCheck {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return "cross-site";
  const origin = request.headers.get("origin");
  if (origin === null || origin === "") return "missing";
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return "invalid";
  }
  if (origin === "null" || parsed.origin !== origin) return "invalid";
  return parsed.origin === new URL(trustedOrigin).origin ? "ok" : "untrusted";
}
