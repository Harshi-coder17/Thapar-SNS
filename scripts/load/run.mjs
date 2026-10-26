#!/usr/bin/env node
// Local load test (NFR-PERF, MET-2, MET-4, MET-5; OI-33 baseline). No extra dependencies.
// Runs against a production build served with the E2E test sign-in and the isolated E2E database:
//   E2E_BUILD=1 next build && DATABASE_URL=<e2e db> E2E_BUILD=1 E2E_TEST_AUTH=1 ... next start -p 3300
//   node scripts/load/run.mjs http://127.0.0.1:3300 [virtualUsers=200] [seconds=60]
// Never point it at the development database: it creates fictitious users and an event.
const [base = "http://127.0.0.1:3300", vuArg = "200", secondsArg = "60"] = process.argv.slice(2);
const VUS = Number(vuArg);
const SECONDS = Number(secondsArg);
const run = Date.now().toString(36);

let address = 0;
const nextAddress = () => {
  address += 1;
  return `10.${200 + Math.floor(address / 62500) % 50}.${Math.floor(address / 250) % 250}.${(address % 250) + 1}`;
};

class Client {
  constructor(ip) {
    this.ip = ip;
    this.cookie = "";
  }
  async request(method, path, body) {
    const headers = { origin: base, "x-forwarded-for": this.ip };
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const started = performance.now();
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const text = await response.text();
    const ms = performance.now() - started;
    const set = response.headers.getSetCookie?.() ?? [];
    const session = set.find((c) => c.startsWith("better-auth.session_token="));
    if (session) this.cookie = session.split(";")[0];
    return { status: response.status, ms, text };
  }
}

async function signedIn(email, name, roll) {
  const client = new Client(nextAddress());
  const signIn = await client.request("POST", "/api/test-auth/sign-in", { email, name });
  if (signIn.status !== 200) throw new Error(`sign-in ${email}: ${signIn.status}`);
  const profile = await client.request("POST", "/api/identity/profile", { name, rollNumber: roll, branchCode: "COE", year: 2, tags: ["python", "rust", "robotics"] });
  if (![200, 409].includes(profile.status)) throw new Error(`profile ${email}: ${profile.status} ${profile.text}`);
  return client;
}

const percentile = (values, p) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const summary = (samples) => {
  const byName = new Map();
  for (const s of samples) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  const rows = [];
  for (const [name, list] of byName) {
    const ms = list.map((s) => s.ms);
    const errors = list.filter((s) => s.status >= 500 || s.status === 0).length;
    const limited = list.filter((s) => s.status === 429).length;
    rows.push({ name, requests: list.length, p50: Math.round(percentile(ms, 50)), p95: Math.round(percentile(ms, 95)), p99: Math.round(percentile(ms, 99)), max: Math.round(Math.max(...ms)), errors, rateLimited: limited });
  }
  return rows;
};

console.log(`Load test against ${base}: ${VUS} virtual users, ${SECONDS} s. Setting up users...`);
const admin = await signedIn("load.admin@thapar.edu", "Load Admin", `LA${run}`.slice(0, 15).toUpperCase());
const start = new Date(Date.now() + 3 * 86_400_000);
const created = await admin.request("POST", "/api/events?as=admin", { title: `Load test event ${run}`, description: "<p>Load test.</p>", venue: "Main auditorium", startAt: start.toISOString(), endAt: new Date(start.getTime() + 3_600_000).toISOString(), capacity: Math.floor(VUS / 2), registrationSchema: [], publish: true });
if (created.status !== 201) throw new Error(`event: ${created.status} ${created.text} (is ADMIN_EMAILS set to load.admin@thapar.edu?)`);
const eventId = JSON.parse(created.text).event.id;
const users = [];
for (let i = 0; i < VUS; i += 20) {
  users.push(...(await Promise.all(Array.from({ length: Math.min(20, VUS - i) }, (_, j) => signedIn(`load.${run}.${i + j}@thapar.edu`, `Load User ${i + j}`, `LD${run}${i + j}`.slice(-15).toUpperCase())))));
}
console.log(`${users.length} users signed in; event ${eventId} (capacity ${Math.floor(VUS / 2)}).`);

// B: registration burst.
const burst = await Promise.all(users.map(async (u) => ({ name: "POST registration (burst)", ...(await u.request("POST", `/api/events/${eventId}/registration`, { responses: {} })) })));
const outcomes = burst.reduce((acc, r) => {
  const key = r.status === 200 ? JSON.parse(r.text).status : `HTTP ${r.status}`;
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

// A: mixed workload with think time.
const samples = [];
const stopAt = Date.now() + SECONDS * 1000;
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));
const queries = ["kumar", "singh", "machine learning", "civil", "Amrita Kour", "power electronics"];
await Promise.all(
  users.map(async (u, i) => {
    let interested = false;
    while (Date.now() < stopAt) {
      const roll = Math.random();
      let name;
      let result;
      if (roll < 0.35) {
        name = "GET /api/notifications";
        result = await u.request("GET", "/api/notifications");
      } else if (roll < 0.55) {
        name = "PUT /api/events/{id}/interest";
        interested = !interested;
        result = await u.request("PUT", `/api/events/${eventId}/interest`, { interested });
      } else if (roll < 0.75) {
        name = "GET /api/events/{id}/interest";
        result = await u.request("GET", `/api/events/${eventId}/interest`);
      } else if (roll < 0.9) {
        name = "GET /events (page)";
        result = await u.request("GET", "/events");
      } else {
        name = "GET /faculty?q= (page)";
        result = await u.request("GET", `/faculty?q=${encodeURIComponent(queries[i % queries.length])}`);
      }
      samples.push({ name, status: result.status, ms: result.ms });
      await pause();
    }
  }),
);

const rows = [...summary(burst), ...summary(samples)];
console.log("\nRegistration burst outcome:", JSON.stringify(outcomes));
console.table(rows);
const all = samples.map((s) => s.ms);
console.log(`Mixed workload: ${samples.length} requests in ${SECONDS} s (${Math.round(samples.length / SECONDS)} req/s), p95 ${Math.round(percentile(all, 95))} ms, server errors ${samples.filter((s) => s.status >= 500).length}.`);
