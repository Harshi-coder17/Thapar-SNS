"use client";

// ACT-3 (respond), ACT-5 to ACT-9 (accept or reject), OI-16 (close).
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { FormAlert } from "../../_components/form-fields";
import { useApiAction } from "../../_components/use-api-action";

export function RespondForm({ requestId }: { requestId: string }) {
  const { run, pending, error } = useApiAction();
  const [message, setMessage] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        await run("POST", `/api/mates/${requestId}/responses`, { message });
      }}
    >
      <FormAlert message={error} />
      <label htmlFor="response-message" className="text-sm font-medium text-ink">
        Introduce yourself
      </label>
      <textarea id="response-message" value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={1000} rows={3} className="block w-full rounded-lg border border-line bg-surface p-3 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none" />
      <Button type="submit" disabled={pending}>
        Send response
      </Button>
    </form>
  );
}

export function DecideButtons({ requestId, responseId, canAccept }: { requestId: string; responseId: string; canAccept: boolean }) {
  const { run, pending, error } = useApiAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="flex flex-wrap gap-2">
        {canAccept ? (
          <Button type="button" disabled={pending} onClick={() => void run("POST", `/api/mates/${requestId}/responses/${responseId}/decision`, { decision: "ACCEPT" })}>
            Accept
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={pending} onClick={() => void run("POST", `/api/mates/${requestId}/responses/${responseId}/decision`, { decision: "REJECT" })}>
          Decline
        </Button>
      </span>
      {error ? <span className="text-sm text-brand" role="alert">{error}</span> : null}
    </span>
  );
}

export function CloseRequestButton({ requestId }: { requestId: string }) {
  const { run, pending, error } = useApiAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="secondary" disabled={pending} onClick={() => void run("POST", `/api/mates/${requestId}/close`)}>
        Close request
      </Button>
      {error ? <span className="text-sm text-brand" role="alert">{error}</span> : null}
    </span>
  );
}

export function ChatLink({ connectionId }: { connectionId: string }) {
  return (
    <Button asChild>
      <Link href={`/chat/${connectionId}`}>Open chat</Link>
    </Button>
  );
}
