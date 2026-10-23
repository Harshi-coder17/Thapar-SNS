# ADR-0012: Realtime delivery on the service with ticket auth

Status: **Proposed.** Follows spec §4.8 and is hosted per ADR-0002.

## Decision (proposed)
- **Tickets:** `POST /api/realtime/ticket` (authenticated, CSRF-protected) returns a JWT with 30-second expiry, a single-use nonce, the user id and allowed channel scopes. It is signed with a key shared with the service.
- **Connect:** the browser opens `wss://<service>/ws?ticket=…`. The service verifies the signature, expiry and audience, and consumes the nonce atomically in Redis (`SET NX` with TTL). Origin allow-list. No cookies on WSS.
- **Channels:** `event:<id>` (interest counts), `user:<id>` (notifications), `connection:<id>` (chat). Permission to subscribe is decided by the API at ticket issue; the realtime layer never queries the DB `[SPEC]`.
- **Publishing:** the API commits, then publishes via the service's signed internal endpoint (single instance) or Redis pub/sub (multi-instance, per spec). Payloads carry absolute values plus a version.
- **Chat writes** go through the HTTP API (validation, sanitisation, authz, persistence), then are published. The WebSocket is used for delivery only.
- **Client:** reconnect with exponential backoff (1 s → 30 s cap), new ticket per attempt, re-subscribe, then **re-fetch authoritative state over HTTP** (counts; chat messages since the last id). Missed messages are never assumed delivered.

## Consequences
Realtime is an enhancement over HTTP state. If the service is down, pages still load correct data. The spike in 3b verifies Upstash TCP SUBSCRIBE (OI-41) before Redis pub/sub is relied on.
