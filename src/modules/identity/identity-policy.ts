// Server-side identity rule for FR-AUTH-1 (OI-51, approved 2026-10-24): only verified Google
// identities whose email domain is exactly the allowed domain. Applied in addition to Google's
// `hd` check, never instead of it (spike condition C4).

export type IdentityRejection = "missing-email" | "malformed-email" | "domain-not-allowed" | "email-not-verified";

export type IdentityDecision = { allowed: true; email: string } | { allowed: false; reason: IdentityRejection };

export function evaluateIdentity(identity: { email?: unknown; emailVerified?: unknown }, allowedDomain: string): IdentityDecision {
  if (typeof identity.email !== "string" || identity.email.trim() === "") return { allowed: false, reason: "missing-email" };
  const email = identity.email.trim().toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { allowed: false, reason: "malformed-email" };
  // Exact match: rejects subdomains (student.thapar.edu) and lookalikes (thapar.edu.evil.com).
  if (parts[1] !== allowedDomain.trim().toLowerCase()) return { allowed: false, reason: "domain-not-allowed" };
  if (identity.emailVerified !== true) return { allowed: false, reason: "email-not-verified" };
  return { allowed: true, email };
}
