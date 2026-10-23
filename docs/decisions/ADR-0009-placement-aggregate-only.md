# ADR-0009: Placement Matrix (aggregate-only, unofficial, k = 5)

Status: **Approved 2026-10-23** (PLC-1…PLC-5, k = 5). Method details in `requirements/placement-matrix.md` are `[PROPOSED]` where marked.

## Context
SCOPE-1 includes a "Placement Matrix (basic version)" with no FRs. The problem statement (spec §1.1.1) cites privacy gaps around placement data. LIM-2 says placement data is self-reported and unofficial.

## Decision
- Admin-entered aggregate records only.
- No per-student data.
- Primary suppression at k = 5, plus complementary suppression and filter re-application.
- "Unofficial" labelling with source citation.
- Audit log on every change.
- No student self-reporting in the first delivery.

## Consequences
- Small programmes will show mostly suppressed cells.
- Re-identification cannot be fully prevented against external knowledge (limitations documented).
- Self-reporting, if ever wanted, needs a new ADR and privacy review.
