// The E2E database (fixture isolation): the development DATABASE_URL with the database name suffixed
// "_e2e", on the same local PostgreSQL. End-to-end runs write fictitious users, societies and events;
// they must never reach the development database.
import { existsSync } from "node:fs";

export function developmentDatabaseUrl() {
  if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (run npm run setup:local)");
  return url;
}

export function e2eDatabaseUrl(source = developmentDatabaseUrl()) {
  const url = new URL(source);
  const name = url.pathname.replace(/^\//, "");
  if (!name || name.endsWith("_e2e")) return url.toString();
  url.pathname = `/${name}_e2e`;
  return url.toString();
}

/** Database name only (never the password), for messages. */
export const databaseName = (value) => new URL(value).pathname.replace(/^\//, "");
