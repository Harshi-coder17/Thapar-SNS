"use client";

// ADR-0010: request a claim (admin approval required); the linked faculty member edits office hours,
// cabin and specialization only.
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { Field, FormAlert, inputClass, TextInput } from "../../_components/form-fields";
import { useApiAction } from "../../_components/use-api-action";

export function ClaimForm({ profileId }: { profileId: string }) {
  const { run, pending, error } = useApiAction();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  // Shown to every signed-in account: students and faculty share @thapar.edu and faculty first sign in
  // with the default role, so the role cannot tell them apart (ADR-0010). A claim grants nothing until
  // an administrator approves it; the server enforces this.
  if (!open)
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">Only for the faculty member named on this page. An administrator checks every claim; claims by anyone else are rejected.</p>
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          This is me: claim this profile
        </Button>
      </div>
    );
  return (
    <form
      className="space-y-3 rounded-lg border border-line bg-canvas p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await run("POST", `/api/faculty/${profileId}/claim`, { message });
        if (result.ok) setOpen(false);
      }}
    >
      <p className="text-sm text-ink">An administrator checks every claim before the profile is linked to your account. After approval, sign in again to use your faculty access.</p>
      <FormAlert message={error} />
      <Field id="claim-message" label="Note for the administrator (optional)">
        <textarea id="claim-message" className={`${inputClass} py-2`} rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Send claim
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function EditOwnProfile({ profileId, initial }: { profileId: string; initial: { cabin: string | null; officeHours: string | null; specialization: string | null } }) {
  const { run, pending, error } = useApiAction();
  const [form, setForm] = useState({ cabin: initial.cabin ?? "", officeHours: initial.officeHours ?? "", specialization: initial.specialization ?? "" });
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaved(false);
        const result = await run("PATCH", `/api/faculty/${profileId}`, { cabin: form.cabin || null, officeHours: form.officeHours || null, specialization: form.specialization || null });
        setSaved(result.ok);
      }}
    >
      <FormAlert message={error} />
      <Field id="cabin" label="Cabin">
        <TextInput id="cabin" maxLength={100} value={form.cabin} onChange={(e) => setForm((f) => ({ ...f, cabin: e.target.value }))} />
      </Field>
      <Field id="officeHours" label="Office hours">
        <TextInput id="officeHours" maxLength={300} value={form.officeHours} onChange={(e) => setForm((f) => ({ ...f, officeHours: e.target.value }))} />
      </Field>
      <Field id="specialization" label="Specialization">
        <textarea id="specialization" className={`${inputClass} py-2`} rows={2} maxLength={500} value={form.specialization} onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        {saved ? <span role="status" className="text-sm text-ink">Saved.</span> : null}
      </div>
    </form>
  );
}
