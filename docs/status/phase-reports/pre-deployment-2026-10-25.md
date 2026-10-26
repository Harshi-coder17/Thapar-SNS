# Pre-deployment work (2026-10-25 and 2026-10-26)

All work is on the working tree. Nothing was staged, committed, pushed, merged or deployed. No database was reset and no record was deleted from the development database. The society dataset was not re-imported.

## 1. Societies and faculty were not visible: cause and fix

**Cause.** There were two causes, and nothing was wrong with the database connection:

- **The directory listed only active societies.** The 56 imported official organisations were inactive, awaiting their first Head. After the last session, their pages were also hidden from students (a rule from ADR-0013 §5). The owner's account is a student account, so it could never see them.
- **E2E runs wrote fixtures into the same database.** E2E tests used the development database, leaving fictitious accounts and content behind:
  - about 225 fictitious accounts;
  - 37 "E2E Society" records, 15 of them active;
  - published "E2E Campus Talk" events;
  - open "E2E team" requests.

  These were the only things the directory, the events page and Find Mates could show.

The running app, the imports and the E2E runs all used the same database, `thapar_sns` on 127.0.0.1:55432.

**Fixes**

| Problem | Fix |
|---|---|
| Fixture leakage | E2E runs use their own database `thapar_sns_e2e` (`scripts/e2e/prepare-db.mjs`, run by `npm run test:e2e`). It refuses to target the development database. |
| Existing fixtures | Hidden without deleting anything (`scripts/dev/hide-e2e-fixtures.mjs`, below). |
| Official societies invisible | Owner decision: shown to every student as "Official student organisations" on the Societies page, read-only until a Head is appointed. Faculty associations matched to the official directory are shown on their pages. ADR-0013 §5 revised. |
| Faculty order | Shown like thapar.edu/faculties (§3). |

**Verified on the rendered pages**, as a student, on a production build pointed at the development database:

- **/societies:** 56 official organisations with 50 official logos; no E2E record.
- **/faculty:** the leadership section, then the 16 units in official order.
- **Department pages:** each starts with its Head (e.g. CSE).
- **/events, /mates and Home:** no fixture content.
- **An official society's About page:** readable, with the official description, links and source.

**Counts** in the development database at verification on 2026-10-25: 276 users, 108 societies, 101 posts, 8 events, 577 faculty profiles.

**Correction (2026-10-26).** The background service's specified expired-story cleanup (FR-SOC-3) later deleted 18 expired fixture stories, leaving 83 posts. None were the owner's, and they are recoverable from the backup. The service was stopped, the owner chose option (b) on 2026-10-26, and the 18 stories were restored (§7.1). Posts are back to 101.

## 2. The fixture correction (reversible)

`node scripts/dev/hide-e2e-fixtures.mjs --apply` changed status only. It touched only records owned exclusively by fixture accounts, matched by exact fixture naming patterns:

- 15 societies deactivated;
- 8 campus events returned to draft;
- 8 teammate requests closed.

Every change has an audit entry (`dev.e2e_fixture.hidden`) holding the previous value. A second run changes nothing. Backup taken first: `.local-backups/backup-before-fixture-isolation-2026-10-25.sql` (gitignored).

To reverse it, if ever needed:

```sql
BEGIN;
UPDATE societies_societies SET "isActive" = true WHERE id IN (SELECT "targetId"::uuid FROM admin_audit_logs WHERE action = 'dev.e2e_fixture.hidden' AND "targetType" = 'society');
UPDATE events_events e SET status = (a.details->'previous'->>'status')::events_status FROM admin_audit_logs a WHERE a.action = 'dev.e2e_fixture.hidden' AND a."targetType" = 'event' AND e.id = a."targetId"::uuid;
UPDATE findmates_requests SET status = 'OPEN', "closedAt" = NULL WHERE id IN (SELECT "targetId"::uuid FROM admin_audit_logs WHERE action = 'dev.e2e_fixture.hidden' AND "targetType" = 'mate_request');
COMMIT;
```

(The statements change nothing else. `events_status` is the event status type in the database.)

## 3. Faculty in official order

**Dataset.** `data/faculty-import/thapar-faculty.2026-10-25.json` was rebuilt by the new `scripts/faculty-import/build-dataset.mjs` from the original scrape. The content is identical; the official unit order and on-page order were added.

**Database.**
- Migration `20261027000000_faculty_official_order` adds two nullable columns. It was rehearsed on a temporary copy, applied to both databases, and shows no drift.
- `npm run import -- faculty-order --apply` filled only those columns, by stable source key. It is idempotent and audited.

**Page.**
- "University leadership" from official designations comes first:
  - the Pro Vice-Chancellor;
  - the Dean of Academic Affairs;
  - the Dean of Student Affairs, when the official pages list one (they currently don't);
  - the Dean of Faculty Affairs;
  - the Dean of Research;
  - the other deans;
  - the Controller of Examinations and the CTO.
- Then the associate deans.
- Then the school, departments and centres in the website's order, each listing its people in the order of its official page (Head first).
- The leadership order is presentation only; it grants nothing.

**Photos.** The one official photo above the 2 MB limit was downscaled on import (OI-60). All 53 official photos are approved.

## 4. Other completed work

| Area | Change |
|---|---|
| Test gaps | New integration tests (`gaps.test.ts`, 11 tests): study material search and semester filter, archive screenshots, the daily calendar job, upload auto-expiry, moderation resolve/dismiss/restore, bans and role changes (including concurrent last-admin protection), a banned session refused, profile editing, society images, time to match. |
| Realtime | Multi-instance Valkey test (`realtime-redis.test.ts`). |
| New E2E tests | UC-10 E2 draft restore, PWA (manifest, service worker, offline page), editor XSS regression, admin session revoke. |
| FR-AUTH-4 | Admin Users page lists each user's sessions, with "Revoke" and "Sign out everywhere". |
| Security | OWASP Top 10:2025 review: `docs/security/owasp-review-2026-10-25.md`. Fixed F1 (editor sanitising in the browser) and F2 (realtime ticket rate rule). F3 and F4 remain open for G-1c. |
| Load | 200 users locally, no errors, CRUD p95 30 ms or less, search p95 under 20 ms: `docs/testing/load-test-2026-10-25.md`. |
| Backups | Both database backups are kept in the gitignored `.local-backups/` folder. |

## 5. Final regression (2026-10-26)

| Check | Result |
|---|---|
| `tsc --noEmit`, ESLint (`--max-warnings 0`, boundary rules) | clean |
| Unit | 240 passed (19 files) |
| Integration (PostgreSQL and Valkey containers) | 156 passed (13 files) |
| E2E (14 emulated devices, isolated E2E database) | 750 passed, 0 failed, 231 skipped by design (journeys run on one desktop and one phone) |
| `npm run check:build` | production build succeeds; test sign-in absent |
| `check:em-dash`, `check:prerelease`, `npm audit` | pass, pass, 0 vulnerabilities |
| Import dry runs | societies 56 skipped, faculty 577 skipped, faculty order 0 to update, images: only the 6 non-official logos skipped |
| Development database after E2E | unchanged (276 users): isolation confirmed |

## 6. Not done

| Item | Why |
|---|---|
| Physical-device checks | They need the owner's phones (`docs/testing/device-test-checklist.md`). Emulated Chromium and WebKit profiles pass. Firefox is not installed for Playwright; installing it is a download that needs approval. |
| OI-27 legal text | Terms and Privacy pages, and the account-deletion process, need text reviewed by the owner or supervisor. |
| List confirmations | OI-42 (skill tags) and OI-55 (category list). |
| Deployment decisions | OI-54 trusted client address, OI-40 monitoring, OI-31 region, OI-33 deployed load test. |
| Deployment (Slice 1c) | Waits for the owner's explicit authorisation. |

## 7. Fixes of 2026-10-26 (owner request)

### 7.1 OI-63: story deletion off in local development, stories restored

- **Cause.** The service ran the specified story cleanup against the development database.
- **Fix.** Outside production the scheduler skips `stories.cleanup` (`SERVICE_DISABLED_JOBS` overrides). Production runs every job, and the deployed service must set `NODE_ENV=production` (`deployment-and-costs.md` §2). Stories still disappear from view 24 hours after posting.
- **Restore.**
  1. A fresh backup was taken first.
  2. The old backup was loaded into a temporary database.
  3. Exactly the 18 stories missing from the development database were copied back with `ON CONFLICT DO NOTHING`, after checking that every author and society still exists. Nothing was overwritten or duplicated.
  4. The restore was audited, and the temporary database was dropped.
- **Verified.** 101 posts. The service logs "scheduled jobs disabled in this environment: stories.cleanup".

### 7.2 Faculty page error

- **Cause.** The long-running dev server cached a Prisma client built before the faculty-order migration and `prisma generate`. That client rejected the new `unitOrder` field ("Unknown field unitOrder").
- **Fix.**
  - `getDb` now records a fingerprint of the generated schema and replaces a cached client built from an older schema.
  - Photos use `FallbackImage`, which shows initials when an image cannot load, including failures before hydration.
- **Verified on the running dev server.**
  - /faculty, a department page and search return 200.
  - Leadership comes first, then units in the official order, each Head first.
  - No broken images; no Prisma error in the log.

### 7.3 Society categories

- **Cause.** The official listing returned nothing whenever a category was selected, and the imported organisations had no category.
- **Fix.** An explicit label-to-category table (OI-55); the labels are stored apart from the category; filtering is applied to official organisations.
- **Verified on the running dev server.**

  | Filter | Organisations shown |
  |---|---|
  | All | 56 |
  | Technical | 16 |
  | Cultural | 5 |
  | Literary | 3 |
  | Music and Dance | 0 |
  | Arts and Media | 0 |
  | Sports and Fitness | 1 |
  | Entrepreneurship | 4 |
  | Professional Chapters | 9 |
  | Social Service | 18 |

  These match the database. Following and My societies show no official organisations, as intended.

### 7.4 Session policy

- **Limits:** computers 30 minutes of inactivity and 12 hours absolute; phones 7 days and 30 days.
- **Server side:** enforced on every page and API.
- **In the browser:** warnings before the end, synchronised across tabs, with drafts kept and a login message.
- **Details:** `docs/auth/session-policy.md`.
- **Effect:** existing desktop sessions past the new limits end on their next request.

### 7.5 Other

- **Upload E2E.** Browser upload against local Garage storage now runs in E2E, through an E2E-only background service on :4101 with its own Valkey key prefix (`tests/e2e/uploads.spec.ts`). It found and fixed one defect: the material form now waits for validation and shows a rejection reason at the file field. Previously a rejected file looked "uploaded".
- **OI-32.** Automated click-count check (`tests/e2e/clicks.spec.ts`).
- **OI-12 to OI-39.** All applied defaults reviewed; none conflicts with an owner decision.

## 8. Final regression (2026-10-26, after §7)

| Check | Result |
|---|---|
| `npm run check` (em-dash, version pins, ESLint `--max-warnings 0`, typecheck, unit) | pass; unit 252 passed (22 files) |
| Integration | 162 passed (13 files) |
| E2E (`npm run test:e2e`, isolated E2E database and E2E service) | 759 passed, 0 failed, 320 skipped by design |
| `npm run check:build` | pass; test sign-in absent from the normal build |
| `npm audit` | 0 vulnerabilities |
| Import dry runs | societies 56 skipped; faculty 577 skipped; faculty order 0 to update; society categories 0 to change; images only the 6 non-official logos skipped |
| Development database | 276 users, 108 societies, 101 posts, 577 faculty, 392 sessions, 459 audit entries: unchanged by the test runs |

Two problems surfaced during the runs and were fixed in the tests:

- A session test waited for "network idle", which never comes once pages hold a live service connection.
- The event test's navigation raced a live notification refresh.

Both are timing problems in the tests, not in the app.

## 9. Pre-commit review (2026-10-26, second pass)

**Owner decisions recorded.**
- OI-63 local behaviour kept.
- Phone sessions confirmed at 7 days / 30 days; desktop at 30 minutes / 12 hours.
- OI-42 skill tags kept: 65 tags in 9 categories, no duplicates found.
- OI-55 categories and mapping kept.
- OI-27 deferred to legal review.
- Hosting decisions deferred: OI-65 lists what must be decided at deployment planning.

**Fixed: faculty claims (owner question C).**
- Showing "Claim profile" to students is intended (ADR-0010). Students and faculty share @thapar.edu, and faculty first sign in with the default role.
- A claim grants nothing; approval, edits and revocation are enforced on the server.
- Defect: one account could hold pending claims on every profile and block the real faculty members.
- Fix:
  - one pending claim per account (service check and unique index, migration `20261030000000`, applied to the development and E2E databases, no drift);
  - clearer text on the page;
  - no form for accounts that already have a profile or a waiting claim.
- Tests: integration ("faculty claims by students") and E2E ("faculty claim").

**Society Heads (owner question A).**
- Not self-service. A platform admin appoints the first Head by email on the society's Administration tab, then activates the society.
- Tested end to end for an imported official organisation, including isolation from other societies (`heads.test.ts` HD11b).
- Self-service claiming is not in the approved requirements: OI-64, for the owner's decision.

**Phone testing (owner question B).** `docs/testing/phone-testing.md`:
- Android: full signed-in testing over Chrome USB port forwarding.
- Any phone: signed-out pages over Wi-Fi.
- Signed-in testing on an iPhone needs the HTTPS preview deployment.

**Repository review.**
- No secrets, `.env` files, database dumps, backups, test reports or build output are in the commit set: they are covered by `.gitignore`, and the commit set was checked with a pattern scan.
- `data/` holds only official, publicly published directory information. The repository is private (OI-45).
- All 11 transitive prerelease packages are development-time only and accepted in ADR-0008.

**Data integrity (development database).**
- 56 official societies, all with source labels and a category.
- 577 faculty profiles, all with official order.
- All 18 restored stories present (the 11 + 7 deleted by the cleanup).
- No active society without a Head.
- Counts unchanged: 276 users, 108 societies, 101 posts, 459 audit entries.

**Final regression.**

| Check | Result |
|---|---|
| `npm run check` | pass; unit 252 passed |
| Integration | 164 passed (13 files) |
| E2E | 761 passed, 0 failed, 332 skipped by design |
| `check:build` | pass |
| `npm audit` | 0 vulnerabilities |
| `prisma migrate status` | up to date |
