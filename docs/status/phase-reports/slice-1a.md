# Phase Report: Slice 1a (Project Skeleton)

Date: 2026-10-23. Status: **complete, awaiting owner acceptance review.** No commit or push has been made (OI-45).

## Scope delivered
- Project skeleton and folder structure (ADR-0011): `src/app`, `src/modules`, `src/shared/{db,layout,ui}`, `src/service/{realtime,workers}`.
- Exact-pinned toolchain (ADR-0008): Node 24.22.1, Next.js 16.4.2, React 19.3.1, TypeScript 6.0.3, ESLint 10.13.0, Prisma 7.10.1 (generator and datasource only, **no tables**).
- Module-boundary enforcement: `eslint/boundaries.mjs`, proven by `tests/lint/boundaries.test.ts` (17 cases, including realtime-to-database bans).
- Em-dash enforcement: `npm run check:em-dash` (literal, escapes and HTML entities), `.githooks/commit-msg`, CI checks of commit messages and PR title/body, and an E2E assertion on rendered text.
- Local infrastructure: Docker Compose with PostgreSQL 17.9 (host port 55432) and Garage 2.4.1, images pinned by digest; `npm run setup:local` generates gitignored local secrets.
- Testing: Vitest (unit + integration projects), Testcontainers (PostgreSQL, Garage), Playwright (Chromium desktop, Chromium 400 px, WebKit desktop) with axe-core.
- CI: `.github/workflows/ci.yml` runs lint/policy checks, typecheck and unit tests. Read-only permissions, SHA-pinned actions, no deployment.
- Static app shell in the reference style: measured tokens, Inter, the owner-provided TIET logo (unchanged file, CSS-cropped mark), the "Unofficial student project" note, 9 module placeholders, Notifications placeholder, a static login page, 404 and error pages.

Not delivered (out of scope): authentication, database tables, business logic, external services, deployment.

## Checks run (2026-10-23)
See the summary in the owner report. Final results are recorded in the table below.

| Check | Result |
|---|---|
| `npm run check:em-dash` | Pass (no em-dashes in any project text file) |
| `npm run check:prerelease` | Pass (41 direct dependencies exact, stable, locked); 11 transitive prereleases reviewed (ADR-0008) |
| `npm run lint` | Pass (0 problems); planted violation in `src/` correctly rejected, then removed |
| `npm run typecheck` | Pass |
| `npm run test:unit` | Pass |
| `npm run test:integration` | Pass (PostgreSQL client; S3 storage contract) |
| `npm run test:e2e` | Pass (production build, 3 browser projects) |
| `docker compose` | postgres and garage healthy; bucket `thapar-sns-dev` created |

## Findings that affect later slices
1. The AWS SDK presigner signs only `host` unless `signableHeaders` includes `content-type` (ADR-0007). Needed in 2d.
2. Garage verifies SHA-256 checksum headers (OI-41 item closed for Garage; R2 still to verify at G-1c).
3. Garage rejects expired presigned URLs with 400, not 403.
4. `eslint-config-next` cannot be used with ESLint 10 without forced peer overrides (ADR-0008, OI-44).
5. npm 11.19 blocks dependency install scripts by default; six were reviewed and denied (ADR-0008).
6. React Server Components cannot pass icon components to Client Components; the sidebar takes a section name instead.

## Screenshots (Chromium, production build)

| Screen | 1280 px | Phone | Reference panel |
|---|---|---|---|
| Home | [home-1280.png](slice-1a/home-1280.png) | [home-android-360.png](slice-1a/home-android-360.png) | 2 (navigation only; feed, counts and search omitted per gap list G-02 to G-05) |
| Login | [login-1280.png](slice-1a/login-1280.png) | [login-iphone-393.png](slice-1a/login-iphone-393.png) | 1 (campus photo not available, brand colour used; Terms/Privacy links await G-01) |
| Module placeholder | [mates-1280.png](slice-1a/mates-1280.png) | [mates-iphone-393.png](slice-1a/mates-iphone-393.png) | 6 (shell only) |

Intentional differences from the montage: no global search bar or notification bell in a top bar (G-02); correct active navigation item on every page (montage panels 6, 7, 9 are inconsistent); signed-out card instead of a named user (no personal data).

## Open items for the owner
OI-43 (montage commit), OI-44 (ESLint plugin gap), OI-45 (GitHub repository and first push), OI-46 (release cooldown approval), and the remaining `[PROPOSED]` defaults, which are **not** treated as approved.

## Review addendum (2026-10-23, before the first commit)

### Repository
- `origin` is set to `https://github.com/Harshi-coder17/Thapar-SNS.git` (owner-created, private, verified empty).
- Nothing has been committed or pushed.
- A snapshot of the pre-review tree is kept in a temporary git index (`.git/slice1a-snapshot.index`, not tracked), so the review changes can be committed separately from the original skeleton.

### Findings and fixes
| Finding | How found | Fix |
|---|---|---|
| Navigation drawer could not scroll on landscape phones; "Go to sign in" unreachable (iPhone 15 and Galaxy S24 landscape) | New responsive test | Sidebar/drawer content `min-h-0 overflow-y-auto overscroll-contain` |
| Touch targets 36 to 40 px (nav rows, menu, close, text links, focused skip link) | New 44 px test over every visible link/button on every route and device | 44 px rows, buttons and links (design rule 10) |
| `Permissions-Policy` and HSTS headers missing | New security test | Added in `next.config.ts` |
| 3 critical `handlebars` advisories in `eslint-plugin-boundaries` 7.2.0 (dev-only) | `npm audit` | 7.2.1 (security-fix exception) |
| `fsevents` install script newly flagged | npm install-scripts | Denied (prebuilt binary) |
| Decorative motion ignored reduced-motion | Review | `motion-safe:` |

### Results after the review
- `npm run check`: em-dash, pins, lint, typecheck, unit tests pass.
- Integration: 9 pass.
- E2E across 14 emulated device profiles: 583 pass, 47 skipped by design, 0 failed.
- Physical devices: **not tested** (checklist in `docs/testing/device-test-checklist.md`).

### Screenshots (refreshed)
| File | Device emulation |
|---|---|
| [home-1280.png](slice-1a/home-1280.png), [login-1280.png](slice-1a/login-1280.png), [mates-1280.png](slice-1a/mates-1280.png) | Chromium 1280x800 |
| [home-android-360.png](slice-1a/home-android-360.png) | Galaxy S24 (Chromium) |
| [login-iphone-393.png](slice-1a/login-iphone-393.png), [mates-iphone-393.png](slice-1a/mates-iphone-393.png) | iPhone 15 (WebKit) |
| [ipad-portrait-home.png](slice-1a/ipad-portrait-home.png) | iPad gen 7 portrait (WebKit) |
| [iphone-landscape-drawer.png](slice-1a/iphone-landscape-drawer.png) | iPhone 15 landscape, drawer scrolled to the bottom (WebKit) |

