import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";

const DIR = path.join(import.meta.dirname, "../../prisma/migrations");

/** Names of the committed Prisma migrations, in order. */
export function migrationNames(): string[] {
  return readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Applies committed Prisma migrations, in order, to a test database: all of them by default, or
 * only those after `after` and up to and including `until` (to test a migration against data in the
 * previous shape).
 */
export async function applyMigrations(connectionString: string, options: { after?: string; until?: string } = {}): Promise<void> {
  const migrations = migrationNames().filter((name) => (!options.after || name > options.after) && (!options.until || name <= options.until));
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const name of migrations) await client.query(readFileSync(path.join(DIR, name, "migration.sql"), "utf8"));
  } finally {
    await client.end();
  }
}
