"use client";

import { type FormEvent, useState } from "react";

import { Button } from "@/shared/ui/button";

import { useApiAction } from "../../_components/use-api-action";

interface Props {
  societyId: string;
  userId: string;
  societyName: string;
  memberRoleLabel: string | null;
  isHead: boolean;
  pendingRequest: boolean;
  canRequest: boolean;
  maxMessage: number;
}

/** Membership controls (OI-10): request to join, withdraw a pending request, or leave. Heads hand over instead of leaving. */
export function MembershipActions({ societyId, userId, societyName, memberRoleLabel, isHead, pendingRequest, canRequest, maxMessage }: Props) {
  const { run, pending, error } = useApiAction();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await run("POST", `/api/societies/${societyId}/membership-requests`, { message });
    if (result.ok) {
      setOpen(false);
      setMessage("");
    }
  }

  const alert = error ? (
    <p role="alert" className="text-sm text-brand">
      {error}
    </p>
  ) : null;

  if (memberRoleLabel) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground">{memberRoleLabel}</span>
          {isHead ? null : (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Leave ${societyName}? You will need a Head's approval to join again.`)) void run("DELETE", `/api/societies/${societyId}/members/${userId}`);
              }}
            >
              Leave
            </Button>
          )}
        </div>
        {alert}
      </div>
    );
  }

  if (pendingRequest) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm text-muted">Membership requested</span>
          <Button variant="ghost" disabled={pending} onClick={() => run("DELETE", `/api/societies/${societyId}/membership-requests`)}>
            Withdraw request
          </Button>
        </div>
        {alert}
      </div>
    );
  }

  if (!canRequest) return null;

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Request to join
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md space-y-2 rounded-xl border border-line bg-surface p-4">
      <label htmlFor="join-message" className="text-sm font-medium text-ink">
        Message to the Head (optional)
      </label>
      <textarea
        id="join-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={maxMessage}
        rows={3}
        className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      />
      <p className="text-xs text-muted">The Head sees your name, branch and year. Following does not require approval; membership does.</p>
      {alert}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending..." : "Send request"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
