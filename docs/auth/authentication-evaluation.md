# Authentication Evaluation and Spike Test Plan

**Status:**
- The spike is `[APPROVED 2026-10-23]`: evaluate Better Auth + a hashing wrapper, with Arctic as the fallback.
- **Neither the wrapper nor the single-token representation is production-approved.** They become eligible only after the security properties in §8 are demonstrated and the owner has reviewed the findings report.

Evidence below was checked on 2026-10-23 against official Better Auth docs, the better-auth GitHub repository, and the npm registry.

## 1. Complete authentication requirements

| ID | Requirement | Source |
|---|---|---|
| A-R1 | Google OAuth only, restricted to @thapar.edu | FR-AUTH-1 `[SPEC]` |
| A-R2 | First-login profile completion (name, roll number, branch, year, ≥3 tags from a controlled set) | FR-AUTH-2, §4.4.1 `[SPEC]` |
| A-R3 | Sessions stored as **hashed** tokens in the DB; credentials delivered in **HTTP-only secure cookies** | FR-AUTH-3 `[SPEC]` |
| A-R4 | Server-side session revocation by administrators | FR-AUTH-4 `[SPEC]` |
| A-R5 | No tokens in localStorage (session hijacking mitigation) | Table 4.4 `[SPEC]` |
| A-R6 | CSRF token on all mutating endpoints | Table 4.4 `[SPEC]` |
| A-R7 | Rate limiting against brute force | Table 4.4 `[SPEC]` |
| A-R8 | Revoked session → subsequent API calls return 401 | §6.1.2 `[SPEC]` |
| A-R9 | Non-Thapar OAuth attempts rejected at the authentication layer | §6.1.4 `[SPEC]` |
| A-R10 | Session validation on every request (expiry, revocation, banned user) | derived `[PROPOSED]` |
| A-R11 | Logout invalidates the session server-side and clears the cookie | derived `[PROPOSED]` |
| A-R12 | Token rotation policy defined (login, privilege change, periodic?) | owner request; OI-05 |
| A-R13 | Recovery procedures: lost device, suspected theft, DB leak, secret leak, DB restore, admin lockout | owner request; §6 |
| A-R14 | Session expiry: sliding idle expiry + absolute lifetime cap | derived; OI-05 |

## 2. Representation under evaluation (ADR-0006, `[PROPOSED]`)

**Literal reading of FR-AUTH-3:** a short-lived *access token* in a cookie, plus a long-lived *refresh token* stored hashed in the DB.

**Proposed representation:** one opaque, high-entropy random **session token**.
- It is delivered in an HTTP-only, Secure, SameSite=Lax cookie.
- The DB stores only `SHA-256(token)`.
- Every request validates the token by hashing it and looking it up.

| Property | Access + refresh (literal) | Single hashed session token (proposed) |
|---|---|---|
| DB leak yields usable credentials | No (refresh hashed). Stateless access tokens may still be valid until expiry if signing keys leak | No |
| Revocation latency | Up to the access-token lifetime, unless a deny-list is checked every request | **Immediate**: every request hits the DB |
| Per-request DB cost | Low (stateless access token) | One indexed lookup per request |
| Theft detection via refresh-token reuse | Possible with rotate-on-refresh + reuse detection | **Not provided** unless periodic rotation is added (§5) |
| Implementation complexity | Higher (two tokens, refresh endpoint, rotation races) | Lower |
| Library support | Neither Better Auth nor Auth.js models this pair | Native in Better Auth, **except hashing** |

**Assessment:** the proposed form keeps the intent of FR-AUTH-3 (no usable token at rest, cookie-only delivery, server-side revocation) and improves revocation latency. It **loses** refresh-reuse theft detection. Whether that loss is acceptable, or whether periodic rotation must be added, is **OI-05** and requires owner approval.

## 3. Better Auth 1.7.12 against the requirements

| Requirement | Finding | Source | Result |
|---|---|---|---|
| A-R1 | Google provider supports `hd: "thapar.edu"`; tokens without matching `hd` are rejected. The mapping of Google `email_verified` → `emailVerified` is **not documented** | better-auth.com/docs/authentication/google | Partial: add our own server-side checks (§4.1) |
| A-R3 hashing | Session `token` column "is also used as the session cookie", so it is stored **raw**. `session.storeTokenHash` exists only in **draft PR #11444** (opened 2026-09-28, unmerged) | session-management docs; GitHub PR #11444 | **Incompatible** without a wrapper |
| A-R3 cookies | "All cookies are httpOnly and secure when the server is running in production mode"; `SameSite=Lax` default; session cookie is secret-signed | cookies + security docs | OK |
| A-R4 / A-R8 | `revokeSession`, `revokeOtherSessions`, `revokeSessions`; admin plugin `revokeUserSession(s)`, `listUserSessions`; ban revokes all sessions | admin plugin docs | OK, but **cookie cache must stay disabled**: "revoked sessions may remain active … until the cookie cache expires" |
| A-R5 | Cookie-based; no localStorage | – | OK |
| A-R6 | Origin check against base URL / `trustedOrigins`; Fetch Metadata for first login. Covers Better Auth endpoints **only** | security docs | OK for auth endpoints. **App endpoints need our own CSRF control** (threat-model §4) |
| A-R7 | Rate limiting enabled on all routes by default; storage location and limits not documented | security docs | Verify in spike; Redis-backed limiter for app routes |
| A-R10 | DB lookup per request (no cookie cache); `expiresIn` 7 days default; `updateAge` 1 day extends expiry | session docs | OK |
| A-R12 | Docs describe refresh as extending expiry; **no documented token rotation** on refresh | session docs | Gap: see §5 |
| A-R14 | Sliding expiry only; no documented absolute cap | session docs | Gap: implement the cap in a validation hook or the wrapper |
| Secondary storage | If `secondaryStorage` is configured, sessions move there (e.g. Redis) | session docs | Must **not** be configured (violates "Postgres authoritative") |
| Versions | 1.7.12 (2026-10-20); peers support Next 16 and Prisma 7 | npm registry | OK |

## 4. Proposed implementation details (to be proven in the spike)

### 4.1 Domain and identity checks (defence in depth)
1. Provider config `hd: "thapar.edu"`.
2. Server-side hook before user/session creation:
   - email lower-cased must end in exactly `@thapar.edu` (no subdomains, no lookalikes)
   - Google `email_verified === true`
   - `hd === "thapar.edu"`

   Reject otherwise and write an audit entry.
3. The test matrix (§8, T11) covers lookalike and edge cases.

### 4.2 Hashing wrapper (Better Auth path)
A thin decorator around the Prisma adapter, applied **only to the `session` model**:
- `create`: replace `data.token` with `sha256(token)` before writing. Return the record with the **raw** token (known from the input) so Better Auth can set the cookie.
- `findOne` / `findMany` / `update` / `delete` / `deleteMany`: if a `where` clause targets `token`, replace its value with `sha256(value)`. Returned records carry the raw token only when it came from the where clause; otherwise a placeholder, never the hash presented as a token.
- Better Auth's documented `customTransformInput` is **not** used. Its documented scope is written data, not where-clauses (create-a-db-adapter docs).
- Admin revocation uses **session id**, through the identity service, never a token.

### 4.3 Compatibility issues to verify in the spike
| Issue | Risk | Handling |
|---|---|---|
| Code paths in Better Auth that read/write `session.token` outside the adapter calls above | Raw token written or lookups fail | Source audit of the pinned version; instrumented test (T14) |
| `listSessions` / `admin.listUserSessions` return stored values | Hash shown where a token is expected | Do not expose these lists with tokens; use ids |
| `admin.revokeUserSession({ sessionToken })` needs a raw token | Admin can't revoke by token | Revoke by id through our service |
| `databaseHooks.session.*` may see raw or hashed values depending on wrapper position | Leaking raw token into logs | Hooks must never log tokens; test |
| Cookie cache, secondaryStorage, one-time-token, bearer, JWT, multi-session plugins | Bypass DB validation or store raw tokens | Not enabled; config test asserts this |
| Library upgrades change internals | Silent regression | Exact pin; T01–T14 must pass before any upgrade; drop the wrapper once `storeTokenHash` ships and is verified |
| Signed cookie value format (`token.signature`) | Hash the wrong substring | Spike verifies what the adapter receives |

### 4.4 Fallback: Arctic + own session module
- **Arctic 3.7.0** (last published 2025-05-21; maintenance status to be assessed in the spike) handles the Google authorization-code flow with state + PKCE.
- ID-token claims are verified server-side (`iss`, `aud`, `exp`, `hd`, `email_verified`).
- Own session module (≈150–250 lines), following the published Lucia session guidance. Lucia was deprecated in March 2025 and its site is now a learning resource:
  - ≥ 160-bit random token
  - SHA-256 stored
  - sliding + absolute expiry
  - revoke by id / user
  - optional rotation
- Trade-off: hashing is satisfied natively, but the team owns more security-critical code, which needs more review and tests.

## 5. Rotation policy (OI-05) `[APPROVED 2026-10-24]` except where marked
| Event | Behaviour |
|---|---|
| Sign-in | Always a new session and token (session-fixation defence) `[APPROVED]` |
| Privilege change (role set, faculty claim approved, admin granted/removed) | Revoke all of the user's sessions → re-login `[PROPOSED]` |
| Ban | Revoke all (Better Auth ban behaviour) |
| Periodic | **Option A `[APPROVED 2026-10-24]`:** no periodic rotation; immediate revocation + 7-day sliding expiry + **30-day absolute cap enforced server-side**. (Option B, 24-hour rotation, was not chosen.) |

## 6. Recovery procedures `[PROPOSED]`
| Scenario | Procedure |
|---|---|
| Lost device / suspected cookie theft | User: "Sign out all other devices". Admin: revoke all sessions for the user. Audit-logged |
| DB leak | Tokens are hashed, so leaked rows are unusable. Still revoke all sessions, rotate the DB credentials, review audit logs |
| Auth secret (`BETTER_AUTH_SECRET`) leak | Rotate the secret (Better Auth 1.5+ supports rotation without invalidating sessions), **then revoke all sessions** |
| DB restored from backup | Restored data may resurrect revoked sessions → **revoke all sessions after any restore** (runbook step) |
| Admin locked out | `ADMIN_EMAILS` bootstrap allow-list (OI-09) grants admin on next login; audit-logged |
| User loses Google/Thapar account access | Recovery is through Google/Thapar IT; the app has no password reset. Alumni access: OI-27 |

## 7. Auth-specific threat model
| Threat | Mitigation | Test |
|---|---|---|
| Non-Thapar or unverified account signs in | `hd` + server-side domain + `email_verified` checks | T11 |
| Session token theft via XSS | HTTP-only cookie; CSP; sanitisation | T03, security suite |
| DB dump used to hijack sessions | Hashed tokens | T01, T02 |
| Session fixation | New token per sign-in | T09 |
| CSRF on auth endpoints | Better Auth origin check | T12 |
| CSRF on app endpoints | Own CSRF control (threat-model §4) | security suite |
| OAuth code/state injection | State + PKCE | T13 |
| Revocation bypass via caches | Cookie cache disabled; no secondaryStorage | T06 |
| Brute-force / enumeration of auth endpoints | Rate limiting | T16 |
| Long-lived stolen session | Sliding 7 d + absolute cap + revoke-all | T08, T10 |
| Library regression on upgrade | Pin + regression suite | T15 |

## 8. Spike plan and go/no-go criteria

**Scope:** local only (Docker Postgres). OAuth is exercised first against a **local mock OIDC provider**. A real Google OAuth client requires creating a Google Cloud project/client, which is an external service, so it needs **separate owner approval** before use (Gate G-1b-oauth). Timebox: 1–2 days. Output: `docs/auth/spike-findings.md`.

| ID | Test | Required |
|---|---|---|
| T01 | After login, no row in `sessions` contains the cookie's token value | Go |
| T02 | Presenting a stored DB value as the cookie → 401 | Go |
| T03 | Cookie attributes: HttpOnly; Secure (prod mode); SameSite=Lax; Path=/; host-only; prefix as configured | Go |
| T04 | Validation rejects expired, revoked, banned-user and tampered-signature cookies | Go |
| T05 | Logout deletes the row and clears the cookie; replaying the old cookie → 401 | Go |
| T06 | Admin revoke by session id → next request 401 (no cookie cache) | Go |
| T07 | Ban / role change revokes all of the user's sessions | Go |
| T08 | Sliding refresh (`updateAge`) works with hashed storage | Go |
| T09 | Each sign-in issues a new token; a pre-login cookie is never promoted | Go |
| T10 | Absolute lifetime cap enforced (if approved in OI-05) | Go if approved |
| T11 | Domain matrix rejects: `@gmail.com`; `@thapar.edu.evil.com`; `@student.thapar.edu` (subdomain); `email_verified=false`; missing/mismatched `hd`. Accepts upper-case `@THAPAR.EDU`, normalised | Go |
| T12 | Cross-origin POST to auth endpoints rejected | Go |
| T13 | Tampered OAuth `state` / missing PKCE verifier rejected | Go |
| T14 | Instrumented adapter: zero raw-token reads/writes on the session model across sign-in, validation, refresh, list, revoke, sign-out | Go |
| T15 | Version pinned; upgrade procedure documented | Go |
| T16 | Auth endpoints rate-limited → 429 | Go |
| T17 | Observe and document whether the token changes on refresh | Informational |

- **Go:** all "Go" tests pass, the source audit finds no unwrapped token path, **and** the owner reviews the findings.
- **No-go:** run the Arctic fallback spike with the same tests (T14 adapted to the own module).
