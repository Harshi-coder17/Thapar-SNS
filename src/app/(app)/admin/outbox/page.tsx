import type { Metadata } from "next";

import { listDead, queueStats } from "@/modules/outbox";
import { getDb } from "@/shared/db/client";
import { formatDateTime } from "@/shared/format";

import { EmptyState } from "../../_components/empty-state";
import { RequeueButton } from "../_components/admin-actions";
import { requireAdmin } from "../_lib";

export const metadata: Metadata = { title: "Background jobs" };

// background-jobs.md §3.3: failed (DEAD) jobs can be retried after the cause is fixed.
export default async function OutboxPage() {
  await requireAdmin();
  const [stats, dead] = await Promise.all([queueStats(getDb()), listDead(getDb())]);
  return (
    <>
      <p className="mb-4 text-sm text-ink">
        {stats.pending} pending · {stats.processing} running · {stats.dead} failed
        {stats.oldestPendingAt ? ` · oldest pending since ${formatDateTime(stats.oldestPendingAt)}` : ""}
      </p>
      {dead.length === 0 ? (
        <EmptyState>No failed jobs.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {dead.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
              <span className="font-medium text-ink">{e.eventType}</span>
              <span className="text-muted">
                {e.attemptCount} attempts · last error {e.lastError ?? "unknown"} · created {formatDateTime(e.createdAt)}
              </span>
              <RequeueButton eventId={e.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
