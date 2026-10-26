import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listMessages, participantConnection } from "@/modules/findmates";
import { userSummaries } from "@/modules/identity";

import { requireSession } from "../../_lib/session";
import { ChatView } from "./chat-view";

export const metadata: Metadata = { title: "Chat" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only the two participants can open a conversation; anyone else gets a 404 (no existence leak).
export default async function ChatPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const session = await requireSession();
  const { connectionId } = await params;
  if (!UUID.test(connectionId)) notFound();
  const connection = await participantConnection(session.user.id, connectionId);
  if (!connection) notFound();
  const otherId = connection.requesterId === session.user.id ? connection.responderId : connection.requesterId;
  const [messages, people] = await Promise.all([listMessages(session.user.id, connectionId), userSummaries([otherId])]);
  return (
    <>
      <Link href="/chat" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Messages
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{people.get(otherId)?.name ?? "Former user"}</h1>
      <p className="mb-4 text-sm text-muted">
        About{" "}
        <Link href={`/mates/${connection.request.id}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
          {connection.request.title}
        </Link>
      </p>
      <ChatView connectionId={connectionId} initial={(messages ?? []).map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))} />
    </>
  );
}
