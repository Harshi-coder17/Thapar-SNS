"use client";

// Admin actions (Slice 5). Every call uses the platform capacity (?as=admin); the server re-checks the
// ADMIN role and refuses an admin acting on their own account or claim.
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { FormAlert, inputClass, TextInput } from "../../_components/form-fields";
import { useApiAction } from "../../_components/use-api-action";

function ReasonForm({ label, submitLabel, onSubmit, minLength = 3 }: { label: string; submitLabel: string; onSubmit: (reason: string) => Promise<unknown>; minLength?: number }) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(reason);
        setReason("");
      }}
    >
      <label className="min-w-48 flex-1 text-xs text-muted">
        {label}
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} minLength={minLength} maxLength={300} required />
      </label>
      <Button type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}

export function UserActions({ userId, role, banned }: { userId: string; role: "STUDENT" | "FACULTY" | "ADMIN"; banned: boolean }) {
  const { run, pending, error } = useApiAction();
  return (
    <div className="space-y-2">
      <FormAlert message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted">
          Role
          <select className={`${inputClass} mt-0 py-0 text-sm`} defaultValue={role} disabled={pending} onChange={(e) => void run("POST", `/api/admin/users/${userId}/role?as=admin`, { role: e.target.value })}>
            <option value="STUDENT">Student</option>
            <option value="FACULTY">Faculty</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </label>
        {banned ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => void run("POST", `/api/admin/users/${userId}/ban?as=admin`, { banned: false })}>
            Lift ban
          </Button>
        ) : null}
      </div>
      {!banned ? <ReasonForm label="Ban reason (signs the user out everywhere)" submitLabel="Ban" onSubmit={(reason) => run("POST", `/api/admin/users/${userId}/ban?as=admin`, { banned: true, reason })} /> : null}
    </div>
  );
}

export function ResolveReport({ reportId }: { reportId: string }) {
  const { run, error } = useApiAction();
  const [action, setAction] = useState<"HIDE" | "DISMISS">("HIDE");
  return (
    <div className="space-y-2">
      <FormAlert message={error} />
      <div className="flex gap-2 text-sm">
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="radio" name={`a-${reportId}`} checked={action === "HIDE"} onChange={() => setAction("HIDE")} /> Hide the content
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="radio" name={`a-${reportId}`} checked={action === "DISMISS"} onChange={() => setAction("DISMISS")} /> Dismiss the report
        </label>
      </div>
      <ReasonForm label="Note (recorded in the audit log)" submitLabel="Resolve" onSubmit={(note) => run("POST", `/api/admin/reports/${reportId}?as=admin`, { action, note })} />
    </div>
  );
}

export function RestoreContent() {
  const { run, error } = useApiAction();
  const [type, setType] = useState("STUDY_MATERIAL");
  const [id, setId] = useState("");
  return (
    <div className="space-y-2">
      <FormAlert message={error} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Kind
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="STUDY_MATERIAL">Study material</option>
            <option value="ARCHIVE_COMMENT">Archive comment</option>
            <option value="CHAT_MESSAGE">Chat message</option>
          </select>
        </label>
        <label className="min-w-72 flex-1 text-xs text-muted">
          Item id
          <TextInput value={id} onChange={(e) => setId(e.target.value.trim())} required pattern="[0-9a-fA-F-]{36}" />
        </label>
      </div>
      <ReasonForm label="Note" submitLabel="Restore" onSubmit={(note) => run("POST", "/api/admin/moderation/restore?as=admin", { targetType: type, targetId: id, note })} />
    </div>
  );
}

export function DecideClaim({ claimId }: { claimId: string }) {
  const { run, error } = useApiAction();
  return (
    <div className="space-y-2">
      <FormAlert message={error} />
      <ReasonForm label="Reason (sent to the claimant if rejected)" submitLabel="Approve" onSubmit={(reason) => run("POST", `/api/admin/faculty-claims/${claimId}/decision?as=admin`, { decision: "APPROVE", reason })} />
      <ReasonForm label="Reason" submitLabel="Reject" onSubmit={(reason) => run("POST", `/api/admin/faculty-claims/${claimId}/decision?as=admin`, { decision: "REJECT", reason })} />
    </div>
  );
}

export function RevokeClaim({ profileId }: { profileId: string }) {
  const { run, error } = useApiAction();
  return (
    <div className="space-y-2">
      <FormAlert message={error} />
      <ReasonForm label="Revocation reason" submitLabel="Revoke link" onSubmit={(reason) => run("POST", `/api/faculty/${profileId}/revoke?as=admin`, { reason })} />
    </div>
  );
}

export function ReviewProject({ projectId }: { projectId: string }) {
  const { run, pending, error } = useApiAction();
  return (
    <div className="space-y-2">
      <FormAlert message={error} />
      <Button type="button" disabled={pending} onClick={() => void run("POST", `/api/archive/${projectId}/review?as=admin`, { decision: "APPROVE" })}>
        Approve and publish
      </Button>
      <ReasonForm label="Why it is not accepted (sent to the submitter)" submitLabel="Reject" onSubmit={(note) => run("POST", `/api/archive/${projectId}/review?as=admin`, { decision: "REJECT", note })} />
    </div>
  );
}

export function RequeueButton({ eventId }: { eventId: string }) {
  const { run, pending, error } = useApiAction();
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="secondary" disabled={pending} onClick={() => void run("POST", `/api/admin/outbox/${eventId}/requeue?as=admin`)}>
        Retry
      </Button>
      {error ? <span className="text-xs text-brand">{error}</span> : null}
    </span>
  );
}

export function PlacementRecordForm({ branches }: { branches: { code: string; name: string }[] }) {
  const { run, pending, error } = useApiAction();
  const empty = { academicYear: "", programme: "B.E.", branchCode: "", company: "", offerType: "FULL_TIME", offerCount: "", eligibleCount: "", placedCount: "", medianCtcLpa: "", sourceCitation: "", sourceDate: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const field = (key: keyof typeof empty, label: string, props: Record<string, unknown> = {}) => (
    <label className="text-xs text-muted">
      {label}
      <TextInput value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} {...props} />
      {errors[key] ? <span className="text-brand">{errors[key]}</span> : null}
    </label>
  );
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await run("POST", "/api/admin/placement/records?as=admin", form);
        setErrors(result.ok ? {} : result.fields);
        if (result.ok) setForm(empty);
      }}
    >
      <FormAlert message={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {field("academicYear", "Academic year (e.g. 2025-26)", { required: true })}
        {field("programme", "Programme", { required: true })}
        <label className="text-xs text-muted">
          Branch
          <select className={inputClass} value={form.branchCode} required onChange={(e) => setForm((f) => ({ ...f, branchCode: e.target.value }))}>
            <option value="">Choose…</option>
            {branches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {field("company", "Company (empty = all companies)")}
        <label className="text-xs text-muted">
          Offer type
          <select className={inputClass} value={form.offerType} onChange={(e) => setForm((f) => ({ ...f, offerType: e.target.value }))}>
            <option value="FULL_TIME">Full-time</option>
            <option value="INTERNSHIP">Internship</option>
          </select>
        </label>
        {field("offerCount", "Offers", { type: "number", min: 0, required: true })}
        {field("eligibleCount", "Eligible students (optional)", { type: "number", min: 0 })}
        {field("placedCount", "Placed students (optional)", { type: "number", min: 0 })}
        {field("medianCtcLpa", "Median CTC in LPA, only as published (optional)", { type: "number", min: 0, step: "0.01" })}
        {field("sourceCitation", "Source citation", { required: true })}
        {field("sourceDate", "Source date", { type: "date", required: true })}
      </div>
      <Button type="submit" disabled={pending}>
        Save record
      </Button>
    </form>
  );
}

export function PlacementImport() {
  const { run, pending, error } = useApiAction();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setResult(null);
        const response = await run<{ created: number; updated: number }>("POST", "/api/admin/placement/import?as=admin", { csv });
        if (response.ok) setResult(`Imported: ${response.data.created} created, ${response.data.updated} updated.`);
      }}
    >
      <FormAlert message={error} />
      <label className="block text-xs text-muted">
        CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-1 block text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setCsv(await file.text());
          }}
        />
      </label>
      <label className="block text-xs text-muted">
        Or paste CSV
        <textarea className={`${inputClass} py-2 font-mono text-xs`} rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
      </label>
      <p className="text-xs text-muted">Columns: academic_year, programme, branch_code, company, offer_type, offer_count, eligible_count, placed_count, median_ctc_lpa, source_citation, source_date. Files with any per-student column are rejected.</p>
      <Button type="submit" disabled={pending || !csv}>
        Import
      </Button>
      {result ? <p role="status" className="text-sm text-ink">{result}</p> : null}
    </form>
  );
}

export function DeletePlacementRecord({ recordId }: { recordId: string }) {
  const { run, pending } = useApiAction();
  return (
    <Button type="button" variant="ghost" disabled={pending} onClick={() => window.confirm("Delete this record?") && void run("DELETE", `/api/admin/placement/records/${recordId}?as=admin`)}>
      Delete
    </Button>
  );
}

/** FR-AUTH-4: revoke one session, or every session of the user (POST /api/identity/admin/sessions/revoke). */
export function SessionActions({ userId, sessions }: { userId: string; sessions: { id: string; label: string }[] }) {
  const { run, pending, error } = useApiAction();
  return (
    <div className="space-y-2">
      <FormAlert message={error} />
      {sessions.length === 0 ? <p className="text-xs text-muted">No active sessions.</p> : null}
      <ul className="space-y-1">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{s.label}</span>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => void run("POST", "/api/identity/admin/sessions/revoke", { sessionId: s.id })}>
              Revoke
            </Button>
          </li>
        ))}
      </ul>
      {sessions.length > 1 ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={() => void run("POST", "/api/identity/admin/sessions/revoke", { userId })}>
          Sign out everywhere
        </Button>
      ) : null}
    </div>
  );
}
