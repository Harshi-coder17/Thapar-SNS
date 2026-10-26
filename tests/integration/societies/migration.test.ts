// Data preservation for the ADR-0013 migration (20261025010000_societies_heads_identity): the schema
// is migrated up to the previous migration, filled with data in the old shape (permission tiers
// HEAD / EDITOR / EVENT_MANAGER / MEMBER), then the new migration runs. Nothing may be lost.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../../support/migrations";
import { POSTGRES_IMAGE } from "./harness";

const PREVIOUS = "20261025000000_societies";
const TARGET = "20261025010000_societies_heads_identity";

let container: StartedPostgreSqlContainer;
let db: pg.Client;

const ids = {
  admin: "00000000-0000-4000-8000-0000000000a1",
  head: "00000000-0000-4000-8000-0000000000b1",
  editor: "00000000-0000-4000-8000-0000000000b2",
  manager: "00000000-0000-4000-8000-0000000000b3",
  member: "00000000-0000-4000-8000-0000000000b4",
  society: "00000000-0000-4000-8000-0000000000c1",
  post: "00000000-0000-4000-8000-0000000000d1",
};

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  await applyMigrations(container.getConnectionUri(), { until: PREVIOUS });
  db = new pg.Client({ connectionString: container.getConnectionUri() });
  await db.connect();
  // Fictitious data in the old shape.
  for (const [key, id] of Object.entries(ids).filter(([key]) => ["admin", "head", "editor", "manager", "member"].includes(key))) {
    await db.query(`INSERT INTO "identity_users" ("id", "name", "email", "emailVerified", "role", "updatedAt") VALUES ($1, $2, $3, true, $4, now())`, [
      id,
      `Migration ${key}`,
      `migration.${key}@thapar.edu`,
      key === "admin" ? "ADMIN" : "STUDENT",
    ]);
  }
  await db.query(
    `INSERT INTO "societies_societies" ("id", "slug", "name", "description", "categorySlug", "createdById", "updatedAt") VALUES ($1, 'migration-society', 'Migration Society', 'Old description', 'technical', $2, now())`,
    [ids.society, ids.admin],
  );
  for (const [user, role] of [
    [ids.head, "HEAD"],
    [ids.editor, "EDITOR"],
    [ids.manager, "EVENT_MANAGER"],
    [ids.member, "MEMBER"],
  ] as const) {
    await db.query(`INSERT INTO "societies_memberships" ("societyId", "userId", "role", "joinedAt", "updatedAt") VALUES ($1, $2, $3, '2026-10-24T10:00:00Z', now())`, [ids.society, user, role]);
  }
  await db.query(`INSERT INTO "societies_posts" ("id", "societyId", "authorId", "type", "title", "body", "publishedAt", "updatedAt") VALUES ($1, $2, $3, 'UPDATE', 'Old post', '<p>x</p>', now(), now())`, [
    ids.post,
    ids.society,
    ids.editor,
  ]);
  await db.query(`INSERT INTO "societies_follows" ("societyId", "userId") VALUES ($1, $2)`, [ids.society, ids.member]);
  await db.query(`INSERT INTO "admin_audit_logs" ("id", "actorId", "action", "targetType", "targetId") VALUES (gen_random_uuid(), $1, 'societies.head.transferred', 'society', $2)`, [ids.admin, ids.society]);
  await applyMigrations(container.getConnectionUri(), { after: PREVIOUS, until: TARGET });
});

afterAll(async () => {
  await db?.end();
  await container?.stop();
});

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;

describe("ADR-0013 migration", () => {
  it("MG01: every row survives (users, society, memberships, posts, follows, audit)", async () => {
    const counts = await one<Record<string, string>>(`SELECT
      (SELECT count(*) FROM identity_users) AS users, (SELECT count(*) FROM societies_societies) AS societies,
      (SELECT count(*) FROM societies_memberships) AS memberships, (SELECT count(*) FROM societies_posts) AS posts,
      (SELECT count(*) FROM societies_follows) AS follows, (SELECT count(*) FROM admin_audit_logs) AS audit`);
    expect(counts).toEqual({ users: "5", societies: "1", memberships: "4", posts: "1", follows: "1", audit: "1" });
    expect(await one(`SELECT "authorId", "title" FROM societies_posts WHERE id = $1`, [ids.post])).toEqual({ authorId: ids.editor, title: "Old post" });
    expect(await one(`SELECT action FROM admin_audit_logs`)).toEqual({ action: "societies.head.transferred" });
  });

  it("MG02: the former HEAD becomes an explicit active Head grant; nobody else gets access", async () => {
    const grants = (await db.query(`SELECT "userId", "grantReason", "grantedById", "revokedAt" FROM societies_head_grants`)).rows;
    expect(grants).toEqual([{ userId: ids.head, grantReason: "MIGRATED", grantedById: ids.admin, revokedAt: null }]);
  });

  it("MG03: Editor and Event Manager become display titles; groups are set; the role column is gone", async () => {
    const rows = (await db.query(`SELECT "userId", "group", "position" FROM societies_memberships ORDER BY "userId"`)).rows;
    expect(rows).toEqual([
      { userId: ids.head, group: "CORE", position: null },
      { userId: ids.editor, group: "CORE", position: "Editor" },
      { userId: ids.manager, group: "CORE", position: "Event Manager" },
      { userId: ids.member, group: "GENERAL", position: null },
    ]);
    const roleColumn = await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'societies_memberships' AND column_name = 'role'`);
    expect(roleColumn.rowCount).toBe(0);
  });

  it("MG04: existing societies are marked verified by their creator; category and description become optional; names up to 150", async () => {
    expect(await one(`SELECT "verifiedById", "verifiedAt" IS NOT NULL AS verified FROM societies_societies`)).toEqual({ verifiedById: ids.admin, verified: true });
    await db.query(`UPDATE societies_societies SET "categorySlug" = NULL, "description" = NULL, "name" = $1 WHERE id = $2`, ["N".repeat(150), ids.society]);
    await expect(db.query(`UPDATE societies_societies SET "name" = $1 WHERE id = $2`, ["N".repeat(151), ids.society])).rejects.toThrow();
  });

  it("MG05: the new constraints hold: one active grant per person, titles at most 60 characters, https source URLs", async () => {
    await expect(db.query(`INSERT INTO societies_head_grants (id, "societyId", "userId", "grantReason") VALUES (gen_random_uuid(), $1, $2, 'ADDED')`, [ids.society, ids.head])).rejects.toThrow();
    await db.query(`INSERT INTO societies_head_grants (id, "societyId", "userId", "grantReason") VALUES (gen_random_uuid(), $1, $2, 'ADDED')`, [ids.society, ids.editor]);
    await expect(db.query(`UPDATE societies_memberships SET position = $1 WHERE "userId" = $2`, ["x".repeat(61), ids.member])).rejects.toThrow();
    await expect(db.query(`UPDATE societies_societies SET "sourceUrl" = 'ENACTUS Website' WHERE id = $1`, [ids.society])).rejects.toThrow();
    await expect(db.query(`UPDATE societies_head_grants SET "revokedAt" = now() WHERE "userId" = $1`, [ids.editor])).rejects.toThrow(); // a revocation needs a reason
  });
});
