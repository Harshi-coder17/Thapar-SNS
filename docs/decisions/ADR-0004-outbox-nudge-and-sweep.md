# ADR-0004: Outbox processing: nudge + five-minute sweep

Status: **Approved 2026-10-23 as the proposed design.** Retry parameters, nudge transport (OI-07) and sweep adaptation (OI-06) remain proposals.

## Context
The spec (§4.7) has workers poll the outbox every 2–5 s. On Neon Free this keeps compute permanently awake (≈ 182 CU-hours/month vs 100 allowed).

## Decision
- Transactional outbox unchanged: domain row + outbox row in one transaction.
- After commit, the API nudges the service (signed HTTP proposed). The service processes due rows immediately.
- A sweep every 5 minutes processes anything missed, reclaims expired leases, and runs due scheduled jobs.
- At-least-once delivery; idempotent handlers; leases; exponential backoff; DEAD after 8 attempts.

Full design: `database/background-jobs.md`.

## Consequences
- Normal-path latency is seconds (to be measured). A missed nudge can delay work up to 5 minutes. Service downtime delays work until recovery. **No processing time is guaranteed.** MET-3/OBJ-3 are measured targets.
- A 5-minute sweep may itself keep Neon Free awake (OI-06). It must be measured, and an adaptive sweep or a paid plan chosen.
- Deviation from the spec's polling interval is recorded here and in requirements INC tracking.
