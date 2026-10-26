"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import type { ProfileOptions } from "@/modules/identity";
import { Button } from "@/shared/ui/button";

const YEARS = [1, 2, 3, 4, 5];
const inputClass =
  "mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none aria-[invalid=true]:border-brand";

type Fields = Partial<Record<"name" | "rollNumber" | "branchCode" | "year" | "tags" | "form", string>>;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-brand">
      {message}
    </p>
  );
}

/** Profile completion form. The server validates everything again (identity profile.ts). */
export function ProfileForm({ defaultName, options, minTags, maxTags }: { defaultName: string; options: ProfileOptions; minTags: number; maxTags: number }) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>([]);
  const [errors, setErrors] = useState<Fields>({});
  const [pending, setPending] = useState(false);
  const categories = [...new Set(options.tags.map((tag) => tag.category))];

  function toggle(slug: string) {
    setTags((current) => (current.includes(slug) ? current.filter((s) => s !== slug) : current.length >= maxTags ? current : [...current, slug]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), rollNumber: form.get("rollNumber"), branchCode: form.get("branchCode"), year: form.get("year"), tags };
    if (tags.length < minTags) {
      setErrors({ tags: `Choose at least ${minTags} tags.` });
      return;
    }
    setPending(true);
    setErrors({});
    const response = await fetch("/api/identity/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (response?.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    const data = (await response?.json().catch(() => null)) as { error?: { message?: string; fields?: Fields } } | null;
    setErrors(data?.error?.fields ?? { form: data?.error?.message ?? "Could not save your profile. Please try again." });
    setPending(false);
  }

  const described = (key: keyof Fields) => (errors[key] ? `${key}-error` : undefined);

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div>
        <label htmlFor="name" className="text-sm font-medium text-ink">
          Full name
        </label>
        <input id="name" name="name" defaultValue={defaultName} required maxLength={100} autoComplete="name" className={inputClass} aria-invalid={!!errors.name} aria-describedby={described("name")} />
        <FieldError id="name-error" message={errors.name} />
      </div>
      <div>
        <label htmlFor="rollNumber" className="text-sm font-medium text-ink">
          Roll number
        </label>
        <input id="rollNumber" name="rollNumber" required maxLength={15} autoComplete="off" spellCheck={false} className={inputClass} aria-invalid={!!errors.rollNumber} aria-describedby={described("rollNumber")} />
        <FieldError id="rollNumber-error" message={errors.rollNumber} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="branchCode" className="text-sm font-medium text-ink">
            Branch
          </label>
          <select id="branchCode" name="branchCode" required defaultValue="" className={inputClass} aria-invalid={!!errors.branchCode} aria-describedby={described("branchCode")}>
            <option value="" disabled>
              Choose your branch
            </option>
            {options.branches.map((branch) => (
              <option key={branch.code} value={branch.code}>
                {branch.name}
              </option>
            ))}
          </select>
          <FieldError id="branchCode-error" message={errors.branchCode} />
        </div>
        <div>
          <label htmlFor="year" className="text-sm font-medium text-ink">
            Year of study
          </label>
          <select id="year" name="year" required defaultValue="" className={inputClass} aria-invalid={!!errors.year} aria-describedby={described("year")}>
            <option value="" disabled>
              Choose your year
            </option>
            {YEARS.map((year) => (
              <option key={year} value={year}>
                Year {year}
              </option>
            ))}
          </select>
          <FieldError id="year-error" message={errors.year} />
        </div>
      </div>
      <fieldset aria-describedby={["tags-hint", described("tags")].filter(Boolean).join(" ")}>
        <legend className="text-sm font-medium text-ink">Skills and interests</legend>
        <p id="tags-hint" className="text-sm text-muted">
          {tags.length} selected. Choose {minTags} to {maxTags}.
        </p>
        <FieldError id="tags-error" message={errors.tags} />
        <div className="mt-3 space-y-4">
          {categories.map((category) => (
            <div key={category}>
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">{category}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {options.tags
                  .filter((tag) => tag.category === category)
                  .map((tag) => {
                    const selected = tags.includes(tag.slug);
                    return (
                      <label
                        key={tag.slug}
                        className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${selected ? "border-brand bg-accent text-accent-foreground" : "border-line bg-surface text-ink"}`}
                      >
                        <input type="checkbox" className="sr-only" checked={selected} onChange={() => toggle(tag.slug)} disabled={!selected && tags.length >= maxTags} />
                        {tag.label}
                      </label>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      {errors.form ? (
        <p role="alert" className="text-sm text-brand">
          {errors.form}
        </p>
      ) : null}
      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Saving..." : "Save and continue"}
      </Button>
    </form>
  );
}
