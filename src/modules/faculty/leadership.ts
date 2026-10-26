// Leadership order for the faculty directory (owner 2026-10-25: "like the official website, starting
// from the deans, DoAA and DoSA, on top"). Derived only from officially published designations; it is
// presentation, never a permission. Lower rank = shown first; null = not a leadership role.

const RULES: { rank: number; label: string; test: RegExp }[] = [
  { rank: 0, label: "Pro Vice-Chancellor", test: /vice[\s-]*chancellor/i },
  { rank: 1, label: "Dean of Academic Affairs", test: /dean\s+of\s+academic\s+affairs|\bdoaa\b/i },
  { rank: 2, label: "Dean of Student Affairs", test: /dean\s+of\s+student\s+affairs|\bdosa\b/i },
  { rank: 3, label: "Dean of Faculty Affairs", test: /(?<!associate\s)dean\s*(\(|of\s+)?faculty\s+affairs|\bdofa\b/i },
  { rank: 4, label: "Dean of Research", test: /(?<!associate\s)dean\s+(of\s+)?research/i },
  { rank: 7, label: "Associate Dean", test: /associate\s+dean|\badofa\b/i },
  { rank: 5, label: "Dean", test: /\bdean\b/i },
  { rank: 6, label: "Institute office", test: /controller\s+of\s+examinations|chief\s+technology\s+officer/i },
];

export function leadershipRank(designation: string): number | null {
  for (const rule of RULES) if (rule.test.test(designation)) return rule.rank;
  return null;
}

/** University leadership (shown first) versus associate deans (shown next). */
export const isSeniorLeadership = (rank: number | null) => rank !== null && rank !== 7;
