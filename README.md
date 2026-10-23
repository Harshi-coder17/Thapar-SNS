# Thapar SNS

A unified campus networking and services platform for TIET students. Unofficial student project; not affiliated with or endorsed by Thapar Institute of Engineering and Technology.

Status: **Slice 1a (project skeleton)**. The app is a static shell; no feature works yet. Project documentation starts at [docs/README.md](docs/README.md); working rules for contributors and Claude Code are in [CLAUDE.md](CLAUDE.md).

## Prerequisites

- Node.js **24.22.1** via [nvm](https://github.com/nvm-sh/nvm): run `nvm install` then `nvm use` in this folder (reads `.nvmrc`).
- Docker Desktop (for the local database, storage emulator and integration tests).

## First-time setup

```bash
nvm use
npm ci                  # exact pinned versions from package-lock.json
npm run setup:local     # generates local-only secrets (gitignored) and .env
npm run db:up           # PostgreSQL 17.9 on 127.0.0.1:55432 and Garage (S3) on 127.0.0.1:3900
npx playwright install chromium webkit   # browsers for end-to-end tests (about 870 MB)
npm run dev             # http://localhost:3000
```

`setup:local` never overwrites existing files and never prints secrets. PostgreSQL uses host port 55432 so it does not clash with a locally installed PostgreSQL on 5432.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint, including module-boundary rules (`eslint/boundaries.mjs`) |
| `npm run typecheck` | `prisma generate` then `tsc --noEmit` |
| `npm run check:em-dash` | Fails on any em-dash in project files (project rule) |
| `npm run check:prerelease` | Fails unless every direct dependency is an exact, stable, locked version |
| `npm run check` | All of the above plus unit tests |
| `npm run test:unit` | Vitest unit tests and lint-rule tests |
| `npm run test:integration` | Vitest with Testcontainers: PostgreSQL client and S3 storage contract (Docker required) |
| `npm run test:e2e` | Production build, then Playwright across 14 emulated phone, tablet and desktop profiles (emulation, not physical devices; see `docs/testing/device-test-checklist.md`) |
| `npm run db:up` / `npm run db:down` | Start or stop local PostgreSQL and Garage |
| `npm run design:sample-colors` | Samples design tokens from the local montage (not committed) |

## Conventions

- **No em-dash characters anywhere** (files, UI text, commit messages). A commit-msg hook in `.githooks/` enforces it; enable it once with `git config core.hooksPath .githooks`.
- Dependencies are pinned exactly (`.npmrc` sets `save-exact`). Dependency install scripts are denied unless approved in `package.json` `allowScripts`.
- Branches: `feat/<module>/<description>` or `fix/<module>/<description>`. Every pull request is reviewed by the owner.
- The original requirements PDF and the design montage are kept locally in `project-docs/` and are not committed (privacy).
