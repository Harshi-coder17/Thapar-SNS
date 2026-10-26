# Session policy

Status: `[APPROVED 2026-10-26]`: desktop limits (owner request of 2026-10-26), and the phone limits confirmed by the owner on 2026-10-26. Implemented and tested locally 2026-10-26. Extends OI-05 and ADR-0006; nothing in them is weakened.

## 1. Limits

| Device class | Inactivity limit | Absolute limit (from sign-in) | Warning before the end |
|---|---|---|---|
| Computer (desktop, laptop, tablet, unknown) | 30 minutes | 12 hours | 2 minutes before the inactivity limit; 10 minutes before the absolute limit |
| Phone | 7 days | 30 days | 10 minutes before the absolute limit |

- **The absolute limit never moves.** Activity resets only the inactivity timer, and the inactivity deadline is never later than the absolute one.
- **The existing OI-05 rules still apply to both classes:** a new token at every sign-in, a 7-day sliding cookie, the 30-day server-side cap, and no periodic rotation.
- **Why phones are more persistent.** Phones are personal, screen-locked devices, and the app is used in short visits throughout the day. A 30-minute timeout would force a Google sign-in on almost every visit. The phone policy is exactly the one the owner approved for all devices on 2026-10-24 (OI-05), so it adds no new risk. Confirmed by the owner on 2026-10-26.
- **How the class is decided.** On the server, from the User-Agent recorded when the session was created (`classifyDevice` in `src/modules/identity/session-policy.ts`):
  - Phones (iPhone, Android "Mobile", Windows Phone) are mobile.
  - Everything else, including tablets and unknown agents, gets the stricter computer limits.
  - The class is fixed at sign-in. Changing the User-Agent later has no effect, because the session row keeps the original value. A forged User-Agent at sign-in can claim the phone limits, which are themselves approved limits (OI-05).

## 2. What counts as activity

| Counts (resets the inactivity timer) | Does not count |
|---|---|
| Any change request (POST, PUT, PATCH, DELETE through the API guard) | Page and API reads (GET) |
| A click, key press, touch or scroll in an open page (sent as `POST /api/identity/activity`, at most once a minute per tab) | Background polling of the session status, realtime ticket requests, the realtime connection itself |
| Opening a page (one ping when the app shell mounts) | A tab left open in the background |

The server writes `lastActiveAt` at most once every 30 seconds per session to limit database writes.

## 3. Enforcement (server side)

Every protected request is checked in the same place, `readCurrentSession` (`src/modules/identity/sessions.ts`). That covers app pages (`requireSession`), every API action (`runAction`, `societies/http.ts`), realtime tickets and uploads.

- **Checks, in order:**
  1. Better Auth's own session (signature, expiry, revocation);
  2. the 30-day cap;
  3. the device-class limits (`checkSession`).
- **A session that fails any check** is deleted from the database at once, and the request is treated as signed out:
  - APIs answer 401 `UNAUTHENTICATED`;
  - pages redirect to `/login?reason=expired` when a session cookie was sent, otherwise to `/login`.
- **The daily session cleanup** also removes sessions past these limits.
- **Revocation** is unchanged:
  - a revoked or signed-out session is refused on its next request;
  - "Sign out everywhere" (admin, FR-AUTH-4) deletes the user's other sessions immediately.

## 4. In the browser

`src/shared/layout/session-guard.tsx`, mounted in the app layout:

- **Status.** It reads `GET /api/identity/session` every minute and whenever a tab becomes visible again. This read does not count as activity.
- **Warnings.**
  - Inactivity, on computers only: "Are you still there?", with a countdown and **Stay signed in** (which records activity).
  - Absolute limit: "Your session is ending soon", with the end time, **Sign in again now** and **Sign out**.
- **When a deadline passes.** It asks the server first, because another tab may have kept the session alive. If the session has ended:
  1. It fires `thapar:session-ending`, so open forms save their drafts. The teammate request form saves to `sessionStorage` and restores the draft after sign-in (UC-10 E2).
  2. It goes to `/login?reason=expired`, which explains the limits.
- **A 401 from any API call** made through `callApi` does the same.
- **Several tabs.** Tabs share status and "ended" through a `BroadcastChannel`, so activity in one tab clears the warning in the others, and an end in one tab ends all of them. Browsers without `BroadcastChannel` find out on their next request.
- **Background tabs, sleep and browser restarts.** The deadlines live on the server, so timers that a browser slows or stops do not matter:
  - the next request or visibility check finds the true state;
  - the cookie survives a browser restart, but the session behind it still has to pass the checks.

## 5. What is stored where

- **Session cookie:** the only credential, a random token in an `HttpOnly`, `Secure` (over HTTPS), `SameSite=Lax`, host-only cookie.
- **Database:** only a hash of the token.
- **The browser** stores no token, no Google OAuth secret and no session data in `localStorage`, `sessionStorage` or IndexedDB.
- **Drafts** saved on session end hold only the user's own form text.
- **Google tokens** are never stored by the app (ADR-0006).

## 6. Tests

| Area | Tests |
|---|---|
| Policy rules, device classes | `tests/unit/identity/session-policy.test.ts` |
| Server enforcement | `tests/integration/identity/identity-auth.test.ts`: P10 (30-day cap on phones), P18 (session view shape), and SP01 to SP05:<br>• SP01: desktop inactivity ends and deletes the session<br>• SP02: activity versus background reads, and the 12-hour limit<br>• SP03: phone persistence and the 7-day limit<br>• SP04: protected API 401 after expiry, with only change requests counting as activity<br>• SP05: sign out everywhere |
| Browser | `tests/e2e/session.spec.ts`:<br>• warning and "Stay signed in";<br>• expired session to the login page with the explanation, and the API refusing it;<br>• expired page request;<br>• a phone still signed in after two hours idle |

## 7. Effect on existing sessions

- Desktop sessions older than 12 hours, or idle for more than 30 minutes, end on their next request after this change; their users sign in again.
- Phone sessions are unaffected.
