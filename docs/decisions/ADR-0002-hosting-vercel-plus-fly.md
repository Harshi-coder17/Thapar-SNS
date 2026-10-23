# ADR-0002: Hosting: Vercel for Next.js + a long-running service (Fly.io candidate)

Status: **Approved 2026-10-23** as the preferred architecture (Option B). **Fly.io is the preferred candidate host, not a verified cheapest option.** Nothing provisioned. Gate G-1c governs account creation and deployment.

## Context
- The spec places the web/API on Vercel (SCOPE-3) and describes a WebSocket handler with ticket auth (§4.8) plus two worker processes polling the outbox (§4.2, §4.7).
- Vercel WebSockets became GA on 2026-10-20, but:
  - connections close at function max duration (300 s Hobby / 800 s Pro)
  - connections are pinned per instance and need external shared state
  - open connections bill provisioned memory continuously (Hobby includes 360 GB-hours)
- Hobby cron runs at most once per day. Vercel Queues (Beta) and Vercel Daemons (public beta, 2026-10-15) are not GA.

## Options considered
- **A.** Vercel for everything: native WebSockets + inline/cron/beta job solutions. Realistically needs Pro (~$20/month) or beta products.
- **B.** Vercel for Next.js + one always-on Node service for realtime and workers.

## Decision
Option B. The service runs the WSS server and the outbox workers. Fly.io is the candidate host (one `shared-cpu-1x` Machine, 512 MB proposed, auto-stop off).

## Consequences
- Two deployment targets; shared code packaged per ADR-0011.
- Small recurring cost (≈ $4–6/month estimated; see `deployment/deployment-and-costs.md`) beyond the spec's $0–15 assumption (INC-11).
- A single service Machine is a single point of failure for realtime and async work. This is acceptable as "disposable acceleration" (delays, no data loss).
- Realtime behind an adapter keeps Option A available later.

## Verification / evidence (2026-10-23)
- Vercel changelog "WebSocket support is now generally available" (2026-10-20); docs `/docs/functions/websockets`, `/docs/functions/limitations`, `/docs/functions/usage-and-pricing`, `/docs/limits/fair-use-guidelines`, `/docs/cron-jobs/usage-and-pricing`, `/docs/queues`.
- Fly.io docs: pricing (`docs.fly.io/about/pricing`), autostop (`docs.fly.io/launch/autostop-autostart`).
- Still to verify before G-1c: Fly `sin` price for 512 MB; whether Fly Proxy imposes idle timeouts on WebSocket connections.
