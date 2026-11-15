# Phase Report: Slice 1b (Identity and Authentication)

Date: 2026-10-24. Status: **complete and verified locally; awaiting the owner's final review and commit.** Nothing has been committed or pushed yet.

## Decisions applied (owner, 2026-10-24)
- Better Auth 1.7.10 with spike conditions C1 to C7 (ADR-0005); one hashed session token (ADR-0006).
- Sessions: 7-day sliding lifetime, 30-day absolute maximum on the server, new token at each sign-in, no periodic rotation (OI-05).
- `@thapar.edu` only, enforced server-side from verified Google claims (OI-51).
- CSRF: strict Origin validation + SameSite cookies; OAuth state + PKCE on the callback; tokens only where these cannot protect (OI-52). The endpoint audit found none.
- E2E test sign-in excluded from production builds, and failing closed inside E2E builds (OI-53).
- Table prefixes per module (`identity_*`, `admin_*`, ADR-0011).
- CSP: `'unsafe-inline'` only where required (style attributes); script restrictions unchanged.
- Thapar IT confirmation (OI-01) is a production-readiness requirement, not a development blocker.

## What was built (plain language)
- **Google sign-in.** The server accepts only verified Google identities whose email ends exactly in `@thapar.edu`. Without credentials on the server, the button is disabled and says so.
- **Sessions.** The browser holds the token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS). The database stores only its SHA-256 fingerprint. Sign-out and revocation take effect on the next request.
- **Only three Better Auth endpoints are reachable** (start sign-in, Google callback, sign-out), blocked in two independent places.
- **CSRF protection** on every state-changing request, and **CSP** with per-request nonces for scripts and `<style>` elements, plus `Cross-Origin-Opener-Policy: same-origin`.
- **Profile completion (FR-AUTH-2).** First-time users fill in name, roll number, branch, year and 3 to 10 tags at `/onboarding` before any app page opens. The roll number is unique and never sent back to the browser.
- **Administration (FR-AUTH-4).**
  - `ADMIN_EMAILS` bootstrap: older sessions are revoked and the change is audited.
  - An admin API revokes all of a user's sessions or a single one; the admin role is re-read from the database on every request.
  - The audit log is append-only, enforced by a database trigger.
- **Rate limits** for `/api/identity/*` in PostgreSQL (per address and per user). If the limit store, session lookup or permission lookup is unavailable, the request is refused (503).
- **Safe logging:** identity errors are logged by error type only, never with tokens or email addresses.

## Verification (2026-10-24, final code, local machine)
| Command | Result |
|---|---|
| `npm run check` (em-dash, dependency pins, ESLint incl. module boundaries, typecheck, unit + lint-rule tests) | exit 0; 112 tests passed |
| `npm run test:integration` (Testcontainers PostgreSQL 17.9, committed migrations) | exit 0; 58 passed (4 files) |
| `npm run spike:auth` | exit 0; 37 passed, 1 todo |
| `npm run check:build` (normal production build + exclusion check) | exit 0; 295 server and client files scanned, test sign-in and test Google-key support absent; with every E2E variable set the route answers 404 and ID-token sign-in yields no session |
| `npm run test:e2e` (E2E build, 14 emulated devices) | exit 0; 635 passed, 108 skipped (device-specific tests that run on one or two representative profiles) |
| `npm audit` and `npm audit --omit=dev` | 0 vulnerabilities |

What the tests cover:
- **Hashed tokens, expiry, absolute cap, sign-out, revocation:** P01 to P10, P14, P18, P22.
- **Domain and verified-email policy:** P11, P20, P21, and the unit matrix.
- **CSRF/Origin** (missing, `null`, malformed, foreign, cross-site): P12, P23, PR06, AD04, plus the unit tests.
- **OAuth state, PKCE, login CSRF and replay:** P13, P24.
- **CSP:** unit tests and E2E on all devices (zero violations; `script-src` nonce plus `strict-dynamic`, no `unsafe-inline` or `unsafe-eval`).
- **Profile validation and gate:** PR01 to PR06 and E2E.
- **Roll-number privacy:** PR02 and E2E.
- **Admin bootstrap and revocation:** AD01 to AD04.
- **Audit-log integrity:** AU01.
- **Rate limits and fail-closed behaviour:** RL01 to RL06.

Problems found and fixed during verification:
- A tamper test could change only base64 padding bits, so it passed or failed at random. Fixed in both suites.
- Better Auth printed raw error objects to the console. Errors are now re-thrown and logged by name only.
- Parallel E2E workers shared test IP addresses and hit the real sign-in limit. Each worker now has its own range.

## Requires real Google OAuth credentials or a real account (owner action)
- Create the OAuth client (`docs/auth/google-oauth-setup.md`).
- Sign in end to end with a real `@thapar.edu` account.
- Confirm with Thapar IT that TIET accounts may use the app (OI-01, before real users).
- Everything Google-facing was tested automatically against a simulated Google (PKCE, redirect URI, ID-token verification, claims).
- **Update 2026-10-24: real Google sign-in verified locally by the owner.** The owner created the OAuth client (Testing mode, redirect `http://localhost:3000/api/auth/callback/google`), added the credentials to the local `.env`, signed in with their own @thapar.edu account, completed the profile and used the authenticated pages. Before the test, the developer checked (without displaying values) that both variables were set and well formed, and that the authorization request carried the expected redirect URI, `hd=thapar.edu`, PKCE S256 and only the `openid email profile` scopes. Still to verify: rejection of a real non-@thapar.edu account against real Google (covered automatically against the simulated Google), and the deployed origin (G-1c).

## Requires a deployed environment (Slice 1c)
- HTTPS-only behaviour: `__Secure-` cookie, `upgrade-insecure-requests`, HSTS as served by the host.
- Response headers and CSP behind the platform.
- Whether the platform's client-IP header can be trusted for rate limits (OI-54).
- Migrations applied to the managed database.

## Non-blocking limitations
- The seeded skill tags (65), branch list (17, from the TIET admissions FAQ; official sources disagree slightly) and roll-number format (6 to 15 letters or digits) are reasonable defaults the owner can adjust (OI-42, OI-27).
- Planned for later slices:
  - Admin UI and role management, including revoke-all on admin role changes (Slice 5).
  - Daily expired-session cleanup job (Slice 3a); expiry is already enforced on every request.
- Device results come from browser emulation; the physical-device checklist is manual.
- `eslint-plugin-boundaries` 7 marks `mode: "file"` (used once, for `src/proxy.ts`) as deprecated; it still works.
- E2E runs leave fictitious `@thapar.edu` users in the local development database.
- 11 transitive prerelease packages are reported for review (`npm run check:prerelease`). They were already present before this slice and come mostly from the Prisma CLI's Studio dependencies, not app runtime code.
