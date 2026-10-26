#!/usr/bin/env node
// Proves that a normal (production) build contains no E2E test sign-in (OI-53). Run after
// `next build` (npm run check:build). Checks:
//   1. no server or client file contains the test sign-in code, the test Google-key support or a
//      /api/test-auth route (marker strings are checked to still exist in the source);
//   2. the build-time E2E flag was inlined, so the runtime environment cannot change it;
//   3. a server started from this build with every E2E variable set still answers 404, and Google
//      ID-token sign-in still yields no session.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const BUILD = ".next";
const PORT = 3199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const failures = [];

if (!existsSync(path.join(BUILD, "BUILD_ID"))) {
  console.error("check-e2e-excluded: no normal build found; run `next build` first");
  process.exit(1);
}

// The markers must still exist in the source; otherwise this check would pass vacuously.
const MARKERS = {
  "src/modules/identity/test-sign-in.ts": "thapar-sns-e2e-test-sign-in",
  "src/modules/identity/test-google.ts": "thapar-sns-e2e-test-google-key",
};
for (const [source, marker] of Object.entries(MARKERS)) {
  if (!readFileSync(source, "utf8").includes(marker)) failures.push(`marker "${marker}" missing from ${source}; update this script`);
}

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|json|mjs|cjs|txt)$/.test(entry)) files.push(full);
  }
};
walk(path.join(BUILD, "server"));
walk(path.join(BUILD, "static"));
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (text.includes("thapar-sns-e2e-test-sign-in")) failures.push(`test sign-in code found in ${file}`);
  if (text.includes("thapar-sns-e2e-test-google-key") || text.includes("test Google keys are not installed")) failures.push(`test Google-key support found in ${file}`);
  if (text.includes("/api/test-auth")) failures.push(`test-auth route found in ${file}`);
  if (text.includes("process.env.THAPAR_E2E_BUILD")) failures.push(`THAPAR_E2E_BUILD not inlined in ${file}`);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
  env: {
    ...process.env,
    E2E_TEST_AUTH: "1",
    E2E_BUILD: "", // a normal build is being checked
    THAPAR_E2E_BUILD: "1", // must have no effect: the build-time value wins
    BETTER_AUTH_URL: ORIGIN,
    BETTER_AUTH_SECRET: "check-e2e-excluded-not-a-real-secret-0123456789",
    AUTH_ALLOWED_EMAIL_DOMAIN: "thapar.edu",
    GOOGLE_CLIENT_ID: "check-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "check-client-secret",
  },
  stdio: "ignore",
});

try {
  let up = false;
  for (let attempt = 0; attempt < 60 && !up; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    up = await fetch(`${ORIGIN}/login`).then(() => true, () => false);
  }
  if (!up) failures.push("server did not start");
  else {
    const headers = { origin: ORIGIN, "content-type": "application/json" };
    const testAuth = await fetch(`${ORIGIN}/api/test-auth/sign-in`, { method: "POST", headers, body: JSON.stringify({ email: "x@thapar.edu" }) });
    if (testAuth.status !== 404) failures.push(`/api/test-auth/sign-in answered ${testAuth.status}, expected 404`);
    if (testAuth.headers.get("x-test-sign-in")) failures.push("test sign-in marker header present");
    const idToken = await fetch(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers,
      body: JSON.stringify({ provider: "google", idToken: { token: "eyJhbGciOiJSUzI1NiJ9.e30.x" } }),
    });
    if (idToken.headers.getSetCookie().some((c) => /session_token=[^;]/.test(c))) failures.push("ID-token sign-in produced a session");
  }
} finally {
  server.kill("SIGTERM");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`check-e2e-excluded: ${failure}`);
  process.exit(1);
}
console.log(`check-e2e-excluded: ${files.length} server and client files scanned; test sign-in absent and unreachable in the normal build.`);
