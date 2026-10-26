import type { Metadata } from "next";
import Link from "next/link";

import { listNotifications } from "@/modules/notifications";
import { getDb } from "@/shared/db/client";
import { formatRelative } from "@/shared/format";
import { PageHeader } from "@/shared/layout/page-header";
import { cn } from "@/shared/ui/cn";

import { EmptyState } from "../_components/empty-state";
import { requireSession } from "../_lib/session";
import { MarkAllRead, MarkReadLink } from "./mark-read";

export const metadata: Metadata = { title: "Notifications" };

// OI-26: in-app notifications (written with the action that caused them, pushed live via realtime).
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requireSession();
  const { cursor } = await searchParams;
  const page = await listNotifications(getDb(), session.user.id, { cursor: cursor && /^[0-9a-f-]{36}$/i.test(cursor) ? cursor : undefined, take: 30 });
  const now = new Date();
  const unread = page.items.filter((n) => !n.read).length;
  return (
    <>
      <PageHeader title="Notifications" description="Updates about your registrations, requests, uploads and claims." action={unread ? <MarkAllRead /> : undefined} />
      {page.items.length === 0 ? (
        <EmptyState>No notifications yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {page.items.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-5 py-4", !n.read && "bg-accent/40")}>
              <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} />
              <span className="min-w-0 flex-1">
                {n.href ? <MarkReadLink id={n.id} href={n.href} unread={!n.read} title={n.title} /> : <span className="block font-medium text-ink">{n.title}</span>}
                <span className="block text-xs text-muted">
                  {formatRelative(n.createdAt, now)}
                  {!n.read ? <span className="sr-only"> (unread)</span> : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <Link href={`/notifications?cursor=${page.nextCursor}`} className="mt-4 inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline">
          Older notifications
        </Link>
      ) : null}
    </>
  );
}
