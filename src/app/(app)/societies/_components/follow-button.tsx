"use client";

import { Check, Plus } from "lucide-react";

import { Button } from "@/shared/ui/button";

import { useApiAction } from "../../_components/use-api-action";

/** Follow or unfollow (owner decision 2026-10-24): open to everyone, no approval, no permissions. */
export function FollowButton({ societyId, following, disabled = false }: { societyId: string; following: boolean; disabled?: boolean }) {
  const { run, pending, error } = useApiAction();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={following ? "secondary" : "primary"}
        aria-pressed={following}
        disabled={pending || (disabled && !following)}
        onClick={() => run(following ? "DELETE" : "PUT", `/api/societies/${societyId}/follow`)}
      >
        {following ? <Check aria-hidden /> : <Plus aria-hidden />}
        {following ? "Following" : "Follow"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-brand">
          {error}
        </p>
      ) : null}
    </div>
  );
}
