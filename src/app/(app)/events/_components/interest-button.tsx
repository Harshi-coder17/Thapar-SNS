"use client";

// FR-EVT-4: "Interested" with a live count. The count arrives over realtime as a versioned absolute
// value (older versions are ignored); after a reconnect it is re-read over HTTP (ADR-0012).
import { Star } from "lucide-react";
import { useState } from "react";

import { callApi } from "@/shared/http/api-client";
import { useRealtime } from "@/shared/realtime/use-realtime";
import { Button } from "@/shared/ui/button";

export function InterestButton({ eventId, interested, count, version, open }: { eventId: string; interested: boolean; count: number; version: number; open: boolean }) {
  const [state, setState] = useState({ interested, count, version });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = (next: { interestCount: number; version: number }) => setState((s) => (next.version > s.version ? { ...s, count: next.interestCount, version: next.version } : s));

  useRealtime(
    [`event:${eventId}`],
    (message) => {
      if (message.body.kind === "interest") apply({ interestCount: Number(message.body.interestCount), version: Number(message.body.version) });
    },
    async () => {
      const response = await fetch(`/api/events/${eventId}/interest`).catch(() => null);
      if (response?.ok) apply((await response.json()) as { interestCount: number; version: number });
    },
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={state.interested ? "primary" : "secondary"}
        aria-pressed={state.interested}
        disabled={pending || !open}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await callApi<{ interested: boolean; interestCount: number; version: number }>("PUT", `/api/events/${eventId}/interest`, { interested: !state.interested });
          setPending(false);
          if (result.ok) setState({ interested: result.data.interested, count: result.data.interestCount, version: Math.max(state.version, result.data.version) });
          else setError(result.message);
        }}
      >
        <Star aria-hidden />
        {state.interested ? "Interested" : "Mark as interested"}
      </Button>
      <span className="text-sm text-muted" aria-live="polite">
        {state.count} interested
      </span>
      {error ? <span className="text-sm text-brand" role="alert">{error}</span> : null}
    </span>
  );
}
