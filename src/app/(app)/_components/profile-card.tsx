import Link from "next/link";

import type { PublicProfile } from "@/modules/identity";
import { formatDate, initials } from "@/shared/format";

export function ProfileCard({ profile, memberships, registeredEvents }: { profile: PublicProfile; memberships: { slug: string; name: string; position: string | null; isHead: boolean }[]; registeredEvents: number }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-accent text-xl font-semibold text-accent-foreground">
          {initials(profile.name)}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{profile.name}</h1>
          <p className="text-sm text-muted">{[profile.branchName, profile.year ? `Year ${profile.year}` : null, `joined ${formatDate(profile.memberSince)}`].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <h2 className="mt-5 mb-2 text-sm font-semibold text-ink">Skills and interests</h2>
      <p className="flex flex-wrap gap-1">
        {profile.skills.map((s) => (
          <span key={s.slug} className="rounded-full border border-line px-2 py-0.5 text-xs text-ink">
            {s.label}
          </span>
        ))}
      </p>
      <h2 className="mt-5 mb-2 text-sm font-semibold text-ink">Societies</h2>
      {memberships.length === 0 ? (
        <p className="text-sm text-muted">Not a member of any society yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {memberships.map((m) => (
            <li key={m.slug}>
              <Link href={`/societies/${m.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-sm text-ink hover:bg-accent">
                {m.name}
                {m.isHead ? " (Head)" : m.position ? ` (${m.position})` : ""}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-sm text-muted">Registered for {registeredEvents === 1 ? "1 event" : `${registeredEvents} events`}.</p>
    </section>
  );
}
