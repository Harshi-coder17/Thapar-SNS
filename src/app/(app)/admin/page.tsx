import type { Metadata } from "next";
import Link from "next/link";

import { getDb } from "@/shared/db/client";
import { openReportCount } from "@/modules/admin";
import { archive } from "@/modules/archive";
import { eventCounts } from "@/modules/events";
import { faculty } from "@/modules/faculty";
import { mateCounts, timeToMatchHours } from "@/modules/findmates";
import { accountCounts } from "@/modules/identity";
import { queueStats } from "@/modules/outbox";
import { societyCounts } from "@/modules/societies";
import { materials } from "@/modules/studymaterial";
import { formatDateTime } from "@/shared/format";

import { requireAdmin } from "./_lib";

export const metadata: Metadata = { title: "Administration" };

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}
const hours = (h: number | null) => (h === null ? "No data yet" : h < 48 ? `${h.toFixed(1)} hours` : `${(h / 24).toFixed(1)} days`);

// Slice 5 dashboard and Slice 6 metrics (MET: time to first match, activity counts).
export default async function AdminOverviewPage() {
  await requireAdmin();
  const since = new Date(new Date().getTime() - 30 * 86_400_000);
  const [users, societies, events, mates, ttm, materialCount, archived, queue, claims, reports, outbox, facultyCount] = await Promise.all([
    accountCounts(since),
    societyCounts(),
    eventCounts(),
    mateCounts(),
    timeToMatchHours(since),
    materials.count(),
    archive.publishedCount(),
    archive.queueCount(),
    faculty.pendingClaimCount(),
    openReportCount(getDb()),
    queueStats(getDb()),
    faculty.count(),
  ]);
  const tiles: { label: string; value: string | number; note?: string; href?: string }[] = [
    { label: "Users", value: users.total, note: `${users.completedProfiles} completed profiles, ${users.newSince} new in 30 days, ${users.banned} banned`, href: "/admin/users" },
    { label: "Active in 30 days", value: users.activeSessionsSince, note: "Users with a session used in the last 30 days" },
    { label: "Societies", value: societies.active, note: `${societies.inactive} inactive, of which ${societies.awaitingHead} await their first Head`, href: "/societies?view=inactive" },
    { label: "Upcoming events", value: events.upcoming, note: `${events.drafts} drafts, ${events.registrations} registrations, ${events.interests} interested` },
    { label: "Open teammate requests", value: mates.open, note: `${mates.connections} connections, ${mates.messages} chat messages` },
    { label: "Time to first match (median, 30 days)", value: hours(percentile(ttm, 50)), note: `90th percentile ${hours(percentile(ttm, 90))}; ${ttm.length} matched requests` },
    { label: "Study materials", value: materialCount },
    { label: "Archive", value: archived, note: `${queue} waiting for review`, href: "/admin/archive" },
    { label: "Faculty directory", value: facultyCount, note: `${claims} claims waiting`, href: "/admin/claims" },
    { label: "Open reports", value: reports, href: "/admin/moderation" },
    { label: "Background jobs", value: outbox.dead ? `${outbox.dead} failed` : "Healthy", note: `${outbox.pending} pending, ${outbox.processing} running${outbox.oldestPendingAt ? `, oldest since ${formatDateTime(outbox.oldestPendingAt)}` : ""}`, href: "/admin/outbox" },
  ];
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((t) => (
        <li key={t.label} className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">{t.label}</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{t.value}</p>
          {t.note ? <p className="mt-1 text-xs text-muted">{t.note}</p> : null}
          {t.href ? (
            <Link href={t.href} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline">
              Open
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
