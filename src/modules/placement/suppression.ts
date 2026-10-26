// Disclosure control for the placement matrix (PLC-3; docs/requirements/placement-matrix.md §3).
// Pure functions, property-tested in tests/unit/placement-suppression.test.ts.

export const K = 5;

export type CellState = "shown" | "primary" | "complementary";

export interface SuppressedTable {
  /** (rows + 1) x (cols + 1): the last column holds row totals, the last row column totals, the corner the grand total. */
  values: number[][];
  state: CellState[][];
}

/** Primary rule (§3.1): 1 to 4 students is suppressed; 0 is shown. */
export const isSmall = (n: number) => n >= 1 && n < K;

/**
 * Builds the extended table (cells plus row, column and grand totals) and applies primary and
 * complementary suppression (§3.3) until stable: every additive line (a row with its total, a column
 * with its total) has either zero or at least two suppressed entries, so no suppressed entry can be
 * recovered by subtracting displayed entries from a displayed total.
 */
export function suppress(cells: number[][]): SuppressedTable {
  const rows = cells.length;
  const cols = rows ? cells[0]!.length : 0;
  const values: number[][] = Array.from({ length: rows + 1 }, (_, i) => Array.from({ length: cols + 1 }, (_, j) => (i < rows && j < cols ? cells[i]![j]! : 0)));
  for (let i = 0; i < rows; i++) values[i]![cols] = cells[i]!.reduce((a, b) => a + b, 0);
  for (let j = 0; j <= cols; j++) values[rows]![j] = values.slice(0, rows).reduce((a, r) => a + r[j]!, 0);
  const state: CellState[][] = values.map((r) => r.map((v) => (isSmall(v) ? "primary" : "shown")));

  // Each additive line: the coordinates of its entries (the total last).
  const lines: [number, number][][] = [];
  for (let i = 0; i <= rows; i++) lines.push(Array.from({ length: cols + 1 }, (_, j) => [i, j] as [number, number]));
  for (let j = 0; j <= cols; j++) lines.push(Array.from({ length: rows + 1 }, (_, i) => [i, j] as [number, number]));

  for (let changed = true; changed; ) {
    changed = false;
    for (const line of lines) {
      const hidden = line.filter(([i, j]) => state[i]![j] !== "shown");
      if (hidden.length !== 1) continue;
      // Suppress the next-smallest shown entry, preferring non-zero cells over totals.
      const candidates = line.filter(([i, j]) => state[i]![j] === "shown");
      if (candidates.length === 0) continue;
      const isTotal = ([i, j]: [number, number]) => i === rows || j === cols;
      candidates.sort((a, b) => Number(isTotal(a)) - Number(isTotal(b)) || Number(values[a[0]]![a[1]] === 0) - Number(values[b[0]]![b[1]] === 0) || values[a[0]]![a[1]]! - values[b[0]]![b[1]]!);
      const [ci, cj] = candidates[0]!;
      state[ci]![cj] = "complementary";
      changed = true;
    }
  }
  return { values, state };
}

/**
 * Checks the guarantee of §5: in every additive line, a suppressed entry is never the only unknown.
 * Used by tests and as a runtime assertion before rendering.
 */
export function isSafe(table: SuppressedTable): boolean {
  const rows = table.values.length - 1;
  const cols = rows >= 0 ? table.values[0]!.length - 1 : 0;
  for (let i = 0; i <= rows; i++) if (table.state[i]!.filter((s) => s !== "shown").length === 1) return false;
  for (let j = 0; j <= cols; j++) if (table.state.filter((r) => r[j] !== "shown").length === 1) return false;
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) if (isSmall(table.values[i]![j]!) && table.state[i]![j] === "shown") return false;
  return true;
}

/** Per-student columns that a placement CSV must never contain (§1). */
export const FORBIDDEN_COLUMNS = ["name", "student", "student_name", "roll", "roll_no", "roll_number", "rollno", "enrolment", "enrollment", "email", "mail", "phone", "ctc", "individual_ctc", "salary", "package"];
