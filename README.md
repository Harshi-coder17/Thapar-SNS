# Thapar SNS

A unified campus networking and services platform for TIET students. Unofficial student project; not affiliated with or endorsed by Thapar Institute of Engineering and Technology.

Status (2026-10-25): **every non-deployment slice is implemented and verified locally** (see `docs/status/implementation-status.md`). Deployment (Slice 1c) waits for the owner's explicit authorisation. Project documentation starts at [docs/README.md](docs/README.md).

## Prerequisites

| | macOS | Windows 10/11 |
|---|---|---|
| Node.js **24.22.1** | [nvm](https://github.com/nvm-sh/nvm) (reads `.nvmrc`) | [nvm-windows](https://github.com/coreybutler/nvm-windows) (does not read `.nvmrc`; give the version explicitly) |
| Docker | [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Docker Desktop with the **WSL 2** backend (the installer's default) |
| Git | Xcode command line tools (`xcode-select --install`) or Homebrew | [Git for Windows](https://git-scm.com/download/win) |

Docker runs the local database (PostgreSQL), file storage (Garage, S3-compatible) and cache (Valkey, Redis-compatible). It must be **running** (whale icon in the menu bar or system tray) before any `db:` command.

## First-time setup (once per machine)

### macOS (Terminal, zsh or bash)

```bash
git clone https://github.com/Harshi-coder17/Thapar-SNS.git
cd Thapar-SNS
nvm install                 # installs Node 24.22.1 from .nvmrc
nvm use
npm ci                      # exact pinned versions from package-lock.json
npm run setup:local         # generates local-only secrets (gitignored) and .env
open -a Docker              # start Docker Desktop if it is not running; wait for it to be ready
npm run db:up               # PostgreSQL 17.9 on 127.0.0.1:55432, Garage (S3) on 127.0.0.1:3900, Valkey on 127.0.0.1:56379
npm run db:migrate          # apply database migrations (prisma/migrations) to the local database
git config core.hooksPath .githooks   # enables the no-em-dash commit-msg hook
```

### Windows (PowerShell)

```powershell
# Keep LF line endings: the Garage config and scripts expect them.
git clone -c core.autocrlf=false https://github.com/Harshi-coder17/Thapar-SNS.git
cd Thapar-SNS
nvm install 24.22.1
nvm use 24.22.1             # may need an Administrator PowerShell the first time
npm ci
npm run setup:local
# Start Docker Desktop from the Start menu and wait until it says "Engine running".
npm run db:up
npm run db:migrate
git config core.hooksPath .githooks
```

If PowerShell refuses to run `npm` ("running scripts is disabled on this system"), run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use Command Prompt or Git Bash instead. The Windows steps have not yet been verified on a Windows machine; please report anything that differs.

Optional, both systems:

```bash
npm run societies:import:dry-run          # read-only report of what importing the society dataset would do (never writes)
npx playwright install chromium webkit    # browsers for end-to-end tests (about 870 MB)
```

`setup:local` never overwrites existing files and never prints secrets. It also adds missing local identity settings to `.env` (`BETTER_AUTH_URL`, a random `BETTER_AUTH_SECRET`, `AUTH_ALLOWED_EMAIL_DOMAIN=thapar.edu`) without changing existing values. Google credentials are never generated: without them the app runs, but the sign-in button is disabled (see `docs/auth/google-oauth-setup.md`). PostgreSQL uses host port 55432 so it does not clash with a locally installed PostgreSQL on 5432.

## Running the app (every time)

1. Start Docker Desktop and wait until it is ready.
2. In the project folder:

   macOS:

   ```bash
   nvm use
   npm run db:up       # safe to repeat; does nothing if the containers are already running
   npm run dev:all     # frontend and backend together
   ```

   Windows (PowerShell):

   ```powershell
   nvm use 24.22.1
   npm run db:up
   npm run dev:all
   ```

3. Open **http://localhost:3000** in a browser.

`dev:all` runs the frontend (`npm run dev`, Next.js on http://localhost:3000) and the backend service (`npm run service`, on 127.0.0.1:4100) together with prefixed output. To see them separately, run `npm run dev` in one terminal and `npm run service` in a second one (both from the project folder, after `nvm use`).

The service processes uploads (validation, thumbnails), notifications, scheduled jobs and realtime updates; without it the app still works, but uploads stay "being checked" and nothing updates live. Outside production the service does not run scheduled jobs that delete records (the 24-hour story cleanup); production runs every job. `SERVICE_DISABLED_JOBS` overrides this (`.env.example`, OI-63).

**Stopping:** press `Ctrl+C` in the terminal running the app, then `npm run db:down` to stop the containers. Data is kept in Docker volumes between runs.

**Troubleshooting**

- `Cannot connect to the Docker daemon` / `error during connect`: Docker Desktop is not running yet.
- `Port 3000 is already in use`: another copy of the app is still running; stop it first.
- `npm ci` fails with `EBADENGINE` or odd errors: check `node -v` prints `v24.22.1` (run `nvm use` again).

Optional data imports (official Thapar data; dry run unless `--apply`; every step is idempotent and never overwrites):

```bash
npm run import -- faculty   [--apply]   # official faculty directory (data/faculty-import)
npm run import -- societies [--apply]   # student organisations (data/society-import): inactive, awaiting a Head
npm run import -- images    [--apply]   # official logos and faculty photos (thapar.edu only), checked by the service
```

On Windows, `npm run test:e2e` uses Unix-style environment syntax (`E2E_BUILD=1 ...`); run it from Git Bash or WSL rather than PowerShell.

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
