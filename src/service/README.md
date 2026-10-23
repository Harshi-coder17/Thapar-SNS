# Long-running service (realtime + workers)

Runs separately from Next.js (ADR-0002, ADR-0011). Delivered in Slices 3a and 3b.

- `realtime/`: WebSocket server with ticket authentication. Must not import the database layer,
  `pg` or any `@prisma/*` package (spec §4.8; enforced by lint).
- `workers/`: outbox processing and scheduled jobs (`docs/database/background-jobs.md`).
