"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/shared/ui/button";

import { Field, fieldAria, TextInput } from "../../_components/form-fields";
import { useApiAction } from "../../_components/use-api-action";

/** A Head grant, with dates already formatted on the server. */
export interface HeadRow {
  id: string;
  name: string;
  since: string;
  until: string | null;
  grantReason: string;
  revokeReason: string | null;
}

interface Props {
  societyId: string;
  societySlug: string;
  societyName: string;
  heads: { active: HeadRow[]; history: HeadRow[] };
  currentUserId: string;
  /** "head": acting as the society in its workspace; "admin": platform oversight and recovery. */
  mode: "head" | "admin";
  societyActive: boolean;
}

const REASONS: Record<string, string> = {
  MIGRATED: "existing Head (migrated)",
  CREATED_WITH_SOCIETY: "appointed when the society was created",
  ADDED: "added by a Head",
  HANDOVER: "handover",
  ADMIN_RECOVERY: "added by an administrator",
  REMOVED: "removed",
};

function EmailForm({ id, label, hint, button, confirmText, onSubmit }: { id: string; label: string; hint: string; button: string; confirmText?: string; onSubmit: (email: string) => Promise<boolean> }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    setPending(true);
    if (await onSubmit(email.trim())) setEmail("");
    setPending(false);
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <Field id={id} label={label} hint={hint}>
        <TextInput id={id} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@thapar.edu" autoComplete="off" {...fieldAria(id, undefined, true)} />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending || email.trim() === ""}>
        {button}
      </Button>
    </form>
  );
}

/**
 * Heads management (ADR-0013 §3.1). Every action is authorised again on the server, which also
 * enforces "at least one Head" under a row lock; the disabled buttons here are only a convenience.
 */
export function HeadsPanel({ societyId, societySlug, societyName, heads, currentUserId, mode, societyActive }: Props) {
  const router = useRouter();
  const { run, pending, error } = useApiAction();
  const [notice, setNotice] = useState<string | null>(null);
  const lastHead = societyActive && heads.active.length <= 1;
  // The Administration tab acts in the platform-admin capacity, which the server checks against the
  // account's ADMIN role; the workspace acts as a Head of this society. The two never mix.
  const capacity = mode === "admin" ? "?as=admin" : "";

  async function call(method: "POST" | "DELETE", url: string, body: unknown, success: string) {
    setNotice(null);
    const result = await run(method, url, body);
    if (result.ok) setNotice(success);
    return result.ok;
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="active-heads" className="space-y-2">
        <h2 id="active-heads" className="text-base font-semibold text-ink">
          Heads ({heads.active.length})
        </h2>
        <p className="text-sm text-muted">Every Head has the same full access to the {societyName} workspace. An active society always keeps at least one Head.</p>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {heads.active.map((head) => {
            const self = head.id === currentUserId;
            const removable = !lastHead && (mode === "admin" || !self);
            return (
              <li key={head.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {head.name}
                    {self ? <span className="ml-2 text-xs text-muted">(you)</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    Head since {head.since} · {REASONS[head.grantReason] ?? head.grantReason}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  disabled={pending || !removable}
                  title={removable ? undefined : self && mode === "head" ? "Hand over instead" : "The last Head cannot be removed"}
                  onClick={() => {
                    if (window.confirm(`Remove ${head.name}'s Head access? Their account, membership and posts stay.`))
                      void call("DELETE", `/api/societies/${societyId}/heads/${head.id}${capacity}`, undefined, `${head.name} is no longer a Head.`);
                  }}
                >
                  Remove Head access
                </Button>
              </li>
            );
          })}
        </ul>
        {lastHead ? <p className="text-xs text-muted">This is the only Head, so their access cannot be removed. Add another Head first, or hand over.</p> : null}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-brand">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-ink">
          {notice}
        </p>
      ) : null}

      <section aria-labelledby="add-head" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="add-head" className="mb-3 text-base font-semibold text-ink">
          Add a Head
        </h2>
        <EmailForm
          id="add-head-email"
          label="Email address"
          hint="The person must have signed in to Thapar SNS at least once. They get full access immediately."
          button="Add Head"
          onSubmit={(email) => call("POST", `/api/societies/${societyId}/heads${capacity}`, { email }, "Head added.")}
        />
      </section>

      {mode === "head" ? (
        <section aria-labelledby="hand-over" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="hand-over" className="mb-3 text-base font-semibold text-ink">
            Hand over your seat
          </h2>
          <EmailForm
            id="handover-email"
            label="Incoming Head's email address"
            hint="At the end of your tenure: the incoming Head gets access first, then yours ends. You stay a member. This is recorded in the audit log."
            button="Hand over"
            confirmText="Hand over your Head seat? You will lose access to this workspace."
            onSubmit={async (email) => {
              const done = await call("POST", `/api/societies/${societyId}/heads/handover`, { email }, "Handover complete.");
              // The outgoing Head no longer has workspace access: return to the public society page.
              if (done) router.push(`/societies/${societySlug}`);
              return done;
            }}
          />
        </section>
      ) : null}

      {heads.history.length > 0 ? (
        <section aria-labelledby="heads-history">
          <h2 id="heads-history" className="mb-2 text-base font-semibold text-ink">
            Former Heads
          </h2>
          <ul className="space-y-1 text-sm text-muted">
            {heads.history.map((head) => (
              <li key={`${head.id}-${head.since}-${head.until}`}>
                {head.name}: {head.since} to {head.until} ({REASONS[head.revokeReason ?? ""] ?? head.revokeReason})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
