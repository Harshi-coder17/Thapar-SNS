// AUTH SPIKE. Server-side identity check applied in addition to Google's `hd` restriction
// (auth evaluation §4.1). The allowed domain is a parameter, never hardcoded: whether production
// keeps the @thapar.edu-only rule of FR-AUTH-1 is an owner decision (OI-51).

export type IdentityDecision =
  | { allowed: true; email: string }
  | { allowed: false; reason: "missing-email" | "malformed-email" | "domain-not-allowed" | "email-not-verified" };

export function evaluateIdentity(
  identity: { email?: unknown; emailVerified?: unknown },
  allowedDomain: string,
): IdentityDecision {
  if (typeof identity.email !== "string" || identity.email.trim() === "") return { allowed: false, reason: "missing-email" };
  const email = identity.email.trim().toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { allowed: false, reason: "malformed-email" };
  // Exact domain match: no subdomains (student.thapar.edu) and no lookalikes (thapar.edu.evil.com).
  if (parts[1] !== allowedDomain.trim().toLowerCase()) return { allowed: false, reason: "domain-not-allowed" };
  if (identity.emailVerified !== true) return { allowed: false, reason: "email-not-verified" };
  return { allowed: true, email };
}
