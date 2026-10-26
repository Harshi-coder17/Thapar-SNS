# Security Requirements and Threat Model

## 1. Security requirements `[SPEC]`
- NFR-SEC: OWASP Top 10 compliance; HTTP-only cookies; CSRF protection; input sanitisation; CSP headers; quarantine-first uploads.
- OBJ-5 / EVAL-3: pass relevant OWASP Top 10 checks, with emphasis on injection, broken authentication and IDOR.
- Spec Table 4.4 (verbatim mitigations; the "Phase" column refers to the spec's roadmap):

| Threat | Mitigation | Spec phase | Our slice |
|---|---|---|---|
| XSS | Server-side HTML sanitization (allowlist), CSP headers, output encoding | 2 | 1b (CSP), 2a (sanitiser: `src/shared/security/sanitize-html.ts`, sanitize-html 2.18.1; on write and again on read; 40-payload corpus in `tests/unit/security/sanitize-html.test.ts`) |
| Session hijacking | HTTP-only secure cookies, no localStorage tokens | 1 | 1b |
| CSRF | CSRF token on all mutating endpoints | 1 | 1b |
| File-based attacks | Quarantine-first pipeline, magic byte validation, MIME check, size limits | 2 | 2d, 3a |
| Double-action bugs | Database unique constraints on interests, votes, registrations | 2 | 2b, 2d |
| Cross-society escalation | Per-row check against the society's active Head grant on every request (ADR-0013); display groups and titles grant nothing; workspace pages re-check the grant themselves | 2 | 2a (integration P05, HD07; E2E workspace 404) |
| Society left without managers, or a removed Head keeping access | At least one active Head per active society, enforced under a row lock on the society; handover grants before it revokes; revocation effective on the next request (no cached permissions) | 2 | 2a (integration HD04 to HD10) |
| Platform-admin and Head powers confused (an admin acting as a society, or a Head acting as an admin) | Exactly one capacity per request: society (Head grant only) by default, platform admin only when requested and the ADMIN role is confirmed; audited accordingly | 2 | 2a (integration HD16 to HD18) |
| Unattributed actions taken as a society | Every workspace action is audited as the individual on behalf of the society (`onBehalfOfType`, `onBehalfOfId`); the audit log is append-only | 2 | 2a (integration HD13, HD14) |
| Brute force | Rate limiting (in-memory Phase 1, Redis Phase 3) | 1/3 | 1b (see §6: in-memory limiting is ineffective on serverless) |
| Unauthorized file access | Signed download URLs with short expiry | 2 | 2d |

Additional spec security items: UUID keys against enumeration; audit logs; @thapar.edu restriction; signed URL expiry test; checksum mismatch rejection.

## 2. Assets and trust boundaries
- **Assets:** user identity data (email, roll number), sessions, chat messages, uploaded files, unpublished content (draft events, unreviewed projects, pending claims), placement aggregates, admin capabilities, audit logs, secrets.
- **Trust boundaries:**
  - browser ↔ Vercel
  - browser ↔ R2 (signed URLs)
  - browser ↔ service (WSS tickets)
  - Vercel ↔ service (signed nudge/publish)
  - app ↔ Neon / Upstash / R2 (credentials)

## 3. Threats by area (STRIDE-oriented)

| Area | Threat | Mitigation | Test |
|---|---|---|---|
| Authn | Spoofing via non-Thapar accounts | Auth evaluation §4.1 | T11 |
| Sessions | Theft, fixation, DB leak | Auth evaluation §2–§7 | T01–T16 |
| Authz | IDOR on any resource ID | Every service method takes `actor`; repository queries scoped by ownership/visibility; 404 for invisible resources | Generated per-route authz tests (Slice 5) + per-slice tests |
| Authz | Cross-society escalation | `getMembershipRole(user, society)` per row | 2a cross-society test |
| Authz | Privilege escalation to ADMIN/FACULTY | Roles changed only by admin service + audit; FACULTY only through approved claim (ADR-0010) | 4b, 5 |
| Input | Stored XSS in posts, descriptions, comments, chat | Allow-list sanitiser on write; React output encoding; CSP | Payload corpus tests |
| Input | SQL injection | Prisma parameterised queries; raw SQL only through tagged templates; lint ban on `$queryRawUnsafe` | Lint + injection tests |
| Uploads | Malicious or mislabelled files, polyglots, oversize | Quarantine prefix; magic bytes (`file-type`); allowed MIME list; size limits checked at intent **and** at validation; SHA-256 verified by the worker (R2 does not document SHA-256 presign constraints); served with `Content-Disposition: attachment` and the detected type | 2d, 3a |
| Uploads | Direct access to quarantined/unapproved files | Private bucket; download URLs only for APPROVED assets, short expiry | 2d |
| Realtime | Ticket replay, cross-user channel subscription | 30-s JWT, single-use nonce in Redis, channel permission check at subscribe | 3b |
| Realtime | Cross-site WebSocket hijacking | Ticket required (cookies not used on WSS); Origin allow-list | 3b |
| Internal | Forged nudge/publish to service | HMAC signature, timestamp window, internal secret | 3a |
| DoS / abuse | Spam requests, upload floods, chat floods | Per-user + per-IP rate limits (Redis); upload quotas `[PROPOSED]`; message size limits | 1b, 3b, 5 |
| Privacy | Roll numbers / personal data exposure | Field-level visibility rules (OI-27); placement aggregate-only (PLC-3) | 4e, 5 |
| Repudiation | Admin abuse | Append-only audit log | 5 |
| Supply chain | Malicious or vulnerable dependencies | Exact pins + lockfile; `npm audit` / advisory check in CI; no RC/beta; review new dependencies in PRs | CI |
| Config | Secrets leaked to the client bundle | Server-only env access; bundle scan in CI | 1c |
| Errors | Stack traces or internals leaked | Central error mapper; generic 500 messages; structured server logs | 1b |

## 4. CSRF design `[PROPOSED]`
- **Approved design (OI-52, 2026-10-24):** strict server-side Origin validation on every state-changing request (`src/shared/security/origin.ts`: missing, `null`, malformed, foreign origins and non-same-origin `Sec-Fetch-Site` are rejected), `SameSite=Lax` cookies, and OAuth `state` (bound to a signed browser cookie) + PKCE on the GET-only Google callback. A CSRF token is added only for an endpoint these controls cannot protect; the 2026-10-24 audit found none. The token design below is kept for that case.
- Next.js Server Actions: framework Origin check, plus the CSRF token below.
- App route handlers: (a) reject requests whose `Origin` (or `Sec-Fetch-Site`) is not same-origin, **and** (b) require an `X-CSRF-Token` header matching a per-session token (synchronizer pattern; the token is derived from the session and kept server-side). This satisfies the spec's "CSRF token on all mutating endpoints".
- Session cookie `SameSite=Lax` as an additional layer.

## 5. Content Security Policy (implemented in Slice 1b, enforced)
Set per request by `src/proxy.ts` using `src/shared/security/csp.ts` (Next.js nonce pattern, nextjs.org/docs/app/guides/content-security-policy, checked 2026-10-24):
`default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'nonce-…'; style-src-attr 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` plus `upgrade-insecure-requests` over HTTPS. Development adds `'unsafe-eval'` (React tooling); production never does.
- **Enforced directly, not report-only first:** the E2E suite checks every device profile for CSP violations, which replaces the report-only trial. No violations were found.
- **Inline styles (owner rule 2026-10-24: only if required):** `<style>` elements need the nonce (`StyleNonce` passes it to libraries that inject styles, e.g. the drawer's scroll lock). `'unsafe-inline'` applies only to style *attributes* (`style-src-attr`), which `next/image` and Next.js emit and nonces cannot cover; removing it produced violations on every page (measured 2026-10-24). Attribute styles cannot execute code. `script-src` has no `'unsafe-inline'`.
- **Consequence:** every page is rendered per request (`await connection()` in the root layout), so pages are not statically cached.
- **Later slices add** the realtime service origin to `connect-src`, and the storage and Google avatar hosts to `img-src`, when those features arrive.

## 6. Rate limiting `[PROPOSED]`
In-memory limiting (spec Phase 1) is ineffective on serverless, because each instance keeps its own counters. **Implemented in Slice 1b, counters in PostgreSQL (`identity_rate_limits`, shared by all instances):** Better Auth endpoints (C5): 10 sign-in starts and 60 other auth requests per IP per minute. `/api/identity/*` (`api-rate-limit.ts`, atomic upsert, fixed 60 s windows): per address before authentication and per user after it (profile 30/10, admin revocation 60/30, `me` 120 per address); **fails closed** (503) if the store is unavailable. Client IP trust is OI-54. **Later high-volume routes:** the Upstash Redis limiter, from the slice that first needs it. If Redis is down, **fail open for reads and fail closed for auth and uploads**, consistent with Redis being disposable. Limits are defined per route group and documented in `docs/api/`.

## 7. Logging, alerting, exceptional conditions (OWASP A09, A10)
- Security events (login failure, domain rejection, permission denial, revocation, admin actions) are logged with request id and actor id, never tokens or file contents.
- Unhandled errors fail closed (deny), return generic responses, and are captured by the error sink (OI-40).
- Alerts: DEAD outbox rows, service down, auth failure spikes.

## 8. OWASP Top 10:2025 coverage map (verified list, top10.owasp.org/2025)
| Category | Primary controls | Verified in |
|---|---|---|
| A01 Broken Access Control | Per-row authz, actor-scoped repositories, 404-on-invisible, IDOR test generator | 2a–5 |
| A02 Security Misconfiguration | Secure headers, CSP, private buckets, config tests | 1b, 1c, 5 |
| A03 Software Supply Chain Failures | Pinning, lockfile, audit in CI, no RC/beta | 1a, CI |
| A04 Cryptographic Failures | TLS everywhere, hashed session tokens, HMAC internal calls, no custom crypto beyond SHA-256/HMAC from Node crypto | 1b, 3a |
| A05 Injection | Prisma parameterisation, sanitiser, output encoding | 2a+, 5 |
| A06 Insecure Design | Threat model per slice, state machines, constraints | each slice |
| A07 Authentication Failures | Auth evaluation T01–T16 | 1b |
| A08 Software or Data Integrity Failures | Quarantine pipeline, checksum verification, signed internal messages, CI-only deploys | 3a, 1c |
| A09 Security Logging and Alerting Failures | §7 | 3a, 5 |
| A10 Mishandling of Exceptional Conditions | Fail-closed error handling, outbox failure matrix | 1b, 3a |

## 9. Non-negotiable rules (also in CLAUDE.md)
No tokens in localStorage. No raw HTML rendering of user content without the sanitiser. No public bucket. No file bytes through the API. No permission checks based only on global role when a per-row rule exists. No secrets in the repository. No RC/beta dependency without an ADR.

## 10. Client-trust assumption (SEC-CLIENT, approved 2026-10-23)
Every client is treated as untrusted: users can read and change JavaScript, replay or forge requests, and run rooted Android or jailbroken iOS devices. A web app or PWA **cannot** reliably detect or prevent rooting or jailbreaking, and this project makes no such claim. Consequences:
- All authentication, authorization, ownership, validation and business rules run on the server. UI hiding is only a convenience.
- Every endpoint's tests include a "malicious client" case: a direct request without the UI, with another user's IDs, with tampered fields.
- Secrets never reach the browser (verified by the client-bundle scan in `tests/e2e/security.spec.ts`).
- Device attestation (Play Integrity, App Attest/DeviceCheck) is relevant only to native apps, which are out of scope (OI-48).

## 11. Slice 1a security posture (2026-10-23)
**Implemented and tested:**
- Response headers on every route: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb, browsing-topics disabled), `Strict-Transport-Security: max-age=63072000`, and no `X-Powered-By`.
- No server secrets or server-only variable names in the client bundle.
- 404 pages show no stack traces or file paths; the error page is generic.
- Realtime code cannot import the database layer (lint-enforced).
- Environment validation never echoes values.
- Local secrets are generated into gitignored files with mode 0600; Docker ports bind to 127.0.0.1.
- CI uses read-only permissions, SHA-pinned actions and `persist-credentials: false`; untrusted PR text is passed through environment variables, not interpolated into shell.
- Dependency install scripts are denied by default; production dependencies have 0 known vulnerabilities (`npm audit --omit=dev`).

**Not applicable yet (no feature exists):** sessions and cookies, CSRF tokens, server-side input validation of requests, authorization and ownership checks, rate limiting, uploads. These arrive with their slices and their tests (§3, §4, §6).

**Deferred with a reason:** Content-Security-Policy and Cross-Origin-Opener-Policy are added in Slice 1b together with the Google sign-in flow (done: §5, §12). HSTS `includeSubDomains`/`preload` wait for the production domain decision (gate G-1c).

## 12. Slice 1b security posture (production identity, 2026-10-24)
**Implemented and tested** (`tests/integration/identity/identity-auth.test.ts` P01 to P22, `tests/unit/identity`, `tests/unit/security`, `tests/e2e/auth.spec.ts`):
- C1: the database stores only SHA-256 of session tokens; a database value cannot authenticate (P01, P02, P14).
- C2: Origin and CSRF checks pinned on even under test settings; cross-origin POSTs rejected (P12).
- C3: only `sign-in/social`, `callback/google` and `sign-out` reach Better Auth; everything else is 404 at two layers (route allow-list and `disabledPaths`) (P15). Tokens never appear in the application's session view (P18).
- C4: `@thapar.edu`, `email_verified === true` and exact-domain checks on the server, at user creation and again at every session creation; lookalike domains rejected (P11, P20, unit matrix).
- C5: rate limits stored in PostgreSQL (P16).
- C6: no Better Auth plugins.
- C7: identity errors are logged by error name only; Better Auth's logger receives messages only, and unexpected errors are re-thrown to our handler instead of being printed (P19).
- Sessions: 7-day sliding lifetime, refreshed at most daily; 30-day absolute maximum enforced on the server; new token at every sign-in; sign-out and revocation take effect immediately (P04 to P10, P22).
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` with the `__Secure-` prefix over HTTPS, not readable from JavaScript (P03, E2E).
- Every app page checks the session on the server and redirects to `/login` if absent (E2E, every route).
- CSP enforced (§5).

**Added later on 2026-10-24:** strict Origin checks on all state-changing endpoints (OI-52, P23, P24); the E2E test sign-in excluded from production builds (OI-53, `npm run check:build`); profile completion gate (FR-AUTH-2); admin bootstrap with session revocation on privilege change; admin session-revocation API with per-request role check (FR-AUTH-4); append-only audit log enforced by a database trigger (AU01).

**Completed at the end of Slice 1b:** database-backed rate limits on `/api/identity/*` with fail-closed behaviour (RL01 to RL05); permission lookups that fail refuse the request (RL06); `Cross-Origin-Opener-Policy: same-origin` (sign-in uses full-page redirects, not popups; E2E header test); build-exclusion check also covers test Google-key support and client bundles.

**Belongs to later slices (by design):** admin UI and role management, including revoke-all when an admin changes another user's role (Slice 5); daily expired-session cleanup job (Slice 3a, background-jobs.md; expiry is already enforced on every request).

**Not verified locally (needs external resources):** real Google sign-in (needs OAuth credentials and a real @thapar.edu account); HTTPS-only behaviour, platform IP header trust (OI-54) and headers as served by the host (need a deployment, G-1c); physical devices.
