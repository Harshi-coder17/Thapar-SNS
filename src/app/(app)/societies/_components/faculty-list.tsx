"use client";

import Link from "next/link";

import type { FacultyAssociationView } from "@/modules/societies";
import { Button } from "@/shared/ui/button";

import { useApiAction } from "../../_components/use-api-action";

/**
 * Faculty associated with the society by a source (ADR-0013 §3.5). Students only ever receive
 * verified entries (filtered on the server); platform admins also see and review unverified ones.
 */
export function FacultyList({ societyId, faculty, review }: { societyId: string; faculty: FacultyAssociationView[]; review: boolean }) {
  const { run, pending, error } = useApiAction();
  if (faculty.length === 0) return null;
  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-sm text-brand">
          {error}
        </p>
      ) : null}
      <ul className="space-y-3">
        {faculty.map((person) => (
          <li key={person.id} className="flex flex-wrap items-start justify-between gap-2">
            <span className="min-w-0 text-sm">
              {person.facultyProfileId ? (
                <Link href={`/faculty/${person.facultyProfileId}`} className="flex min-h-11 items-center font-medium text-ink underline underline-offset-4">
                  {person.name}
                </Link>
              ) : (
                <span className="block font-medium text-ink">{person.name}</span>
              )}
              <span className="block text-xs text-muted">{[person.sourceRole, person.department].filter(Boolean).join(" · ")}</span>
              {review ? <span className="block text-xs text-muted">{person.verified ? "Verified by an administrator" : person.official ? "Matched to the official faculty directory: shown to everyone" : "Unverified: visible to administrators only"}</span> : null}
            </span>
            {review ? (
              <Button variant="ghost" size="md" disabled={pending} onClick={() => run("PATCH", `/api/societies/${societyId}/faculty/${person.id}`, { verified: !person.verified })}>
                {person.verified ? "Mark unverified" : "Verify"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
