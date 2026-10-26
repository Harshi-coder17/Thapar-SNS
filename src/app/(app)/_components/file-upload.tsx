"use client";

// Quarantine-first upload (Slice 2d, UC-13): the browser computes the SHA-256, asks for a signed
// upload URL, PUTs the bytes straight to storage, then confirms. The server re-checks type, size and
// checksum in the background and only an APPROVED file is ever shown.
import { Upload } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/shared/ui/button";

type Purpose = "STUDY_MATERIAL" | "SOCIETY_LOGO" | "SOCIETY_BANNER" | "ARCHIVE_SCREENSHOT";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UploadedFile {
  assetId: string;
  name: string;
}

export function FileUpload({ purpose, accept, label, hint, onUploaded, waitForApproval = false }: { purpose: Purpose; accept: string; label: string; hint?: string; onUploaded: (file: UploadedFile) => void; waitForApproval?: boolean }) {
  const id = useId();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      setStatus("Preparing upload…");
      const sha256 = await sha256Hex(file);
      const intent = await fetch("/api/uploads/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purpose, fileName: file.name, contentType: file.type, size: file.size, sha256 }) });
      const intentBody = (await intent.json().catch(() => null)) as { assetId?: string; uploadUrl?: string; contentType?: string; error?: { message?: string; fields?: Record<string, string> } } | null;
      if (!intent.ok || !intentBody?.assetId || !intentBody.uploadUrl) throw new Error(Object.values(intentBody?.error?.fields ?? {})[0] ?? intentBody?.error?.message ?? "The upload could not start.");
      setStatus("Uploading…");
      const put = await fetch(intentBody.uploadUrl, { method: "PUT", headers: { "content-type": intentBody.contentType ?? file.type }, body: file });
      if (!put.ok) throw new Error("The file could not be uploaded. Please try again.");
      const done = await fetch(`/api/uploads/${intentBody.assetId}/complete`, { method: "POST" });
      if (!done.ok) throw new Error("The upload could not be confirmed. Please try again.");
      let approved = false;
      if (waitForApproval) {
        setStatus("Checking the file…");
        for (let i = 0; i < 30; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const check = await fetch(`/api/uploads/${intentBody.assetId}`);
          const state = (await check.json().catch(() => null)) as { status?: string; rejectionReason?: string | null } | null;
          if (state?.status === "APPROVED") {
            approved = true;
            break;
          }
          if (state?.status === "REJECTED" || state?.status === "QUARANTINED") throw new Error(`The file was rejected: ${state.rejectionReason ?? "it failed validation"}.`);
        }
      }
      setStatus(approved ? "Uploaded and checked." : "Uploaded. It will appear once it has been checked.");
      onUploaded({ assetId: intentBody.assetId, name: file.name });
    } catch (caught) {
      setStatus(null);
      setError(caught instanceof Error ? caught.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <Button asChild variant="secondary" aria-disabled={busy}>
          <label htmlFor={id} className="cursor-pointer">
            <Upload aria-hidden />
            {busy ? "Working…" : "Choose file"}
          </label>
        </Button>
        <input
          id={id}
          type="file"
          accept={accept}
          disabled={busy}
          className="sr-only"
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
        <span role="status" className="text-sm text-muted">
          {status}
        </span>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-sm text-brand">
          {error}
        </p>
      ) : null}
    </div>
  );
}
