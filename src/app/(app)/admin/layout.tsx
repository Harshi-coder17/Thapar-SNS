import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { AdminNav } from "./_components/admin-nav";
import { requireAdmin } from "./_lib";

// Platform administration (Slice 5). A separate capacity from society Head access (ADR-0013 §3.4):
// every action here is sent with ?as=admin and re-checked on the server.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <>
      <div role="region" aria-label="Acting as" className="mb-4 flex items-center gap-2 rounded-xl border border-brand/30 bg-accent px-4 py-3 text-sm text-accent-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Acting as platform administrator. Every action is recorded in the audit log.
      </div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Administration</h1>
      <AdminNav />
      {children}
    </>
  );
}
