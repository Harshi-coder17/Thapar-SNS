import type { Metadata } from "next";
import Link from "next/link";

import { faculty } from "@/modules/faculty";
import { formatDateTime } from "@/shared/format";

import { EmptyState } from "../../_components/empty-state";
import { DecideClaim, RevokeClaim } from "../_components/admin-actions";
import { requireAdmin } from "../_lib";

export const metadata: Metadata = { title: "Faculty claims" };

const STATUS = { PENDING: "Waiting", APPROVED: "Approved", REJECTED: "Rejected", REVOKED: "Revoked" } as const;

// UCD-18 / ADR-0010: approve or reject faculty profile claims; revoke approved links.
export default async function ClaimsPage() {
  const session = await requireAdmin();
  const claims = await faculty.claims();
  return claims.length === 0 ? (
    <EmptyState>No faculty profile claims yet.</EmptyState>
  ) : (
    <ul className="space-y-3">
      {claims.map((c) => (
        <li key={c.id} className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <p className="font-medium text-ink">
            <Link href={`/faculty/${c.profile.id}`} className="underline-offset-4 hover:underline">
              {c.profile.name}
            </Link>{" "}
            <span className="text-sm font-normal text-muted">({c.profile.department})</span>
          </p>
          <p className="text-sm text-ink">
            Claimed by {c.claimant.name} ({c.claimant.email}) on {formatDateTime(c.createdAt)} · <strong>{STATUS[c.status]}</strong>
          </p>
          <p className={c.emailMatches ? "text-sm text-ink" : "text-sm text-brand"}>
            {c.emailMatches ? "Hint: the sign-in email matches the official directory email." : `Hint: the sign-in email does not match the official directory email${c.profile.email ? ` (${c.profile.email})` : " (none published)"}.`}
          </p>
          {c.message ? <p className="rounded-lg bg-canvas p-2 text-sm text-ink">{c.message}</p> : null}
          {c.reason ? <p className="text-sm text-muted">Reason: {c.reason}</p> : null}
          {c.status === "PENDING" ? c.claimant.id === session.user.id ? <p className="text-xs text-muted">Your own claim must be decided by another administrator.</p> : <DecideClaim claimId={c.id} /> : null}
          {c.status === "APPROVED" ? <RevokeClaim profileId={c.profile.id} /> : null}
        </li>
      ))}
    </ul>
  );
}
