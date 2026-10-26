"use client";

// UC-07: registration with the event's own questions. Repeat submissions return the existing
// registration (E1); a full event puts the student on the waitlist (E2).
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { Field, FormAlert, inputClass, TextInput } from "../../_components/form-fields";
import { useApiAction } from "../../_components/use-api-action";

export interface FormField {
  id: string;
  label: string;
  type: "short_text" | "long_text" | "single_select" | "multi_select" | "checkbox" | "number";
  required: boolean;
  options?: string[];
}

export function RegisterForm({ eventId, fields, full }: { eventId: string; fields: FormField[]; full: boolean }) {
  const { run, pending, error } = useApiAction();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const set = (id: string, value: unknown) => setAnswers((a) => ({ ...a, [id]: value }));
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await run("POST", `/api/events/${eventId}/registration`, { responses: answers });
        setFieldErrors(result.ok ? {} : result.fields);
      }}
    >
      <FormAlert message={error} />
      {fields.map((field) => {
        const id = `q-${field.id}`;
        const label = `${field.label}${field.required ? " (required)" : ""}`;
        const err = fieldErrors[field.id];
        switch (field.type) {
          case "long_text":
            return (
              <Field key={field.id} id={id} label={label} error={err}>
                <textarea id={id} className={`${inputClass} py-2`} rows={3} maxLength={2000} required={field.required} onChange={(e) => set(field.id, e.target.value)} />
              </Field>
            );
          case "number":
            return (
              <Field key={field.id} id={id} label={label} error={err}>
                <TextInput id={id} type="number" required={field.required} onChange={(e) => set(field.id, e.target.value === "" ? "" : Number(e.target.value))} />
              </Field>
            );
          case "checkbox":
            return (
              <div key={field.id}>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
                  <input id={id} type="checkbox" className="size-4" required={field.required} onChange={(e) => set(field.id, e.target.checked)} />
                  {label}
                </label>
                {err ? <p className="text-sm text-brand">{err}</p> : null}
              </div>
            );
          case "single_select":
            return (
              <Field key={field.id} id={id} label={label} error={err}>
                <select id={id} className={inputClass} required={field.required} defaultValue="" onChange={(e) => set(field.id, e.target.value)}>
                  <option value="">Choose…</option>
                  {field.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
            );
          case "multi_select":
            return (
              <fieldset key={field.id}>
                <legend className="text-sm font-medium text-ink">{label}</legend>
                {field.options?.map((o) => (
                  <label key={o} className="flex min-h-11 items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="size-4"
                      onChange={(e) => set(field.id, e.target.checked ? [...((answers[field.id] as string[]) ?? []), o] : ((answers[field.id] as string[]) ?? []).filter((x) => x !== o))}
                    />
                    {o}
                  </label>
                ))}
                {err ? <p className="text-sm text-brand">{err}</p> : null}
              </fieldset>
            );
          default:
            return (
              <Field key={field.id} id={id} label={label} error={err}>
                <TextInput id={id} maxLength={200} required={field.required} onChange={(e) => set(field.id, e.target.value)} />
              </Field>
            );
        }
      })}
      <Button type="submit" disabled={pending}>
        {full ? "Join the waitlist" : "Register"}
      </Button>
    </form>
  );
}
