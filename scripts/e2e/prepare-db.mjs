#!/usr/bin/env node
// Prepares the isolated E2E database before `npm run test:e2e` (fixture isolation, 2026-10-25):
// creates it if missing, applies the committed migrations, and loads the official faculty directory
// (idempotent) so faculty search can be tested. Never touches the development database.
import { execFileSync } from "node:child_process";

import pg from "pg";

import { databaseName, developmentDatabaseUrl, e2eDatabaseUrl } from "./database-url.mjs";

const development = developmentDatabaseUrl();
const e2e = e2eDatabaseUrl(development);
if (databaseName(e2e) === databaseName(development)) throw new Error("refusing to run: the E2E database would be the development database");

const admin = new pg.Client({ connectionString: development });
await admin.connect();
try {
  const name = databaseName(e2e);
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    console.log(`e2e: created database ${name}`);
  }
} finally {
  await admin.end();
}

const env = { ...process.env, DATABASE_URL: e2e };
execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: ["ignore", "ignore", "inherit"] });
console.log(`e2e: migrations applied to ${databaseName(e2e)}`);
execFileSync("npx", ["tsx", "--conditions=react-server", "--env-file=.env", "scripts/imports/run.ts", "faculty", "--apply"], { env, stdio: "inherit" });
