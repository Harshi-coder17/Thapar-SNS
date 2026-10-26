"use client";

import { Button } from "@/shared/ui/button";

import { useApiAction } from "../../_components/use-api-action";

/** Platform-admin society status (OI-38). Activation needs at least one Head (checked on the server). */
export function AdminPanel({ societyId, isActive, headCount, verified }: { societyId: string; isActive: boolean; headCount: number; verified: boolean }) {
  const { run, pending, error } = useApiAction();
  return (
    <section aria-labelledby="admin-heading" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h2 id="admin-heading" className="text-base font-semibold text-ink">
        Society status
      </h2>
      <p className="text-sm text-muted">
        {isActive
          ? "Deactivating hides the society from the directory. Its posts stay readable by direct link; nobody can post, join or follow."
          : headCount === 0
            ? "This society is awaiting its first Head. Add a Head below, then activate it."
            : `This society is inactive.${verified ? "" : " Its imported profile has not been reviewed: activating it records your review."} Activating lists it in the directory again.`}
      </p>
      <Button
        variant="secondary"
        disabled={pending || (!isActive && headCount === 0)}
        onClick={() => {
          if (!isActive || window.confirm("Deactivate this society? Pending membership requests will be cancelled.")) void run("PUT", `/api/societies/${societyId}/status`, { active: !isActive });
        }}
      >
        {isActive ? "Deactivate society" : "Activate society"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-brand">
          {error}
        </p>
      ) : null}
    </section>
  );
}
