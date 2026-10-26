import type { Metadata } from "next";
import Link from "next/link";

import { auditLog } from "@/modules/admin";
import { userSummaries } from "@/modules/identity";
import { getDb } from "@/shared/db/client";
import { formatDateTime } from "@/shared/format";
import { Button } from "@/shared/ui/button";

import { first, selectClass, withQuery } from "../../_components/chips";
import { requireAdmin } from "../_lib";

export const metadata: Metadata = { title: "Audit log" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Append-only audit log: who acted, as whom (on behalf of a society, or as administrator), on what.
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const action = first(params.action)?.slice(0, 80) || undefined;
  const actorId = UUID.test(first(params.actor) ?? "") ? first(params.actor) : undefined;
  const beforeRaw = first(params.before);
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : undefined;
  const rows = await auditLog(getDb(), { action, actorId, before });
  const people = await userSummaries(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])));
  return (
    <>
      <form action="/admin/audit" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="min-w-60 flex-1 text-xs text-muted">
          Action starts with
          <input name="action" defaultValue={action} placeholder="e.g. societies. or identity.role" className={selectClass} />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Capacity</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                <td className="px-3 py-2">{r.actorId ? <Link href={withQuery("/admin/audit", { actor: r.actorId })} className="underline-offset-4 hover:underline">{people.get(r.actorId)?.name ?? r.actorId}</Link> : "System"}</td>
                <td className="px-3 py-2">{r.onBehalfOfType ? `On behalf of ${r.onBehalfOfType} ${r.onBehalfOfId}` : r.actorId ? "Own account or administrator" : "System"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2 text-xs">
                  {r.targetType} {r.targetId ?? ""}
                </td>
                <td className="px-3 py-2 font-mono text-xs break-all">{JSON.stringify(r.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 100 ? (
        <Link href={withQuery("/admin/audit", { action, actor: actorId, before: rows.at(-1)!.createdAt.toISOString() })} className="mt-4 inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline">
          Older entries
        </Link>
      ) : null}
    </>
  );
}
