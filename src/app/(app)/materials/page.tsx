import { Download, FileText, Image as ImageIcon, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { profileOptions } from "@/modules/identity";
import { materials, MATERIAL_TYPES, TYPE_LABELS } from "@/modules/studymaterial";
import { formatDate } from "@/shared/format";
import { PageHeader } from "@/shared/layout/page-header";
import { Button } from "@/shared/ui/button";

import { chipClass, first, selectClass, withQuery } from "../_components/chips";
import { EmptyState } from "../_components/empty-state";
import { ReportButton } from "../_components/report-button";
import { VoteButton } from "../_components/vote-button";
import { requireSession } from "../_lib/session";
import { DeleteMaterialButton } from "./_components/delete-material";

export const metadata: Metadata = { title: "Study Material" };

const size = (bytes: number | null) => (bytes === null ? "" : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const STATUS = { AWAITING_UPLOAD: "Waiting for the file", UPLOADED: "Being checked", SCANNING: "Being checked", APPROVED: "Listed", REJECTED: "Rejected", QUARANTINED: "Rejected", EXPIRED: "Upload expired", UNKNOWN: "Unknown" } as Record<string, string>;

// FR-MAT-1..4: browse by subject code and semester, search, upvote, download (approved files only).
export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const view = first(params.view) === "mine" ? "mine" : "browse";
  const q = first(params.q)?.slice(0, 100) || undefined;
  const subjectCode = first(params.subject)?.toUpperCase().slice(0, 10) || undefined;
  const semesterRaw = Number(first(params.semester));
  const semester = Number.isInteger(semesterRaw) && semesterRaw >= 1 && semesterRaw <= 10 ? semesterRaw : undefined;
  const branchCode = first(params.branch) || undefined;
  const typeParam = first(params.type);
  const type = MATERIAL_TYPES.find((t) => t === typeParam);
  const sort = first(params.sort) === "top" ? "top" : "new";
  const [{ branches }, list, subjects, mine] = await Promise.all([
    profileOptions(),
    view === "browse" ? materials.list(session.user.id, { q, subjectCode, semester, branchCode, type, sort }) : Promise.resolve([]),
    materials.subjects(),
    view === "mine" ? materials.mine(session.user.id) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title="Study Material"
        description="Notes, previous-year papers and references shared by students, by subject and semester."
        action={
          <Button asChild>
            <Link href="/materials/upload">
              <Upload aria-hidden />
              Share material
            </Link>
          </Button>
        }
      />
      <nav aria-label="Material lists" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link href="/materials" aria-current={view === "browse" ? "page" : undefined} className={chipClass(view === "browse")}>
          Browse
        </Link>
        <Link href="/materials?view=mine" aria-current={view === "mine" ? "page" : undefined} className={chipClass(view === "mine")}>
          My uploads
        </Link>
      </nav>
      {view === "mine" ? (
        mine.length === 0 ? (
          <EmptyState>You have not shared any material yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {mine.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{m.title}</span>
                  <span className="block text-sm text-muted">
                    {m.subjectCode} · {formatDate(m.createdAt)} · {m.hiddenAt ? "Hidden by a moderator" : STATUS[m.status]}
                    {m.rejectionReason ? `: ${m.rejectionReason}` : ""}
                  </span>
                </span>
                <DeleteMaterialButton materialId={m.id} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <form role="search" action="/materials" className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label htmlFor="m-q" className="text-sm font-medium text-ink">
                Search
              </label>
              <input id="m-q" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Title, subject code or description" className={selectClass} />
            </div>
            <div>
              <label htmlFor="m-subject" className="text-sm font-medium text-ink">
                Subject
              </label>
              <select id="m-subject" name="subject" defaultValue={subjectCode ?? ""} className={selectClass}>
                <option value="">Any</option>
                {subjects.map((s) => (
                  <option key={s.subjectCode} value={s.subjectCode}>
                    {s.subjectCode} ({s.count})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="m-semester" className="text-sm font-medium text-ink">
                Semester
              </label>
              <select id="m-semester" name="semester" defaultValue={semester ?? ""} className={selectClass}>
                <option value="">Any</option>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="m-branch" className="text-sm font-medium text-ink">
                Branch
              </label>
              <select id="m-branch" name="branch" defaultValue={branchCode ?? ""} className={selectClass}>
                <option value="">Any</option>
                {branches.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="m-type" className="text-sm font-medium text-ink">
                Type
              </label>
              <select id="m-type" name="type" defaultValue={type ?? ""} className={selectClass}>
                <option value="">Any</option>
                {MATERIAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-6">
              <select name="sort" defaultValue={sort} aria-label="Sort" className={`${selectClass} w-auto`}>
                <option value="new">Newest first</option>
                <option value="top">Most upvoted</option>
              </select>
              <Button type="submit" variant="secondary">
                Apply
              </Button>
              {q || subjectCode || semester || branchCode || type ? (
                <Link href="/materials" className="inline-flex min-h-11 items-center px-2 text-sm text-muted underline-offset-4 hover:underline">
                  Clear filters
                </Link>
              ) : null}
            </div>
          </form>
          {list.length === 0 ? (
            <EmptyState>No material matches these filters yet.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {list.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start gap-4 rounded-xl border border-line bg-surface p-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">{m.mime === "application/pdf" ? <FileText aria-hidden className="size-5" /> : <ImageIcon aria-hidden className="size-5" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{m.title}</p>
                    <p className="text-sm text-muted">
                      {[m.subjectCode, TYPE_LABELS[m.type], `Semester ${m.semester}`, m.branchName, size(m.size), formatDate(m.createdAt), m.uploaderName ? `shared by ${m.mine ? "you" : m.uploaderName}` : null].filter(Boolean).join(" · ")}
                    </p>
                    {m.description ? <p className="mt-1 text-sm text-ink">{m.description}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <VoteButton url={`/api/materials/${m.id}/vote`} voted={m.voted} count={m.upvoteCount} />
                      <Button asChild variant="secondary">
                        <a href={withQuery(`/api/materials/${m.id}/file`, { download: 1 })}>
                          <Download aria-hidden />
                          Download
                        </a>
                      </Button>
                      {!m.mine ? <ReportButton targetType="STUDY_MATERIAL" targetId={m.id} /> : <DeleteMaterialButton materialId={m.id} />}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
