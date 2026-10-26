// Explicit mapping from the official Thapar student societies directory's labels (type and subtype,
// https://studentsocieties.thapar.edu/) to Thapar SNS application categories (OI-55, owner 2026-10-26:
// "map official source labels to application categories explicitly and consistently"). The source
// labels are kept separately on the society record; nothing is inferred from names or descriptions.
// A label pair not listed here maps to no category (the organisation still appears under "All").

export interface SourceLabels {
  sourceType: string | null;
  sourceSubtype: string | null;
}

/** subtype -> category; the type only matters where a rule says so. */
const RULES: { subtype: string; type?: string; category: string }[] = [
  { subtype: "technical-/-academic", type: "chapter", category: "professional" },
  { subtype: "technical-/-academic", category: "technical" },
  { subtype: "entrepreneurship", category: "entrepreneurship" },
  { subtype: "cultural-/-visual-arts", category: "cultural" },
  { subtype: "debate-/-literary", category: "literary" },
  { subtype: "physical-fitness", category: "sports-fitness" },
  { subtype: "social", category: "social-service" },
];

export function categoryForSource(labels: SourceLabels): string | null {
  const subtype = labels.sourceSubtype?.trim().toLowerCase();
  const type = labels.sourceType?.trim().toLowerCase();
  if (!subtype) return null;
  const rule = RULES.find((r) => r.subtype === subtype && (r.type === undefined || r.type === type));
  return rule?.category ?? null;
}

/** Human-readable source label, e.g. "Chapter · Technical / Academic". */
export function sourceLabel(labels: SourceLabels): string | null {
  const nice = (v: string | null) => (v ? v.replace(/-\/-/g, " / ").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null);
  const parts = [nice(labels.sourceType), nice(labels.sourceSubtype)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export const SOURCE_CATEGORY_RULES = RULES;
