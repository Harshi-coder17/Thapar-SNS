# Slices 2b to 6: phase report (2026-10-25)

All work is on the working tree of `spike/auth/better-auth`. Nothing was staged, committed, pushed, merged or deployed. Deployment (Slice 1c) waits for the owner's explicit authorisation.

## 1. What was built

| Slice | Delivered |
|---|---|
| 2b Events | Society events by any active Head (from the workspace, attributed to the society). Campus events by admins. Up to 10 custom registration questions. Drafts, publishing, editing and cancellation. Registration with a row lock, a first-come-first-served waitlist and promotion. Cancelling one's own registration. "Interested" with a live count. Registration list for managers. |
| 2c Find Mates | Requests (type, subject, skills, team size 2 to 10, expiry), browsing and filters, best-match sort by skill overlap, responses, accept and decline with notifications, closing at team size under concurrency, closing early. If the session has expired, the draft is restored after signing in again (UC-10 E2). |
| 2d Uploads | Quarantine-first uploads. The browser hashes the file and PUTs it to storage with a signed URL. The service checks magic bytes, MIME type, size and SHA-256, makes WebP thumbnails, publishes the file and deletes the quarantine copy. Rejections carry a reason and a notification. Study material: browse, filter, search, one vote per student, signed 5-minute downloads, uploader delete. Society logo and banner upload by Heads. |
| 3a Service | `npm run service`: outbox worker (SKIP LOCKED claims, 2-minute lease, backoff, DEAD after 8 attempts), a signed nudge endpoint, a 5-minute sweep, and scheduled jobs (expired stories, mate expiry, stale uploads, event status, calendar window, outbox retention, stale sessions). |
| 3b Realtime | A WebSocket server in the service. 30-second single-use tickets authorised per channel by the app. Origin check. Valkey pub/sub with an in-process fallback. Live notification badge, interest counts and chat. |
| 4a Chat | One conversation per accepted response, for its two participants only. Plain text, stored first, then announced live. |
| 4b Faculty | The official directory: 577 profiles. Full-text plus trigram search (typo tolerant), department filter, pagination. Claims with admin approval (ADR-0010). Allow-listed edits by the linked faculty member. |
| 4c Archive | Submission with GitHub link, tags and screenshots. Admin review before publication. Votes. Comments threaded three levels deep. Search. |
| 4d Calendar | Academic, Campus, Society and Personal layers. Recurrence (RRULE subset) materialised for 90 days. Month and agenda views. Authenticated RFC 5545 export. |
| 4e Placement | Aggregate records only, entered by admins through a form or CSV (per-student columns rejected). Every change audited. k = 5 primary and complementary suppression on the whole table before any filter. Unofficial-data label and citations. No data supplied, so none is shown. |
| 5 Administration | Overview with metrics. Users (roles and bans, each revoking sessions; never one's own account or the last admin). Moderation reports (hide, dismiss, restore). Faculty claims. Archive reviews. Placement data. Failed background jobs. Audit log viewer. |
| 6 Polish | PWA manifest, icons, service worker (static files and an offline page only; never personal data). Time-to-first-match metric. Login photograph. Profile page and public profiles. Home dashboard (your events, upcoming events, matching teams). |

## 2. Security

- **One capacity per request.** Personal by default. The platform capacity needs `?as=admin` and the ADMIN role, and gives no society powers. Society powers come only from an active Head grant on an active society, read from the database on every request.
- **Tested combinations:**
  - an admin without a grant cannot act as a Head;
  - a Head who is also an admin gets no society powers in the platform capacity;
  - revocation applies on the next request, for that society only;
  - another society's ids are refused;
  - an imported, never-activated society is "not found" for students.
- **Audit records** show the capacity used: on behalf of the society for Head actions, without a society for admin actions.
- **IDOR:**
  - chats, personal calendar entries, uploads and draft events are 404 for anyone without access;
  - comments must belong to the same project;
  - uploads can be attached only by their owner and for their purpose.
- **Concurrency:** 50 simultaneous registrations for 10 places give exactly 10 registered and 40 waitlisted; five simultaneous acceptances for the last team place accept exactly one; concurrent votes count once.
- **Rate limits and body sizes** apply on every endpoint. A disconnecting client is not logged as an error.
- **CSP:** only the storage origin (image and connect sources) and the realtime origin (connect source) were added.

## 3. Data

Official Thapar data was treated as verified (owner instruction 2026-10-25). Before the first import, a database backup was written to the session scratchpad.

**Faculty**
- 577 profiles from the official faculty pages; 22 people listed under two units were merged by institutional email.
- Two published emails that are not @thapar.edu addresses are not shown.
- 52 of 53 official photos were imported; one exceeds the 2 MB limit (OI-60).

**Societies**
- 56 organisations created inactive, unverified and awaiting their first Head.
- 102 faculty associations created unverified; 72 are linked to official directory profiles.
- 50 official logos imported. The other 6 are hosted outside thapar.edu and were not imported.
- Both imports are idempotent: a second run created nothing.

**Owner confirmation pending.** A later owner message asks for explicit approval before any society import. The data has been kept, not removed (OI-58).

## 4. Login photograph

- `project-docs/tiet.jxl` and `tiet_page.png` are the same JPEG XL file.
- It was decoded with macOS ImageIO and stored as `public/brand/login-campus.jpg` (1080 x 689, 175 KB). Next.js serves it as AVIF or WebP.
- **Desktop:** the photo fills the right 62 % and fades right to left into the white background through a CSS mask, with no hard edge.
- **Phones:** it is a top band that fades downward, and the form starts below the end of the fade.
- Inspected in screenshots at 1440, 1024 and 390 px. E2E checks that the mask is applied and the sign-in button is on top and on screen.

## 5. Results (2026-10-25)

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| ESLint (`--max-warnings 0`, including boundary rules) | clean |
| Unit (Vitest) | 238 passed, 18 files |
| Integration (Testcontainers, PostgreSQL 17.9) | 144 passed, 11 files |
| E2E (Playwright, 14 emulated devices) | 744 passed, 0 failed, 181 skipped by design (§6) |
| `npm run check:build` | production build succeeds; test sign-in absent |
| `npm run check:em-dash` | no em-dashes |
| `npm run check:prerelease` | 51 direct dependencies pinned and stable |
| `npm audit` | 0 vulnerabilities |
| Migration | rehearsed on a temporary copy, applied, no drift |
| Import dry runs | societies: 56 skipped (already present); faculty: 577 skipped |

Defects found and fixed by these checks:
- an overwritten profile-completion route;
- ARIA attributes on calendar links;
- touch targets under 44 px;
- overflow on 320 px phones (grid columns);
- unpaginated faculty list;
- a chat message hidden by a late page refresh;
- noisy logs on aborted requests;
- imported societies visible by direct link.

## 6. E2E

The final run of `npm run test:e2e` gave **744 passed, 0 failed, 181 skipped**. The skips are deliberate device scoping: full journeys run on one desktop (Windows Chrome 1366) and one phone (iPhone 15), and device-independent checks run once. The two conditional skips (no login photograph; faculty directory not imported) did not apply.

New journeys in `tests/e2e/platform.spec.ts`:
- the admin area gate;
- a campus event with a custom question, through registration and the notification;
- Find Mates through response, acceptance and chat, including an outsider's 404;
- calendar export (authenticated) and the placement label;
- typo-tolerant faculty search;
- the login photograph's fade and layering.

Every module page is also covered by the shell (axe accessibility, no em-dash) and responsive (no horizontal scroll, readable text, 44 px targets) specs on all 14 devices.

Earlier runs in this session found real defects, all fixed:
- ARIA attributes on calendar links;
- an inline link distinguished only by colour;
- small touch targets;
- 320 px overflow;
- an unpaginated 577-card page.

They also found three mistakes in the new tests (an ambiguous label, an invalid request body, a below-the-fold check), which were corrected without weakening the checks.

## 7. Not done or not verified

The full list is in `docs/requirements/traceability.md`. In short:

- **Owner decisions pending:** OI-58 (keep the imported data?); the recommended defaults applied for OI-12 to OI-39.
- **Untested steps:**
  - UC-10 E2 (draft restore);
  - study material keyword search and semester filter;
  - archive screenshot attach;
  - the daily calendar job;
  - moderation resolve and restore;
  - the ban endpoint;
  - profile editing;
  - the society image endpoint;
  - the time-to-match query;
  - PWA install and offline behaviour.
- **Not started:** load tests (k6), the written OWASP review, the physical-device checklist, an automated multi-instance Redis test.
- **Deployment-only items:** real Google sign-in from a non-Thapar account, deployed origin, monitoring, CI on GitHub.
