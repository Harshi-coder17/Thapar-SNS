import { ChevronRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { faculty, type FacultyCard } from "@/modules/faculty";
import { PageHeader } from "@/shared/layout/page-header";
import { Button } from "@/shared/ui/button";

import { first, selectClass, withQuery } from "../_components/chips";
import { EmptyState } from "../_components/empty-state";
import { requireSession } from "../_lib/session";
import { FacultyPhoto } from "./_components/faculty-photo";

export const metadata: Metadata = { title: "Faculty" };

// FR-FAC-1/2: the official faculty directory, presented like thapar.edu/faculties (owner 2026-10-25):
// university leadership first (deans and institute offices), then the schools, departments and centres
// in the website's order, each listing its people in the order of its official page (head first).
export default async function FacultyPage({ searchParams }: { searchParams: Promise<{ q?: string; department?: string; page?: string }> }) {
  await requireSession();
  const params = await searchParams;
  const q = first(params.q)?.slice(0, 100) ?? "";
  const department = first(params.department) ?? "";
  const requestedPage = Number(first(params.page));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const overview = !q && !department;
  const [units, result, leaders] = await Promise.all([
    faculty.departments(),
    overview ? Promise.resolve(null) : faculty.search({ q, department: department || undefined, page }),
    overview ? faculty.leadership() : Promise.resolve(null),
  ]);
  const pageHref = (n: number) => withQuery("/faculty", { q, department, page: n > 1 ? n : undefined });
  const total = units.reduce((sum, u) => sum + u.count, 0);

  return (
    <>
      <PageHeader title="Faculty" description="The official Thapar faculty directory, in the order of the official website. Search by name, department or research area." />
      <form role="search" action="/faculty" className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="f-q" className="text-sm font-medium text-ink">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 mt-0.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="f-q" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Name, department or research area" className={`${selectClass} pl-9`} />
          </div>
        </div>
        <div>
          <label htmlFor="f-dept" className="text-sm font-medium text-ink">
            School, department or centre
          </label>
          <select id="f-dept" name="department" defaultValue={department} className={selectClass}>
            <option value="">All</option>
            {units.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.count})
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {overview && leaders ? (
        <>
          <section aria-labelledby="leadership-heading" className="mb-10">
            <h2 id="leadership-heading" className="mb-1 text-lg font-semibold text-ink">
              University leadership
            </h2>
            <p className="mb-4 text-sm text-muted">Deans and institute offices, as their designations are published on the official faculty pages.</p>
            <PeopleGrid people={leaders.senior} highlight />
            {leaders.associateDeans.length ? (
              <>
                <h3 className="mt-6 mb-3 text-base font-semibold text-ink">Associate deans</h3>
                <PeopleGrid people={leaders.associateDeans} />
              </>
            ) : null}
          </section>
          <section aria-labelledby="units-heading">
            <h2 id="units-heading" className="mb-1 text-lg font-semibold text-ink">
              Schools, departments and centres
            </h2>
            <p className="mb-4 text-sm text-muted" role="status">
              {total} people in {units.length} units. Each list follows its official page: the head first, then by seniority.
            </p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {units.map((u) => (
                <li key={u.name}>
                  <Link href={withQuery("/faculty", { department: u.name })} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{u.name}</span>
                      <span className="block text-sm text-muted">{u.count === 1 ? "1 person" : `${u.count} people`}</span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : result ? (
        <>
          {department && !q ? (
            <h2 className="mb-1 text-lg font-semibold text-ink">{department}</h2>
          ) : null}
          <p className="mb-3 text-sm text-muted" role="status">
            {result.total === 1 ? "1 person" : `${result.total} people`}
            {q ? ` matching "${q}"` : ", in the order of the official page"}
            {result.pages > 1 ? `, page ${result.page} of ${result.pages}` : ""}
          </p>
          {result.items.length === 0 ? <EmptyState>No one matches. Check the spelling or choose another unit.</EmptyState> : <PeopleGrid people={result.items} />}
          <nav aria-label="Pages" className="mt-6 flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/faculty">All units</Link>
            </Button>
            {result.page > 1 ? (
              <Button asChild variant="secondary">
                <Link href={pageHref(result.page - 1)}>Previous</Link>
              </Button>
            ) : null}
            {result.page < result.pages ? (
              <Button asChild variant="secondary">
                <Link href={pageHref(result.page + 1)}>Next</Link>
              </Button>
            ) : null}
          </nav>
        </>
      ) : null}
    </>
  );
}

function PeopleGrid({ people, highlight = false }: { people: FacultyCard[]; highlight?: boolean }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {people.map((p) => (
        <li key={p.id}>
          <Link
            href={`/faculty/${p.id}`}
            className={`flex h-full items-start gap-3 rounded-xl border bg-surface p-4 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${highlight ? "border-brand/30" : "border-line"}`}
          >
            <FacultyPhoto name={p.name} photoAssetId={p.photoAssetId} />
            <span className="min-w-0">
              <span className="block font-semibold text-ink">
                {p.name}
                {p.isVerified ? <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-xs font-medium text-accent-foreground">Verified</span> : null}
              </span>
              <span className={`block text-sm ${highlight ? "font-medium text-brand" : "text-ink"}`}>{p.designation}</span>
              <span className="block text-sm text-muted">{p.department}</span>
              {p.specialization ? <span className="mt-1 line-clamp-2 block text-xs text-muted">{p.specialization}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
