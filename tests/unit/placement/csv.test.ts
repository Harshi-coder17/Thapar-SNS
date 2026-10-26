import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/identity", () => ({ apiDeps: () => ({}), profileOptions: async () => ({ branches: [{ code: "COE", name: "Computer Engineering" }], tags: [] }) }));
vi.mock("@/modules/admin", () => ({ audit: async () => undefined }));

const { importCsv, parseCsv, recordSchema } = await import("@/modules/placement");

const platform = { userId: "00000000-0000-4000-8000-000000000001", globalRole: "ADMIN" as const, capacity: "platform" as const };

describe("placement CSV (PLC-1, placement-matrix.md §1)", () => {
  it("parses quoted fields, doubled quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });

  it("refuses files with per-student columns before touching the database", async () => {
    const prisma = { $transaction: vi.fn() };
    const result = await importCsv(prisma as never, platform, { csv: "academic_year,programme,branch_code,roll_number,offer_type,offer_count,source_citation,source_date\n2025-26,B.E.,COE,102003001,FULL_TIME,10,x,2026-06-30" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain("Per-student data is not allowed");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses the platform action in the personal capacity", async () => {
    const result = await importCsv({} as never, { ...platform, capacity: "personal" }, { csv: "x" });
    expect(result).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("reports the line of an invalid record and imports nothing", async () => {
    const prisma = { $transaction: vi.fn() };
    const csv = "academic_year,programme,branch_code,company,offer_type,offer_count,eligible_count,placed_count,median_ctc_lpa,source_citation,source_date\n2025-26,B.E.,COE,,FULL_TIME,10,5,8,,TIET report,2026-06-30";
    const result = await importCsv(prisma as never, platform, { csv });
    expect(JSON.stringify(result)).toContain("Line 2");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("validates counts (placed never exceeds eligible)", () => {
    const base = { academicYear: "2025-26", programme: "B.E.", branchCode: "COE", company: "", offerType: "FULL_TIME", offerCount: 10, sourceCitation: "TIET report", sourceDate: "2026-06-30" };
    expect(recordSchema.safeParse({ ...base, eligibleCount: 50, placedCount: 40 }).success).toBe(true);
    expect(recordSchema.safeParse({ ...base, eligibleCount: 5, placedCount: 8 }).success).toBe(false);
    expect(recordSchema.safeParse({ ...base, offerCount: -1 }).success).toBe(false);
  });
});
