import { Info } from "lucide-react";

import { findNavItem } from "./nav";
import { PageHeader } from "./page-header";

/** Static placeholder for a module route until its slice is delivered. No features are simulated. */
export function ModulePlaceholder({ href }: { href: string }) {
  const item = findNavItem(href);
  const Icon = item.icon;
  return (
    <>
      <PageHeader title={item.label} description={item.summary} />
      <section className="flex items-start gap-4 rounded-xl border border-line bg-surface p-6" aria-labelledby="placeholder-title">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <h2 id="placeholder-title" className="flex items-center gap-2 text-base font-semibold text-ink">
            <Info className="size-4 text-muted" aria-hidden />
            Not available yet
          </h2>
          <p className="mt-1 text-sm text-muted">This module is planned for Slice {item.slice}. Nothing here is functional yet.</p>
        </div>
      </section>
    </>
  );
}
