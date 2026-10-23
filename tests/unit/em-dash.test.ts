import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findEmDashes, isBinary } from "../../scripts/lib/em-dash.mjs";

// Test inputs are built from code points so this file stays free of the forbidden forms.
const EM = String.fromCodePoint(0x2014);
const BS = String.fromCodePoint(0x5c);
const AMP = "&";

describe("findEmDashes", () => {
  it.each([
    ["literal character", `Title ${EM} subtitle`, "literal em-dash"],
    ["JS unicode escape", `const s = "${BS}u2014";`, "unicode escape"],
    ["JS code point escape", `const s = "${BS}u{2014}";`, "unicode escape"],
    ["CSS escape", `content: "${BS}2014";`, "css escape"],
    ["named HTML entity", `<p>a ${AMP}mdash; b</p>`, "html entity"],
    ["decimal HTML entity", `<p>a ${AMP}#8212; b</p>`, "html decimal entity"],
    ["hex HTML entity", `<p>a ${AMP}#x2014; b</p>`, "html hex entity"],
  ])("detects a %s", (_label, text, kind) => {
    const findings = findEmDashes(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe(kind);
  });

  it("reports line and column", () => {
    expect(findEmDashes(`ok\nab${EM}`)).toEqual([{ line: 2, column: 3, kind: "literal em-dash" }]);
  });

  it.each([
    ["hyphen", "well-known"],
    ["en dash", `pages 2${String.fromCodePoint(0x2013)}5`],
    ["colon and parentheses", "Slice 1a: skeleton (static)"],
    ["other unicode escape", `"${BS}u2013"`],
    ["unrelated CSS escape", `content: "${BS}20140";`],
  ])("allows %s", (_label, text) => {
    expect(findEmDashes(text)).toEqual([]);
  });
});

describe("isBinary", () => {
  it("skips binary extensions and NUL-containing buffers", () => {
    expect(isBinary("logo.png", Buffer.from("text"))).toBe(true);
    expect(isBinary("data.bin", Buffer.from([0x61, 0x00, 0x62]))).toBe(true);
    expect(isBinary("README.md", Buffer.from("text"))).toBe(false);
  });
});

describe("commit-msg hook", () => {
  const hook = path.join(import.meta.dirname, "../../.githooks/commit-msg");
  const dir = mkdtempSync(path.join(tmpdir(), "commit-msg-"));

  function runHook(message: string) {
    const file = path.join(dir, `msg-${Math.random().toString(36).slice(2)}`);
    writeFileSync(file, message);
    try {
      execFileSync("sh", [hook, file], { stdio: "pipe" });
      return 0;
    } catch (error) {
      return (error as { status: number }).status;
    }
  }

  it("accepts a clean message", () => {
    expect(runHook("feat(platform): add app shell\n")).toBe(0);
  });

  it("rejects a message containing an em-dash", () => {
    expect(runHook(`feat(platform): add shell ${EM} static\n`)).toBe(1);
  });

  it("ignores git comment lines", () => {
    expect(runHook(`feat: ok\n# ${EM} comment from git template\n`)).toBe(0);
  });
});
