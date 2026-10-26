"use client";

// Report content for moderation (Slice 5). One report per item per user; admins review reports.
import { Flag } from "lucide-react";
import { useId, useState } from "react";

import { callApi } from "@/shared/http/api-client";
import { Button } from "@/shared/ui/button";

type Target = "SOCIETY_POST" | "STUDY_MATERIAL" | "ARCHIVE_PROJECT" | "ARCHIVE_COMMENT" | "CHAT_MESSAGE";

export function ReportButton({ targetType, targetId, label = "Report" }: { targetType: Target; targetId: string; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (message && !open) return <span className="text-xs text-muted" role="status">{message}</span>;
  if (!open)
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        <Flag aria-hidden />
        {label}
      </Button>
    );
  return (
    <form
      className="mt-2 flex w-full flex-col gap-2 rounded-lg border border-line bg-canvas p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await callApi("POST", "/api/reports", { targetType, targetId, reason });
        setPending(false);
        if (result.ok || result.status === 409) {
          setMessage(result.ok ? "Thanks, an administrator will review this." : result.message);
          setOpen(false);
        } else setMessage(Object.values(result.fields)[0] ?? result.message);
      }}
    >
      <label htmlFor={id} className="text-sm font-medium text-ink">
        What is wrong?
      </label>
      <textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} required rows={2} className="rounded-lg border border-line bg-surface p-2 text-base text-ink" />
      {message ? <p className="text-sm text-brand" role="alert">{message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Send report
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
