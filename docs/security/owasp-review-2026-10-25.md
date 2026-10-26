# OWASP Top 10:2025 review (2026-10-25)

Scope: the complete application on the working tree (web app, API routes, background service, realtime server, import tools) before deployment. The deployment itself is out of scope until Slice 1c.

Category list verified against the official OWASP site, https://top10.owasp.org/2025 (checked 2026-10-25). The page doesn't say whether the list is final.

## How the review was done

1. **Automated probes over the code**
   - raw SQL built from strings (`$queryRawUnsafe`, `Prisma.raw`): none outside the generated client;
   - API routes that bypass the shared guard: none;
   - every `dangerouslySetInnerHTML` source traced;
   - redirects built from input: none;
   - `target="_blank"` without `noopener`: none;
   - `process.env` in client components: none;
   - secret-looking strings in project files: none;
   - SVG uploads: not accepted.
2. **Probes against a production build**
   - response headers;
   - unauthenticated and cross-origin writes;
   - `/.env`;
   - file URLs without a session.
3. **The automated test suites** (unit, integration with PostgreSQL and Valkey, E2E across 14 device profiles). They cover each item below.
4. **A load test** at 200 concurrent users (`docs/testing/load-test-2026-10-25.md`).

## Findings

| # | Category | Finding | Severity | Status |
|---|---|---|---|---|
| F1 | A05 Injection (DOM XSS) | The rich-text editor assigned its starting markup to a contentEditable element without sanitising it in the browser. Server content was already sanitised, but a restored Find Mates draft comes from the tab's own `sessionStorage`. Event handlers in such markup (e.g. `<img onerror>`) can run in contentEditable. Exploitation needs script access to the tab already (self-XSS), so the risk was low. | Low | **Fixed**: `src/shared/security/editor-html.ts` parses the markup into an inert document and keeps the server allow-list only. The editor is filled after mounting; `dangerouslySetInnerHTML` was removed. Regression test: `tests/e2e/platform.spec.ts` ("the editor never runs markup from a restored draft"). |
| F2 | A06 Insecure Design (availability) | Realtime tickets, requested on every page view, used the *write* limit per client address (120 per minute). On a campus network, many students share one public address, so the realtime layer could be throttled for everyone behind it. | Low | **Fixed**: the ticket endpoint uses the read limit (300 per address, 180 per user per minute). |
| F3 | A06 / A07 | Per-address rate limits rely on the client address from `x-forwarded-for`. That is spoofable unless a trusted proxy sets it, and a campus NAT makes many users share one address. | Medium (deployment) | **Open, OI-54**: decide the trusted proxy header and per-address limits at G-1c, once the hosting is known. Per-user limits, applied after authentication, are not affected. |
| F4 | A09 Logging and Alerting | The audit log is append-only (database trigger) and records the capacity used. Errors are logged by name only (no personal data). There is no alerting or error sink yet. | Medium (deployment) | **Open, OI-40**: choose a monitor and an error sink at G-1c. |
| F5 | A02 Misconfiguration | Development mode needs `'unsafe-eval'` for React tooling, and its dev overlay injects style elements that the CSP blocks (console noise in development only). | Info | Accepted. Production builds send no `'unsafe-eval'`, which `tests/unit/security/csp.test.ts` and the production header probe confirm. |
| F6 | A01 Access Control (data) | E2E runs wrote fictitious users, societies and events into the development database, where they appeared in the normal app. This was not a vulnerability, but test data leaked into the real data. | Info | **Fixed**: E2E runs use a separate database (`scripts/e2e/prepare-db.mjs`). The existing fixtures were hidden reversibly (`scripts/dev/hide-e2e-fixtures.mjs`, audited). |

No critical or high findings.

## Evidence by category

**A01 Broken Access Control**
- Every request is authorised on the server, from the database, in exactly one capacity:
  - personal, with society powers only from an active Head grant on that society;
  - or platform, with the ADMIN role and `?as=admin`.
- Capacities never combine.
- IDOR protection: chats, personal calendar entries, uploads, draft events, unreviewed archive projects and other societies' records return 404.
- Cross-object ids are refused (comment parents, screenshot owners, upload purposes).
- Admin pages and APIs re-check the role.
- Tests:
  - `tests/integration/platform/authorization.test.ts`, `gaps.test.ts`, `coverage.test.ts`;
  - `tests/integration/societies/heads.test.ts` (HD07, HD16 to HD18);
  - `tests/e2e/platform.spec.ts` (admin gate; outsider 404 on chat).

**A02 Security Misconfiguration**
- Response headers on production responses:
  - CSP with a per-request nonce and `'strict-dynamic'`;
  - HSTS;
  - `X-Frame-Options: DENY`;
  - nosniff;
  - strict referrer policy;
  - a restrictive Permissions-Policy;
  - COOP same-origin;
  - no `X-Powered-By`.
- The CSP adds only the storage origin (images and uploads) and the realtime origin.
- The service binds to 127.0.0.1.
- Storage CORS allows only the app origin.
- The test sign-in is absent from normal builds (`npm run check:build`).

**A03 Software Supply Chain Failures**
- All 51 direct dependencies are pinned to exact stable versions with a lockfile and a 7-day release cooldown (`npm run check:prerelease`).
- `npm audit`: 0 vulnerabilities.
- Install scripts are allow-listed.
- No scripts are loaded from third-party CDNs.

**A04 Cryptographic Failures**
- Session tokens are stored only as SHA-256 hashes (ADR-0006).
- Cookies are HttpOnly, and Secure over HTTPS.
- Internal keys (nudge HMAC, realtime tickets) are derived with HKDF from the server secret, with a separate label per purpose.
- Signed storage URLs last 5 minutes for downloads and 15 minutes for uploads.
- Constant-time signature comparisons.

**A05 Injection**
- SQL: Prisma queries and tagged-template raw SQL only; search input is passed as a parameter, and LIKE wildcards are escaped.
- HTML: allow-list sanitisation on write and again on read (server), plus F1 in the browser.
- Plain text (chat, comments, notes) is rendered as text.
- iCalendar export escapes and folds text (RFC 5545, tested by parsing it back with ical.js).
- Download filenames are reduced to safe characters before `Content-Disposition`.

**A06 Insecure Design**
- Double actions are prevented by unique constraints: registrations, votes, interests, responses, reports, pending claims.
- Capacities hold under concurrency thanks to row locks: 50 registrations for 10 places; the last team place; 200-user burst in the load test.
- Quarantine-first uploads with magic-byte, MIME, size and SHA-256 checks, a decompression-bomb limit on thumbnails, and a daily quota.
- Body size limits and rate limits on every API.

**A07 Authentication Failures**
- Google sign-in restricted to verified @thapar.edu accounts (server-side, `hd` checked).
- 7-day sliding and 30-day absolute session lifetime.
- Bans and role changes revoke every session; a banned user's existing session is refused on the next request (`gaps.test.ts`).
- The last administrator can be neither banned nor demoted, even concurrently.

**A08 Software or Data Integrity Failures**
- Uploaded files are accepted only if their SHA-256 matches.
- Service nudges are HMAC-signed and fresh within 60 seconds.
- Realtime tickets are signed, single use (nonce stored in Valkey and shared across instances), and limited to channels authorised from the database.
- The service worker caches only immutable build files and an offline page, never personal data.
- Official images are downloaded only over https from thapar.edu hosts, through the same validation.

**A09 Security Logging and Alerting Failures**
- Audit entries record:
  - every privileged change (roles, bans, claims, moderation, placement, society management);
  - the capacity and the society acted for;
  - system jobs.
- Gap: alerting (F4).

**A10 Mishandling of Exceptional Conditions**
- Every API fails closed with a generic 503 and logs the error name only.
- Aborted requests are not logged.
- Background jobs retry with backoff and stop after 8 attempts (DEAD, visible to admins).
- The realtime layer falls back to in-process delivery when Valkey is down; the hint-only design means clients re-read over HTTP.

## Before deployment

Resolve F3 (OI-54) and F4 (OI-40) with the hosting choice. Then repeat the header probe, the load test (OI-33) and the cookie Secure check on the deployed origin.
