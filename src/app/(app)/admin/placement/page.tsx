import type { Metadata } from "next";

import { profileOptions } from "@/modules/identity";
import { placement } from "@/modules/placement";

import { DeletePlacementRecord, PlacementImport, PlacementRecordForm } from "../_components/admin-actions";
import { requireAdmin } from "../_lib";

export const metadata: Metadata = { title: "Placement data" };

// PLC-1 and PLC-5: admins enter aggregate records (form or CSV) with a cited source; every change is audited.
export default async function AdminPlacementPage() {
  await requireAdmin();
  const [{ branches }, records] = await Promise.all([profileOptions(), placement.records()]);
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-lg font-semibold text-ink">Add or update a record</h2>
        <PlacementRecordForm branches={branches} />
      </section>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-lg font-semibold text-ink">Import a CSV</h2>
        <PlacementImport />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Records ({records.length})</h2>
        {records.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">No records yet. Nothing is shown to students until records with a cited source are added.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  {["Year", "Programme", "Branch", "Company", "Type", "Offers", "Eligible", "Placed", "Median LPA", "Source", ""].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-3 py-2">{r.academicYear}</td>
                    <td className="px-3 py-2">{r.programme}</td>
                    <td className="px-3 py-2">{r.branchCode}</td>
                    <td className="px-3 py-2">{r.company || "All"}</td>
                    <td className="px-3 py-2">{r.offerType === "FULL_TIME" ? "Full-time" : "Internship"}</td>
                    <td className="px-3 py-2">{r.offerCount}</td>
                    <td className="px-3 py-2">{r.eligibleCount ?? ""}</td>
                    <td className="px-3 py-2">{r.placedCount ?? ""}</td>
                    <td className="px-3 py-2">{r.medianCtcLpa?.toString() ?? ""}</td>
                    <td className="px-3 py-2">{r.sourceCitation}</td>
                    <td className="px-3 py-2">
                      <DeletePlacementRecord recordId={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
