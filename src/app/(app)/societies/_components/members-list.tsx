"use client";

import { useState } from "react";

import type { MemberGroup, MemberView } from "@/modules/societies";
import { Button } from "@/shared/ui/button";

import { inputClass } from "../../_components/form-fields";
import { useApiAction } from "../../_components/use-api-action";

const GROUP_LABELS: Record<MemberGroup, string> = { CORE: "Core member", GENERAL: "General member" };

function describe(member: MemberView) {
  return [member.branchName, member.year ? `Year ${member.year}` : null].filter(Boolean).join(" · ");
}

/** One editable row: display group and free-text title (organisational only; never permissions). */
function MemberRow({ societyId, member, positionMax }: { societyId: string; member: MemberView; positionMax: number }) {
  const { run, pending, error } = useApiAction();
  const [group, setGroup] = useState<MemberGroup>(member.group);
  const [position, setPosition] = useState(member.position ?? "");
  const changed = group !== member.group || position.trim() !== (member.position ?? "");
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {member.name}
            {member.isHead ? <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-foreground">Head</span> : null}
          </p>
          <p className="text-sm text-muted">{describe(member)}</p>
        </div>
        {member.isHead ? null : (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Remove ${member.name} from the society? Their account and history stay.`)) void run("DELETE", `/api/societies/${societyId}/members/${member.id}`);
            }}
          >
            Remove
          </Button>
        )}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run("PATCH", `/api/societies/${societyId}/members/${member.id}`, { group, position: position.trim() || null });
        }}
      >
        <label className="text-sm text-ink">
          <span className="block">Display group</span>
          <select value={group} onChange={(event) => setGroup(event.target.value as MemberGroup)} className={`${inputClass} w-auto`} disabled={member.isHead}>
            <option value="CORE">{GROUP_LABELS.CORE}</option>
            <option value="GENERAL">{GROUP_LABELS.GENERAL}</option>
          </select>
        </label>
        <label className="min-w-48 flex-1 text-sm text-ink">
          <span className="block">Title (optional)</span>
          <input value={position} onChange={(event) => setPosition(event.target.value)} maxLength={positionMax} placeholder="e.g. General Secretary" className={inputClass} />
        </label>
        <Button type="submit" variant="secondary" disabled={pending || !changed}>
          Save
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-brand">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Member list. In the workspace, Heads edit each member's display group and title and remove
 * members. Groups and titles are organisational information: they never grant any access.
 */
export function MembersList({ societyId, members, manage, positionMax }: { societyId: string; members: MemberView[]; manage: boolean; positionMax: number }) {
  if (members.length === 0) return <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">No members yet.</p>;
  if (manage) {
    return (
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {members.map((member) => (
          <MemberRow key={member.id} societyId={societyId} member={member} positionMax={positionMax} />
        ))}
      </ul>
    );
  }
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {members.map((member) => (
        <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium text-ink">{member.name}</p>
            <p className="text-sm text-muted">{[member.position, describe(member)].filter(Boolean).join(" · ")}</p>
          </div>
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">{member.isHead ? "Head" : GROUP_LABELS[member.group]}</span>
        </li>
      ))}
    </ul>
  );
}
