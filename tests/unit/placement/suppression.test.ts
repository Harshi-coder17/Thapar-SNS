import { describe, expect, it } from "vitest";

import { FORBIDDEN_COLUMNS, isSafe, K, suppress } from "@/modules/placement/suppression";

/** Deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Can a hidden value be recovered by subtracting shown entries from a shown total in one line? */
function recoverable(table: ReturnType<typeof suppress>): boolean {
  const rows = table.values.length - 1;
  const cols = table.values[0]!.length - 1;
  const lines: [number, number][][] = [];
  for (let i = 0; i <= rows; i++) lines.push(Array.from({ length: cols + 1 }, (_, j) => [i, j] as [number, number]));
  for (let j = 0; j <= cols; j++) lines.push(Array.from({ length: rows + 1 }, (_, i) => [i, j] as [number, number]));
  return lines.some((line) => line.filter(([i, j]) => table.state[i]![j] !== "shown").length === 1);
}

describe("placement suppression (PLC-3, placement-matrix.md §3)", () => {
  it("suppresses cells of 1 to 4 students, shows 0, and hides the smallest other non-zero cell (§3.3 rule 1)", () => {
    const t = suppress([[0, 4, 5, 20]]);
    expect(t.state[0]!.slice(0, 4)).toEqual(["shown", "primary", "complementary", "shown"]);
    expect(isSafe(t)).toBe(true);
  });

  it("adds complementary suppression so a lone small cell cannot be derived from the row total", () => {
    const t = suppress([[3, 37]]);
    expect(t.state[0]![0]).toBe("primary");
    expect(t.state[0]![1]).toBe("complementary");
    expect(isSafe(t)).toBe(true);
  });

  it("suppresses a total that itself covers 1 to 4 students", () => {
    const t = suppress([[2, 0], [0, 0]]);
    expect(t.state[0]![2]).not.toBe("shown");
    expect(t.state[2]![2]).not.toBe("shown");
    expect(isSafe(t)).toBe(true);
  });

  it("never leaves a recoverable or unsuppressed small value (property test, 2000 random matrices)", () => {
    const random = rng(20261025);
    for (let n = 0; n < 2000; n++) {
      const rows = 1 + Math.floor(random() * 6);
      const cols = 1 + Math.floor(random() * 6);
      const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (random() < 0.35 ? Math.floor(random() * K) : Math.floor(random() * 60))));
      const table = suppress(cells);
      expect(isSafe(table)).toBe(true);
      expect(recoverable(table)).toBe(false);
      for (const [i, row] of table.values.entries()) for (const [j, v] of row.entries()) if (v >= 1 && v < K) expect(table.state[i]![j]).not.toBe("shown");
    }
  });

  it("rejects per-student column names", () => {
    for (const column of ["name", "roll_number", "email", "ctc", "salary"]) expect(FORBIDDEN_COLUMNS).toContain(column);
  });
});
