#!/usr/bin/env node
// ADR-0008 pinning policy: every direct dependency is an exact, stable version, and the
// lockfile resolves it to that same version. Prerelease versions in transitive dependencies
// are listed for review but do not fail the check.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const EXACT_STABLE = /^\d+\.\d+\.\d+$/;

const errors = [];
const direct = { ...pkg.dependencies, ...pkg.devDependencies };
for (const [name, spec] of Object.entries(direct)) {
  if (!EXACT_STABLE.test(spec)) errors.push(`${name}: "${spec}" is not an exact stable version`);
  const locked = lock.packages?.[`node_modules/${name}`]?.version;
  if (locked !== spec) errors.push(`${name}: package.json pins ${spec} but the lockfile resolves ${locked ?? "nothing"}`);
}

const transitivePrereleases = Object.entries(lock.packages ?? {})
  .filter(([path, info]) => path && info.version && info.version.includes("-"))
  .map(([path, info]) => `${path.replace(/^.*node_modules\//, "")}@${info.version}`);

if (transitivePrereleases.length > 0) {
  console.log(`check:prerelease: ${transitivePrereleases.length} transitive prerelease version(s) for review:`);
  for (const entry of transitivePrereleases) console.log(`  ${entry}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`check:prerelease: ${error}`);
  process.exit(1);
}
console.log(`check:prerelease: ${Object.keys(direct).length} direct dependencies pinned to exact stable versions and locked.`);
