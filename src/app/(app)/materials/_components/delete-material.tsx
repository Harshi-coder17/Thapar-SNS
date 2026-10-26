"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/shared/ui/button";

import { useApiAction } from "../../_components/use-api-action";

/** OI-19: the uploader removes their own material. */
export function DeleteMaterialButton({ materialId }: { materialId: string }) {
  const { run, pending, error } = useApiAction();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Remove this material? Others will no longer see it.")) void run("DELETE", `/api/materials/${materialId}`);
        }}
      >
        <Trash2 aria-hidden />
        Remove
      </Button>
      {error ? <span className="text-xs text-brand" role="alert">{error}</span> : null}
    </span>
  );
}
