"use client";

// Event management: publish a draft, cancel (terminal, with a reason; registrants are notified).
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { FormAlert, TextInput } from "../../_components/form-fields";
import { useApiAction } from "../../_components/use-api-action";

export function ManageActions({ eventId, draft, cancellable, asAdmin }: { eventId: string; draft: boolean; cancellable: boolean; asAdmin: boolean }) {
  const { run, pending, error } = useApiAction();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const q = asAdmin ? "?as=admin" : "";
  return (
    <div className="space-y-3">
      <FormAlert message={error} />
      <div className="flex flex-wrap gap-2">
        {draft ? (
          <Button type="button" disabled={pending} onClick={() => void run("POST", `/api/events/${eventId}/publish${q}`)}>
            Publish
          </Button>
        ) : null}
        {cancellable && !cancelling ? (
          <Button type="button" variant="secondary" onClick={() => setCancelling(true)}>
            Cancel event
          </Button>
        ) : null}
      </div>
      {cancelling ? (
        <form
          className="space-y-2 rounded-lg border border-line bg-canvas p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await run("POST", `/api/events/${eventId}/cancel${q}`, { reason });
            if (result.ok) setCancelling(false);
          }}
        >
          <label htmlFor="cancel-reason" className="text-sm font-medium text-ink">
            Reason (sent to everyone registered)
          </label>
          <TextInput id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} required />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              Confirm cancellation
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCancelling(false)}>
              Keep the event
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function CancelRegistrationButton({ eventId }: { eventId: string }) {
  const { run, pending, error } = useApiAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="secondary" disabled={pending} onClick={() => void run("DELETE", `/api/events/${eventId}/registration`)}>
        Cancel my registration
      </Button>
      {error ? <span className="text-sm text-brand" role="alert">{error}</span> : null}
    </span>
  );
}
