import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { archive, MAX_DEPTH } from "@/modules/archive";
import { formatDate } from "@/shared/format";
import { Button } from "@/shared/ui/button";

import { ReportButton } from "../../_components/report-button";
import { VoteButton } from "../../_components/vote-button";
import { requireSession } from "../../_lib/session";
import { Comments } from "../_components/comments";

export const metadata: Metadata = { title: "Project" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// FR-ARC-2/3: unreviewed projects exist only for their submitter and reviewers (404 for others).
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await requireSession();
  const { projectId } = await params;
  if (!UUID.test(projectId)) notFound();
  const p = await archive.get(session.user.id, session.user.role === "ADMIN", projectId);
  if (!p) notFound();
  return (
    <>
      <Link href="/archive" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Archive
      </Link>
      <article className="space-y-6">
        <header className="rounded-xl border border-line bg-surface p-5">
          {p.status !== "APPROVED" ? (
            <p role="note" className="mb-3 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
              {p.status === "SUBMITTED" ? "Waiting for review. Only you and the reviewers can see this project." : `Not accepted${p.reviewNote ? `: ${p.reviewNote}` : "."}`}
            </p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-ink [overflow-wrap:anywhere]">{p.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {p.submitterName ? `By ${p.mine ? "you" : p.submitterName} · ` : ""}
            {formatDate(p.createdAt)}
          </p>
          <p className="mt-3 flex flex-wrap gap-1">
            {p.tags.map((t) => (
              <Link key={t} href={`/archive?tag=${encodeURIComponent(t)}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-xs text-ink hover:bg-accent">
                {t}
              </Link>
            ))}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {p.status === "APPROVED" ? <VoteButton url={`/api/archive/${p.id}/vote`} voted={p.voted} count={p.upvoteCount} /> : null}
            <Button asChild variant="secondary">
              <a href={p.githubUrl} rel="noopener noreferrer" target="_blank">
                <ExternalLink aria-hidden />
                GitHub repository
              </a>
            </Button>
            {p.status === "APPROVED" && !p.mine ? <ReportButton targetType="ARCHIVE_PROJECT" targetId={p.id} /> : null}
          </div>
        </header>
        {p.screenshots.length ? (
          <section aria-label="Screenshots" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {p.screenshots.map((assetId, i) => (
              <a key={assetId} href={`/api/archive/${p.id}/screenshots/${assetId}`} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-xl border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URLs */}
                <img src={`/api/archive/${p.id}/screenshots/${assetId}?variant=thumbnail`} alt={`Screenshot ${i + 1}`} className="h-56 w-full object-cover" />
              </a>
            ))}
          </section>
        ) : null}
        <section aria-labelledby="about-title" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="about-title" className="mb-2 text-lg font-semibold text-ink">
            About the project
          </h2>
          {/* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- sanitised HTML only (sanitize-html.ts) */}
          <div className="rich-text text-sm text-ink" dangerouslySetInnerHTML={{ __html: p.description }} />
        </section>
        {p.status === "APPROVED" ? (
          <section aria-labelledby="comments-title" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="comments-title" className="mb-3 text-lg font-semibold text-ink">
              Discussion
            </h2>
            <Comments projectId={p.id} comments={JSON.parse(JSON.stringify(p.comments))} maxDepth={MAX_DEPTH} />
          </section>
        ) : null}
      </article>
    </>
  );
}
