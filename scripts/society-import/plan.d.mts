export function slugify(name: string): string;
export function normaliseName(name: string): string;
interface PlanRecord {
  key: string;
  name: string;
  source?: { recordUrl?: string };
  review?: { possibleDuplicateOf?: string[] };
}
export function planImport(
  records: PlanRecord[],
  existing: { name: string; slug: string; sourceKey: string | null }[],
): {
  create: { key: string; name: string; slug: string }[];
  skip: { key: string; name: string; existing: string; reason: string }[];
  invalid: { key: string; name: string; problems: string[] }[];
  possibleDuplicates: { key: string; name: string; possibleDuplicateOf: string[] }[];
};
