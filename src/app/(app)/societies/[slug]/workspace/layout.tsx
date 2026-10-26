import { ArrowLeftRight, Building2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceNav } from "../../_components/workspace-nav";
import { loadWorkspace } from "../load";

// The shared society workspace (ADR-0013): a persistent "Acting as" bar shows that every action here
// is taken on behalf of the society. Each page re-checks the Head grant (layouts are not re-run on
// navigation between their pages).
export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { society } = await loadWorkspace((await params).slug);
  const base = `/societies/${society.slug}/workspace`;
  return (
    <>
      <div role="region" aria-label="Acting as" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-accent px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-accent-foreground">
          <Building2 className="size-4 shrink-0" aria-hidden />
          <span>
            Acting as <strong>{society.name}</strong>. Posts and decisions appear as the society; the audit log records you as the Head who acted.
          </span>
        </p>
        <Link href={`/societies/${society.slug}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent-foreground underline-offset-4 hover:underline">
          <ArrowLeftRight className="size-4" aria-hidden />
          Switch back to personal
        </Link>
      </div>
      {!society.isActive ? (
        <p role="note" className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink">
          This society is inactive. You can remove content, but nothing new can be published until an administrator reactivates it.
        </p>
      ) : null}
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">{society.name} workspace</h1>
      <WorkspaceNav base={base} />
      {children}
    </>
  );
}
