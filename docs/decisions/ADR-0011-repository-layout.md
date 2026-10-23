# ADR-0011: Repository layout: one package, two entry points

Status: **Option 1 applied in Slice 1a (2026-10-23), pending owner review.** The Postgres schema-per-module question moves to Slice 1b, when the first tables are created; no tables exist yet. The service build tool is decided in Slice 3a, when the service gets code.

Applied layout: `src/app` (Next.js routes), `src/modules/<name>` (empty until each slice), `src/shared` (`db`, `layout`, `ui`, `env.ts`), `src/service/{realtime,workers}` (empty until 3a/3b), `src/generated` (Prisma client, gitignored). Boundaries are enforced by `eslint/boundaries.mjs` and tested in `tests/lint/boundaries.test.ts`.

## Context
The Next.js app (Vercel) and the realtime/worker service (Fly.io) share module code: services, schemas, outbox handlers, storage adapter.

## Options
1. **One package, two entry points.** `src/app` for Next.js; `src/service/main.ts` for the service, built with a small bundler/tsx. Simplest for a team new to deployment.
2. A pnpm workspace with `apps/web`, `apps/service`, `packages/*`. Cleaner isolation, more tooling.

## Decision (proposed)
Option 1, using the folder shape in `architecture/modules.md` §2.

Decided in Slice 1a, based on Prisma 7 ESM and Next 16 bundling behaviour:
- Postgres schema-per-module vs table prefixes
- the service build tool

## Consequences
One lockfile and one CI pipeline. The service Docker image includes only what `src/service` imports. Revisit option 2 if build coupling becomes painful.
