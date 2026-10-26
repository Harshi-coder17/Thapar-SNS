"use client";

// FR-EVT-1: create or edit an event, with up to 10 custom registration fields (OI-12). The server
// validates and sanitises everything again.
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/shared/http/api-client";
import { istLocalToIso } from "@/shared/format";
import { Button } from "@/shared/ui/button";

import { Field, fieldAria, FormAlert, inputClass, TextInput } from "../../_components/form-fields";
import { RichTextEditor } from "../../_components/rich-text-editor";

type FieldType = "short_text" | "long_text" | "single_select" | "multi_select" | "checkbox" | "number";
const TYPE_LABELS: Record<FieldType, string> = { short_text: "Short text", long_text: "Long text", single_select: "Choose one", multi_select: "Choose several", checkbox: "Tick box", number: "Number" };

interface DraftField {
  /** Client-only list key. */
  key: number;
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string;
}

export interface EventFormInitial {
  id?: string;
  title: string;
  description: string;
  venue: string;
  startAt: string;
  endAt: string;
  capacity: number;
  fields: { id: string; label: string; type: FieldType; required: boolean; options?: string[] }[];
}

const slug = (label: string, taken: Set<string>) => {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "field";
  if (!/^[a-z]/.test(base)) base = `f_${base}`.slice(0, 24);
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}_${n}`;
  taken.add(candidate);
  return candidate;
};

export function EventForm({ mode, societyId, asAdmin, initial, maxFields }: { mode: "create" | "edit"; societyId: string | null; asAdmin: boolean; initial: EventFormInitial; maxFields: number }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [venue, setVenue] = useState(initial.venue);
  const [startAt, setStartAt] = useState(initial.startAt);
  const [endAt, setEndAt] = useState(initial.endAt);
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [fields, setFields] = useState<DraftField[]>(initial.fields.map((f, i) => ({ ...f, key: i, options: (f.options ?? []).join("\n") })));
  const [nextKey, setNextKey] = useState(initial.fields.length);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = (index: number, change: Partial<DraftField>) => setFields((list) => list.map((f, i) => (i === index ? { ...f, ...change } : f)));

  async function submit(publish: boolean) {
    setPending(true);
    setMessage(null);
    const taken = new Set<string>();
    const registrationSchema = fields.map((f) => {
      const select = f.type === "single_select" || f.type === "multi_select";
      return { id: f.id || slug(f.label, taken), label: f.label, type: f.type, required: f.required, ...(select ? { options: f.options.split("\n").map((o) => o.trim()).filter(Boolean) } : {}) };
    });
    const body = { title, description, venue, startAt: istLocalToIso(startAt) ?? "", endAt: istLocalToIso(endAt) ?? "", capacity: Number(capacity), registrationSchema, ...(mode === "create" ? { publish, ...(societyId ? { societyId } : {}) } : {}) };
    const query = asAdmin ? "?as=admin" : "";
    const result = mode === "create" ? await callApi<{ event: { id: string } }>("POST", `/api/events${query}`, body) : await callApi("PATCH", `/api/events/${initial.id}${query}`, body);
    setPending(false);
    if (!result.ok) {
      setErrors(result.fields);
      setMessage(Object.keys(result.fields).length ? "Check the highlighted fields." : result.message);
      return;
    }
    const id = mode === "create" ? (result.data as { event: { id: string } }).event.id : initial.id!;
    router.push(`/events/${id}`);
    router.refresh();
  }

  return (
    <form
      className="max-w-3xl space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <FormAlert message={message} />
      <Field id="title" label="Title" error={errors.title}>
        <TextInput id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required {...fieldAria("title", errors.title)} />
      </Field>
      <div>
        <p id="description-label" className="text-sm font-medium text-ink">
          Description
        </p>
        <RichTextEditor id="description" labelId="description-label" initialHtml={initial.description} onChange={setDescription} describedBy={errors.description ? "description-error" : undefined} invalid={!!errors.description} />
        {errors.description ? (
          <p id="description-error" className="mt-1 text-sm text-brand">
            {errors.description}
          </p>
        ) : null}
      </div>
      <Field id="venue" label="Venue" error={errors.venue}>
        <TextInput id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={200} required {...fieldAria("venue", errors.venue)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="startAt" label="Starts (IST)" error={errors.startAt}>
          <TextInput id="startAt" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required {...fieldAria("startAt", errors.startAt)} />
        </Field>
        <Field id="endAt" label="Ends (IST)" error={errors.endAt}>
          <TextInput id="endAt" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required {...fieldAria("endAt", errors.endAt)} />
        </Field>
      </div>
      <Field id="capacity" label="Capacity" hint="When it is full, new registrations join a waitlist." error={errors.capacity}>
        <TextInput id="capacity" type="number" min={1} max={100000} value={capacity} onChange={(e) => setCapacity(e.target.value)} required {...fieldAria("capacity", errors.capacity, true)} />
      </Field>

      <fieldset className="space-y-3 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-medium text-ink">Registration questions (optional, up to {maxFields})</legend>
        {errors.registrationSchema ? <p className="text-sm text-brand">{errors.registrationSchema}</p> : null}
        {fields.map((field, index) => (
          <div key={field.key} className="space-y-2 rounded-lg border border-line bg-canvas p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <Field id={`field-${index}-label`} label={`Question ${index + 1}`}>
                <TextInput id={`field-${index}-label`} value={field.label} onChange={(e) => update(index, { label: e.target.value })} maxLength={80} required />
              </Field>
              <Field id={`field-${index}-type`} label="Answer type">
                <select id={`field-${index}-type`} className={inputClass} value={field.type} onChange={(e) => update(index, { type: e.target.value as FieldType })}>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {field.type === "single_select" || field.type === "multi_select" ? (
              <Field id={`field-${index}-options`} label="Options (one per line, at least 2)">
                <textarea id={`field-${index}-options`} className={`${inputClass} py-2`} rows={3} value={field.options} onChange={(e) => update(index, { options: e.target.value })} />
              </Field>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="size-4" checked={field.required} onChange={(e) => update(index, { required: e.target.checked })} />
                Required
              </label>
              <Button type="button" variant="ghost" onClick={() => setFields((list) => list.filter((_, i) => i !== index))}>
                <Trash2 aria-hidden />
                Remove
              </Button>
            </div>
          </div>
        ))}
        {fields.length < maxFields ? (
          <Button type="button" variant="secondary" onClick={() => {
              setFields((list) => [...list, { key: nextKey, id: "", label: "", type: "short_text", required: false, options: "" }]);
              setNextKey((k) => k + 1);
            }}>
            <Plus aria-hidden />
            Add a question
          </Button>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        {mode === "create" ? (
          <>
            <Button type="button" disabled={pending} onClick={() => void submit(true)}>
              Publish event
            </Button>
            <Button type="submit" variant="secondary" disabled={pending}>
              Save as draft
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={pending}>
            Save changes
          </Button>
        )}
      </div>
    </form>
  );
}
