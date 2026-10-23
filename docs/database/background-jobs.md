# Background Jobs - Outbox with Nudge + Sweep

Status: design `[APPROVED 2026-10-23 as proposed design]` (ADR-0004). Parameters marked `[PROPOSED]` still need approval. **No processing-time guarantees are made by this design; see §5.**

## 1. Why an outbox `[SPEC]` (spec §4.7)

When an action needs a database write **and** background work (e.g. "save the asset and validate it"), both are written in **one transaction**: the domain row plus an `outbox_events` row. Either both happen or neither does. Workers process outbox rows afterwards. This gives reliable (at-least-once) background processing using only PostgreSQL.

## 2. What changed from the spec, and why

| Spec | This design | Reason |
|---|---|---|
| Workers poll the outbox every 2–5 s | After commit, the API sends a **nudge** to the service. The service processes immediately. A **sweep every 5 minutes** catches anything missed. | A 2–5 s poll keeps Neon's compute awake permanently: about 0.25 CU × 730 h ≈ 182 CU-hours/month, against **100 CU-hours/project** on Free. Running out suspends compute until the next billing period (Neon pricing page, checked 2026-10-23). |

The outbox table remains the **single source of truth** for pending work. A nudge is only a hint to "look now"; losing one never loses work.

## 3. Components

### 3.1 Outbox table `[PROPOSED]`

| Column | Purpose |
|---|---|
| id (uuid) | Primary key |
| event_type (text) | e.g. `file.uploaded` |
| payload (jsonb) | IDs only, no secrets, no file bytes |
| dedupe_key (text, unique, nullable) | Producer-side de-duplication (e.g. `file.uploaded:<asset_id>`) |
| status | `PENDING` → `PROCESSING` → `DONE`, or `DEAD` |
| attempt_count (int), last_error (text) | Retry bookkeeping |
| available_at (timestamptz) | Earliest time the row may be processed (retry backoff) |
| locked_by (text), locked_until (timestamptz) | Lease for crash recovery |
| created_at, processed_at | Metrics (queue latency) |

Indexes: partial index on `(available_at) WHERE status IN ('PENDING','PROCESSING')`.

### 3.2 Nudge `[PROPOSED]` (transport is OI-07)
- After commit, the route handler uses Next.js `after()` to send `POST /internal/nudge` to the service. It is fire-and-forget with a 2-second timeout, and a failure is only logged.
- The request is authenticated with an HMAC-SHA256 signature over `timestamp + body`, using a shared secret. Requests older than 60 s are rejected. The body carries at most event IDs (no sensitive data).
- Alternative: Redis publish/subscribe. This needs Upstash TCP SUBSCRIBE, which is unverified (OI-41).

### 3.3 Claiming
- Claim in a short transaction: `SELECT … WHERE status='PENDING' AND available_at <= now() ORDER BY available_at LIMIT n FOR UPDATE SKIP LOCKED`, then set `status='PROCESSING', locked_by=<instance>, locked_until=now()+2 min`.
- Also reclaim rows with `status='PROCESSING' AND locked_until < now()` (crashed worker).
- Process **outside** the claim transaction. Finish with a conditional update: `WHERE id=? AND locked_by=?`.
- Concurrency limits per event type, e.g. file validation at most 2 at once on a 512 MB machine `[PROPOSED]`.

### 3.4 Sweep `[APPROVED 5 minutes]`
Every 5 minutes, the service runs: claim-due-rows, reclaim expired leases, then the scheduled jobs in §6 that are due. **Compute implications: §7.**

## 4. Correctness rules

### 4.1 Delivery semantics
**At-least-once.** Any committed outbox row is processed one or more times, provided the service eventually runs and the handler eventually succeeds. Exactly-once is **not** provided. Duplicates are handled by idempotency (§4.2).

### 4.2 Idempotency requirements (mandatory for every handler)
1. **State-conditional transitions.** Example: `UPDATE assets SET status='SCANNING' WHERE id=? AND status='UPLOADED'`. If zero rows change, the work was already done, so stop successfully.
2. **Unique constraints on effects.** Example: `notifications UNIQUE(source_event_id, recipient_id)`, so a re-run cannot double-notify.
3. **Idempotent storage operations.** Copy to a deterministic published key. Delete the quarantine object only after the DB status commit; a re-run tolerates "already copied/deleted".
4. **Realtime publishes carry absolute values plus a version** (e.g. interest count = 42, version 17), never deltas. Clients ignore older versions.
5. **No non-idempotent external calls.** If email or push is added later (OI-26), the provider's idempotency key must be used.

### 4.3 Duplicate events
- Producer side: `dedupe_key` is unique where a natural key exists. For example, a second `complete` call for the same asset cannot enqueue a second `file.uploaded`.
- Consumer side: §4.2.

### 4.4 Ordering
There is no global ordering guarantee. Handlers re-read current state from the DB rather than trusting payload snapshots. Where order matters, aggregate versions are used.

### 4.5 Retry policy `[PROPOSED]`
- Only **infrastructure failures** are retried: DB/storage unavailable, timeouts, unexpected exceptions. **Business outcomes are not failures.** A file failing validation is a successful run that produces `REJECTED`.
- Backoff: delay = min(15 s × 2^(attempt−1), 32 min) ± 20% jitter → 15 s, 30 s, 1 m, 2 m, 4 m, 8 m, 16 m, 32 m.
- After **8 failed attempts** (about 1 hour cumulative), the row becomes `DEAD`. It is visible in the admin dashboard, re-queueable by an admin, and counted in alerts.
- The service schedules an in-process timer for `available_at`. If the timer is lost (restart), the sweep picks the row up.

## 5. Expected processing delays (targets and bounds, not guarantees)

| Situation | Expected delay before processing starts | Notes |
|---|---|---|
| Normal: nudge delivered, service healthy, DB awake | about 1–2 s (to be measured in 3a) | Plus handler time (file download from R2 + checks) |
| DB compute suspended | + "a few hundred milliseconds" wake time (Neon docs) | Applies to API requests too |
| Nudge lost | Up to **5 min** (next sweep) | |
| Transient failure | Per §4.5 backoff, up to about 1 h, then `DEAD` | |
| Service down or restarting | **Unbounded** until the service is back; backlog then drains | The web app keeps working; affected items show "Processing" |

**MET-3** (validation < 5 s) and **OBJ-3** (upload-to-availability within 5 s) are achievable on the **normal path only**. They are reported as measured targets (e.g. p95 for files ≤ the size limit under normal conditions), never as guarantees. The UI must show truthful states ("Processing…", "Rejected: reason") instead of promising a time.

## 6. Scheduled jobs (Worker 2) `[PROPOSED cadences]`

All run inside sweep ticks, batched to minimise DB wake-ups. User-visible **correctness never depends on them**: query-time filters enforce expiry. The jobs only tidy state.

| Job | Cadence | Correctness backstop |
|---|---|---|
| Story cleanup (FR-SOC-3) | hourly | `expires_at > now()` filter |
| Mate request expiry → CLOSED (FR-MATE-5) | hourly | `expires_at > now()` filter |
| Stale assets: AWAITING_UPLOAD > 1 h → EXPIRED, delete quarantine object (UC-13 E1) | hourly | Asset never visible unless APPROVED |
| Calendar 90-day window extension (FR-CAL-2) | daily 02:00 IST + on `calendar.rule.changed` | Window stays ≥ 90 days if daily run succeeds; alert if horizon < 85 days |
| Outbox retention: delete `DONE` older than 14 days | daily | – |
| Expired session cleanup | daily | Expiry checked on every validation |

## 7. Database compute implications - action needed (OI-06)

- **Finding.** Neon Free suspends compute after 5 minutes of inactivity. A sweep that queries the DB every 5 minutes may **prevent suspension entirely**. Neon's documentation doesn't define precisely what resets the inactivity timer, so this must be measured.
  - If it does: ≈ 0.25 CU × 730 h ≈ **182 CU-hours/month**, above the 100 CU-hour Free allowance.
  - The 0.25 CU minimum compute size is an assumption to verify (A-07).
  - Exhausting the allowance **suspends the database until the next billing period**: a full outage.
- **Development is unaffected.** Local development uses Docker PostgreSQL. Neon Free is touched only by preview deployments, on demand. Do **not** point an always-on service at Neon Free.
- **Options for staging/production (decision needed):**
  1. **Adaptive sweep** `[PROPOSED]`: 5-minute sweep while the app is active (any nudge or API activity in the last 30 minutes, tracked in memory/Redis without touching the DB), otherwise hourly. Safe because outbox rows are only created by API requests, which also nudge and wake the DB; scheduled jobs have query-time backstops. *Deviation from the approved fixed 5-minute sweep, so it needs approval.*
  2. **Fixed 5-minute sweep + Neon Launch** (pay-as-you-go, no minimum, $0.106/CU-hour): about **$19/month** if always awake at 0.25 CU, plus $0.35/GB-month storage.
  3. Longer fixed sweep (e.g. 15 min): lets the DB sleep part of the time, but raises missed-nudge delay to 15 min.
- Note: even without any sweep, sustained daytime usage can exceed 100 CU-hours (≈ 400 h at 0.25 CU ≈ 13 h/day). Neon Free is suitable for development, not assured for the evaluation period. Measure in Slice 1c/3a using the Neon usage dashboard.

## 8. Failure-recovery matrix

| Failure | Effect | Recovery |
|---|---|---|
| API crashes before commit | Nothing written | User retries (idempotent endpoints) |
| API crashes after commit, before nudge | Row PENDING | Sweep (≤ 5 min) |
| Nudge rejected/lost | Row PENDING | Sweep |
| Worker crashes mid-handler | Row PROCESSING with lease | Lease expires (2 min) → reclaimed → idempotent re-run |
| Stale worker finishes late | Conditional completion fails | No harm; the effects were idempotent |
| DB unavailable | Claims fail | Service backs off; retries; health check reports degraded |
| R2 unavailable | Handler fails | Retry per §4.5 |
| Poison event (always fails) | `DEAD` after 8 attempts | Alert, admin inspection, manual re-queue after fix |
| Service down for hours | Backlog | Drains on restart in `available_at` order; dashboard shows backlog age |
| Redis down | No realtime fan-out (if Redis is used for it); rate limiter falls back | Clients re-fetch over HTTP; outbox unaffected |
| DB restored from backup | Possible re-processing of rows | Idempotency (§4.2) |

## 9. Reliability check against requirements

| Requirement | Met? | Notes |
|---|---|---|
| Spec §4.7 "reliable asynchronous processing" | Yes: at-least-once, durable in Postgres | Exactly-once is not claimed |
| Spec §4.1 "losing Redis/worker never produces a wrong answer" | Yes | Delays only; state stays authoritative in Postgres |
| MET-3 / OBJ-3 5-second validation | Target on normal path only | Measured and reported, not guaranteed |
| NFR-AVAIL 99% | Web/API: depends on Vercel. Async/realtime: a single Fly machine with restart policy | Monitored; second machine is a scaling option (cost doubles) |

## 10. Tests (Slice 3a)
Atomicity (domain + outbox in one transaction; rollback leaves neither) · nudge-lost → processed by sweep · crash mid-handler → reclaimed after lease · duplicate delivery → single effect · conditional transitions · backoff schedule · DEAD after 8 · dedupe_key rejects duplicate enqueue · scheduled jobs idempotent · normal-path latency measured and recorded (not asserted as a hard guarantee in CI).
