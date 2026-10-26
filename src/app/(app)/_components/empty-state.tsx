import type { ReactNode } from "react";

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">{children}</div>;
}
