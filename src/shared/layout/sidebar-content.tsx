import { Brand } from "./brand";
import { IdentitySwitcher, type ManagedSociety } from "./identity-switcher";
import { SidebarNav } from "./sidebar-nav";
import { SignOutButton } from "./sign-out-button";

/** The signed-in user (display only; supplied by the server-side session check). */
export interface ShellUser {
  name: string;
  email: string;
  /** Society workspaces this user may switch into (ADR-0013); empty for most students. */
  societies: ManagedSociety[];
  /** Shows the Administration link (display only; admin pages and APIs re-check the role). */
  isAdmin: boolean;
  unreadNotifications: number;
}

function SessionCard({ user }: { user: ShellUser }) {
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>
      <SignOutButton />
    </div>
  );
}

export function SidebarContent({ user, onNavigate }: { user: ShellUser; onNavigate?: () => void }) {
  return (
    // Scrolls when the screen is too short for the whole menu (e.g. phones in landscape).
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-5">
      <Brand />
      <SidebarNav section="primary" label="Main" onNavigate={onNavigate} />
      <div className="mt-auto space-y-3">
        {user.isAdmin ? <SidebarNav section="admin" label="Administration" onNavigate={onNavigate} /> : null}
        <SidebarNav section="secondary" label="Account" onNavigate={onNavigate} badges={{ "/notifications": user.unreadNotifications }} />
        <IdentitySwitcher personalName={user.name} societies={user.societies} onNavigate={onNavigate} />
        <SessionCard user={user} />
      </div>
    </div>
  );
}
