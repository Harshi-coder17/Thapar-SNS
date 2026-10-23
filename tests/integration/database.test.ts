import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient } from "@/shared/db/client";

// Same image (tag and digest) as docker-compose.yml.
const POSTGRES_IMAGE = "postgres:17.9-alpine@sha256:c7526c0f6c3f30260a563d7bcf8ad778effac59a44f8ffa86678c35418338609";

let container: StartedPostgreSqlContainer;
let db: ReturnType<typeof createDbClient>;

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  db = createDbClient(container.getConnectionUri());
});

afterAll(async () => {
  await db?.$disconnect();
  await container?.stop();
});

describe("database client (Prisma 7 + adapter-pg)", () => {
  it("connects and runs a parameterised query", async () => {
    const rows = await db.$queryRaw<Array<{ ok: number }>>`SELECT ${1}::int AS ok`;
    expect(rows).toEqual([{ ok: 1 }]);
  });

  it("runs PostgreSQL 17", async () => {
    const rows = await db.$queryRaw<Array<{ server_version_num: string }>>`SHOW server_version_num`;
    expect(rows[0]?.server_version_num.startsWith("17")).toBe(true);
  });

  it("stores timestamps as timestamptz in UTC", async () => {
    const rows = await db.$queryRaw<Array<{ tz: string }>>`SELECT current_setting('TimeZone') AS tz`;
    expect(rows[0]?.tz).toBe("UTC");
  });
});
