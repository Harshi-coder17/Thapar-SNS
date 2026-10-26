import type { Metadata } from "next";

import { openReports, TARGET_LABELS } from "@/modules/admin";
import { getDb } from "@/shared/db/client";
import { formatDateTime } from "@/shared/format";

import { EmptyState } from "../../_components/empty-state";
import { moderationTargets } from "../../_lib/moderation-targets";
import { ResolveReport, RestoreContent } from "../_components/admin-actions";
import { requireAdmin } from "../_lib";

export const metadata: Metadata = { title: "Moderation" };

// UCD-20 Moderate Content: open reports grouped by item; hide or dismiss; restore hidden items.
export default async function ModerationPage() {
  await requireAdmin();
  const reports = await openReports(getDb(), moderationTargets);
  return (
    <>
      <h2 className="mb-3 text-lg font-semibold text-ink">Open reports</h2>
      {reports.length === 0 ? (
        <EmptyState>No open reports.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.reportId} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <p className="text-sm text-muted">
                {TARGET_LABELS[r.targetType]} · reported {r.count === 1 ? "once" : `${r.count} times`} since {formatDateTime(r.firstAt)} · id <code className="text-xs">{r.targetId}</code>
              </p>
              <p className="rounded-lg bg-canvas p-3 text-sm text-ink">{r.preview ?? "The item no longer exists."}</p>
              <ul className="list-disc pl-5 text-sm text-ink">
                {[...new Set(r.reasons)].map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <ResolveReport reportId={r.reportId} />
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 mb-3 text-lg font-semibold text-ink">Restore hidden content</h2>
      <div className="rounded-xl border border-line bg-surface p-4">
        <RestoreContent />
      </div>
    </>
  );
}
