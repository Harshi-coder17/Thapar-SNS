"use client";

// Live chat (FR-MATE-4, ADR-0012). Messages are stored first and then announced over realtime; the
// view fetches anything newer than the last message it has, so a missed announcement only delays it.
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { callApi } from "@/shared/http/api-client";
import { useRealtime } from "@/shared/realtime/use-realtime";
import { Button } from "@/shared/ui/button";

import { ReportButton } from "../../_components/report-button";

export interface ChatMessage {
  id: string;
  mine: boolean;
  body: string;
  hidden: boolean;
  createdAt: string;
}

const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function ChatView({ connectionId, initial }: { connectionId: string; initial: ChatMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(initial.at(-1)?.id);

  async function catchUp() {
    const after = lastIdRef.current ? `?after=${lastIdRef.current}` : "";
    const response = await fetch(`/api/connections/${connectionId}/messages${after}`).catch(() => null);
    if (!response?.ok) return;
    const { messages: fresh } = (await response.json()) as { messages: ChatMessage[] };
    if (fresh.length === 0) return;
    setMessages((list) => {
      const known = new Set(list.map((m) => m.id));
      const merged = [...list, ...fresh.filter((m) => !known.has(m.id))];
      lastIdRef.current = merged.at(-1)?.id;
      return merged;
    });
  }

  // On every mount, fetch anything newer than the server-rendered list: a page rendered from slightly
  // older data (e.g. a refresh that arrives late) never hides a message that is already stored.
  const catchUpRef = useRef(catchUp);
  useEffect(() => {
    catchUpRef.current = catchUp;
  });
  useEffect(() => {
    void catchUpRef.current();
  }, [connectionId]);

  useRealtime([`connection:${connectionId}`], (message) => {
    if (message.body.kind === "message") void catchUp();
  }, () => void catchUp());

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface">
      <ol aria-label="Messages" aria-live="polite" className="max-h-[60dvh] min-h-64 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? <li className="text-sm text-muted">No messages yet. Say hello.</li> : null}
        {messages.map((m) => (
          <li key={m.id} className={m.mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
            <span className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm break-words whitespace-pre-line ${m.mine ? "bg-brand text-brand-foreground" : "bg-canvas text-ink"}`}>{m.hidden ? <em>This message was removed by a moderator.</em> : m.body}</span>
            <span className="mt-1 flex items-center gap-2 text-xs text-muted">
              {time.format(new Date(m.createdAt))}
              {!m.mine && !m.hidden ? <ReportButton targetType="CHAT_MESSAGE" targetId={m.id} /> : null}
            </span>
          </li>
        ))}
        <div ref={endRef} />
      </ol>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          setSending(true);
          setError(null);
          const sent = draft;
          const result = await callApi<{ message: { id: string; createdAt: string } }>("POST", `/api/connections/${connectionId}/messages`, { body: sent });
          setSending(false);
          if (result.ok) {
            setDraft("");
            // Show the stored message at once (as the server cleaned it, the catch-up below replaces nothing it already has).
            const { id, createdAt } = result.data.message;
            setMessages((list) => (list.some((m) => m.id === id) ? list : [...list, { id, mine: true, body: sent.trim(), hidden: false, createdAt }]));
            await catchUp();
          } else setError(Object.values(result.fields)[0] ?? result.message);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={4000}
          className="min-h-11 flex-1 resize-none rounded-lg border border-line bg-surface p-2.5 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        />
        <Button type="submit" size="icon" disabled={sending} aria-label="Send message">
          <Send aria-hidden />
        </Button>
      </form>
      {error ? (
        <p role="alert" className="px-4 pb-3 text-sm text-brand">
          {error}
        </p>
      ) : null}
    </div>
  );
}
