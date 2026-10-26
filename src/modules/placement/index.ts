import "server-only";

// Placement matrix (Slice 4e: PLC-1..5, ADR-0009; docs/requirements/placement-matrix.md). Aggregate
// records only, entered by admins (form or CSV); every change is audited; no student self-reporting.
// Suppression is computed on the full table for (year, offer type, programme) and filters only select
// rows or columns of that suppressed table, so comparing filtered views never reveals a hidden value.
// No placement data has been supplied: nothing is seeded or invented.
import { audit } from "@/modules/admin";
import { apiDeps, profileOptions } from "@/modules/identity";
import { getDb, type PrismaClient } from "@/shared/db/client";
import { type ApiActor, forbidden, invalid, notFound, ok, RATE, runAction, type ServiceResult } from "@/shared/http/api-action";
import { z } from "zod";

import { type CellState, FORBIDDEN_COLUMNS, isSafe, K, suppress } from "./suppression";

export { K } from "./suppression";
export const PLC4_LABEL = "Unofficial, aggregate data compiled from the cited sources. Groups of fewer than 5 students are hidden. Not an official Thapar Institute statement.";
export const OTHER_COMPANIES = "Other (<5 offers)";

const year = z.string().trim().regex(/^20\d{2}-\d{2}$/, "Use an academic year such as 2025-26.");
const count = z.coerce.number().int("Use a whole number.").min(0, "Counts cannot be negative.").max(100_000);
const optionalCount = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), count.optional());

export const recordSchema = z
  .object({
    academicYear: year,
    programme: z.string().trim().min(2, "Enter the programme, e.g. B.E.").max(40),
    branchCode: z.string().trim().min(1, "Choose a branch."),
    company: z.preprocess((v) => (typeof v === "string" ? v.trim() : v ?? ""), z.string().max(120)),
    offerType: z.enum(["FULL_TIME", "INTERNSHIP"]),
    offerCount: count,
    eligibleCount: optionalCount,
    placedCount: optionalCount,
    medianCtcLpa: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().min(0).max(1000).optional()),
    sourceCitation: z.string().trim().min(5, "Cite the source.").max(500),
    sourceDate: z.iso.date("Use a date such as 2026-06-30."),
  })
  .strict()
  .refine((r) => r.placedCount === undefined || r.eligibleCount === undefined || r.placedCount <= r.eligibleCount, { message: "Placed cannot exceed eligible.", path: ["placedCount"] });

type RecordInput = z.infer<typeof recordSchema>;

const fieldErrors = (error: z.ZodError) => {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return fields;
};

const branchCodes = async () => new Set((await profileOptions()).branches.map((b) => b.code));

const recordData = (r: RecordInput) => ({
  academicYear: r.academicYear,
  programme: r.programme,
  branchCode: r.branchCode,
  company: r.company,
  offerType: r.offerType,
  offerCount: r.offerCount,
  eligibleCount: r.eligibleCount ?? null,
  placedCount: r.placedCount ?? null,
  medianCtcLpa: r.medianCtcLpa ?? null,
  sourceCitation: r.sourceCitation,
  sourceDate: new Date(`${r.sourceDate}T00:00:00Z`),
});

/** PLC-1: admin creates or replaces one record (keyed by year, programme, branch, company, offer type). */
export async function upsertRecord(prisma: PrismaClient, actor: ApiActor, raw: unknown): Promise<ServiceResult<{ id: string }>> {
  if (actor.capacity !== "platform") return forbidden;
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  if (!(await branchCodes()).has(parsed.data.branchCode)) return invalid({ branchCode: "Choose a branch from the list." });
  return prisma.$transaction(async (tx): Promise<ServiceResult<{ id: string }>> => {
    const data = recordData(parsed.data);
    const key = { academicYear: data.academicYear, programme: data.programme, branchCode: data.branchCode, company: data.company, offerType: data.offerType };
    const existing = await tx.placementRecord.findUnique({ where: { academicYear_programme_branchCode_company_offerType: key }, select: { id: true } });
    const row = existing ? await tx.placementRecord.update({ where: { id: existing.id }, data, select: { id: true } }) : await tx.placementRecord.create({ data: { ...data, createdById: actor.userId }, select: { id: true } });
    await audit(tx, { actorId: actor.userId, action: existing ? "placement.record.updated" : "placement.record.created", targetType: "placement_record", targetId: row.id });
    return ok(row);
  });
}

export async function deleteRecord(prisma: PrismaClient, actor: ApiActor, id: string): Promise<ServiceResult> {
  if (actor.capacity !== "platform") return forbidden;
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    const { count: deleted } = await tx.placementRecord.deleteMany({ where: { id } });
    if (!deleted) return notFound;
    await audit(tx, { actorId: actor.userId, action: "placement.record.deleted", targetType: "placement_record", targetId: id });
    return ok(undefined);
  });
}

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const CSV_COLUMNS = ["academic_year", "programme", "branch_code", "company", "offer_type", "offer_count", "eligible_count", "placed_count", "median_ctc_lpa", "source_citation", "source_date"] as const;
const importSchema = z.object({ csv: z.string().min(1, "Paste or choose a CSV file.").max(1_000_000, "The file is too large (1 MB at most).") }).strict();

/**
 * PLC-1 CSV import: all rows are validated first and applied in one transaction (all or nothing).
 * A file with any per-student column is rejected outright (§1).
 */
export async function importCsv(prisma: PrismaClient, actor: ApiActor, raw: unknown): Promise<ServiceResult<{ created: number; updated: number }>> {
  if (actor.capacity !== "platform") return forbidden;
  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const rows = parseCsv(parsed.data.csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return invalid({ csv: "The file needs a header row and at least one record." });
  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const forbiddenColumn = header.find((h) => FORBIDDEN_COLUMNS.includes(h));
  if (forbiddenColumn) return invalid({ csv: `Per-student data is not allowed (column "${forbiddenColumn}"). Import aggregate counts only.` });
  const unknown = header.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) return invalid({ csv: `Unknown columns: ${unknown.join(", ")}. Expected: ${CSV_COLUMNS.join(", ")}.` });
  if (rows.length - 1 > 2000) return invalid({ csv: "Import at most 2000 records at a time." });
  const branches = await branchCodes();
  const records: RecordInput[] = [];
  const keys = new Set<string>();
  for (const [index, cells] of rows.slice(1).entries()) {
    const line = index + 2;
    const value = Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
    const result = recordSchema.safeParse({
      academicYear: value.academic_year,
      programme: value.programme,
      branchCode: value.branch_code,
      company: value.company ?? "",
      offerType: (value.offer_type ?? "").toUpperCase().replace(/[\s-]+/g, "_"),
      offerCount: value.offer_count,
      eligibleCount: value.eligible_count,
      placedCount: value.placed_count,
      medianCtcLpa: value.median_ctc_lpa,
      sourceCitation: value.source_citation,
      sourceDate: value.source_date,
    });
    if (!result.success) {
      const [field, message] = Object.entries(fieldErrors(result.error))[0]!;
      return invalid({ csv: `Line ${line}, ${field}: ${message}` });
    }
    if (!branches.has(result.data.branchCode)) return invalid({ csv: `Line ${line}: unknown branch code "${result.data.branchCode}".` });
    const key = [result.data.academicYear, result.data.programme, result.data.branchCode, result.data.company, result.data.offerType].join("|");
    if (keys.has(key)) return invalid({ csv: `Line ${line}: duplicate record in the file.` });
    keys.add(key);
    records.push(result.data);
  }
  return prisma.$transaction(
    async (tx): Promise<ServiceResult<{ created: number; updated: number }>> => {
      let created = 0;
      let updated = 0;
      for (const record of records) {
        const data = recordData(record);
        const key = { academicYear: data.academicYear, programme: data.programme, branchCode: data.branchCode, company: data.company, offerType: data.offerType };
        const existing = await tx.placementRecord.findUnique({ where: { academicYear_programme_branchCode_company_offerType: key }, select: { id: true } });
        if (existing) {
          await tx.placementRecord.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await tx.placementRecord.create({ data: { ...data, createdById: actor.userId } });
          created++;
        }
      }
      await audit(tx, { actorId: actor.userId, action: "placement.csv.imported", targetType: "placement_record", details: { created, updated } });
      return ok({ created, updated });
    },
    { timeout: 60_000 },
  );
}

export interface MatrixCell {
  display: string;
  state: CellState;
  /** Whole-percent placement rate, only for a single shown record with both counts and n >= 5 (§3.5). */
  placementPct: number | null;
  /** Only as published by the source, for a shown group of at least 5 (§3.2). */
  medianCtcLpa: number | null;
}

export interface MatrixView {
  academicYear: string;
  offerType: "FULL_TIME" | "INTERNSHIP";
  programme: string;
  rows: { code: string; name: string; cells: MatrixCell[]; total: MatrixCell }[];
  columns: string[];
  columnTotals: MatrixCell[];
  grandTotal: MatrixCell;
  measure: "placed" | "offers";
  citations: { citation: string; date: string }[];
  options: { years: string[]; programmes: string[]; branches: { code: string; name: string }[]; companies: string[] };
}

const display = (value: number, state: CellState) => (state === "primary" ? "<5" : state === "complementary" ? "Hidden" : String(value));

/** PLC-2: the matrix for one year, offer type and programme; optional single branch or company filter. */
export async function matrix(prisma: PrismaClient, filters: { academicYear?: string; offerType?: "FULL_TIME" | "INTERNSHIP"; programme?: string; branch?: string; company?: string }): Promise<MatrixView | null> {
  const years = (await prisma.placementRecord.findMany({ distinct: ["academicYear"], select: { academicYear: true }, orderBy: { academicYear: "desc" } })).map((r) => r.academicYear);
  if (years.length === 0) return null;
  const academicYear = filters.academicYear && years.includes(filters.academicYear) ? filters.academicYear : years[0]!;
  const offerType = filters.offerType ?? "FULL_TIME";
  const programmes = (await prisma.placementRecord.findMany({ where: { academicYear }, distinct: ["programme"], select: { programme: true }, orderBy: { programme: "asc" } })).map((r) => r.programme);
  const programme = filters.programme && programmes.includes(filters.programme) ? filters.programme : (programmes[0] ?? "");
  const records = await prisma.placementRecord.findMany({ where: { academicYear, offerType, programme } });
  const branchNames = new Map((await profileOptions()).branches.map((b) => [b.code, b.name]));

  // Company-level records when any exist; otherwise the all-companies records as one column.
  const companyLevel = records.some((r) => r.company !== "");
  const used = records.filter((r) => (companyLevel ? r.company !== "" : r.company === ""));
  // Everything counts placed students when every record has them, otherwise offers (§3.1).
  const measure: MatrixView["measure"] = used.length > 0 && used.every((r) => r.placedCount !== null) ? "placed" : "offers";
  const n = (r: (typeof used)[number]) => (measure === "placed" ? r.placedCount! : r.offerCount);
  // §3.4: companies with fewer than 5 in total for the year are grouped.
  const companyTotals = new Map<string, number>();
  for (const r of used) companyTotals.set(r.company, (companyTotals.get(r.company) ?? 0) + n(r));
  const columnOf = (company: string) => (!companyLevel ? "All companies" : (companyTotals.get(company) ?? 0) < K ? OTHER_COMPANIES : company);
  const columns = [...new Set(used.map((r) => columnOf(r.company)))].sort((a, b) => (a === OTHER_COMPANIES ? 1 : b === OTHER_COMPANIES ? -1 : a.localeCompare(b)));
  const rowCodes = [...new Set(used.map((r) => r.branchCode))].sort((a, b) => (branchNames.get(a) ?? a).localeCompare(branchNames.get(b) ?? b));
  const grid = rowCodes.map(() => columns.map(() => 0));
  const members = rowCodes.map(() => columns.map(() => [] as (typeof used)[number][]));
  for (const r of used) {
    const i = rowCodes.indexOf(r.branchCode);
    const j = columns.indexOf(columnOf(r.company));
    grid[i]![j]! += n(r);
    members[i]![j]!.push(r);
  }
  const table = suppress(grid);
  if (!isSafe(table)) throw new Error("placement suppression invariant violated");
  const cell = (i: number, j: number): MatrixCell => {
    const state = table.state[i]![j]!;
    const value = table.values[i]![j]!;
    const group = i < rowCodes.length && j < columns.length ? members[i]![j]! : [];
    const single = group.length === 1 ? group[0]! : null;
    const shownBig = state === "shown" && value >= K;
    return {
      display: display(value, state),
      state,
      placementPct: shownBig && single?.eligibleCount && single.placedCount !== null ? Math.round((single.placedCount / single.eligibleCount) * 100) : null,
      medianCtcLpa: shownBig && single?.medianCtcLpa ? Number(single.medianCtcLpa) : null,
    };
  };
  // Filters select rows or columns of the already-suppressed table (never re-suppress a subset).
  const rowIdx = rowCodes.map((_, i) => i).filter((i) => !filters.branch || rowCodes[i] === filters.branch);
  const colIdx = columns.map((_, j) => j).filter((j) => !filters.company || columns[j] === filters.company);
  const citations = [...new Map(used.map((r) => [`${r.sourceCitation}|${r.sourceDate.toISOString().slice(0, 10)}`, { citation: r.sourceCitation, date: r.sourceDate.toISOString().slice(0, 10) }])).values()];
  return {
    academicYear,
    offerType,
    programme,
    rows: rowIdx.map((i) => ({ code: rowCodes[i]!, name: branchNames.get(rowCodes[i]!) ?? rowCodes[i]!, cells: colIdx.map((j) => cell(i, j)), total: cell(i, columns.length) })),
    columns: colIdx.map((j) => columns[j]!),
    columnTotals: colIdx.map((j) => cell(rowCodes.length, j)),
    grandTotal: cell(rowCodes.length, columns.length),
    measure,
    citations,
    options: { years, programmes, branches: rowCodes.map((code) => ({ code, name: branchNames.get(code) ?? code })), companies: columns },
  };
}

/** Admin list of raw records (admins only; edit history stays in the audit log). */
export async function listRecords(prisma: PrismaClient) {
  return prisma.placementRecord.findMany({ orderBy: [{ academicYear: "desc" }, { programme: "asc" }, { branchCode: "asc" }, { company: "asc" }], take: 2000 });
}

// Wiring.
export const placement = {
  matrix: (filters: Parameters<typeof matrix>[1]) => matrix(getDb(), filters),
  records: () => listRecords(getDb()),
};

export const placementApi = {
  upsert: (request: Request) =>
    runAction(apiDeps(), request, { name: "placement:upsert", rules: RATE.admin, body: true, capacity: "platform", run: (actor, body) => upsertRecord(getDb(), actor, body), output: (v) => ({ record: v }) }),
  remove: (request: Request, id: string) => runAction(apiDeps(), request, { name: "placement:delete", rules: RATE.admin, ids: [id], capacity: "platform", run: (actor) => deleteRecord(getDb(), actor, id) }),
  importCsv: (request: Request) => runAction(apiDeps(), request, { name: "placement:import", rules: RATE.admin, body: true, maxBodyBytes: 1_200_000, capacity: "platform", run: (actor, body) => importCsv(getDb(), actor, body) }),
};
