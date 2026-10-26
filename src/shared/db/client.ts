import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "@/generated/prisma/client";

export type { Prisma, PrismaClient };
/** A client or an open transaction: lets module services take part in a caller's transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;

/** Creates a Prisma client over node-postgres (Prisma 7 requires a driver adapter). */
export function createDbClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// One client per process. Cached on globalThis so development hot reloads do not open a new
// connection pool on every edit. The cache also records a fingerprint of the generated schema (every
// model's column list): after `prisma generate` for a schema change, a hot-reloaded module brings a new
// fingerprint, and a client built from the old schema would reject new fields (2026-10-26: the Faculty
// page failed with "Unknown field unitOrder" until the dev server restarted), so it is replaced. The
// fingerprint is identical in every bundle copy of the same generated client, so production bundles
// keep sharing one client (comparing the class itself would make separate bundles replace each other's
// client while queries are in flight).
const SCHEMA_FINGERPRINT = Object.entries(Prisma as unknown as Record<string, unknown>)
  .filter(([name]) => name.endsWith("ScalarFieldEnum"))
  .map(([name, fields]) => `${name}:${Object.keys(fields as object).join(",")}`)
  .sort()
  .join("|");

const globalForDb = globalThis as typeof globalThis & { thaparSnsDb?: PrismaClient; thaparSnsDbSchema?: string };

/** The process-wide client for DATABASE_URL, created on first use. */
export function getDb(): PrismaClient {
  if (globalForDb.thaparSnsDb && globalForDb.thaparSnsDbSchema !== undefined && globalForDb.thaparSnsDbSchema !== SCHEMA_FINGERPRINT) {
    void globalForDb.thaparSnsDb.$disconnect().catch(() => undefined);
    globalForDb.thaparSnsDb = undefined;
  }
  if (!globalForDb.thaparSnsDb) {
    globalForDb.thaparSnsDbSchema = SCHEMA_FINGERPRINT;
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.thaparSnsDb = createDbClient(url);
  }
  return globalForDb.thaparSnsDb;
}
