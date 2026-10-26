import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { actorOf, canCreateSociety, listOfficialAwaitingHead, listSocieties, type SocietyCard, societyCategories } from "@/modules/societies";
import { plural } from "@/shared/format";
import { PageHeader } from "@/shared/layout/page-header";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";

import { requireSession } from "../_lib/session";
import { SocietyAvatar } from "../_components/society-avatar";

export const metadata: Metadata = { title: "Societies" };

type View = "all" | "following" | "mine" | "inactive";
type SearchParams = Promise<{ q?: string | string[]; category?: string | string[]; view?: string | string[] }>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// FR-SOC-4 / UCD-3: directory of active societies with search and category filter.
export default async function SocietiesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const actor = actorOf(session);
  const params = await searchParams;
  const q = first(params.q)?.slice(0, 100) ?? "";
  const category = first(params.category) ?? "";
  const isAdmin = canCreateSociety(actor);
  const requested = first(params.view);
  const view: View = requested === "following" || requested === "mine" || (requested === "inactive" && isAdmin) ? requested : "all";
  const [categories, societies, official] = await Promise.all([
    societyCategories(),
    listSocieties(actor, { q, category: category || undefined, view }),
    view === "all" ? listOfficialAwaitingHead(actor, { q, category: category || undefined }) : Promise.resolve([] as SocietyCard[]),
  ]);

  const href = (changes: Partial<{ q: string; category: string; view: View }>) => {
    const next = new URLSearchParams();
    const merged = { q, category, view, ...changes };
    if (merged.q) next.set("q", merged.q);
    if (merged.category) next.set("category", merged.category);
    if (merged.view !== "all") next.set("view", merged.view);
    const query = next.toString();
    return query ? `/societies?${query}` : "/societies";
  };

  const views: { key: View; label: string }[] = [
    { key: "all", label: "All societies" },
    { key: "following", label: "Following" },
    { key: "mine", label: "My societies" },
    ...(isAdmin ? [{ key: "inactive" as const, label: "Inactive" }] : []),
  ];
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
      active ? "border-brand bg-brand text-brand-foreground" : "border-line bg-surface text-ink hover:bg-accent",
    );

  return (
    <>
      <PageHeader
        title="Societies"
        description="Discover campus societies, follow their updates and request to join."
        action={
          isAdmin ? (
            <Button asChild>
              <Link href="/societies/new">
                <Plus aria-hidden />
                Create society
              </Link>
            </Button>
          ) : undefined
        }
      />

      <form role="search" action="/societies" className="mb-4 flex gap-2">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
        <label htmlFor="society-search" className="sr-only">
          Search societies
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="society-search"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Search by name or description"
            className="block min-h-11 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <nav aria-label="Society lists" className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {views.map((item) => (
          <Link key={item.key} href={href({ view: item.key })} aria-current={view === item.key ? "page" : undefined} className={chip(view === item.key)}>
            {item.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Categories" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        <Link href={href({ category: "" })} aria-current={!category ? "true" : undefined} className={chip(!category)}>
          All categories
        </Link>
        {categories.map((item) => (
          <Link key={item.slug} href={href({ category: item.slug })} aria-current={category === item.slug ? "true" : undefined} className={chip(category === item.slug)}>
            {item.label}
          </Link>
        ))}
      </nav>

      <p className="mb-3 text-sm text-muted" role="status">
        {societies.length === 1 ? "1 active society" : `${societies.length} active societies`}
        {official.length ? ` and ${official.length} official organisation${official.length === 1 ? "" : "s"} awaiting a Head` : ""}
        {q ? ` matching "${q}"` : ""}
      </p>
      {societies.length === 0 ? (
        view === "all" && official.length ? null : (
          <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
            {view === "following"
              ? "You are not following any society yet. Follow a society to see its updates on your Home page."
              : view === "mine"
                ? "You are not a member of any society yet. Open a society and request to join."
                : "No societies found. Try another search or category."}
          </div>
        )
      ) : (
        <SocietyGrid societies={societies} />
      )}
      {official.length ? (
        <section aria-labelledby="official-heading" className="mt-10">
          <h2 id="official-heading" className="text-lg font-semibold text-ink">
            Official student organisations
          </h2>
          <p className="mt-1 mb-4 max-w-3xl text-sm text-muted">
            Listed in the official{" "}
            <a href="https://studentsocieties.thapar.edu/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-brand underline underline-offset-4">
              Thapar student societies directory
            </a>
            . They are not active on Thapar SNS yet: each one starts posting, accepting members and running events once a platform administrator appoints its first Head.
          </p>
          <SocietyGrid societies={official} />
        </section>
      ) : null}
    </>
  );
}

function SocietyGrid({ societies }: { societies: SocietyCard[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {societies.map((society) => (
        <li key={society.id}>
          <Link
            href={`/societies/${society.slug}`}
            className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <span className="flex items-center gap-3">
              <SocietyAvatar name={society.name} logoAssetId={society.logoAssetId} />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{society.name}</span>
                {society.category ? <span className="block text-sm text-muted">{society.category.label}</span> : null}
              </span>
            </span>
            <span className="line-clamp-3 text-sm text-muted">{society.excerpt ?? "No description yet."}</span>
            <span className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted">
              {society.isActive ? (
                <>
                  <span>{plural(society.memberCount, "member")}</span>
                  <span aria-hidden>·</span>
                  <span>{plural(society.followerCount, "follower")}</span>
                </>
              ) : null}
              {society.isHead ? <span className="rounded-full bg-brand px-2 py-0.5 font-medium text-brand-foreground">Head</span> : null}
              {society.isMember && !society.isHead ? <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">Member</span> : null}
              {society.following ? <span className="rounded-full bg-canvas px-2 py-0.5 font-medium text-ink">Following</span> : null}
              {!society.isActive ? <span className="rounded-full bg-canvas px-2 py-0.5 font-medium text-ink">{society.awaitingHead ? "Official listing · awaiting a Head" : "Inactive"}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
