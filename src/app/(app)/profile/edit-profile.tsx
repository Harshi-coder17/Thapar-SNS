"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { Field, fieldAria, FormAlert, inputClass, TextInput } from "../_components/form-fields";
import { useApiAction } from "../_components/use-api-action";

export function EditProfile({ initial, branches, tags, limits }: { initial: { name: string; branchCode: string; year: number; tags: string[] }; branches: { code: string; name: string }[]; tags: { slug: string; label: string }[]; limits: { min: number; max: number } }) {
  const { run, pending, error } = useApiAction();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaved(false);
        const result = await run("PATCH", "/api/identity/profile", form);
        setErrors(result.ok ? {} : result.fields);
        setSaved(result.ok);
      }}
    >
      <FormAlert message={error} />
      <Field id="p-name" label="Name" error={errors.name}>
        <TextInput id="p-name" value={form.name} maxLength={100} required onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} {...fieldAria("p-name", errors.name)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="p-branch" label="Branch" error={errors.branchCode}>
          <select id="p-branch" className={inputClass} value={form.branchCode} onChange={(e) => setForm((f) => ({ ...f, branchCode: e.target.value }))}>
            {branches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="p-year" label="Year" error={errors.year}>
          <select id="p-year" className={inputClass} value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-ink">
          Skills and interests ({limits.min} to {limits.max})
        </legend>
        {errors.tags ? <p className="text-sm text-brand">{errors.tags}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag) => {
            const on = form.tags.includes(tag.slug);
            return (
              <label key={tag.slug} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${on ? "border-brand bg-accent text-accent-foreground" : "border-line bg-surface text-ink"}`}>
                <input type="checkbox" className="size-4" checked={on} disabled={!on && form.tags.length >= limits.max} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.checked ? [...f.tags, tag.slug] : f.tags.filter((t) => t !== tag.slug) }))} />
                {tag.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save profile
        </Button>
        {saved ? <span role="status" className="text-sm text-ink">Saved.</span> : null}
      </div>
    </form>
  );
}
