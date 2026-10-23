# ADR-0006: Session token representation for FR-AUTH-3

Status: **Proposed; spike evidence available (2026-10-23).** T01 to T09 and T14 pass with the single hashed token (`docs/auth/spike-findings.md`). Not production-approved until the owner accepts it.

## Context
FR-AUTH-3: "store sessions as hashed refresh tokens in the database, with access tokens delivered via HTTP-only secure cookies." Database-session libraries use a single opaque token rather than an access/refresh pair.

## Proposal
One high-entropy random session token per session:
- delivered only in an HTTP-only, Secure, SameSite=Lax cookie
- the DB stores only its SHA-256 hash
- validated against the DB on every request
- revocable server-side by session id or user

## Assessment (full table in `auth/authentication-evaluation.md` §2)
- **Kept:** no usable credential at rest; no script-readable token; server-side revocation (faster than access-token expiry).
- **Lost:** refresh-token reuse detection (theft signal), unless periodic rotation is added (OI-05).
- **Cost:** one indexed DB lookup per authenticated request.

## Decision required from the owner
1. Accept the single-token representation as satisfying FR-AUTH-3's intent, **or** require a literal access/refresh pair.
2. Rotation policy (OI-05): no periodic rotation with a 30-day absolute cap (proposed), or 24-hour rotation with a grace window.
