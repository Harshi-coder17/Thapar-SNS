# Security Requirements and Threat Model

## 1. Security requirements `[SPEC]`
- NFR-SEC: OWASP Top 10 compliance; HTTP-only cookies; CSRF protection; input sanitisation; CSP headers; quarantine-first uploads.
- OBJ-5 / EVAL-3: pass relevant OWASP Top 10 checks, with emphasis on injection, broken authentication and IDOR.
- Spec Table 4.4 (verbatim mitigations; the "Phase" column refers to the spec's roadmap):

| Threat | Mitigation | Spec phase | Our slice |
|---|---|---|---|
| XSS | Server-side HTML sanitization (allowlist), CSP headers, output encoding | 2 | 1b (CSP), 2a (sanitiser) |
| Session hijacking | HTTP-only secure cookies, no localStorage tokens | 1 | 1b |
| CSRF | CSRF token on all mutating endpoints | 1 | 1b |
| File-based attacks | Quarantine-first pipeline, magic byte validation, MIME check, size limits | 2 | 2d, 3a |
| Double-action bugs | Database unique constraints on interests, votes, registrations | 2 | 2b, 2d |
| Cross-society escalation | Per-row membership check, not blanket role check | 2 | 2a |
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
- Better Auth endpoints: the library's Origin check (`trustedOrigins` = production + preview domains).
- Next.js Server Actions: framework Origin check, plus the CSRF token below.
- App route handlers: (a) reject requests whose `Origin` (or `Sec-Fetch-Site`) is not same-origin, **and** (b) require an `X-CSRF-Token` header matching a per-session token (synchronizer pattern; the token is derived from the session and kept server-side). This satisfies the spec's "CSRF token on all mutating endpoints".
- Session cookie `SameSite=Lax` as an additional layer.

## 5. Content Security Policy `[PROPOSED]`
Nonce-based `script-src`. `object-src 'none'`. `base-uri 'self'`. `frame-ancestors 'none'`. `connect-src` limited to self, the service WSS origin and the R2 endpoint. `img-src` self + R2 + Google avatar host. Start in report-only during 1b, then enforce.

## 6. Rate limiting `[PROPOSED]`
In-memory limiting (spec Phase 1) is ineffective on serverless, because each instance keeps its own counters. Use the Upstash Redis limiter from Slice 1b. If Redis is down, **fail open for reads and fail closed for auth and uploads**, consistent with Redis being disposable. Limits are defined per route group and documented in `docs/api/`.

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

**Deferred with a reason:** Content-Security-Policy and Cross-Origin-Opener-Policy are added in Slice 1b together with the Google sign-in flow, because both depend on that flow's redirects and origins. HSTS `includeSubDomains`/`preload` wait for the production domain decision (gate G-1c).
