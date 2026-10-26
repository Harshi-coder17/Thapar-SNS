"use client";

// Personal entries (any student) and academic or campus entries (platform admins, ?as=admin), with
// an optional repeat rule (FR-CAL-2).
import { useState } from "react";

import { istLocalToIso } from "@/shared/format";
import { Button } from "@/shared/ui/button";

import { Field, FormAlert, inputClass, TextInput } from "../../_components/form-fields";
import { useApiAction } from "../../_components/use-api-action";

const REPEATS: Record<string, string> = { "": "Does not repeat", "FREQ=DAILY": "Every day", "FREQ=WEEKLY": "Every week", "FREQ=WEEKLY;INTERVAL=2": "Every two weeks", "FREQ=MONTHLY": "Every month", "FREQ=YEARLY": "Every year" };

export interface EntryInitial {
  id?: string;
  layer: "PERSONAL" | "ACADEMIC" | "CAMPUS";
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  rrule: string;
  until: string;
}

export function EntryForm({ initial, layers, onDone }: { initial: EntryInitial; layers: ("PERSONAL" | "ACADEMIC" | "CAMPUS")[]; onDone?: () => void }) {
  const { run, pending, error } = useApiAction();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof EntryInitial>(key: K, value: EntryInitial[K]) => setForm((f) => ({ ...f, [key]: value }));
  const admin = form.layer !== "PERSONAL";
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const rrule = form.rrule ? `${form.rrule}${form.until ? `;UNTIL=${form.until.replace(/-/g, "")}T235959Z` : ""}` : undefined;
        const body = { layer: form.layer, title: form.title, description: form.description, location: form.location, startAt: istLocalToIso(form.startAt) ?? "", endAt: istLocalToIso(form.endAt) ?? "", allDay: form.allDay, ...(rrule ? { rrule } : {}) };
        const query = admin ? "?as=admin" : "";
        const result = initial.id ? await run("PUT", `/api/calendar/entries/${initial.id}${query}`, body) : await run("POST", `/api/calendar/entries${query}`, body);
        setErrors(result.ok ? {} : result.fields);
        if (result.ok) onDone?.();
      }}
    >
      <FormAlert message={error} />
      {layers.length > 1 && !initial.id ? (
        <Field id="layer" label="Calendar">
          <select id="layer" className={inputClass} value={form.layer} onChange={(e) => set("layer", e.target.value as EntryInitial["layer"])}>
            {layers.map((l) => (
              <option key={l} value={l}>
                {l === "PERSONAL" ? "Personal (only you)" : l === "ACADEMIC" ? "Academic (everyone)" : "Campus (everyone)"}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field id="entry-title" label="Title" error={errors.title}>
        <TextInput id="entry-title" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={150} required />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="entry-start" label="Starts (IST)" error={errors.startAt}>
          <TextInput id="entry-start" type="datetime-local" value={form.startAt} onChange={(e) => set("startAt", e.target.value)} required />
        </Field>
        <Field id="entry-end" label="Ends (IST)" error={errors.endAt}>
          <TextInput id="entry-end" type="datetime-local" value={form.endAt} onChange={(e) => set("endAt", e.target.value)} required />
        </Field>
      </div>
      <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="size-4" checked={form.allDay} onChange={(e) => set("allDay", e.target.checked)} />
        All day
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="entry-repeat" label="Repeat" error={errors.rrule}>
          <select id="entry-repeat" className={inputClass} value={form.rrule} onChange={(e) => set("rrule", e.target.value)}>
            {Object.entries(REPEATS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {form.rrule ? (
          <Field id="entry-until" label="Repeat until (optional)">
            <TextInput id="entry-until" type="date" value={form.until} onChange={(e) => set("until", e.target.value)} />
          </Field>
        ) : null}
      </div>
      <Field id="entry-location" label="Location (optional)">
        <TextInput id="entry-location" value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={200} />
      </Field>
      <Field id="entry-description" label="Notes (optional)">
        <textarea id="entry-description" className={`${inputClass} py-2`} rows={2} maxLength={1000} value={form.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending}>
        {initial.id ? "Save" : "Add to calendar"}
      </Button>
    </form>
  );
}

export function NewEntryPanel({ layers, defaultStart }: { layers: ("PERSONAL" | "ACADEMIC" | "CAMPUS")[]; defaultStart: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Add entry
      </Button>
    );
  const end = defaultStart.replace(/T(\d{2})/, (_, h: string) => `T${String(Math.min(23, Number(h) + 1)).padStart(2, "0")}`);
  return (
    <section className="w-full rounded-xl border border-line bg-surface p-5">
      <EntryForm initial={{ layer: "PERSONAL", title: "", description: "", location: "", startAt: defaultStart, endAt: end, allDay: false, rrule: "", until: "" }} layers={layers} onDone={() => setOpen(false)} />
    </section>
  );
}

export function DeleteEntryButton({ entryId, admin }: { entryId: string; admin: boolean }) {
  const { run, pending } = useApiAction();
  return (
    <Button type="button" variant="ghost" disabled={pending} onClick={() => window.confirm("Delete this entry (and all its repeats)?") && void run("DELETE", `/api/calendar/entries/${entryId}${admin ? "?as=admin" : ""}`)}>
      Delete
    </Button>
  );
}
