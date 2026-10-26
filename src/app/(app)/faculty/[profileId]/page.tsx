import { ExternalLink, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { faculty } from "@/modules/faculty";
import { formatDate } from "@/shared/format";

import { requireSession } from "../../_lib/session";
import { ClaimForm, EditOwnProfile } from "../_components/faculty-actions";
import { FacultyPhoto } from "../_components/faculty-photo";

export const metadata: Metadata = { title: "Faculty profile" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FacultyProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  const session = await requireSession();
  const { profileId } = await params;
  if (!UUID.test(profileId)) notFound();
  const p = await faculty.get(session.user.id, profileId);
  if (!p) notFound();
  return (
    <>
      <Link href="/faculty" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Faculty
      </Link>
      <article className="space-y-6">
        <header className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
          <FacultyPhoto name={p.name} photoAssetId={p.photoAssetId} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {p.name}
              {p.isVerified ? <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-xs font-medium text-accent-foreground">Verified by the faculty member</span> : null}
            </h1>
            <p className="text-ink">{p.designation}</p>
            <p className="text-sm text-muted">{p.department}</p>
            {p.email ? (
              <a href={`mailto:${p.email}`} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-brand underline-offset-4 hover:underline">
                <Mail className="size-4" aria-hidden />
                {p.email}
              </a>
            ) : null}
          </div>
        </header>
        <section aria-labelledby="details-title" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="details-title" className="mb-3 text-lg font-semibold text-ink">
            Details
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Research area</dt>
            <dd className="text-ink">{p.specialization ?? "Not published"}</dd>
            <dt className="text-muted">Cabin</dt>
            <dd className="text-ink">{p.cabin ?? "Not published"}</dd>
            <dt className="text-muted">Office hours</dt>
            <dd className="text-ink">{p.officeHours ?? "Not published"}</dd>
            {p.societies.length ? (
              <>
                <dt className="text-muted">Societies</dt>
                <dd className="text-ink">
                  {p.societies.map((s, i) => (
                    <span key={s.slug}>
                      {i ? ", " : ""}
                      <Link href={`/societies/${s.slug}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
                        {s.name}
                      </Link>{" "}
                      ({s.role})
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            Source: official Thapar faculty pages{p.sourceFetchedAt ? `, retrieved ${formatDate(p.sourceFetchedAt)}` : ""}.
            {p.profileUrl ? (
              <a href={p.profileUrl} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-11 items-center gap-1 text-brand underline underline-offset-4">
                Official profile <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </p>
        </section>
        {p.canEdit ? (
          <section aria-labelledby="edit-title" className="rounded-xl border border-brand/30 bg-surface p-5">
            <h2 id="edit-title" className="mb-3 text-lg font-semibold text-ink">
              Edit your profile
            </h2>
            <EditOwnProfile profileId={p.id} initial={{ cabin: p.cabin, officeHours: p.officeHours, specialization: p.specialization }} />
          </section>
        ) : !p.isVerified ? (
          <section aria-labelledby="claim-title" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="claim-title" className="mb-2 text-lg font-semibold text-ink">
              Are you this faculty member?
            </h2>
            {p.myPendingClaim ? (
              <p className="text-sm text-ink">Your claim is waiting for an administrator.</p>
            ) : p.hasPendingClaim ? (
              <p className="text-sm text-muted">A claim for this profile is already being reviewed.</p>
            ) : p.viewerCannotClaim ? (
              <p className="text-sm text-muted">Your account already has a faculty profile or a claim waiting for review.</p>
            ) : (
              <ClaimForm profileId={p.id} />
            )}
          </section>
        ) : null}
      </article>
    </>
  );
}
