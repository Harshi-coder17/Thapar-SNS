import Link from "next/link";

import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";

/** Signed-out placeholder until authentication arrives in Slice 1b. No real user data is shown. */
function SessionCard() {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-sm font-medium text-ink">Not signed in</p>
      <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
        Go to sign in
      </Link>
    </div>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    // Scrolls when the screen is too short for the whole menu (e.g. phones in landscape).
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-5">
      <Brand />
      <SidebarNav section="primary" label="Main" onNavigate={onNavigate} />
      <div className="mt-auto space-y-3">
        <SidebarNav section="secondary" label="Account" onNavigate={onNavigate} />
        <SessionCard />
      </div>
    </div>
  );
}
