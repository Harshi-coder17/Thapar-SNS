# Deployment Architecture and Cost Assumptions

Status:
- Option B `[APPROVED 2026-10-23]` as the preferred architecture.
- **Fly.io is the preferred candidate host, not a verified cheapest option.**
- Nothing has been created or provisioned. Every account, project or deployment requires approval at gate G-1c.

All figures below were checked on 2026-10-23. **Source type** marks official vendor documentation vs third-party. Prices change; re-verify at G-1c.

## 1. Target architecture

| Component | Host | Purpose | Status |
|---|---|---|---|
| Next.js 16 web + API | Vercel Hobby | Pages, route handlers, auth, signed URLs, outbox writes, nudges | `[APPROVED]` |
| Realtime + worker service (Node 24) | Fly.io, one always-on Machine | WSS server (ticket auth), outbox processing, scheduled jobs | `[APPROVED]` candidate |
| PostgreSQL | Neon | Authoritative data | `[APPROVED]` Free for initial development |
| Object storage | Cloudflare R2 (production); Garage locally | File bytes | `[PROPOSED]` ADR-0007 |
| Redis | Upstash | Rate limits, ticket nonces, pub/sub (if used), cache | `[PROPOSED]` |
| CI/CD | GitHub Actions | Lint, typecheck, tests; deploy | `[SPEC]` |

### 1.1 Region co-location `[PROPOSED]` (OI-31)
Neon offers **Singapore (`aws-ap-southeast-1`)**; Mumbai is not listed (Neon regions page). Proposal: put everything in Singapore: Vercel `sin1`, Fly `sin`, Neon `aws-ap-southeast-1`, Upstash Singapore (verify), R2 location hint APAC (verify). Benefit: low DB latency for both hosts. Trade-off: about 40–70 ms extra round trip for users in India versus a Mumbai host (to be measured; not a verified figure).

## 2. Operational requirements

### Vercel (web/API)
- Fluid compute (default for new projects). Node 24.x.
- Function max duration 300 s on Hobby: fine for HTTP, since realtime is not on Vercel.
- **Runtime logs are kept only 1 hour on Hobby** (Vercel limits page), so errors must go to an external sink (OI-40).
- Hobby is **non-commercial use only** (fair-use guidelines). A student project fits; revisit if that changes.
- Preview deployments per PR `[SPEC]` need a preview database. Proposed: Neon branch per preview (Free: 10 branches/project).

### Fly.io (service)
- One Machine, `shared-cpu-1x`, **512 MB** proposed: the 256 MB preset is likely too small for Node + file validation; measure in 3a.
- Must never auto-stop. The service exposes WSS, so it has an `[http_service]`. Set `auto_stop_machines = "off"` and `auto_start_machines = false` (Fly autostop docs).
- Health check endpoint (`/healthz`: process up, last sweep time, DB reachable, backlog age).
- Restart policy: always. Graceful shutdown: stop accepting work, finish or release leases, close sockets with a "reconnect" code.
- Deploys cause a brief disconnect. Clients reconnect with backoff and re-sync over HTTP (ADR-0012).
- Secrets: DB URL, R2 keys, Redis URL, ticket-signing key, nudge HMAC key. Set via Fly secrets, never in the repo.
- Single instance = single point of failure for realtime and background processing. This is acceptable under the spec's "disposable acceleration" principle: delays only, no data loss. A second Machine (plus Redis pub/sub fan-out) is the scaling path.

### Neon
- Free: 1 GB storage/project, **100 CU-hours/project/month**, scale-to-zero after 5 min (cannot be disabled on Free), 10 branches. When CU-hours run out, compute is suspended until the next billing period.
- See `database/background-jobs.md` §7 for sweep interaction (OI-06).
- Connection handling: the pooled connection string for Vercel functions; direct or pooled for the service (decided in 1c).

### Monitoring (OI-40)
External uptime check on the web app and the service `/healthz`. Error sink for both. Alert on: service down, DEAD outbox rows, backlog age > 10 min, Neon CU usage > 70% of allowance.

## 3. Estimated monthly costs (USD)

| Item | Development (now) | Evaluation / production estimate | Source type |
|---|---|---|---|
| Vercel Hobby | $0 | $0 within allowances: 4 h Active CPU, 360 GB-h memory, 1M invocations, 100 GB transfer | Official (fair-use, pricing docs) |
| Fly.io Machine shared-cpu-1x | $0 if run locally only | **$3.69** (512 MB, `iad` price). Singapore is priced higher: 1 GB is $8.50 in `sin` vs $6.70 in `iad`, so 512 MB in `sin` is **estimated ≈ $4.70** (proportional estimate, not a published price). 256 MB `iad` $2.19 | Official (Fly pricing docs); `sin` 512 MB is an estimate |
| Fly.io extras | – | Shared IPv4 free; dedicated IPv4 $2 (optional, not needed); egress $0.04/GB Asia-Pacific, $0.12/GB India. Realtime traffic is small (estimate < $1) | Official |
| Fly.io free tier | – | **None for new organisations** (trial: 2 h runtime or 7 days) | Official |
| Neon | $0 (Free) | $0 if usage fits 100 CU-h. If the DB stays awake 24/7 at 0.25 CU: ≈ **$19.35** (182.5 CU-h × $0.106) + $0.35/GB-month | Official rates; usage is our estimate |
| Upstash Redis | $0 | $0 within 500K commands/month; then $0.20 per 100K | Official |
| Cloudflare R2 | $0 | Expected $0 at campus scale. Free-tier figures **not verified this session** (spec states 10 GB) | Verify at G-1c |
| Domain (optional) | – | $10–15/year | Spec §2.3 |
| GitHub | $0 | $0 | Spec §2.3 |
| **Total** | **≈ $0** (all local) | **≈ $4–6/month** (Neon Free) to **≈ $25/month** (Neon always-on) | – |

The spec's economic feasibility assumed $0–15 total (spec Table 2.2). The Fly.io service adds a small recurring cost not in the original estimate. This is recorded as INC-11.

## 4. Fallback: Option A (not selected)
Vercel WebSockets (GA 2026-10-20) remain a fallback. Realtime sits behind an adapter (ADR-0012), so moving later is contained. Known constraints from official docs:
- connections close at function max duration (300 s Hobby, 800 s Pro)
- connections are pinned per instance, so shared state needs external storage
- open connections bill provisioned memory continuously (Hobby 360 GB-h)
- Hobby cron is once per day
- Vercel Queues is Beta and Vercel Daemons is a public beta (2026-10-15)

## 5. Gates
- **G-1c:** creating Vercel/Neon/R2/Upstash/Fly accounts, projects, secrets and the first deployment requires explicit owner approval, with a re-verified cost table.
- No production data before Slice 5 hardening sign-off `[PROPOSED]`.
