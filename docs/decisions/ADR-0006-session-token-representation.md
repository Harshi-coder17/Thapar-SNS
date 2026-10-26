# ADR-0006: Session token representation for FR-AUTH-3

Status: **Approved 2026-10-24**: single hashed session token, provided it satisfies the authentication requirements and supports secure expiration and immediate revocation. Lifetime (OI-05, approved 2026-10-24): 7-day sliding, 30-day absolute maximum enforced server-side, new token at sign-in, no periodic rotation. Evidence: spike T01 to T09 and T14 (`docs/auth/spike-findings.md`).

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

## Decision (owner, 2026-10-24)
1. The single-token representation is accepted as satisfying FR-AUTH-3's intent (no literal access/refresh pair).
2. Rotation policy (OI-05): no periodic rotation; 7-day sliding expiry; 30-day absolute cap enforced on the server; new token at every sign-in.
   - *Amendment 2026-10-26 (owner):* on computers, a 30-minute inactivity limit and a 12-hour absolute limit are added on top, also enforced on the server. Phones keep the limits above. The token representation is unchanged. Details: `docs/auth/session-policy.md`.
