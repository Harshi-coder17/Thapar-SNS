import { cn } from "@/shared/ui/cn";

/** Filter chip link style (same as the societies directory). */
export const chipClass = (active: boolean) =>
  cn(
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
    active ? "border-brand bg-brand text-brand-foreground" : "border-line bg-surface text-ink hover:bg-accent",
  );

export const cardClass = "rounded-xl border border-line bg-surface p-5";
export const selectClass = "mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";
export const badgeClass = "rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink";

export const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Builds a query string from defined, non-empty values. */
export function withQuery(path: string, values: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
