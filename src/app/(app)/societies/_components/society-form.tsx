"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import type { CategoryOption, SocialLinks } from "@/modules/societies";
import { callApi } from "@/shared/http/api-client";
import { Button } from "@/shared/ui/button";

import { Field, fieldAria, FormAlert, inputClass, TextInput } from "../../_components/form-fields";

interface Initial {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  description: string | null;
  categorySlug: string | null;
  links: SocialLinks;
  contactEmail: string | null;
}

interface Props {
  mode: "create" | "edit";
  categories: CategoryOption[];
  /** Admins may rename a society; Heads may not. */
  canRename: boolean;
  initial?: Initial;
  limits: { name: number; description: number; shortName: number };
}

/** Create (platform admins, FR-SOC-1) or edit (any Head, or an admin; UCD-4) a society profile. The server re-validates everything. */
export function SocietyForm({ mode, categories, canRename, initial, limits }: Props) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    const links = { website: text("website"), instagram: text("instagram"), linkedin: text("linkedin") };
    const common = { shortName: text("shortName"), description: text("description"), categorySlug: text("categorySlug"), links, contactEmail: text("contactEmail") };
    setPending(true);
    setErrors({});
    setFormError(null);
    setSaved(false);
    const result =
      mode === "create"
        ? await callApi<{ society: { slug: string } }>("POST", "/api/societies", {
            ...common,
            name: text("name"),
            headEmails: text("headEmails")
              .split(/[\s,;]+/)
              .map((value) => value.trim())
              .filter(Boolean),
          })
        : await callApi("PATCH", `/api/societies/${initial!.id}`, { ...common, ...(canRename && text("name") !== initial!.name ? { name: text("name") } : {}) });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fields);
      if (Object.keys(result.fields).length === 0) setFormError(result.message);
      return;
    }
    if (mode === "create") {
      router.push(`/societies/${(result.data as { society: { slug: string } }).society.slug}`);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
      {mode === "create" || canRename ? (
        <Field id="name" label="Society name" error={errors.name}>
          <TextInput id="name" name="name" required maxLength={limits.name} defaultValue={initial?.name} {...fieldAria("name", errors.name)} />
        </Field>
      ) : null}
      <Field id="shortName" label="Short name (optional)" hint="An acronym such as CCS." error={errors.shortName}>
        <TextInput id="shortName" name="shortName" maxLength={limits.shortName} defaultValue={initial?.shortName ?? ""} {...fieldAria("shortName", errors.shortName, true)} />
      </Field>
      <Field id="categorySlug" label="Category (optional)" hint="Leave as none if no category fits." error={errors.categorySlug}>
        <select id="categorySlug" name="categorySlug" defaultValue={initial?.categorySlug ?? ""} className={inputClass} {...fieldAria("categorySlug", errors.categorySlug, true)}>
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id="description" label="Description (optional)" hint={`What the society does, who it is for. Up to ${limits.description} characters.`} error={errors.description}>
        <textarea
          id="description"
          name="description"
          rows={6}
          maxLength={limits.description}
          defaultValue={initial?.description ?? ""}
          className={`${inputClass} py-2`}
          {...fieldAria("description", errors.description, true)}
        />
      </Field>
      {mode === "create" ? (
        <Field
          id="headEmails"
          label="Heads' email addresses"
          hint="One or more @thapar.edu addresses, separated by commas or new lines. Each person must have signed in to Thapar SNS at least once. All Heads have the same full access."
          error={errors.headEmails}
        >
          <textarea id="headEmails" name="headEmails" required rows={3} autoComplete="off" className={`${inputClass} py-2`} {...fieldAria("headEmails", errors.headEmails, true)} />
        </Field>
      ) : null}
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-ink">Links (optional, https only)</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(
            [
              ["website", "Website"],
              ["instagram", "Instagram"],
              ["linkedin", "LinkedIn"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} id={key} label={label} error={errors[key]}>
              <TextInput id={key} name={key} type="url" inputMode="url" placeholder="https://" defaultValue={initial?.links[key] ?? ""} {...fieldAria(key, errors[key])} />
            </Field>
          ))}
          <Field id="contactEmail" label="Contact email" error={errors.contactEmail}>
            <TextInput id="contactEmail" name="contactEmail" type="email" defaultValue={initial?.contactEmail ?? ""} {...fieldAria("contactEmail", errors.contactEmail)} />
          </Field>
        </div>
      </fieldset>
      <FormAlert message={formError} />
      {saved ? (
        <p role="status" className="text-sm text-ink">
          Saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : mode === "create" ? "Create society" : "Save changes"}
      </Button>
    </form>
  );
}
