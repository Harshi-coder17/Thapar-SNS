import type { Metadata } from "next";
import Link from "next/link";

import { listConnections } from "@/modules/findmates";
import { formatRelative } from "@/shared/format";
import { PageHeader } from "@/shared/layout/page-header";

import { EmptyState } from "../_components/empty-state";
import { requireSession } from "../_lib/session";

export const metadata: Metadata = { title: "Messages" };

// FR-MATE-4: one conversation per accepted teammate response.
export default async function ChatListPage() {
  const session = await requireSession();
  const connections = await listConnections(session.user.id);
  const now = new Date();
  return (
    <>
      <PageHeader title="Messages" description="Chats with the teammates you connected with through Find Mates." />
      {connections.length === 0 ? (
        <EmptyState>
          No conversations yet. A chat opens when a teammate request is accepted. <Link href="/mates" className="inline-flex min-h-11 items-center text-brand underline underline-offset-4">Find Mates</Link>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {connections.map((c) => (
            <li key={c.id}>
              <Link href={`/chat/${c.id}`} className="flex min-h-11 flex-col gap-1 px-5 py-4 hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                <span className="font-medium text-ink">{c.other.name}</span>
                <span className="text-sm text-muted">
                  {c.requestTitle} · {c.lastMessageAt ? `last message ${formatRelative(c.lastMessageAt, now)}` : `connected ${formatRelative(c.createdAt, now)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
