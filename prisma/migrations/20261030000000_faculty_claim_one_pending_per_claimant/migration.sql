-- ADR-0010 hardening (2026-10-26): an account may have at most one claim waiting for review.
-- Without this, one account could hold pending claims on every profile and block the real faculty
-- members (each profile already allows only one pending claim, faculty_claims_one_pending).
-- Partial index: not expressible in schema.prisma, kept here like faculty_claims_one_pending.
CREATE UNIQUE INDEX "faculty_claims_one_pending_per_claimant" ON "faculty_claims" ("claimantId") WHERE "status" = 'PENDING';
