# Auth Spike Findings: Better Auth 1.7.10 + session-token hashing wrapper

Status: **spike complete 2026-10-23; reviewed and approved by the owner 2026-10-24 (gate G-1b-spike)** with conditions C1 to C7. The spike code is evidence and a design reference; production code is written separately in `src/modules/identity` and must preserve C1 to C7, with the relevant tests rerun before production use.

Recommendation: **GO, with conditions C1 to C7 below.** Every "Go" test passed. The source audit found no session-token path outside the wrapped adapter. The gaps found are closed by configuration or by small, tested replacements.

## 1. What was tested and how
- **Code:** `spikes/auth/` (outside `src/`, never part of the app bundle).
  - `hashed-session-adapter.ts`: the wrapper
  - `create-spike-auth.ts`: Better Auth configured as intended for production
  - `identity-policy.ts`: the server-side email/domain rule
  - `google-stub.ts`: a stand-in for Google's token and key endpoints
  - `auth-spike.test.ts`: tests T01 to T18
- **Realism:**
  - the real Better Auth 1.7.10 HTTP handler and the real Prisma 7 adapter, on PostgreSQL 17.9 (Testcontainers)
  - the real Google provider code path: authorization URL, state, PKCE, token exchange, ID token, `hd` check
  - only Google's network endpoints are simulated, with a locally generated signing key
- **Not tested:** a real Google account and real Google servers. That needs OAuth credentials (see `docs/auth/google-oauth-setup.md`). **Real Google sign-in has not been demonstrated.**
- **Run:** `npm run spike:auth` (Docker required). **Result:** 37 passed, 1 to-do (T10, blocked on OI-05).

## 2. Results

| Test | Requirement | Result |
|---|---|---|
| T01 | DB never holds the cookie token; stores SHA-256 | **Pass** |
| T02 | A DB value cannot authenticate (unsigned, signed with the real secret, marker form) | **Pass** |
| T03 | Cookie `__Secure-` prefix, HttpOnly, Secure, SameSite=Lax, Path=/, host-only | **Pass** |
| T04 | Expired, deleted, tampered-signature sessions rejected | **Pass** (banned users: tested via T07; ban itself is production 1b work) |
| T05 | Sign-out deletes the row, clears the cookie; old cookie rejected | **Pass** |
| T06 | Revoke by session id takes effect on the next request (no cookie cache) | **Pass** |
| T07 | Revoke all of a user's sessions | **Pass** |
| T08 | Sliding refresh works with hashed storage | **Pass** |
| T09 | New token per sign-in; planted cookie never adopted | **Pass** |
| T10 | Absolute lifetime cap | **To-do**: blocked on OI-05 |
| T11 | Domain matrix: Gmail, lookalike, subdomain, unverified, missing `hd` rejected with no user row; upper-case address accepted and lower-cased; domain is configuration | **Pass** |
| T12 | Cross-origin POST rejected | **Pass only after condition C2** (see F-05) |
| T13 | PKCE verified, tampered state rejected, callback replay rejected | **Pass** |
| T14 | No raw token reached the adapter (372 calls, 27 tokens; create, findOne, findMany, update, delete, deleteMany) | **Pass** |
| T15 | Exact version pin; wrapper refuses unreviewed adapter methods | **Pass** |
| T16 | Sign-in rate limited (429 after the limit) | **Pass** (memory store; see F-08) |
| T17 | Token rotation on refresh | Observed: **no rotation**, only the expiry extends |
| T18 | `/get-session` exposes the raw token to browser JavaScript | **Confirmed** (see F-03); mitigation passes |

## 3. Findings

| ID | Finding | Evidence | Consequence |
|---|---|---|---|
| F-01 | Better Auth stores the raw session token unless wrapped; the opt-in hashing is only a draft PR | Source; GitHub PR #11444 | Wrapper needed (C1) |
| F-02 | Only `db/internal-adapter.mjs` touches the session table, but some work runs through a transaction adapter, and the adapter interface has 13 members (incl. `consumeOne`, `incrementOne`) | Source audit | Wrapper covers all members, wraps transactions, and fails closed on unknown members (T15) |
| F-03 | `/get-session` returns the raw session token in its JSON, and stock `/list-sessions` returns the tokens of **all** the user's sessions. Any XSS could read them, which defeats HttpOnly | T18; source | Disable these HTTP routes; read sessions on the server only (C3) |
| F-04 | Token-based revocation endpoints (`/revoke-session`, `/revoke-other-sessions`) cannot work with hashed storage. Better Auth looks the row up before deleting, and lookups always hash. They report success but revoke nothing (fail closed) | Tests | Disable them; provide id-based revocation in the identity module (tested) (C3) |
| F-05 | **Better Auth disables its origin/CSRF checks automatically when `NODE_ENV=test` or `TEST` is set.** A stray environment variable in a deployment would silently remove CSRF protection | `context/create-context.mjs`; T12 failed until fixed | Set `disableOriginCheck: false` and `disableCSRFCheck: false` explicitly (C2) |
| F-06 | Google `hd` is checked against the ID token claim (exact match, missing claim rejected); `emailVerified` comes from `email_verified`. Google's own docs say the `hd` request parameter alone must not be trusted | Source; Google OpenID Connect docs | Keep the server-side policy as a second check (C4) |
| F-07 | The session token is 32 random alphanumeric characters (about 190 bits) and is not rotated on refresh | Source; T17 | Acceptable with immediate revocation; periodic rotation is OI-05 |
| F-08 | Rate limiting works, but the `memory` store is per process and shared by every instance in it. `secondary-storage` would also move sessions out of Postgres (forbidden) | T16; source | Production: `database` storage or a custom Redis store (C5) |
| F-09 | Telemetry is opt-in (off by default) | `@better-auth/telemetry` source | Keep `telemetry.enabled: false` explicitly |
| F-10 | Recent Better Auth advisories include critical/high account-takeover bugs (fixed by 1.7.7); most are in plugins we do not use | GitHub advisories | Enable no extra plugins; re-check advisories before every upgrade (C6) |
| F-11 | Database hooks run before the adapter, so they see raw tokens | Source | Hooks must never log session data (C7) |

## 4. Conditions for production use (if approved)
- **C1:** Use the wrapper exactly as tested, over the Prisma adapter. Pin `better-auth` exactly. Re-run this suite before any upgrade. Drop the wrapper once upstream hashing ships and is verified.
- **C2:** Pin `advanced.disableOriginCheck: false` and `advanced.disableCSRFCheck: false`.
- **C3:** Disable `/get-session`, `/list-sessions`, `/revoke-session`, `/revoke-sessions` and `/revoke-other-sessions` over HTTP. Sessions are read server-side (`auth.api.getSession`); listing and revocation use session ids through the identity module.
- **C4:** Keep `hd` plus the server-side identity policy (exact domain, `email_verified`, lower-cased), with the domain from configuration (OI-51).
- **C5:** Production rate limiting uses shared storage (database or Redis custom storage), never `secondary-storage`.
- **C6:** No Better Auth plugins beyond what a reviewed ADR adds.
- **C7:** No logging of session objects in hooks or errors.

## 5. Owner decisions (2026-10-24)
1. **G-1b-spike:** approved. Better Auth with C1 to C7 is the basis for implementation.
2. **ADR-0006:** approved: single hashed session token, provided expiration and immediate revocation are secure.
3. **OI-05:** approved: 7-day sliding, **30-day absolute maximum enforced server-side**, new token at sign-in, no periodic rotation. (T10 is implemented and tested in the production identity module, not in the spike.)
4. **OI-51:** approved: keep `@thapar.edu` only (FR-AUTH-1), enforced server-side from verified Google claims; unverified and lookalike addresses rejected.
