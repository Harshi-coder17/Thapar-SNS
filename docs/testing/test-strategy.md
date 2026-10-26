# Testing and Quality Strategy

## 1. Spec baseline `[SPEC]` (spec §6.1)
Unit (Vitest), integration (Vitest + test database), API tests (spec names Supertest), security testing (manual + automated). CI gates on every PR: ESLint, `tsc --noEmit`, Vitest (spec §5.4).

## 2. Test layers `[PROPOSED]`

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Static | ESLint 10 + typescript-eslint, `tsc --noEmit`, boundary rules, prerelease-dependency check | Whole repo | Every push/PR |
| Unit | Vitest 5 | Pure logic: permissions matrix, state machines (asset, event, claim), validation schemas, sanitiser, suppression algorithm, rrule expansion, backoff calculator | Every PR |
| Integration | Vitest + **Testcontainers PostgreSQL** (same major as Neon) + Garage container | Module services against a real DB/storage: constraints, transactions, concurrency, outbox, upload flow | Every PR |
| Route / API | Vitest calling Next.js route handlers with real `Request` objects; **Supertest** for the service's HTTP endpoints (`/healthz`, `/internal/*`) | Auth enforcement (401/403/404), CSRF, rate limits, error mapping | Every PR |
| End-to-end | Playwright 1.64 across the 14-profile device matrix (§8) | Full workflows (UC-07, UC-10, UC-13, ACT), three-click checks, visual review screenshots | Every PR (smoke) + nightly (full) `[PROPOSED]` |
| Accessibility | @axe-core/playwright | No serious/critical violations on each screen | With E2E |
| Security | Payload corpora (XSS, SQLi), IDOR test generator, CSRF suite, auth T01–T17, dependency audit | Per slice + Slice 5 review against OWASP Top 10:2025 | Every PR + Slice 5 |
| Performance | k6 v2.3 | p95 < 200 ms CRUD, search < 100 ms, 200 VUs; environment documented (OI-33) | Slice 5 + before demo |
| Contract | Storage adapter suite (Garage in CI; R2 once at G-1c); API schema-vs-docs check | Per change |

## 3. Test-only authentication `[PROPOSED]`
E2E tests cannot use real Google accounts. **Implemented (Slice 1b):** an E2E-only test sign-in (`/api/test-auth/sign-in`) that mints a Google-style ID token signed by a throwaway local key and sends it through Better Auth's real ID-token path, so the same domain and verified-email checks apply. It exists only in E2E builds (`E2E_BUILD=1`; route file `route.e2e.ts`), and even there fails closed unless `E2E_TEST_AUTH=1` on a loopback URL off any deployment. `npm run check:build` (CI) proves a normal build excludes it (OI-53, approved 2026-10-24).

## 4. Data and isolation
- Each integration test file gets a fresh schema (or transaction rollback). There is no shared mutable state between tests.
- Clock control (fake timers or injectable clock) for expiry tests: stories, mate requests, sessions, tickets, signed URLs.
- Seed factories per module. Seeds contain no real personal data.

## 5. Concurrency tests (mandatory where the spec relies on constraints)
Event capacity (50 parallel registrations / 10 seats), interest toggles, votes, last-spot mate acceptance, duplicate upload completion, duplicate outbox delivery.

## 6. Quality gates
- **Per PR:** all automated checks green; ≥ 1 human reviewer other than the author `[SPEC]`; traceability rows updated.
- **Coverage** `[PROPOSED]`: ≥ 80% lines for `modules/*/service.ts`, `permissions.ts`, state machines and security utilities. Coverage is a signal, not the goal: every FR needs at least one named test in the traceability matrix.
- **No skipped tests** on main without an open-issue reference.
- **Flaky tests** are quarantined with an issue and fixed within the slice.

## 7. What "complete" means for a workflow
All steps and exception flows in `requirements/requirements.md` §6 are covered by passing tests, recorded in `traceability.md`. Anything else is `Partial (missing: …)`.

## 8. Cross-device testing (NFR-DEVICE, approved 2026-10-23)

**Automated emulation** (`playwright.config.ts`, every E2E run): real Chromium and WebKit engines with each device's viewport, pixel density, touch input and mobile user agent.

| Group | Profiles |
|---|---|
| Android phones | Galaxy S24 (360 px), Pixel 7 (412 px), Galaxy S24 landscape |
| iPhones | iPhone SE (320 px), iPhone SE 3rd gen (375 px), iPhone 15 (393 px), iPhone 15 landscape |
| Tablets | Galaxy Tab S9 portrait and landscape; iPad (gen 7) portrait and landscape |
| Desktop | Chrome 1366x768 (Windows-class laptop), Edge 1920x1080 (Chromium engine with Edge identity), Safari 1440x900 (macOS) |

Checks: no horizontal scrolling; smallest text at least 12 px; pinch zoom allowed; every visible link and button at least 44x44 CSS px; navigation reachable on short (landscape) screens; drawer/sidebar switch on rotation; skip link and focus handling; axe-core WCAG 2.2 AA (serious and critical); no em-dashes in rendered text.

**Limits of emulation:** no real notch insets, on-screen keyboards, OEM browsers (Samsung Internet, Vivo/OnePlus defaults), system font scaling, or low-end device performance. Firefox is not in the matrix (not installed; not required by NFR-DEVICE-1).

**Physical devices:** manual checklist in [device-test-checklist.md](device-test-checklist.md), run by the owner on real hardware; results are recorded there. No physical-device testing has been done as of 2026-10-23.
