# CLAUDE.md: Thapar SNS

Claude Code reads this file at the start of every session. It holds the rules for working in this repository.

## What this project is

Thapar SNS is a campus networking and services platform for TIET students (UCS503P Software Engineering project, team of four). The goal is the **complete application described in the specification**, not a prototype.

- Baseline specification: `project-docs/Thapar_SNS_AI_Style_Reviewed.pdf` (mid-semester report, 15 Sep 2026).
- Visual style reference: `project-docs/design-reference/` and `project-docs/TIET-Logo.png`.
- All project documentation lives in `docs/`; start at `docs/README.md`.

## Working rules (non-negotiable)

1. **Phase-gated delivery.** Work only inside the currently approved phase/slice (see `docs/status/implementation-status.md`). Stop at the end of each slice, report, and wait for explicit approval before starting the next.
2. **No side effects without approval.** Do not install packages, initialise skeletons, change databases, create external accounts/services, provision infrastructure, or deploy unless the current approved slice explicitly allows it.
3. **Never overwrite blindly.** Read a file before modifying or replacing it. Never modify `project-docs/` (the baseline is read-only).
4. **Never silently weaken a requirement.** If a library or platform cannot meet a `[SPEC]` requirement, document the incompatibility in `docs/open-issues.md` and propose a deviation for approval.
5. **Never mark a workflow complete** unless every specified step (FR text, use-case steps, activity-diagram steps) passes its tests. Otherwise mark it `Partial (missing: …)` in `docs/requirements/traceability.md`.
6. **Do not invent features from the visual montage.** It is a style reference. Features seen only in the montage are tracked in `docs/design/gap-list.md` and are built only after approval.
7. **Verify time-sensitive claims.** Versions, pricing, platform limits and feature availability must be checked against current official documentation before being relied on; record the source and date. Distinguish official from third-party sources.
8. **No beta / RC / canary dependencies** in production without an approved ADR. Pin exact versions. (Note: npm `latest` for the `prisma` CLI pointed to an RC on 2026-10-23, so always pin.)
9. **Explain decisions in plain language.** The project owner is new to Claude Code; summaries should say what was decided, why, and what it affects.
10. **No em-dash characters (U+2014) anywhere in the project** `[APPROVED 2026-10-23]`: documentation, code, code comments, API responses, configuration, commit messages and UI text. Use colons, parentheses, semicolons or commas instead. Enforced by an automated check (from Slice 1a: `npm run check:em-dash`, CI, and a commit-msg hook).
11. **No academic timeline** `[APPROVED 2026-10-23]`: disregard all semester timelines, week numbers and submission dates in the spec. The project runs on the owner's own schedule, slice by slice.
12. **Roles** `[APPROVED 2026-10-23]`: Claude implements the complete application as solo developer/architect. The owner reviews and approves every pull request and every gated external action.

## Status labels used in all docs

| Label | Meaning |
|---|---|
| `[SPEC]` | Confirmed requirement, stated in the baseline specification |
| `[APPROVED]` | Decision approved by the project owner (date recorded) |
| `[PROPOSED]` | Recommended default, not yet approved |
| `[OPEN]` | Unresolved question (see `docs/open-issues.md`) |
| `[OUT-OF-SCOPE]` | Excluded by the specification itself (e.g. §7.3 future work) |

## Architecture rules

- **Two authoritative stores** `[SPEC]`: PostgreSQL for data, S3-compatible storage for approved file bytes. Redis, workers and realtime are disposable acceleration, never a source of truth.
- **Modular monolith** `[SPEC]`: modules never read or write another module's tables; cross-module access goes through the owning module's service interface (`docs/architecture/modules.md`). Enforced by lint rules once code exists.
- **Outbox pattern** `[SPEC]` for every action that needs both a DB write and background work, in one transaction. Handlers must be idempotent (`docs/database/background-jobs.md`).
- **Security baseline** `[SPEC]`: @thapar.edu-only Google sign-in, HTTP-only secure cookies, no tokens in `localStorage`, CSRF protection on all mutating endpoints, server-side allow-list HTML sanitisation, CSP headers, quarantine-first uploads, per-row permission checks, DB unique constraints for double-action rules, signed short-lived download URLs.

## Documentation upkeep (every slice)

Update, as relevant: `docs/requirements/traceability.md`, `docs/status/implementation-status.md`, `docs/open-issues.md`, the affected ADRs, API contracts in `docs/api/`, and `docs/database/database-design.md`. Add a short phase report under `docs/status/phase-reports/`.

## Current state

- Phase 0 approved 2026-10-23. Slice 1a committed and pushed by the owner (`main`: docs; `feat/platform/skeleton`: skeleton and logo). Slice 1b: auth spike complete (`npm run spike:auth`, 37 pass); stopped at gate G-1b-spike awaiting owner review. Google Sign-In approved as the method; allowed domain pending OI-51. Never commit or push; the owner does it.
- Toolchain: Node 24.22.1 via nvm (`source "$NVM_DIR/nvm.sh" && nvm use` in non-interactive shells). Docker Desktop for local services and integration tests.
- Commands: `npm run check` (em-dash, pins, lint, typecheck, unit), `npm run test:integration`, `npm run test:e2e`, `npm run setup:local`, `npm run db:up`. Full list in `README.md`.
- Local PostgreSQL is on host port 55432 (5432 is taken by another install, OI-47).
