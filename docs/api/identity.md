# API Contract: identity (Slice 1b)

Mirrors `src/modules/identity` and the route handlers in `src/app/api/`. Only the endpoints below are reachable; every other `/api/auth/*` path returns 404 (allow-list in `request-guard.ts`, condition C3).

### POST /api/auth/sign-in/social
Auth: public. CSRF: strict Origin check + SameSite (OI-52). Rate limit: 10 per IP per minute (database-backed, C5).
Request: `{ "provider": "google", "callbackURL": "/" }`
Response 200: `{ "url": "https://accounts.google.com/...", "redirect": true }`. The browser navigates to `url`. State and the PKCE verifier are stored server-side (`identity_verifications`, 10 minutes).
Errors: 403 cross-origin; 404 when Google is not configured; 429 rate limited.
Requirement IDs: FR-AUTH-1. Tests: identity-auth P11 to P13, P16.

### GET /api/auth/callback/google
Auth: public (called by Google). CSRF: OAuth `state` bound to a signed browser cookie + PKCE. POST is refused (404).
Behaviour: exchanges the code, verifies Google's ID token, applies the identity policy (verified email, exact `@thapar.edu`), creates the user (role `STUDENT`) on first sign-in, creates a session with a new token, sets the session cookie, redirects to `callbackURL`.
Errors: redirect to `/login?error=<code>`; the login page shows a fixed message per code (`sign-in-errors.ts`) and never echoes the code.
Requirement IDs: FR-AUTH-1, FR-AUTH-3. Tests: P09, P11, P13, P20.

### POST /api/auth/sign-out
Auth: session cookie. CSRF: strict Origin check + SameSite (OI-52).
Response 200: `{ "success": true }`; deletes the session row and clears the cookie.
Requirement IDs: FR-AUTH-3. Tests: P05, E2E "sign-out ends the session on the server".

### POST /api/test-auth/sign-in (E2E builds only)
Not present in normal or production builds (OI-53). In an E2E build: 404 unless `E2E_TEST_AUTH=1` on a loopback URL off any deployment; same-origin requests only (403 otherwise).
Request: `{ "email": string, "name"?: string, "emailVerified"?: boolean, "hd"?: string }`. The identity goes through Better Auth's ID-token path and the same identity policy.
Tests: P20, P21, E2E setup.

### Common to /api/identity/*
Rate limits (PostgreSQL, fixed 60 s windows): per client address before authentication and per user after it; profile 30 per address and 10 per user, admin revocation 60 and 30, `me` 120 per address. Over the limit: 429 `RATE_LIMITED` with `Retry-After`. If the rate-limit store, session lookup or permission lookup fails: 503 `UNAVAILABLE`, nothing changed. Tests: RL01 to RL06.

### GET /api/identity/me
Auth: session cookie. Response 200: `{ "user": { id, name, email, role, image }, "profileComplete": boolean }` (never a token or roll number). 401 `UNAUTHENTICATED` without a valid session.
Tests: PR02, AD02 to AD04.

### POST /api/identity/profile
Auth: session cookie. CSRF: strict Origin check. Completes the first-time profile once (FR-AUTH-2).
Request: `{ "name": string(2..100), "rollNumber": string(6..15 letters/digits), "branchCode": string, "year": 1..5, "tags": string[3..10] (tag slugs) }`
Response 200: `{ "ok": true }`. Errors: 400 `VALIDATION` with `fields`; 401; 403 `FORBIDDEN_ORIGIN`; 409 `ROLL_NUMBER_TAKEN` or `ALREADY_COMPLETED`.
Tests: PR02 to PR06, E2E onboarding.

### POST /api/identity/admin/sessions/revoke
Auth: session cookie, role ADMIN (checked from the database on every request). CSRF: strict Origin check.
Request: `{ "userId": uuid }` (all sessions of a user) or `{ "sessionId": uuid }` (one session), not both.
Response 200: `{ "revoked": number }`; the revoked user's next request is 401. Errors: 400, 401, 403 (`FORBIDDEN` or `FORBIDDEN_ORIGIN`), 404.
Side effects: audit entry `identity.sessions.revoked` in the same transaction.
Requirement IDs: FR-AUTH-4. Tests: AD02 to AD04.

### GET /api/identity/session
Auth: session cookie (an incomplete profile is allowed). Rate: read rules. Does **not** count as activity.
Response 200: `{ "deviceClass": "desktop" | "mobile", "idleExpiresAt": ISO, "absoluteExpiresAt": ISO, "serverNow": ISO }`. 401 when the session has ended (it is deleted on the server).
Requirement IDs: session policy (`docs/auth/session-policy.md`). Tests: SP01 to SP03, E2E `session.spec.ts`.

### POST /api/identity/activity
Auth: session cookie. CSRF: strict Origin check. Records that the user is present (click, key, touch or scroll in an open page; sent at most once a minute per tab). Body `{}`.
Response 200: as `GET /api/identity/session`, with the inactivity deadline moved forward (never past `absoluteExpiresAt`). 401 when the session has ended.

### Session limits on every protected request
Every page and API checks the session against `docs/auth/session-policy.md`: computers 30 minutes inactivity and 12 hours absolute, phones 7 days and 30 days. Change requests (POST, PUT, PATCH, DELETE) count as activity; reads, realtime tickets and status polling do not. An ended session is deleted and the request answers 401 `UNAUTHENTICATED` (pages: redirect to `/login?reason=expired`).

## Session cookie
`better-auth.session_token` (`__Secure-` prefix over HTTPS): `HttpOnly`, `SameSite=Lax`, `Path=/`, host-only, `Max-Age` 7 days. Refreshed (sliding) on page requests by `src/proxy.ts` at most once per day; never after the 30-day absolute maximum. The cookie's lifetime is an upper bound only: the server's device-class limits (session policy) end the session behind it earlier. The token is never returned in a response body.

## Server-side interface (other modules)
`@/modules/identity`: `getCurrentSession(headers)` returns `{ sessionId, expiresAt, user: { id, name, email, role, image } }` or `null` (never a token); `revokeSession(id)`, `revokeAllSessions(userId)`, `revokeOtherSessionsOf({ userId, sessionId })`. Admin revocation over HTTP: see above. Admin bootstrap: `ADMIN_EMAILS` (OI-09).
