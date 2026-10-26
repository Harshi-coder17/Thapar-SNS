import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { browseRequests } from "@/modules/findmates";
import { profileOptions } from "@/modules/identity";
import { formatDate } from "@/shared/format";
import { PageHeader } from "@/shared/layout/page-header";
import { Button } from "@/shared/ui/button";

import { chipClass, first, selectClass, withQuery } from "../_components/chips";
import { EmptyState } from "../_components/empty-state";
import { requireSession } from "../_lib/session";

export const metadata: Metadata = { title: "Find Mates" };

const TYPES = { HACKATHON: "Hackathon", PROJECT: "Project", CASUAL: "Casual" } as const;
type View = "open" | "mine" | "responded";

// FR-MATE-2: browse open, unexpired requests; filter by type, skill and subject; best match first (OI-17).
export default async function MatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const view = (["open", "mine", "responded"].includes(first(params.view) ?? "") ? first(params.view) : "open") as View;
  const type = (Object.keys(TYPES).includes(first(params.type) ?? "") ? first(params.type) : undefined) as keyof typeof TYPES | undefined;
  const skill = first(params.skill) || undefined;
  const subject = first(params.subject)?.slice(0, 60) || undefined;
  const q = first(params.q)?.slice(0, 100) || undefined;
  const sort = first(params.sort) === "best" ? "best" : "newest";
  const [{ tags }, requests] = await Promise.all([profileOptions(), browseRequests(session.user.id, { view, type, skills: skill ? [skill] : undefined, subject, q, sort })]);
  const views: { key: View; label: string }[] = [
    { key: "open", label: "Open requests" },
    { key: "mine", label: "My requests" },
    { key: "responded", label: "My responses" },
  ];
  return (
    <>
      <PageHeader
        title="Find Mates"
        description="Find teammates for hackathons, projects and study."
        action={
          <Button asChild>
            <Link href="/mates/new">
              <Plus aria-hidden />
              New request
            </Link>
          </Button>
        }
      />
      <nav aria-label="Request lists" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {views.map((item) => (
          <Link key={item.key} href={withQuery("/mates", { view: item.key === "open" ? undefined : item.key })} aria-current={view === item.key ? "page" : undefined} className={chipClass(view === item.key)}>
            {item.label}
          </Link>
        ))}
      </nav>
      <form role="search" action="/mates" className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
        {view !== "open" ? <input type="hidden" name="view" value={view} /> : null}
        <div className="lg:col-span-2">
          <label htmlFor="mates-q" className="text-sm font-medium text-ink">
            Keywords
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 mt-0.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="mates-q" name="q" type="search" defaultValue={q} maxLength={100} className={`${selectClass} pl-9`} />
          </div>
        </div>
        <div>
          <label htmlFor="mates-type" className="text-sm font-medium text-ink">
            Type
          </label>
          <select id="mates-type" name="type" defaultValue={type ?? ""} className={selectClass}>
            <option value="">Any</option>
            {Object.entries(TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mates-skill" className="text-sm font-medium text-ink">
            Skill
          </label>
          <select id="mates-skill" name="skill" defaultValue={skill ?? ""} className={selectClass}>
            <option value="">Any</option>
            {tags.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mates-subject" className="text-sm font-medium text-ink">
            Subject
          </label>
          <input id="mates-subject" name="subject" defaultValue={subject} maxLength={60} className={selectClass} />
        </div>
        <div>
          <label htmlFor="mates-sort" className="text-sm font-medium text-ink">
            Sort
          </label>
          <select id="mates-sort" name="sort" defaultValue={sort} className={selectClass}>
            <option value="newest">Newest</option>
            <option value="best">Best match for my skills</option>
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-6">
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
        </div>
      </form>
      {requests.length === 0 ? (
        <EmptyState>{view === "mine" ? "You have not posted a request yet." : view === "responded" ? "You have not responded to any request yet." : "No open requests match these filters."}</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/mates/${r.id}`} className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">{TYPES[r.type]}</span>
                  {r.subject ? <span className="rounded-full bg-canvas px-2 py-0.5 font-medium text-ink">{r.subject}</span> : null}
                  {r.status !== "OPEN" ? <span className="rounded-full bg-canvas px-2 py-0.5 font-medium text-ink">{r.status === "CLOSED" ? "Closed" : "Expired"}</span> : null}
                  <span className="ml-auto text-muted">{Math.round(r.match * 100)}% skill match</span>
                </span>
                <span className="font-semibold text-ink">{r.title}</span>
                <span className="line-clamp-3 text-sm text-muted">{r.excerpt}</span>
                <span className="flex flex-wrap gap-1">
                  {r.skills.map((s) => (
                    <span key={s.slug} className="rounded-full border border-line px-2 py-0.5 text-xs text-ink">
                      {s.label}
                    </span>
                  ))}
                </span>
                <span className="mt-auto flex flex-wrap gap-2 text-xs text-muted">
                  <span>
                    Team {r.currentCount}/{r.teamSize}
                  </span>
                  <span aria-hidden>·</span>
                  <span>Open until {formatDate(r.expiresAt)}</span>
                  {r.creator ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>by {r.mine ? "you" : r.creator.name}</span>
                    </>
                  ) : null}
                  {r.myResponse ? <span className="rounded-full bg-brand px-2 py-0.5 font-medium text-brand-foreground">{r.myResponse === "PENDING" ? "You responded" : r.myResponse === "ACCEPTED" ? "Accepted" : "Declined"}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
