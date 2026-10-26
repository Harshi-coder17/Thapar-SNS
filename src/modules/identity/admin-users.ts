import "server-only";

// Admin user management (Slice 5, OI-28): ban, unban and role changes, platform capacity only. An
// admin cannot change their own account, and the last admin cannot be demoted or banned. Each change
// revokes the user's sessions and is audited in the same transaction.
import { audit } from "@/modules/admin";
import type { PrismaClient } from "@/shared/db/client";
import { type ApiActor, forbidden, invalid, invalidState, notFound, ok, type ServiceResult } from "@/shared/http/api-action";
import { z } from "zod";

import { setUserBan, setUserRole } from "./accounts";

const banSchema = z.object({ banned: z.boolean(), reason: z.string().trim().max(300).optional() }).strict();
const roleSchema = z.object({ role: z.enum(["STUDENT", "FACULTY", "ADMIN"]) }).strict();

async function guard(tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], actor: ApiActor, userId: string): Promise<ServiceResult<{ role: "STUDENT" | "FACULTY" | "ADMIN" }>> {
  if (actor.capacity !== "platform") return forbidden;
  if (userId === actor.userId) return invalidState("You cannot change your own account here.");
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user ? ok(user) : notFound;
}

async function isLastAdmin(tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], userId: string): Promise<boolean> {
  // Lock admin rows so two concurrent demotions cannot remove the last two admins.
  const admins = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "identity_users" WHERE "role" = 'ADMIN' AND "bannedAt" IS NULL FOR UPDATE`;
  return admins.length <= 1 && admins.some((a) => a.id === userId);
}

export async function banUser(prisma: PrismaClient, actor: ApiActor, userId: string, raw: unknown): Promise<ServiceResult> {
  const parsed = banSchema.safeParse(raw);
  if (!parsed.success) return invalid({ reason: "Give a short reason (at most 300 characters)." });
  if (parsed.data.banned && (parsed.data.reason ?? "").length < 3) return invalid({ reason: "Give a short reason." });
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    const checked = await guard(tx, actor, userId);
    if (!checked.ok) return checked;
    if (parsed.data.banned && checked.value.role === "ADMIN" && (await isLastAdmin(tx, userId))) return invalidState("The last administrator cannot be banned.");
    await setUserBan(tx, userId, parsed.data.banned ? parsed.data.reason! : null);
    await audit(tx, { actorId: actor.userId, action: parsed.data.banned ? "identity.user.banned" : "identity.user.unbanned", targetType: "user", targetId: userId });
    return ok(undefined);
  });
}

export async function changeRole(prisma: PrismaClient, actor: ApiActor, userId: string, raw: unknown): Promise<ServiceResult> {
  const parsed = roleSchema.safeParse(raw);
  if (!parsed.success) return invalid({ role: "Choose a role." });
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    const checked = await guard(tx, actor, userId);
    if (!checked.ok) return checked;
    if (checked.value.role === parsed.data.role) return ok(undefined);
    if (checked.value.role === "ADMIN" && (await isLastAdmin(tx, userId))) return invalidState("The last administrator cannot be demoted.");
    const result = await setUserRole(tx, userId, parsed.data.role);
    await audit(tx, { actorId: actor.userId, action: "identity.role.changed", targetType: "user", targetId: userId, details: { from: checked.value.role, to: parsed.data.role, sessionsRevoked: result?.sessionsRevoked ?? 0 } });
    return ok(undefined);
  });
}
