// MET-4 / OBJ-4: full-text search latency at campus scale, measured at the query layer (the official
// faculty directory, 577 profiles). Run against the E2E database:
//   DATABASE_URL=<e2e db> npx tsx --conditions=react-server --env-file=.env scripts/load/search-latency.ts
import { searchFaculty } from "@/modules/faculty";
import { listMaterials } from "@/modules/studymaterial";
import { getDb } from "@/shared/db/client";

const queries = ["kumar", "singh", "machine learning", "civil", "Amrita Kour", "power electronics", "karun verma", "biotechnology", "data science", "sharma"];
const percentile = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)]!;

async function measure(name: string, fn: (q: string) => Promise<unknown>, rounds = 30) {
  for (const q of queries) await fn(q); // warm-up
  const times: number[] = [];
  for (let r = 0; r < rounds; r++)
    for (const q of queries) {
      const t = performance.now();
      await fn(q);
      times.push(performance.now() - t);
    }
  console.log(`${name}: ${times.length} searches, p50 ${percentile(times, 50).toFixed(1)} ms, p95 ${percentile(times, 95).toFixed(1)} ms, max ${Math.max(...times).toFixed(1)} ms`);
}

await measure("faculty search (tsvector + trigram)", (q) => searchFaculty(getDb(), { q }));
await measure("study material search (tsvector)", (q) => listMaterials(getDb(), "00000000-0000-4000-8000-000000000000", { q }, async () => new Map()));
await getDb().$disconnect();
