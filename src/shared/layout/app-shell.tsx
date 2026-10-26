import type { ReactNode } from "react";

import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { type ShellUser, SidebarContent } from "./sidebar-content";

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main" className="sr-only z-50 rounded-md bg-surface px-3 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:inline-flex focus:min-h-11 focus:items-center focus:ring-2 focus:ring-brand">
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-surface lg:block" aria-label="Sidebar">
        <SidebarContent user={user} />
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
        <MobileNav user={user} />
        <Brand />
      </header>
      <main id="main" className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
        {children}
      </main>
    </div>
  );
}
