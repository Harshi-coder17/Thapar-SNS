import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { archive } from "@/modules/archive";
import { formatDate } from "@/shared/format";
import { PageHeader } from "@/shared/layout/page-header";
import { Button } from "@/shared/ui/button";

import { chipClass, first, withQuery } from "../_components/chips";
import { EmptyState } from "../_components/empty-state";
import { requireSession } from "../_lib/session";

export const metadata: Metadata = { title: "Archive" };

const STATUS = { SUBMITTED: "Waiting for review", APPROVED: "Published", REJECTED: "Not accepted" } as const;

// FR-ARC-3: reviewed past projects; search, tags, upvotes. Own submissions under "My projects".
export default async function ArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const view = first(params.view) === "mine" ? "mine" : "approved";
  const q = first(params.q)?.slice(0, 100) || undefined;
  const tag = first(params.tag)?.slice(0, 30) || undefined;
  const sort = first(params.sort) === "top" ? "top" : "new";
  const projects = await archive.list(session.user.id, { view, q, tag, sort });
  return (
    <>
      <PageHeader
        title="Archive"
        description="Past student projects, reviewed before they are published."
        action={
          <Button asChild>
            <Link href="/archive/submit">
              <Plus aria-hidden />
              Submit a project
            </Link>
          </Button>
        }
      />
      <form role="search" action="/archive" className="mb-4 flex flex-wrap gap-2">
        {view === "mine" ? <input type="hidden" name="view" value="mine" /> : null}
        <label htmlFor="a-q" className="sr-only">
          Search projects
        </label>
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="a-q" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Search titles, descriptions and tags" className="block min-h-11 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none" />
        </div>
        <select name="sort" defaultValue={sort} aria-label="Sort" className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink">
          <option value="new">Newest</option>
          <option value="top">Most upvoted</option>
        </select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <nav aria-label="Project lists" className="mb-6 flex flex-wrap gap-2">
        <Link href="/archive" aria-current={view === "approved" && !tag ? "page" : undefined} className={chipClass(view === "approved" && !tag)}>
          All projects
        </Link>
        <Link href="/archive?view=mine" aria-current={view === "mine" ? "page" : undefined} className={chipClass(view === "mine")}>
          My projects
        </Link>
        {tag ? <span className={chipClass(true)}>Tag: {tag}</span> : null}
      </nav>
      {projects.length === 0 ? (
        <EmptyState>{view === "mine" ? "You have not submitted a project yet." : "No published projects match yet."}</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
              {p.coverAssetId ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URLs
                <img src={`/api/archive/${p.id}/screenshots/${p.coverAssetId}?variant=thumbnail`} alt="" className="h-36 w-full object-cover" />
              ) : null}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <Link href={`/archive/${p.id}`} className="inline-flex min-h-11 items-center font-semibold text-ink underline-offset-4 hover:underline">
                  {p.title}
                </Link>
                <p className="line-clamp-3 text-sm text-muted">{p.excerpt}</p>
                <p className="flex flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <Link key={t} href={withQuery("/archive", { tag: t })} className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-xs text-ink hover:bg-accent">
                      {t}
                    </Link>
                  ))}
                </p>
                <p className="mt-auto text-xs text-muted">
                  {p.upvoteCount} upvotes · {formatDate(p.createdAt)}
                  {view === "mine" ? ` · ${STATUS[p.status]}` : p.submitterName ? ` · by ${p.submitterName}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
