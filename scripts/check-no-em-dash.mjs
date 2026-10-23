#!/usr/bin/env node
// Fails when any project text file (or a commit message) contains an em-dash in any form.
// Usage:
//   node scripts/check-no-em-dash.mjs                    scan tracked + untracked (non-ignored) files
//   node scripts/check-no-em-dash.mjs --commit-msg FILE  check one commit message file
//   node scripts/check-no-em-dash.mjs --stdin            check text piped on stdin (CI commit messages)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { findEmDashes, isBinary } from "./lib/em-dash.mjs";

function report(label, findings) {
  for (const f of findings) console.error(`${label}:${f.line}:${f.column}  ${f.kind}`);
}

function checkText(label, text) {
  const findings = findEmDashes(text);
  report(label, findings);
  return findings.length;
}

function listProjectFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

const args = process.argv.slice(2);
let problems = 0;

if (args[0] === "--commit-msg" && args[1]) {
  const message = readFileSync(args[1], "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("#"))
    .join("\n");
  problems = checkText("commit message", message);
} else if (args[0] === "--stdin") {
  problems = checkText("stdin", readFileSync(0, "utf8"));
} else {
  let scanned = 0;
  for (const file of listProjectFiles()) {
    let buffer;
    try {
      buffer = readFileSync(file);
    } catch {
      continue; // deleted in the working tree
    }
    if (isBinary(file, buffer)) continue;
    scanned += 1;
    problems += checkText(file, buffer.toString("utf8"));
  }
  if (problems === 0) console.log(`check:em-dash: ${scanned} text files scanned, no em-dashes found.`);
}

if (problems > 0) {
  console.error(`check:em-dash: ${problems} forbidden em-dash occurrence(s). Use a colon, comma, semicolon or parentheses.`);
  process.exit(1);
}
