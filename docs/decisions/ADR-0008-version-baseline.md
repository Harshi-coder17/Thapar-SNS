# ADR-0008: Version baseline and pinning policy

Status: **Applied in Slice 1a (2026-10-23), pending owner review.** The owner specified Next.js 16.4.2, Prisma 7.10.1, TypeScript 6.0.3 and ESLint 10.13.0. The 7-day release cooldown (below) was **approved by the owner on 2026-10-23** (OI-46).

## Policy
- Exact version pins (no `^`/`~`), `.npmrc` `save-exact=true`, committed lockfile, `npm ci` in CI.
- No beta, RC, canary or "next" versions as direct dependencies. `npm run check:prerelease` fails CI otherwise and lists transitive prereleases for review.
- **Never install by bare name where `latest` is a prerelease.** On 2026-10-23 npm `prisma@latest` was `8.0.0-rc.27`, and the Prisma CLI prints an "update available" notice pointing to it. Ignore it.
- **Release cooldown `[APPROVED 2026-10-23]`:** choose the newest stable release published at least 7 days before install (cutoff on 2026-10-23: 2026-10-16), unless the owner names a version. Exceptions: urgent security fixes or critical blockers, with the reason recorded here. Keep locked versions unless an update is justified. Reduces exposure to compromised or broken fresh releases (OWASP A03:2025).
- **Compatibility:** declared peer ranges must be satisfied. An install that prints `ERESOLVE overriding peer dependency` is treated as a failure, never forced.
- **Install scripts:** npm 11.19 blocks dependency install scripts unless listed in `package.json` `allowScripts`. Every skipped script is reviewed and recorded as an explicit approval or denial.
- Upgrades are deliberate PRs with changelog review and a full test run.

## ESLint decision (resolves the Slice 1a plan conflict)
- **Problem:** `eslint-config-next` 16.4.2 bundles `eslint-plugin-react` 7.37.5 (peer `eslint ^9.7`), `eslint-plugin-import` 2.32.0 (peer up to `^9`) and `eslint-plugin-jsx-a11y` 6.10.2 (peer up to `^9`).
- **Evidence:** an npm dry run (2026-10-23) of ESLint 10.13.0 + `eslint-config-next` printed `npm warn ERESOLVE overriding peer dependency` three times. ESLint 9 has been end-of-life since 2026-08-06 (eslint.org/version-support), so downgrading is not an option.
- **Decision:** ESLint 10.13.0 with a directly assembled config:
  - `@eslint/js`
  - `typescript-eslint` 8.71.2
  - `@next/eslint-plugin-next` 16.4.2 (recommended + core-web-vitals)
  - `eslint-plugin-react-hooks` 7.1.1 (declares ESLint 10)
  - `eslint-plugin-boundaries` 7.2.0
  - `eslint-import-resolver-typescript` 4.4.5

  The dry run of this set and of the full dependency tree printed **zero** peer warnings.
- **Trade-off:** the rules from `eslint-plugin-react` and `eslint-plugin-jsx-a11y` are not active. Accessibility is covered by axe-core in every E2E route test.
- **React rules restored (OI-44, approved 2026-10-23):** `@eslint-react/eslint-plugin` 5.28.0 `recommended-typescript` on `.tsx`, with its 9 rules that duplicate `eslint-plugin-react-hooks` switched off (derived from its `disable-conflict-eslint-plugin-react-hooks` preset). Dry run clean; no install scripts.

## Install-script decisions (2026-10-23)
All denied; none is needed:

| Package | Script | Why it is not needed |
|---|---|---|
| prisma | preinstall | Node version check only |
| @prisma/engines | postinstall | The schema engine is downloaded by the Prisma CLI on first use |
| unrs-resolver | postinstall | Prebuilt binding installed through optional dependencies |
| ssh2, cpu-features | install | Optional native speedups for Testcontainers (Docker over SSH not used) |
| protobufjs | postinstall | Version check only |
| fsevents (via vite, macOS only) | install | Ships a prebuilt `fsevents.node`; flagged after the 7.2.1 lockfile update, denied in the review |

## Installed baseline (Slice 1a, verified against the npm registry 2026-10-23)

| Package / runtime | Version | Note |
|---|---|---|
| Node.js | 24.22.1 (`.nvmrc`, `engines: 24.x`) | Vercel default major; npm 11.19.1 bundled |
| next | 16.4.2 | Owner-specified |
| react / react-dom | 19.3.1 | |
| typescript | 6.0.3 | Owner-specified; typescript-eslint requires `<6.1.0` |
| eslint | 10.13.0 | Owner-specified |
| @eslint/js / typescript-eslint | 10.0.1 / 8.71.2 | 8.72.0 is inside the cooldown window |
| @next/eslint-plugin-next | 16.4.2 | |
| eslint-plugin-react-hooks | 7.1.1 | |
| @eslint-react/eslint-plugin | 5.28.0 | Added 2026-10-23 (OI-44) |
| better-auth | 1.7.10 | **Dev dependency, auth spike only** (ADR-0005). 1.7.11/1.7.12 are inside the cooldown and contain no security fixes; 1.7.10 includes every published advisory fix (critical GHSA-965c-763c-88jm fixed in 1.7.7) |
| eslint-plugin-boundaries | **7.2.1** | Upgraded from 7.2.0 in the Slice 1a review under the security-fix exception (bundled handlebars 4.7.9 to 4.7.10; GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f, GHSA-xw65-4hp5-5hc7) |
| eslint-import-resolver-typescript | 4.4.5 | |
| globals | 17.13.0 | |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.1 | Owner-specified |
| pg / @types/pg | 8.23.1 / 8.23.1 | |
| zod | 4.6.7 | |
| tailwindcss / @tailwindcss/postcss / postcss | 4.3.3 / 4.3.3 / 8.5.30 | |
| radix-ui | 1.8.1 | Unified Radix primitives (Dialog, Slot) |
| class-variance-authority / clsx / tailwind-merge | 0.7.1 / 2.1.1 / 3.7.0 | shadcn/ui pattern, written by hand (no CLI install) |
| lucide-react | 1.58.0 | |
| server-only | 0.0.1 | |
| vitest / @vitest/coverage-v8 / vite | 5.0.5 / 5.0.5 / 8.3.4 | Vite 8.3.5 is inside the cooldown window |
| @playwright/test / @axe-core/playwright | 1.64.1 / 4.14.0 | |
| testcontainers / @testcontainers/postgresql | 12.2.1 | |
| @aws-sdk/client-s3 / s3-request-presigner | 3.1152.0 | Dev-only until Slice 2d |
| dotenv | 18.0.8 | |
| sharp | 0.35.5 | Design-token sampling script |
| @types/node | 24.19.2 | Matches the Node 24 runtime |
| @types/react / @types/react-dom | 19.3.0 | |
| PostgreSQL image | `postgres:17.9-alpine@sha256:c7526c0f...8609` | Tag and digest pinned |
| Garage image | `dxflrs/garage:v2.4.1@sha256:9c96caa2...0020` | Tag and digest pinned |
| GitHub Actions | `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0 | Pinned to full commit SHAs |

## Known transitive items (reviewed, accepted)
- `glob@10.5.0` (deprecated, with a security warning) via `testcontainers` → `archiver` → `archiver-utils`. It is dev/test-only and never in the app bundle. Revisit when testcontainers updates; no forced override.
- Transitive prereleases: `@visx/*` alphas via `@prisma/studio-core` (Prisma CLI's Studio), `@prisma/engines-version` (an engine build identifier), and `gensync@1.0.0-beta.2` via Babel (used by the react-hooks lint plugin). All are dev-time only.

## Audit status (Slice 1a review, 2026-10-23)
- `npm audit --omit=dev` (production dependencies): **0** vulnerabilities.
- `npm audit` (all): 6 "high" entries, all from `braces` 3.0.3 via micromatch in lint tooling. GitHub has **withdrawn** that advisory (GHSA-vfj7-8cjw-p6xm); no patched version exists. npm's suggested fix (`@next/eslint-plugin-next` 14.2.35, a major downgrade) is rejected (OI-50).
- The 3 critical `handlebars` advisories were fixed by the boundaries upgrade above.

## Planned later (not installed in 1a)
arctic 3.7.0 (auth fallback, only if the spike is rejected), file-type, sanitize-html (**installed in 2a: 2.18.1**, published 2026-10-14, inside the 7-day cooldown cutoff of 2026-10-17; `@types/sanitize-html` 2.16.2 as a dev dependency; 0 audit findings on 2026-10-24), ws (3b), ioredis / @upstash/redis (3b), ical-generator and an rrule library (4d), serwist (6), k6 binary (5). Versions are re-verified when installed.
