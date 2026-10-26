import "server-only";

// FR-AUTH-4: administrators revoke sessions. Permission is checked here, per request, from the
// database role (never from the browser). Revocation and its audit record share one transaction.
import { z } from "zod";

import { audit } from "@/modules/admin";
import type { PrismaClient } from "@/shared/db/client";

export const adminRevokeSchema = z.union([z.object({ userId: z.uuid() }).strict(), z.object({ sessionId: z.uuid() }).strict()]);

export type AdminRevokeResult = { ok: true; revoked: number } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" };

export async function adminRevokeSessions(prisma: PrismaClient, actor: { userId: string }, raw: unknown): Promise<AdminRevokeResult> {
  const actorRow = await prisma.user.findUnique({ where: { id: actor.userId }, select: { role: true } });
  if (actorRow?.role !== "ADMIN") return { ok: false, code: "FORBIDDEN" };
  const parsed = adminRevokeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "VALIDATION" };
  const target = parsed.data;

  return prisma.$transaction(async (tx) => {
    if ("userId" in target) {
      if (!(await tx.user.findUnique({ where: { id: target.userId }, select: { id: true } }))) return { ok: false, code: "NOT_FOUND" } as const;
      const { count } = await tx.session.deleteMany({ where: { userId: target.userId } });
      await audit(tx, { actorId: actor.userId, action: "identity.sessions.revoked", targetType: "user", targetId: target.userId, details: { scope: "all", count } });
      return { ok: true, revoked: count } as const;
    }
    const session = await tx.session.findUnique({ where: { id: target.sessionId }, select: { userId: true } });
    if (!session) return { ok: false, code: "NOT_FOUND" } as const;
    await tx.session.delete({ where: { id: target.sessionId } });
    await audit(tx, { actorId: actor.userId, action: "identity.sessions.revoked", targetType: "session", targetId: target.sessionId, details: { scope: "one", userId: session.userId } });
    return { ok: true, revoked: 1 } as const;
  });
}
