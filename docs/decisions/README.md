# Architecture Decision Records (ADRs)

An ADR is a short record of one significant decision: its context, the options considered, the choice, and its consequences. ADRs are not edited after acceptance. A later ADR **supersedes** an earlier one instead.

Status values: `Proposed` · `Approved` (with date and scope) · `Approved for spike only` · `Superseded by ADR-x` · `Rejected`.

| ADR | Title | Status |
|---|---|---|
| [0001](ADR-0001-modular-monolith.md) | Modular monolith with enforced module boundaries | Approved (spec baseline) |
| [0002](ADR-0002-hosting-vercel-plus-fly.md) | Hosting: Vercel + long-running service (Fly.io candidate) | Approved 2026-10-23 (Fly.io = candidate) |
| [0003](ADR-0003-neon-postgres.md) | Neon PostgreSQL, Free tier for initial development | Approved 2026-10-23 (development scope) |
| [0004](ADR-0004-outbox-nudge-and-sweep.md) | Outbox processing: nudge + 5-minute sweep | Approved 2026-10-23 as proposed design; parameters proposed |
| [0005](ADR-0005-authentication-library.md) | Authentication library: Better Auth (spike), Arctic fallback | Approved for spike only |
| [0006](ADR-0006-session-token-representation.md) | Session token representation for FR-AUTH-3 | Proposed: pending spike findings and owner review |
| [0007](ADR-0007-object-storage.md) | Object storage: R2 + Garage; worker-side SHA-256 verification | Proposed (Slice 1a findings added) |
| [0008](ADR-0008-version-baseline.md) | Version baseline and pinning policy | Applied in 1a; pending review (cooldown: OI-46) |
| [0009](ADR-0009-placement-aggregate-only.md) | Placement Matrix: aggregate-only, unofficial, k = 5 | Approved 2026-10-23 |
| [0010](ADR-0010-faculty-claim-admin-approval.md) | Faculty claims require admin approval | Approved 2026-10-23 |
| [0011](ADR-0011-repository-layout.md) | Repository layout: one package, two entry points | Applied in 1a; pending review |
| [0012](ADR-0012-realtime-delivery.md) | Realtime delivery on the service with ticket auth | Proposed |

Template:

```
# ADR-NNNN: Title
Status: … (date)
## Context
## Options considered
## Decision
## Consequences
## Verification / evidence (sources + dates)
```
