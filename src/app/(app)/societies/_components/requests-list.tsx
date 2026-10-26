"use client";

import type { RequestView } from "@/modules/societies";
import { Button } from "@/shared/ui/button";

import { useApiAction } from "../../_components/use-api-action";

/** Pending membership requests; the Head approves or rejects each one (OI-10, audited). */
export function RequestsList({ societyId, requests }: { societyId: string; requests: { id: string; person: RequestView["person"]; message: string | null; requestedAt: string }[] }) {
  const { run, pending, error } = useApiAction();
  if (requests.length === 0) return <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">No pending requests.</p>;
  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-sm text-brand">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{request.person.name}</p>
              <p className="text-sm text-muted">
                {[request.person.branchName, request.person.year ? `Year ${request.person.year}` : null, `requested ${request.requestedAt}`].filter(Boolean).join(" · ")}
              </p>
              {request.message ? <p className="mt-2 text-sm whitespace-pre-line text-ink [overflow-wrap:anywhere]">{request.message}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button size="md" disabled={pending} onClick={() => run("POST", `/api/societies/${societyId}/membership-requests/${request.id}/decision`, { decision: "APPROVE" })}>
                Approve
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => run("POST", `/api/societies/${societyId}/membership-requests/${request.id}/decision`, { decision: "REJECT" })}>
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
