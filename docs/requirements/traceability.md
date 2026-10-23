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
| FR-AUTH-1 | 1b | Required | OI-01 (owner verifying), OI-09 | Non-@thapar.edu, unverified, and `hd`-mismatch logins rejected server-side | – | Not started |
| FR-AUTH-2 | 1b | Required | OI-42 | Profile gate enforced for all app routes; ≥3 tags from controlled set | – | Not started |
| FR-AUTH-3 | 1b | Required | **OI-04**, OI-05 | Spike findings reviewed and representation approved; DB never holds usable tokens; cookie HTTP-only + Secure | – | Not started |
| FR-AUTH-4 | 1b (API), 5 (UI) | Required | OI-28 | Admin revokes a session → next request 401; UI available | – | Not started |
| FR-SOC-1 | 2a | Required | OI-09 | Admin-only create with name, description, category, logo, banner (logo/banner via upload pipeline, 3a) | – | Not started |
| FR-SOC-2 | 2a | Required | **OI-10** | Four roles stored per membership row; per-row checks | – | Not started |
| FR-SOC-3 | 2a, 3a | Required | **OI-11** | Heads/Editors create/edit/publish updates, recruitment drives, stories; stories invisible after 24 h + cleanup job | – | Not started |
| FR-SOC-4 | 2a | Required | – | Directory lists active societies; search + category filter | – | Not started |
| FR-EVT-1 | 2b | Required | **OI-12** | Heads/Event Managers create events with all listed fields + custom fields | – | Not started |
| FR-EVT-2 | 2b | Required | **OI-13** | Only legal transitions accepted | – | Not started |
| FR-EVT-3 | 2b | Required | **OI-14** | Registration for PUBLISHED/LIVE only; waitlist at capacity under concurrency | – | Not started |
| FR-EVT-4 | 2b, 3b | Required | – | Toggle works **and** count updates in real time for all viewers (3b) | – | Not started |
| FR-EVT-5 | 2b | Required | – | DB unique (event_id, user_id) on registrations | – | Not started |
| FR-MATE-1 | 2c | Required | OI-15 | All FR fields + UC-10 additions (description, size 2–10) | – | Not started |
| FR-MATE-2 | 2c | Required | **OI-15** | Filter by type, skills, **subject** | – | Not started |
| FR-MATE-3 | 2c | Required | – | Response with message stored | – | Not started |
| FR-MATE-4 | 2c, 3a, 4a | Required | **OI-16** | Accept/reject + connection + **chat channel usable** + notifications (ACT-4/6/7) | – | Not started |
| FR-MATE-5 | 2c, 3a | Required | – | Expired requests hidden at query time and closed by job | – | Not started |
| FR-MAT-1 | 2d | Required | OI-39 | PDF/JPEG/PNG only; all metadata fields | – | Not started |
| FR-MAT-2 | 2d, 3a | Required | **OI-18**, OI-19 | Nothing visible before APPROVED; full state machine; worker validation | – | Not started |
| FR-MAT-3 | 2d | Required | – | Browse by subject code + semester; keyword search | – | Not started |
| FR-MAT-4 | 2d | Required | – | One vote per student per material (composite PK) | – | Not started |
| FR-ARC-1 | 4c | Required | OI-39 | All fields; screenshots via upload pipeline | – | Not started |
| FR-ARC-2 | 4c | Required | **OI-21** | Unreviewed projects invisible to non-reviewers | – | Not started |
| FR-ARC-3 | 4c | Required | OI-23 | Browse, search, threaded comments, depth ≤ 3 | – | Not started |
| FR-FAC-1 | 4b | Required | – | All listed fields searchable | – | Not started |
| FR-FAC-2 | 4b | Required | – | tsvector + pg_trgm typo tolerance | – | Not started |
| FR-FAC-3 | 4b | Required | [APPROVED] admin approval (ADR-0010) | Claim → Pending → admin approve/reject; audit log | – | Not started |
| FR-CAL-1 | 4d | Required | **OI-24** | Four layers displayed; society events appear | – | Not started |
| FR-CAL-2 | 4d, 3a | Required | – | RRULE stored; worker maintains 90-day window | – | Not started |
| FR-CAL-3 | 4d | Required | **OI-25** | Valid RFC 5545 export | – | Not started |
| PLC-1 | 4e | Required | OI-29 | Admin entry + CSV import of aggregate records only | – | Not started |
| PLC-2 | 4e | Required | – | Matrix view + filters with suppression re-applied | – | Not started |
| PLC-3 | 4e | Required | – | k=5 primary + complementary suppression; no per-student data | – | Not started |
| PLC-4 | 4e | Required | – | Label + citation on every view | – | Not started |
| PLC-5 | 4e | Required | – | Audit log on every change; no self-reporting | – | Not started |

## 2. Use-case and workflow steps

A workflow is `Complete` only when all of its steps and exception flows pass E2E/integration tests.

| ID | Steps | Slice(s) | Decisions | Status |
|---|---|---|---|---|
| UC-10 Create Mate Request | 1–7, E1, E2 (form restored after re-login), P1–P3 | 2c (+3a for P3 job) | OI-15 | Not started |
| UC-13 Upload Study Material | 1–10, E1 (auto-expire), E2 (**rejection reason notified**), E3, P1–P2 | 2d, 3a | OI-18, OI-19, OI-26 | Not started |
| UC-07 Register for Event | 1–7 (step 6 = outbox confirmation notification), E1–E3 | 2b, 3a | OI-12, OI-14, OI-26 | Not started |
| ACT Find Mates activity | ACT-1…ACT-9 incl. rejection + acceptance notifications, fork/join, chat, capacity close | 2c, 3a, 4a | OI-16, OI-26 | Not started |
| UCD-1 Login | – | 1b | OI-01 | Not started |
| UCD-2 View Profile | – | 1b | OI-35 | Not started |
| UCD-3…UCD-5 Society use cases | – | 2a | OI-10, OI-11 | Not started |
| UCD-6, UCD-7 Browse Events / Toggle Interest | – | 2b, 3b | – | Not started |
| UCD-9 Create Event (incl. Validate Input) | – | 2b | OI-12 | Not started |
| UCD-11, UCD-12 Respond / Accept-Reject | – | 2c | – | Not started |
| UCD-13 Browse Study Materials | – | 2d | – | Not started |
| UCD-15 Submit Project (incl. Upload File) | – | 4c | OI-21 | Not started |
| UCD-16, UCD-17, UCD-18 Faculty search/claim/verify | – | 4b | – | Not started |
| UCD-19 Manage Users | – | 1b (minimal), 5 | OI-28 | Not started |
| UCD-20 Moderate Content | – | per module + 5 | OI-28 | Not started |

## 3. Other specified behaviour (spec §4–§7)

| ID | Item | Slice(s) | Delivery | Decisions | Status |
|---|---|---|---|---|---|
| SPEC-SOC-PERM | Per-row permission checks; society social links | 2a | Required | – | Not started |
| SPEC-EVT-JSONB | Custom fields JSONB; interest unique constraint; Redis pub/sub broadcast | 2b, 3b | Required | ADR-0012 | Not started |
| SPEC-MATE-COUNT | current_count increment; auto-close at team size | 2c | Required | – | Not started |
| SPEC-ASSET | Asset state machine, no backward transitions, files never via API server | 2d, 3a | Required | OI-18 | Not started |
| SPEC-W1 | Worker 1: validation, **thumbnail generation**, **URL safety checks** | 3a, 4c | Required | **OI-20** | Not started |
| SPEC-W2 | Worker 2: notifications, recurrence expansion, data reconciliation | 3a, 4d | Required | OI-26 | Not started |
| SPEC-OUTBOX | Transactional outbox (designed as nudge + 5-min sweep) | 3a | Required | ADR-0004, OI-06, OI-07 | Not started |
| SPEC-RT | 30-s single-use JWT tickets; realtime layer has no DB access; Redis pub/sub | 3b | Required | ADR-0012 | Not started |
| SPEC-REDIS | Redis for rate limiting, pub/sub, hot caching (and "OTP storage") | 1b, 3b, 5 | Required | OI-37 | Not started |
| SPEC-DB | UUID PKs, TIMESTAMPTZ, constraint-enforced rules, module isolation | all | Required | – | Not started |
| SPEC-CAL-EXP | calendar_occurrences pre-expansion | 4d | Required | – | Not started |
| SPEC-ADMIN | Admin dashboard: user management, moderation, analytics; audit logs | per slice + 5 | Required | OI-28 | Not started |
| SPEC-METRICS | Metrics dashboard incl. time-to-match | 2c (capture), 6 | Required | – | Not started |
| SPEC-PWA | PWA manifest + offline shell | 6 | Required | – | Not started |
| SPEC-MATCH | Skill-overlap match scoring (spec §6.1.1) | 2c | Required | **OI-17** | Not started |
| SPEC-ARC-VOTE | Archive voting (roadmap Table 5.1 only) | 4c | Required pending decision | **OI-22** | Not started |
| SPEC-WORKFLOW | PR CI gates, previews, ≥1 reviewer | 1a, 1c | Required | [APPROVED] owner reviews all PRs (OI-03); OI-45 | Partial (missing: CI not yet run on GitHub; Vercel previews arrive in 1c) |
| SPEC-SEED | Content seeding: faculty from public sites, materials, 3–5 societies | 6 | Required | OI-30 | Not started |

## 4. Non-functional requirements and metrics

| ID | Slice(s) | Verification | Decisions | Status |
|---|---|---|---|---|
| NFR-PERF / MET-2 / MET-4 | 2–5 | k6 at 200 VUs; search timing test | OI-33 | Not started |
| MET-3 (validation < 5 s) | 3a | Measured on normal path; **target, not guarantee** (background-jobs.md §5) | OI-06 | Not started |
| MET-1 / EVAL-5 (time-to-match) | 2c, 6 | Timestamps captured; metric query tested | – | Not started |
| MET-5 / NFR-SCAL | 5 | k6 200 VUs | OI-33 | Not started |
| NFR-SEC / OBJ-5 / EVAL-3 | 1b–5 | OWASP Top 10:2025 review + automated tests | – | Not started |
| NFR-AVAIL (99%) | 1c, 5 | External uptime monitor; incident log | OI-40 | Not started |
| NFR-USE (responsive, ≤3 clicks) / EVAL-4 | every UI slice | Playwright at 1280px + 400px (`tests/e2e/shell.spec.ts`); click-count checks from 2a | OI-32 | In progress (shell responsive; no core tasks exist yet) |
| NFR-MAINT | 1a | Boundary lint rules (`tests/lint/boundaries.test.ts`); strict TypeScript (`npm run typecheck`) | OI-44 | Partial (missing: lint rules from eslint-plugin-react/jsx-a11y, OI-44) |
| NFR-PORT | 1a, 1c | No vendor-only APIs in modules (adapters isolate Vercel/Fly/R2) | – | Not started |
| OBJ-1 (≥3 societies, ≥5 events) | 6 | Seed/demo data check | – | Not started |

## 4b. Owner-approved additions (2026-10-23)

| ID | Slice(s) | Verification | Decisions | Status |
|---|---|---|---|---|
| NFR-DEVICE-1, -2, -3 | 1a, every UI slice | `tests/e2e/responsive.spec.ts` across 14 emulated device profiles; manual checklist `docs/testing/device-test-checklist.md` | OI-49 | Partial (missing: physical-device checklist not yet run; only the static shell exists) |
| NFR-DEVICE-4 | 1b+ (forms), 6 (edge-to-edge) | Form tests per slice; safe area by browser default until OI-49 | OI-49 | Partial (missing: no forms exist yet; edge-to-edge PWA deferred) |
| NFR-DEVICE-5 | every UI slice | axe-core, keyboard and state tests per slice | – | Partial (missing: shell only; feature states arrive with features) |
| NFR-DEVICE-6 | all | Reports separate emulation from physical testing | – | In progress |
| SEC-CLIENT-1, -2 | 1b onward | Server-side authz tests per slice (threat model §3) | – | Not started (no server-side features exist in 1a) |
| SEC-CLIENT-3 | – | – | OI-48 | Out of scope unless native apps are approved |

## 5. Out of scope (excluded by the spec itself)

LIM-1 native apps · LIM-3 video/voice · LIM-4 multi-campus · §7.3 future work (pgvector, realtime extraction, ClamAV, CDN/WAF/LB, native app).
