import "server-only";

// The append-only audit log (database trigger). Entries are written inside the caller's transaction.
import type { Db } from "@/shared/db/client";

export interface AuditEntry {
  /** Acting user, or null for system actions (e.g. admin bootstrap from configuration). */
  actorId: string | null;
  /** Dotted action name, e.g. "identity.sessions.revoked". */
  action: string;
  targetType: string;
  targetId?: string | null;
  /** Small, non-sensitive facts only: never tokens, never personal data beyond ids. */
  details?: Record<string, string | number | boolean | null>;
  /** The identity the actor acted for (ADR-0013 §3.4), e.g. { type: "society", id }. Omit when acting as themselves. */
  onBehalfOf?: { type: "society"; id: string };
}

export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      details: entry.details ?? {},
      onBehalfOfType: entry.onBehalfOf?.type ?? null,
      onBehalfOfId: entry.onBehalfOf?.id ?? null,
    },
  });
}
