# ADR-0003: Neon PostgreSQL (Free tier for initial development)

Status: **Approved 2026-10-23** for initial development, subject to current limits and suitability. The plan for the evaluation/production period is open (OI-06).

## Context
The spec selects PostgreSQL on Neon (Table 4.1). Neon Free (pricing page, 2026-10-23):
- 1 GB storage/project
- 100 CU-hours/project/month; running out suspends compute until the next billing period
- scale-to-zero after 5 minutes, which cannot be disabled on Free
- 10 branches
- regions include Singapore (`aws-ap-southeast-1`); Mumbai is not offered

## Decision
- Local development and tests use Docker PostgreSQL (same major version).
- Neon Free is used for preview deployments (a branch per preview) during initial development.
- No always-on process is pointed at Neon Free.

## Consequences
- The 5-minute sweep (ADR-0004) and daytime usage may exceed Free compute during evaluation. Decision pending in OI-06: adaptive sweep vs Neon Launch (~$19/month always-on estimate).
- Neon cold start ("a few hundred milliseconds") affects p95 latency measurements. Performance tests must state warm/cold conditions (OI-33).
- Free-tier PITR/restore window not verified; check at G-1c.
