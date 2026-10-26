#!/usr/bin/env node
// One-off, reversible correction for the development database (2026-10-25). Until E2E runs got their
// own database (scripts/e2e/prepare-db.mjs), they wrote fictitious fixtures into the development
// database, where they showed up in the ordinary app. Nothing is deleted. Only records whose owners are
// all fixture accounts, matched by exact fixture naming patterns, change status:
//   - fixture societies   -> inactive (like an admin deactivation: hidden from the directory, kept)
//   - fixture events      -> DRAFT    (invisible to students, kept with their registrations)
//   - fixture mate requests -> CLOSED (kept with responses and chats)
// Each change writes an audit entry with the previous value. Dry run by default; --apply to write.
// Reversal: see docs/status/phase-reports/fixture-isolation-2026-10-25.md.
import "dotenv/config";
import pg from "pg";

const apply = process.argv.includes("--apply");
const FIXTURE_EMAIL = "^(e2e\\.(student|admin)|sign\\.out|new\\.student\\.[0-9]+|soc\\.(student|heada|headb|incoming|plain|head)\\.[0-9]+|plat\\.(cal|member|owner|student|event|outsider)\\.[0-9]+|shot\\.(head|heada|headb)\\.[0-9]+)@thapar\\.edu$";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  const fixtureUsers = `SELECT id FROM identity_users WHERE email ~ $1`;
  const societies = await client.query(
    `SELECT s.id, s.name FROM societies_societies s
      WHERE s."sourceKey" IS NULL AND s."isActive" AND s.name ~ '^(E2E Society|Coding Club) [0-9]+$'
        AND NOT EXISTS (SELECT 1 FROM societies_head_grants g WHERE g."societyId" = s.id AND g."userId" NOT IN (${fixtureUsers}))
        AND (s."createdById" IS NULL OR s."createdById" IN (${fixtureUsers}))`,
    [FIXTURE_EMAIL],
  );
  const events = await client.query(
    `SELECT e.id, e.title, e.status FROM events_events e
      WHERE e.title ~ '^E2E Campus Talk [0-9]+$' AND e.status <> 'DRAFT' AND e."createdById" IN (${fixtureUsers})`,
    [FIXTURE_EMAIL],
  );
  const requests = await client.query(
    `SELECT r.id, r.title, r.status FROM findmates_requests r
      WHERE r.title ~ '^E2E team [0-9]+$' AND r.status = 'OPEN' AND r."creatorId" IN (${fixtureUsers})`,
    [FIXTURE_EMAIL],
  );
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${societies.rowCount} fixture societies to deactivate, ${events.rowCount} fixture events to return to draft, ${requests.rowCount} fixture requests to close.`);
  const audit = (targetType, targetId, details) =>
    client.query(`INSERT INTO admin_audit_logs (id, "actorId", action, "targetType", "targetId", details) VALUES (gen_random_uuid(), NULL, 'dev.e2e_fixture.hidden', $1, $2, $3)`, [targetType, targetId, JSON.stringify(details)]);
  if (apply) {
    for (const s of societies.rows) {
      await client.query(`UPDATE societies_societies SET "isActive" = false, "updatedAt" = now() WHERE id = $1 AND "isActive"`, [s.id]);
      await audit("society", s.id, { previous: { isActive: true }, reason: "E2E fixture in the development database" });
    }
    for (const e of events.rows) {
      await client.query(`UPDATE events_events SET status = 'DRAFT', "updatedAt" = now() WHERE id = $1 AND status = $2`, [e.id, e.status]);
      await audit("event", e.id, { previous: { status: e.status }, reason: "E2E fixture in the development database" });
    }
    for (const r of requests.rows) {
      await client.query(`UPDATE findmates_requests SET status = 'CLOSED', "closedAt" = now() WHERE id = $1 AND status = 'OPEN'`, [r.id]);
      await audit("mate_request", r.id, { previous: { status: "OPEN" }, reason: "E2E fixture in the development database" });
    }
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
