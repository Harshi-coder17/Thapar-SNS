// Shared setup for the platform-module suites (Slices 2b to 5): PostgreSQL 17.9 in a container with
// every committed migration. Module services that reach other modules through their public
// interfaces use the process-wide client (getDb), which is pointed at the same container.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import { createDbClient, type PrismaClient } from "@/shared/db/client";
import type { ApiActor } from "@/shared/http/api-action";

import { applyMigrations } from "../../support/migrations";
import { POSTGRES_IMAGE } from "../societies/harness";

export interface Platform {
  prisma: PrismaClient;
  user(options?: { role?: "STUDENT" | "FACULTY" | "ADMIN"; email?: string; skills?: string[] }): Promise<{ id: string; email: string }>;
  society(name: string, heads: string[], options?: { active?: boolean }): Promise<{ id: string; slug: string }>;
  personal(userId: string, role?: ApiActor["globalRole"]): ApiActor;
  platform(userId: string): ApiActor;
  stop(): Promise<void>;
}

let counter = 0;

export async function startPlatform(): Promise<Platform> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const url = container.getConnectionUri();
  await applyMigrations(url);
  const prisma = createDbClient(url);
  process.env.DATABASE_URL = url;
  (globalThis as { thaparSnsDb?: PrismaClient }).thaparSnsDb = prisma;
  return {
    prisma,
    async user(options = {}) {
      counter += 1;
      const email = options.email ?? `user${counter}.${Date.now()}@thapar.edu`;
      const user = await prisma.user.create({
        data: { email, name: `User ${counter}`, emailVerified: true, role: options.role ?? "STUDENT", rollNumber: `PT${String(counter).padStart(7, "0")}`, branchCode: "COE", year: 2, profileCompletedAt: new Date() },
        select: { id: true, email: true },
      });
      await prisma.userSkill.createMany({ data: (options.skills ?? ["python", "rust", "robotics"]).map((tagSlug) => ({ userId: user.id, tagSlug })) });
      return user;
    },
    async society(name, heads, options = {}) {
      counter += 1;
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${counter}`;
      const society = await prisma.society.create({ data: { name: `${name} ${counter}`, slug, isActive: options.active ?? true, verifiedAt: new Date() }, select: { id: true, slug: true } });
      for (const userId of heads) {
        await prisma.societyHeadGrant.create({ data: { societyId: society.id, userId, grantReason: "ADDED" } });
        await prisma.societyMembership.create({ data: { societyId: society.id, userId, group: "CORE" } });
      }
      return society;
    },
    personal: (userId, role = "STUDENT") => ({ userId, globalRole: role, capacity: "personal" }),
    platform: (userId) => ({ userId, globalRole: "ADMIN", capacity: "platform" }),
    async stop() {
      await prisma.$disconnect();
      delete (globalThis as { thaparSnsDb?: PrismaClient }).thaparSnsDb;
      await container.stop();
    },
  };
}

/** A future time window for events. */
export function future(daysFromNow: number, hours = 2): { startAt: string; endAt: string } {
  const start = new Date(Date.now() + daysFromNow * 86_400_000);
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + hours * 3_600_000).toISOString() };
}
