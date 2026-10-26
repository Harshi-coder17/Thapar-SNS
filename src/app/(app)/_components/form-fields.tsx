import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/shared/ui/cn";

export const inputClass =
  "mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none aria-[invalid=true]:border-brand";

/** A labelled field with its hint and error, wired up for screen readers. */
export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-brand">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for an input inside <Field>. */
export const fieldAria = (id: string, error?: string, hint?: boolean) => ({
  "aria-invalid": error ? true : undefined,
  "aria-describedby": [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined,
});

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function FormAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-brand/30 bg-accent px-3 py-2 text-sm text-accent-foreground">
      {message}
    </p>
  );
}
