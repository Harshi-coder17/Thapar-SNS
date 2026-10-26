# Thapar SNS

A unified campus networking and services platform for TIET students. Unofficial student project; not affiliated with or endorsed by Thapar Institute of Engineering and Technology.

Status (2026-10-25): **every non-deployment slice is implemented and verified locally** (see `docs/status/implementation-status.md`). Deployment (Slice 1c) waits for the owner's explicit authorisation. Project documentation starts at [docs/README.md](docs/README.md); working rules for contributors and Claude Code are in [CLAUDE.md](CLAUDE.md).

## Prerequisites

- Node.js **24.22.1** via [nvm](https://github.com/nvm-sh/nvm): run `nvm install` then `nvm use` in this folder (reads `.nvmrc`).
- Docker Desktop (for the local database, storage emulator and integration tests).

## First-time setup

```bash
nvm use
npm ci                  # exact pinned versions from package-lock.json
npm run setup:local     # generates local-only secrets (gitignored) and .env
npm run db:up           # PostgreSQL 17.9 on 127.0.0.1:55432 and Garage (S3) on 127.0.0.1:3900
npm run db:migrate      # apply database migrations (prisma/migrations) to the local database
npm run societies:import:dry-run  # read-only report of what importing the society dataset would do (never writes)
npx playwright install chromium webkit   # browsers for end-to-end tests (about 870 MB)
npm run dev:all         # web app on http://localhost:3000 and the background service on 127.0.0.1:4100
```

`dev:all` runs `npm run dev` and `npm run service` together; `npm run db:up` must have started PostgreSQL, Garage (S3) and Valkey (Redis-compatible, 127.0.0.1:56379) first. The service processes uploads (validation, thumbnails), notifications, scheduled jobs and realtime updates; without it the app still works, but uploads stay "being checked" and nothing updates live. Outside production the service does not run scheduled jobs that delete records (the 24-hour story cleanup); production runs every job. `SERVICE_DISABLED_JOBS` overrides this (`.env.example`, OI-63).

Optional data imports (official Thapar data; dry run unless `--apply`; every step is idempotent and never overwrites):

```bash
npm run import -- faculty   [--apply]   # official faculty directory (data/faculty-import)
npm run import -- societies [--apply]   # student organisations (data/society-import): inactive, awaiting a Head
npm run import -- images    [--apply]   # official logos and faculty photos (thapar.edu only), checked by the service
```

`setup:local` never overwrites existing files and never prints secrets. It also adds missing local identity settings to `.env` (`BETTER_AUTH_URL`, a random `BETTER_AUTH_SECRET`, `AUTH_ALLOWED_EMAIL_DOMAIN=thapar.edu`) without changing existing values. Google credentials are never generated: without them the app runs, but the sign-in button is disabled (see `docs/auth/google-oauth-setup.md`). PostgreSQL uses host port 55432 so it does not clash with a locally installed PostgreSQL on 5432.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run service` | Background service: outbox worker, signed nudge endpoint, 5-minute sweep, scheduled jobs, realtime WebSocket server (`src/service/main.ts`) |
| `npm run dev:all` | `dev` and `service` together |
| `npm run import -- <faculty\|faculty-order\|societies\|images> [--apply]` | Data imports (dry run without `--apply`; idempotent; `faculty-order` sets only the official order columns) |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint, including module-boundary rules (`eslint/boundaries.mjs`) |
| `npm run typecheck` | `prisma generate` then `tsc --noEmit` |
| `npm run check:em-dash` | Fails on any em-dash in project files (project rule) |
| `npm run check:prerelease` | Fails unless every direct dependency is an exact, stable, locked version |
| `npm run check` | All of the above plus unit tests |
| `npm run test:unit` | Vitest unit tests and lint-rule tests |
| `npm run test:integration` | Vitest with Testcontainers: PostgreSQL client, S3 storage contract, identity, societies and the platform modules (authorisation and capacities, concurrency, uploads, outbox, imports, placement, realtime) (Docker required) |
| `npm run test:e2e` | Prepares the separate E2E database (`<name>_e2e`: migrations and the official faculty directory), builds the E2E variant (`E2E_BUILD=1`, output in `.next-e2e`), then runs Playwright across 14 emulated phone, tablet and desktop profiles (emulation, not physical devices; see `docs/testing/device-test-checklist.md`). Fictitious test users and content go only to the E2E database, never the development one |
| `npm run e2e:prepare-db` | Creates or updates the E2E database only |
| `node scripts/load/run.mjs <url> [users] [seconds]` | Local load test against a production build on the E2E database (`docs/testing/load-test-2026-10-25.md`) |
| `npm run spike:auth` | Auth spike: Better Auth + hashed sessions + simulated Google, T01 to T18 (Docker required; spike code only, not the app) |
| `npm run db:up` / `npm run db:down` | Start or stop local PostgreSQL, Garage and Valkey |
| `npm run db:migrate` | Apply committed migrations (`prisma migrate deploy`); never creates new ones |
| `npm run societies:import:dry-run` | Compares `data/society-import/*.json` with the database (read-only transaction) and prints what an import would create, skip or flag. The apply-capable importer is `npm run import -- societies --apply` (OI-57, OI-58) |
| `npm run check:build` | Normal production build, then proves the E2E test sign-in is absent and unreachable in it (also in CI) |
| `npm run design:sample-colors` | Samples design tokens from the local montage (not committed) |

## Conventions

- **No em-dash characters anywhere** (files, UI text, commit messages). A commit-msg hook in `.githooks/` enforces it; enable it once with `git config core.hooksPath .githooks`.
- Dependencies are pinned exactly (`.npmrc` sets `save-exact`). Dependency install scripts are denied unless approved in `package.json` `allowScripts`.
- Branches: `feat/<module>/<description>` or `fix/<module>/<description>`. Every pull request is reviewed by the owner.
- `project-docs/` (specification PDF, design montage, original logo) is kept locally and is gitignored (privacy). The served logo is `public/brand/tiet-logo.png`, an unchanged copy.
