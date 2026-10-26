import type { ReactNode } from "react";

import { unreadCount } from "@/modules/notifications";
import { listManagedSocieties } from "@/modules/societies";
import { getDb } from "@/shared/db/client";
import { AppShell } from "@/shared/layout/app-shell";
import { SessionGuard } from "@/shared/layout/session-guard";
import { LiveUpdates } from "@/shared/realtime/live-updates";

import { requireSession } from "./_lib/session";

// Every app page requires a signed-in user. The check runs on the server for each request;
// hiding links in the browser is never the security boundary (SEC-CLIENT-2).
export default async function AppLayout({ children }: { children: ReactNode }) {
  // FR-AUTH-2: first-time users complete their profile before using any app page.
  const session = await requireSession();
  // Workspace switcher entries: the societies this user is an active Head of (read on the server).
  const [managed, unread] = await Promise.all([listManagedSocieties(session.user.id), unreadCount(getDb(), session.user.id)]);
  const societies = managed.map(({ slug, name }) => ({ slug, name }));
  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, societies, isAdmin: session.user.role === "ADMIN", unreadNotifications: unread }}>
      {/* New notifications refresh the page data (badge, lists) as they arrive (ADR-0012). */}
      <LiveUpdates channels={[]} refreshOn={["notification"]} />
      {/* Expiry warnings and activity signals (docs/auth/session-policy.md); the server enforces. */}
      <SessionGuard />
      {children}
    </AppShell>
  );
}
