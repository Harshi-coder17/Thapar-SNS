import { Info } from "lucide-react";
import type { Metadata } from "next";

import { K, OTHER_COMPANIES, placement, PLC4_LABEL } from "@/modules/placement";
import { PageHeader } from "@/shared/layout/page-header";
import { Button } from "@/shared/ui/button";

import { first, selectClass } from "../_components/chips";
import { EmptyState } from "../_components/empty-state";
import { requireSession } from "../_lib/session";

export const metadata: Metadata = { title: "Placement" };

// PLC-2..4: aggregate placement matrix. Suppression (k = 5, primary and complementary) is applied to the
// whole table before any filter; filters only pick rows or columns of that table.
export default async function PlacementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSession();
  const params = await searchParams;
  const offerType = first(params.offer) === "INTERNSHIP" ? "INTERNSHIP" : "FULL_TIME";
  const view = await placement.matrix({ academicYear: first(params.year), offerType, programme: first(params.programme), branch: first(params.branch) || undefined, company: first(params.company) || undefined });
  return (
    <>
      <PageHeader title="Placement" description="Unofficial, aggregate placement statistics by year, branch and company." />
      <p role="note" className="mb-6 flex items-start gap-2 rounded-xl border border-brand/30 bg-accent px-4 py-3 text-sm text-accent-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {PLC4_LABEL}
      </p>
      {!view ? (
        <EmptyState>No placement records have been added yet. Administrators add aggregate records with a cited source; no student data is ever collected.</EmptyState>
      ) : (
        <>
          <form action="/placement" className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <div>
              <label htmlFor="p-year" className="text-sm font-medium text-ink">
                Academic year
              </label>
              <select id="p-year" name="year" defaultValue={view.academicYear} className={selectClass}>
                {view.options.years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-offer" className="text-sm font-medium text-ink">
                Offer type
              </label>
              <select id="p-offer" name="offer" defaultValue={view.offerType} className={selectClass}>
                <option value="FULL_TIME">Full-time</option>
                <option value="INTERNSHIP">Internship</option>
              </select>
            </div>
            <div>
              <label htmlFor="p-programme" className="text-sm font-medium text-ink">
                Programme
              </label>
              <select id="p-programme" name="programme" defaultValue={view.programme} className={selectClass}>
                {view.options.programmes.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-branch" className="text-sm font-medium text-ink">
                Branch
              </label>
              <select id="p-branch" name="branch" defaultValue={first(params.branch) ?? ""} className={selectClass}>
                <option value="">All branches</option>
                {view.options.branches.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-company" className="text-sm font-medium text-ink">
                Company
              </label>
              <select id="p-company" name="company" defaultValue={first(params.company) ?? ""} className={selectClass}>
                <option value="">All companies</option>
                {view.options.companies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              Show
            </Button>
          </form>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="px-4 pt-4 pb-2 text-left text-sm text-muted">
                {view.measure === "placed" ? "Students placed" : "Offers"}, {view.offerType === "FULL_TIME" ? "full-time" : "internships"}, {view.programme}, {view.academicYear}. &quot;&lt;{K}&quot; means fewer than {K} students; &quot;Hidden&quot; is withheld so a small group cannot be worked out from the totals.
              </caption>
              <thead>
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Branch
                  </th>
                  {view.columns.map((c) => (
                    <th key={c} scope="col" className="px-4 py-2 font-medium">
                      {c === OTHER_COMPANIES ? c : c}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2 font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.code} className="border-b border-line">
                    <th scope="row" className="px-4 py-2 font-medium text-ink">
                      {row.name}
                    </th>
                    {row.cells.map((cell, j) => (
                      <td key={view.columns[j]} className="px-4 py-2 text-ink">
                        {cell.display}
                        {cell.placementPct !== null ? <span className="block text-xs text-muted">{cell.placementPct}% placed</span> : null}
                        {cell.medianCtcLpa !== null ? <span className="block text-xs text-muted">median {cell.medianCtcLpa} LPA</span> : null}
                      </td>
                    ))}
                    <td className="px-4 py-2 font-medium text-ink">{row.total.display}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="px-4 py-2 font-medium text-ink">
                    Total
                  </th>
                  {view.columnTotals.map((cell, j) => (
                    <td key={view.columns[j]} className="px-4 py-2 font-medium text-ink">
                      {cell.display}
                    </td>
                  ))}
                  <td className="px-4 py-2 font-semibold text-ink">{view.grandTotal.display}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <section aria-labelledby="sources-title" className="mt-6">
            <h2 id="sources-title" className="mb-2 text-base font-semibold text-ink">
              Sources
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {view.citations.map((c) => (
                <li key={`${c.citation}-${c.date}`}>
                  {c.citation} ({c.date})
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
