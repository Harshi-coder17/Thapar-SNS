# Thapar SNS - Documentation Index

Phase 0 documentation set, created 2026-10-23. Baseline: `project-docs/Thapar_SNS_AI_Style_Reviewed.pdf` (cited as "spec §x.y").

## Status labels

| Label | Meaning |
|---|---|
| `[SPEC]` | Confirmed requirement from the baseline specification |
| `[APPROVED]` | Decision approved by the project owner (with date) |
| `[PROPOSED]` | Recommended default awaiting approval |
| `[OPEN]` | Unresolved question (tracked in `open-issues.md`) |
| `[OUT-OF-SCOPE]` | Excluded by the specification itself |

## Map

| Area | Document |
|---|---|
| Requirements (verbatim spec + approved additions) | [requirements/requirements.md](requirements/requirements.md) |
| Requirements traceability matrix | [requirements/traceability.md](requirements/traceability.md) |
| Placement Matrix definition and suppression method | [requirements/placement-matrix.md](requirements/placement-matrix.md) |
| Architecture overview | [architecture/overview.md](architecture/overview.md) |
| Module boundaries, ownership and contracts | [architecture/modules.md](architecture/modules.md) |
| API contract conventions | [api/README.md](api/README.md) |
| Architecture decision records | [decisions/README.md](decisions/README.md) |
| Security requirements and threat model | [security/threat-model.md](security/threat-model.md) |
| Authentication evaluation and spike test plan | [auth/authentication-evaluation.md](auth/authentication-evaluation.md) |
| Database design | [database/database-design.md](database/database-design.md) |
| Background jobs (outbox) design | [database/background-jobs.md](database/background-jobs.md) |
| Deployment architecture and cost assumptions | [deployment/deployment-and-costs.md](deployment/deployment-and-costs.md) |
| Frontend design rules | [design/frontend-design-rules.md](design/frontend-design-rules.md) |
| Reference screen map | [design/screen-map.md](design/screen-map.md) |
| Montage-only features (gap list) | [design/gap-list.md](design/gap-list.md) |
| Testing and quality strategy | [testing/test-strategy.md](testing/test-strategy.md) |
| Implementation phases and acceptance criteria | [status/phases-and-acceptance.md](status/phases-and-acceptance.md) |
| Implementation status | [status/implementation-status.md](status/implementation-status.md) |
| Open issues, assumptions, approval gates | [open-issues.md](open-issues.md) |

## Approval record

| Date | Decision | Where recorded |
|---|---|---|
| 2026-10-23 | Hosting Option B: Vercel (Next.js) + Fly.io as **candidate** host for the realtime/worker service | ADR-0002 |
| 2026-10-23 | Neon free tier for initial development | ADR-0003 |
| 2026-10-23 | Outbox nudge + five-minute sweep as the proposed design | ADR-0004 |
| 2026-10-23 | Auth spike approved: Better Auth + hashing wrapper; Arctic fallback. **Not production-approved.** | ADR-0005, ADR-0006 |
| 2026-10-23 | Placement Matrix PLC-1…PLC-5 with k = 5 | ADR-0009, requirements |
| 2026-10-23 (prior message) | Faculty claims require admin approval | ADR-0010 |
| 2026-10-23 | Goal is the complete application; all original requirements preserved | traceability |
| 2026-10-23 | Phase 0 = documentation only | status |
| 2026-10-23 | Phase 0 documentation fully approved | status |
| 2026-10-23 | No em-dash characters anywhere in the project | CLAUDE.md rule 10 |
| 2026-10-23 | Academic timelines disregarded; own schedule | CLAUDE.md rule 11, OI-02 |
| 2026-10-23 | Claude is solo implementer; owner reviews all PRs | CLAUDE.md rule 12, OI-03 |
| 2026-10-23 | OI-01 Workspace sign-in verified by the owner separately | open-issues |
