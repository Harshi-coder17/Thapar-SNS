import type { Metadata } from "next";

import { adminSessionsByUser, listUsers } from "@/modules/identity";
import { formatDate, formatDateTime } from "@/shared/format";
import { Button } from "@/shared/ui/button";

import { first, selectClass } from "../../_components/chips";
import { SessionActions, UserActions } from "../_components/admin-actions";
import { requireAdmin } from "../_lib";

export const metadata: Metadata = { title: "Users" };

const ROLE = { STUDENT: "Student", FACULTY: "Faculty", ADMIN: "Administrator" } as const;

// UCD-19 Manage Users: search, roles, bans (each revokes sessions and is audited).
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireAdmin();
  const q = first((await searchParams).q)?.slice(0, 100) ?? "";
  const users = await listUsers(q || undefined);
  const sessions = await adminSessionsByUser(users.map((u) => u.id));
  return (
    <>
      <form role="search" action="/admin/users" className="mb-4 flex gap-2">
        <label htmlFor="u-q" className="sr-only">
          Search users
        </label>
        <input id="u-q" name="q" type="search" defaultValue={q} placeholder="Name or email" className={`${selectClass} mt-0 flex-1`} />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id} className="grid gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {u.name} <span className="text-sm font-normal text-muted">({ROLE[u.role]})</span>
              </p>
              <p className="text-sm break-all text-muted">{u.email}</p>
              <p className="text-xs text-muted">
                {[u.branchName, u.year ? `Year ${u.year}` : null, u.profileComplete ? null : "profile incomplete", `joined ${formatDate(u.createdAt)}`, `${u.activeSessions} active sessions`].filter(Boolean).join(" · ")}
              </p>
              <details className="mt-2">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-ink">Sessions ({sessions.get(u.id)?.length ?? 0})</summary>
                <SessionActions
                  userId={u.id}
                  sessions={(sessions.get(u.id) ?? []).map((s) => ({ id: s.id, label: `Started ${formatDateTime(s.createdAt)}, last used ${formatDateTime(s.lastUsedAt)}${s.device ? `, ${s.device}` : ""}` }))}
                />
              </details>
              {u.bannedAt ? (
                <p className="mt-1 text-sm text-brand">
                  Banned {formatDate(u.bannedAt)}: {u.bannedReason}
                </p>
              ) : null}
            </div>
            {u.id === session.user.id ? <p className="text-xs text-muted">This is you. Another administrator must change your account.</p> : <UserActions userId={u.id} role={u.role} banned={u.bannedAt !== null} />}
          </li>
        ))}
      </ul>
    </>
  );
}
