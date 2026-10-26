# Requirements Traceability Matrix

**Rules**
- Every original requirement stays in this table. Nothing is removed, merged away, or redefined.
- **Delivery** `Required` means part of the complete application. The approved goal (2026-10-23) is the complete application described in the spec. `Out of scope` is used **only** where the spec itself excludes something (§1.3 limitations, §7.3 future work).
- **Status** values: `Not started` · `In progress` · `Partial (missing: …)` · `Complete`. `Complete` requires **every** specified step to pass its automated tests. Partial implementations must name the missing steps.
- **Decisions** link to `docs/open-issues.md`. A requirement with an `[OPEN]` blocking decision cannot reach `Complete`.
- **Tests** column is filled in as test files are written (file path + test name).

Slices are defined in `docs/status/phases-and-acceptance.md`.

## 1. Functional requirements

| ID | Slice(s) | Delivery | Decisions | Complete only when | Tests | Status |
|---|---|---|---|---|---|---|
| FR-AUTH-1 | 1b | Required | OI-01 (production-readiness, non-blocking), OI-09, [APPROVED 2026-10-24] OI-51 @thapar.edu only | Non-@thapar.edu, unverified, and `hd`-mismatch logins rejected server-side | `tests/integration/identity/identity-auth.test.ts` P11, P13, P20, P21; `tests/unit/identity/identity-units.test.ts` (policy matrix); `tests/e2e/auth.spec.ts`; manual: real Google sign-in by the owner (2026-10-24) | Partial (real Google sign-in with the owner's @thapar.edu account verified by the owner on 2026-10-24, locally; missing: rejection of a real non-@thapar.edu Google account tested against real Google, and the deployed origin at G-1c; OI-01 before real users) |
| FR-AUTH-2 | 1b | Required | OI-42 | Profile gate enforced for all app routes; ≥3 tags from controlled set | `tests/integration/identity/profile-admin.test.ts` PR01 to PR06, RL01; `tests/e2e/auth.spec.ts` (first-time profile, roll-number privacy) | Complete (verified locally; seeded tag/branch lists and roll-number format open for owner adjustment, OI-42/OI-27) |
| FR-AUTH-3 | 1b | Required | [APPROVED 2026-10-24] OI-04 (ADR-0006), OI-05 | Spike findings reviewed and representation approved; DB never holds usable tokens; cookie HTTP-only + Secure | `tests/integration/identity/identity-auth.test.ts` P01 to P10, P14, P18, P19, P22, SP01 to SP05 (session policy 2026-10-26: computers 30 min inactivity / 12 h, phones 7 d / 30 d, `docs/auth/session-policy.md`); `tests/unit/identity/session-policy.test.ts`; `tests/e2e/session.spec.ts` (warning, expiry redirect, phone persistence); `tests/e2e/auth.spec.ts` (HttpOnly, sign-out); spike T01 to T18 | Complete (verified locally, including Secure cookies over a simulated HTTPS origin; re-verify on the deployment at G-1c) |
| FR-AUTH-4 | 1b (API), 5 (UI) | Required | OI-28 | Admin revokes a session → next request 401; UI available | tests/integration/platform/gaps.test.ts (bans, role changes, banned session refused, last admin); `tests/e2e/platform.spec.ts` (admin revokes a session from the Users page; next request 401); `tests/integration/identity/profile-admin.test.ts` AD01 to AD04 | Complete (verified locally 2026-10-25) |
| FR-SOC-1 | 2a, 2d/3a | Required | OI-09; OI-55 (category optional, owner 2026-10-25); ADR-0013 | Admin-only create with name, description, category, logo, banner (logo/banner via upload pipeline, 3a) | tests/integration/platform/gaps.test.ts (society logo and banner: own asset, purpose, other society refused, audit on behalf); `tests/integration/societies/societies.test.ts` S01 to S04; `tests/e2e/societies.spec.ts` | Complete (verified locally 2026-10-25; 50 official logos imported) |
| FR-SOC-2 | 2a | Required | OI-10; **owner-approved deviation 2026-10-25 (OI-56, ADR-0013 §7, §10): the four fixed roles become Head authorisation (equal, any number, at least one per active society) plus free display groups and titles** | Head authorisation per society row; positions grant nothing; at least one Head; handover audited | `tests/integration/societies/heads.test.ts` HD01 to HD15; `tests/integration/societies/societies.test.ts` M01 to M06; `tests/integration/societies/migration.test.ts` MG01 to MG05; `tests/unit/societies/permissions.test.ts` (full matrix); `tests/e2e/societies.spec.ts` | Complete as revised (verified locally 2026-10-25) |
| FR-SOC-3 | 2a, 3a | Required | OI-11; OI-56 (all Heads publish; content shown as the society; the individual in the audit log) | Heads/Editors create/edit/publish updates, recruitment drives, stories; stories invisible after 24 h + cleanup job | `tests/integration/societies/societies.test.ts` P01 to P06; `tests/integration/societies/heads.test.ts` HD02, HD13; tests/integration/platform/coverage.test.ts (expired-story cleanup job); `tests/unit/service/jobs.test.ts` (deletion off outside production, on in production; OI-63); `tests/unit/security/sanitize-html.test.ts`; `tests/e2e/societies.spec.ts` | Complete (verified locally 2026-10-25; stories remain text only) |
| FR-SOC-4 | 2a | Required | [APPROVED 2026-10-24] OI-38 | Directory lists active societies; search + category filter | `tests/integration/societies/societies.test.ts` D01, D02; `tests/unit/societies/source-categories.test.ts` (official labels mapped explicitly); tests/integration/platform/authorization.test.ts (category filter on official organisations, All, Following, My societies); `tests/e2e/societies.spec.ts` | Complete (verified locally; category list `[PROPOSED]`) |
| FR-EVT-1 | 2b | Required | **OI-12**; OI-56 (owner 2026-10-25: events are created by any Head of the society, from the society workspace, attributed to the society; "Event Manager" is a display position) | Heads/Event Managers create events with all listed fields + custom fields | tests/integration/platform/authorization.test.ts (Head of own society only, admin capacity separation, revocation, inactive society), tests/integration/platform/coverage.test.ts (edits); `tests/unit/events/events.test.ts` (custom fields); `tests/e2e/platform.spec.ts` (campus event with a custom question) | Complete (verified locally 2026-10-25; OI-12 default applied) |
| FR-EVT-2 | 2b | Required | **OI-13** | Only legal transitions accepted | tests/integration/platform/coverage.test.ts (publish drafts only, past start refused), tests/integration/platform/authorization.test.ts (cancel is terminal); `tests/unit/events/events.test.ts` (time-derived LIVE and COMPLETED) | Complete (verified locally 2026-10-25; OI-13 default applied) |
| FR-EVT-3 | 2b | Required | **OI-14** | Registration for PUBLISHED/LIVE only; waitlist at capacity under concurrency | tests/integration/platform/authorization.test.ts (50 concurrent registrations for 10 places; FIFO waitlist promotion; drafts and cancelled events refused); `tests/e2e/platform.spec.ts` | Complete (verified locally 2026-10-25; OI-14 default applied) |
| FR-EVT-4 | 2b, 3b | Required | – | Toggle works **and** count updates in real time for all viewers (3b) | tests/integration/platform/authorization.test.ts (one interest per student, versioned realtime update queued), tests/integration/platform/realtime.test.ts (WebSocket delivery); `tests/e2e/platform.spec.ts` (count shown); manual: delivery through Valkey 2026-10-25 (OI-61) | Complete (verified locally 2026-10-25; live update in a second browser is covered by the hub test and the manual Valkey check, not by an E2E test) |
| FR-EVT-5 | 2b | Required | – | DB unique (event_id, user_id) on registrations | tests/integration/platform/authorization.test.ts (idempotent re-registration) | Complete (unique (eventId, userId) in the schema; verified locally) |
| FR-MATE-1 | 2c | Required | OI-15 | All FR fields + UC-10 additions (description, size 2–10) | `tests/unit/findmates/match.test.ts` (team size 2 to 10, skills); tests/integration/platform/authorization.test.ts | Complete (verified locally 2026-10-25; OI-15 default applied) |
| FR-MATE-2 | 2c | Required | **OI-15** | Filter by type, skills, **subject** | tests/integration/platform/coverage.test.ts (type, skill, subject filters; best-match sort) | Complete (verified locally 2026-10-25) |
| FR-MATE-3 | 2c | Required | – | Response with message stored | tests/integration/platform/authorization.test.ts (message stored; own request and duplicates refused); `tests/e2e/platform.spec.ts` | Complete (verified locally 2026-10-25) |
| FR-MATE-4 | 2c, 3a, 4a | Required | **OI-16** | Accept/reject + connection + **chat channel usable** + notifications (ACT-4/6/7) | tests/integration/platform/authorization.test.ts (accept creates the connection; chat by participants only), tests/integration/platform/coverage.test.ts (rejection notification), tests/integration/platform/realtime.test.ts; `tests/e2e/platform.spec.ts` (respond, accept, chat, outsider 404) | Complete (verified locally 2026-10-25; OI-16 default applied) |
| FR-MATE-5 | 2c, 3a | Required | – | Expired requests hidden at query time and closed by job | tests/integration/platform/coverage.test.ts (hidden at query time; job marks EXPIRED) | Complete (verified locally 2026-10-25) |
| FR-MAT-1 | 2d | Required | OI-39 | PDF/JPEG/PNG only; all metadata fields | `tests/unit/assets/rules.test.ts`; tests/integration/platform/pipeline.test.ts (types and limits refused before an upload URL is issued; metadata) | Complete (verified locally 2026-10-25; OI-39 default applied) |
| FR-MAT-2 | 2d, 3a | Required | **OI-18**, OI-19 | Nothing visible before APPROVED; full state machine; worker validation | tests/integration/platform/pipeline.test.ts (approved only after validation; checksum mismatch and renamed executable rejected and deleted; rejected material never listed; rejection notified); `tests/e2e/uploads.spec.ts` (browser upload to local storage, validation, listing, signed download, disguised file rejected with its reason, society logo and broken-image fallback) | Complete (verified locally 2026-10-25; OI-18/OI-19 defaults applied) |
| FR-MAT-3 | 2d | Required | – | Browse by subject code + semester; keyword search | tests/integration/platform/gaps.test.ts (title, description and subject-code search; semester filter); tests/integration/platform/pipeline.test.ts | Complete (verified locally 2026-10-25) |
| FR-MAT-4 | 2d | Required | – | One vote per student per material (composite PK) | tests/integration/platform/coverage.test.ts (concurrent repeat votes count once) | Complete (verified locally 2026-10-25) |
| FR-ARC-1 | 4c | Required | OI-39 | All fields; screenshots via upload pipeline | tests/integration/platform/gaps.test.ts (own approved screenshots attached and served only while visible; reuse refused); tests/integration/platform/coverage.test.ts | Complete (verified locally 2026-10-25) |
| FR-ARC-2 | 4c | Required | **OI-21** | Unreviewed projects invisible to non-reviewers | tests/integration/platform/authorization.test.ts (invisible and uncommentable before review; review needs the platform capacity; no self-review) | Complete (verified locally 2026-10-25; OI-21 default applied) |
| FR-ARC-3 | 4c | Required | OI-23 | Browse, search, threaded comments, depth ≤ 3 | tests/integration/platform/authorization.test.ts (depth 3; cross-project parent refused), tests/integration/platform/coverage.test.ts (search by words and tags) | Complete (verified locally 2026-10-25; OI-22/OI-23 defaults applied) |
| FR-FAC-1 | 4b | Required | – | All listed fields searchable | tests/integration/platform/coverage.test.ts; `tests/unit/faculty/leadership.test.ts` (official leadership order) | Complete (verified locally 2026-10-25; shown in the official order, leadership first, owner 2026-10-25) |
| FR-FAC-2 | 4b | Required | – | tsvector + pg_trgm typo tolerance | tests/integration/platform/coverage.test.ts ("Amrita Kour" finds Dr. Amrita Kaur); `tests/e2e/platform.spec.ts` | Complete (verified locally 2026-10-25) |
| FR-FAC-3 | 4b | Required | [APPROVED] admin approval (ADR-0010) | Claim → Pending → admin approve/reject; audit log | tests/integration/platform/authorization.test.ts (one pending claim per profile and per account, platform capacity, no self-decision, role FACULTY and session revocation atomic, audit; a student's claim grants nothing and cannot edit or revoke) | Complete (verified locally 2026-10-26) |
| FR-CAL-1 | 4d | Required | **OI-24** | Four layers displayed; society events appear | tests/integration/platform/authorization.test.ts (personal privacy, academic admin-only), tests/integration/platform/coverage.test.ts (society events appear, drafts never) | Complete (verified locally 2026-10-25; OI-24 default applied) |
| FR-CAL-2 | 4d, 3a | Required | – | RRULE stored; worker maintains 90-day window | `tests/unit/calendar/rules.test.ts`; tests/integration/platform/gaps.test.ts (daily window extension, idempotent) | Complete (verified locally 2026-10-25) |
| FR-CAL-3 | 4d | Required | **OI-25** | Valid RFC 5545 export | `tests/unit/calendar/rules.test.ts` (parsed back with ical.js, including RRULE, escaping and folding); `tests/e2e/platform.spec.ts` (authenticated download) | Complete (verified locally 2026-10-25; OI-25 default applied) |
| PLC-1 | 4e | Required | OI-29 | Admin entry + CSV import of aggregate records only | tests/integration/platform/pipeline.test.ts (CSV import), tests/integration/platform/coverage.test.ts (form create/update/delete); `tests/unit/placement/csv.test.ts` (per-student columns rejected) | Complete as software (verified locally 2026-10-25); no placement data has been supplied, so none is shown |
| PLC-2 | 4e | Required | – | Matrix view + filters with suppression re-applied | tests/integration/platform/pipeline.test.ts (filters select rows of the suppressed table) | Complete (verified locally 2026-10-25) |
| PLC-3 | 4e | Required | – | k=5 primary + complementary suppression; no per-student data | `tests/unit/placement/suppression.test.ts` (2000-matrix property test); tests/integration/platform/pipeline.test.ts | Complete (verified locally 2026-10-25) |
| PLC-4 | 4e | Required | – | Label + citation on every view | `tests/e2e/platform.spec.ts` (label); citations rendered under every matrix | Complete (verified locally 2026-10-25) |
| PLC-5 | 4e | Required | – | Audit log on every change; no self-reporting | tests/integration/platform/coverage.test.ts (create, update, delete audited; personal capacity refused), tests/integration/platform/pipeline.test.ts (CSV audited) | Complete (verified locally 2026-10-25) |

## 2. Use-case and workflow steps

A workflow is `Complete` only when all of its steps and exception flows pass E2E/integration tests.

| ID | Steps | Slice(s) | Decisions | Status |
|---|---|---|---|---|
| UC-10 Create Mate Request | 1–7, E1, E2 (form restored after re-login), P1–P3 | 2c (+3a for P3 job) | OI-15 | Complete (E2 restore: tests/e2e/platform.spec.ts "UC-10 E2"; verified locally 2026-10-25) |
| UC-13 Upload Study Material | 1–10, E1 (auto-expire), E2 (**rejection reason notified**), E3, P1–P2 | 2d, 3a | OI-18, OI-19, OI-26 | Partial (every step tested at the integration level, including E1 auto-expiry (gaps.test.ts) and E2; missing: a browser E2E of the upload form against storage, which needs storage CORS for the E2E origin and the service running during E2E) |
| UC-07 Register for Event | 1–7 (step 6 = outbox confirmation notification), E1–E3 | 2b, 3a | OI-12, OI-14, OI-26 | Complete (tests/integration/platform/authorization.test.ts, tests/e2e/platform.spec.ts; verified locally 2026-10-25) |
| ACT Find Mates activity | ACT-1…ACT-9 incl. rejection + acceptance notifications, fork/join, chat, capacity close | 2c, 3a, 4a | OI-16, OI-26 | Complete (tests/integration/platform/authorization.test.ts and coverage.test.ts, tests/e2e/platform.spec.ts; verified locally 2026-10-25) |
| UCD-1 Login | – | 1b | OI-01 | Partial (real sign-in verified locally by the owner 2026-10-24; missing: deployed origin, G-1c) |
| UCD-2 View Profile | – | 1b | OI-35 | Complete with the OI-35 default (profile editing: tests/integration/platform/gaps.test.ts) |
| UCD-3…UCD-5 Society use cases | – | 2a | OI-10, OI-11 (approved 2026-10-24) | Complete as revised (logo and banner upload added 2026-10-25; see FR-SOC-1 for the missing endpoint test) |
| UCD-6, UCD-7 Browse Events / Toggle Interest | – | 2b, 3b | – | Complete (verified locally 2026-10-25) |
| UCD-9 Create Event (incl. Validate Input) | – | 2b | OI-12 | Complete (verified locally 2026-10-25) |
| UCD-11, UCD-12 Respond / Accept-Reject | – | 2c | – | Complete (verified locally 2026-10-25) |
| UCD-13 Browse Study Materials | – | 2d | – | Partial (see FR-MAT-3) |
| UCD-15 Submit Project (incl. Upload File) | – | 4c | OI-21 | Partial (see FR-ARC-1) |
| UCD-16, UCD-17, UCD-18 Faculty search/claim/verify | – | 4b | – | Complete (verified locally 2026-10-25) |
| UCD-19 Manage Users | – | 1b (minimal), 5 | OI-28 | Complete with the OI-28 default (see FR-AUTH-4) |
| UCD-20 Moderate Content | – | per module + 5 | OI-28 | Complete with the OI-28 default (resolve, dismiss, restore, audit: tests/integration/platform/gaps.test.ts) |

## 3. Other specified behaviour (spec §4–§7)

| ID | Item | Slice(s) | Delivery | Decisions | Status |
|---|---|---|---|---|---|
| SPEC-SOC-PERM | Per-row permission checks; society social links | 2a | Required | ADR-0013 | Complete (access from the per-society Head grant row, checked on every request; permission matrix unit tests; cross-society 403 in integration P05 and HD07; https-only links) |
| SPEC-EVT-JSONB | Custom fields JSONB; interest unique constraint; Redis pub/sub broadcast | 2b, 3b | Required | ADR-0012 | Complete (verified locally 2026-10-25; Redis path verified by hand, OI-61) |
| SPEC-MATE-COUNT | current_count increment; auto-close at team size | 2c | Required | – | Complete (concurrent last-place test, tests/integration/platform/authorization.test.ts) |
| SPEC-ASSET | Asset state machine, no backward transitions, files never via API server | 2d, 3a | Required | OI-18 | Complete (conditional transitions; browsers upload and download with signed storage URLs; tests/integration/platform/pipeline.test.ts) |
| SPEC-W1 | Worker 1: validation, **thumbnail generation**, **URL safety checks** | 3a, 4c | Required | **OI-20** | Complete with the OI-20 default (magic bytes, MIME, size, SHA-256; WebP thumbnails with a pixel limit; GitHub link validation) |
| SPEC-W2 | Worker 2: notifications, recurrence expansion, data reconciliation | 3a, 4d | Required | OI-26 | Complete as designed (notifications; recurrence expansion with the daily job tested; reconciliation = status, expiry, story and retention jobs) |
| SPEC-OUTBOX | Transactional outbox (designed as nudge + 5-min sweep) | 3a | Required | ADR-0004, OI-06, OI-07 | Complete locally (atomicity, SKIP LOCKED, lease reclaim, backoff, DEAD after 8, dedupe: tests/integration/platform/pipeline.test.ts; signed nudge: tests/unit/service/security.test.ts) |
| SPEC-RT | 30-s single-use JWT tickets; realtime layer has no DB access; Redis pub/sub | 3b | Required | ADR-0012 | Complete locally (tests/integration/platform/realtime.test.ts, tests/unit/service/security.test.ts, boundary lint rule; Redis by hand, OI-61) |
| SPEC-REDIS | Redis for rate limiting, pub/sub, hot caching (and "OTP storage") | 1b, 3b, 5 | Required | OI-37 | Partial (pub/sub and shared ticket nonces on Valkey, tested across instances; rate limiting stays in PostgreSQL by the Slice 1b design; no hot caching needed at the measured load; OTP not applicable, OI-37) |
| SPEC-DB | UUID PKs, TIMESTAMPTZ, constraint-enforced rules, module isolation | all | Required | – | Complete (CHECK constraints and unique keys in migration 20261026000000; boundary lint rules) |
| SPEC-CAL-EXP | calendar_occurrences pre-expansion | 4d | Required | – | Complete (verified locally 2026-10-25) |
| SPEC-ADMIN | Admin dashboard: user management, moderation, analytics; audit logs | per slice + 5 | Required | OI-28 | Complete with the OI-28 default (verified locally 2026-10-25) |
| SPEC-METRICS | Metrics dashboard incl. time-to-match | 2c (capture), 6 | Required | – | Complete (time-to-match query tested in gaps.test.ts) |
| SPEC-PWA | PWA manifest + offline shell | 6 | Required | – | Complete (manifest, icons, service worker and offline page: tests/e2e/platform.spec.ts "PWA"; edge-to-edge layout deferred, OI-49) |
| SPEC-MATCH | Skill-overlap match scoring (spec §6.1.1) | 2c | Required | **OI-17** | Complete with the OI-17 default (tests/unit/findmates/match.test.ts, coverage.test.ts) |
| SPEC-ARC-VOTE | Archive voting (roadmap Table 5.1 only) | 4c | Required pending decision | **OI-22** | Complete with the OI-22 default |
| SPEC-WORKFLOW | PR CI gates, previews, ≥1 reviewer | 1a, 1c | Required | [APPROVED] owner reviews all PRs (OI-03); OI-45 | Partial (missing: CI not yet run on GitHub; Vercel previews arrive in 1c) |
| SPEC-SEED | Content seeding: faculty from public sites, materials, 3–5 societies | 6 | Required | OI-30 | Partial (577 official faculty profiles and 56 societies imported locally with official photos and logos, OI-57/OI-58; no study material or events are seeded: nothing is invented) |

## 4. Non-functional requirements and metrics

| ID | Slice(s) | Verification | Decisions | Status |
|---|---|---|---|---|
| NFR-PERF / MET-2 / MET-4 | 2–5 | k6 at 200 VUs; search timing test | OI-33 | Partial (met locally: CRUD p95 ≤ 30 ms, search p95 6 and 16 ms, docs/testing/load-test-2026-10-25.md; missing: the deployed run, OI-33) |
| MET-3 (validation < 5 s) | 3a | Measured on normal path; **target, not guarantee** (background-jobs.md §5) | OI-06 | Not measured (locally, the 102 imported images were all validated within about 20 seconds of being queued, observed by hand; no timing test) |
| MET-1 / EVAL-5 (time-to-match) | 2c, 6 | Timestamps captured; metric query tested | – | Complete as a measurement (query tested; the 24-hour target needs real use) |
| MET-5 / NFR-SCAL | 5 | k6 200 VUs | OI-33 | Partial (200 concurrent users locally with no errors; multi-instance realtime tested; missing: the deployed run) |
| NFR-SEC / OBJ-5 / EVAL-3 | 1b–5 | OWASP Top 10:2025 review + automated tests | – | Partial (written review docs/security/owasp-review-2026-10-25.md; 2 low findings fixed; open: F3 trusted client address (OI-54) and F4 alerting (OI-40), both decided with the hosting at G-1c) |
| NFR-AVAIL (99%) | 1c, 5 | External uptime monitor; incident log | OI-40 | Not started |
| NFR-USE (responsive, ≤3 clicks) / EVAL-4 | every UI slice | Playwright across 14 device profiles (`tests/e2e/shell.spec.ts`, `responsive.spec.ts`, `platform.spec.ts`); click-count checks | OI-32 | Complete locally (every module page responsive, accessible (axe) and with 44 px targets in E2E; `tests/e2e/clicks.spec.ts` checks at most 3 navigation clicks from Home to the teammate request, material upload and event registration forms on desktop and phone, OI-32 default applied 2026-10-26; physical devices still to check) |
| NFR-MAINT | 1a | Boundary lint rules (`tests/lint/boundaries.test.ts`); strict TypeScript (`npm run typecheck`) | OI-44 | Partial (missing: lint rules from eslint-plugin-react/jsx-a11y, OI-44) |
| NFR-PORT | 1a, 1c | No vendor-only APIs in modules (adapters isolate Vercel/Fly/R2) | – | Not started |
| OBJ-1 (≥3 societies, ≥5 events) | 6 | Seed/demo data check | – | Not met (56 societies imported but inactive until Heads are appointed; no real events exist and none are invented) |

## 4b. Owner-approved additions (2026-10-23)

| ID | Slice(s) | Verification | Decisions | Status |
|---|---|---|---|---|
| NFR-DEVICE-1, -2, -3 | 1a, every UI slice | `tests/e2e/responsive.spec.ts` across 14 emulated device profiles; manual checklist `docs/testing/device-test-checklist.md` | OI-49 | Partial (all module pages pass in emulation; missing: the physical-device checklist) |
| NFR-DEVICE-4 | 1b+ (forms), 6 (edge-to-edge) | Form tests per slice; safe area by browser default until OI-49 | OI-49 | Partial (forms tested in E2E for events, Find Mates, chat and profile completion; edge-to-edge PWA deferred, OI-49) |
| NFR-DEVICE-5 | every UI slice | axe-core, keyboard and state tests per slice | – | Partial (missing: shell only; feature states arrive with features) |
| NFR-DEVICE-6 | all | Reports separate emulation from physical testing | – | In progress |
| SEC-CLIENT-1, -2 | 1b onward | Server-side authz tests per slice (threat model §3) | – | Complete for Slices 1b to 5 (every action is authorised on the server; admin links are display only; tests/integration/platform/*.test.ts, tests/e2e/platform.spec.ts) |
| SEC-CLIENT-3 | – | – | OI-48 | Out of scope unless native apps are approved |

## 5. Out of scope (excluded by the spec itself)

LIM-1 native apps · LIM-3 video/voice · LIM-4 multi-campus · §7.3 future work (pgvector, realtime extraction, ClamAV, CDN/WAF/LB, native app).
