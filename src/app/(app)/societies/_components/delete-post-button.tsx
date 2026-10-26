"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/shared/ui/button";

import { useApiAction } from "../../_components/use-api-action";

/** Heads and Editors delete a post or story (audited). */
export function DeletePostButton({ societyId, postId, redirectTo, label = "Delete" }: { societyId: string; postId: string; redirectTo?: string; label?: string }) {
  const router = useRouter();
  const { run, pending, error } = useApiAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={async () => {
          if (!window.confirm("Delete this post? This cannot be undone.")) return;
          const result = await run("DELETE", `/api/societies/${societyId}/posts/${postId}`);
          if (result.ok && redirectTo) router.push(redirectTo);
        }}
      >
        <Trash2 aria-hidden />
        {label}
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-brand">
          {error}
        </span>
      ) : null}
    </span>
  );
}
