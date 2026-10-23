// Project rule (CLAUDE.md rule 10): the em-dash character (U+2014) is forbidden everywhere.
// Patterns are assembled from code points so this file never contains the forbidden forms itself.

const EM_DASH = String.fromCodePoint(0x2014);
const BACKSLASH = String.fromCodePoint(0x5c);

/** Forbidden forms: the literal character, JS/CSS escapes, and HTML entities that render it. */
export const FORBIDDEN_PATTERNS = [
  { kind: "literal em-dash", regex: new RegExp(EM_DASH, "g") },
  { kind: "unicode escape", regex: new RegExp(`${BACKSLASH}${BACKSLASH}u${BACKSLASH}{?0*2014${BACKSLASH}}?`, "gi") },
  { kind: "css escape", regex: new RegExp(`${BACKSLASH}${BACKSLASH}0*2014(?![0-9a-f])`, "gi") },
  { kind: "html entity", regex: new RegExp(["&", "mdash;"].join(""), "gi") },
  { kind: "html decimal entity", regex: new RegExp(["&#", "0*8212;"].join(""), "g") },
  { kind: "html hex entity", regex: new RegExp(["&#x", "0*2014;"].join(""), "gi") },
];

/** Returns every forbidden occurrence with 1-based line and column numbers. */
export function findEmDashes(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { kind, regex } of FORBIDDEN_PATTERNS) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        findings.push({ line: index + 1, column: match.index + 1, kind });
      }
    }
  });
  return findings;
}

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".avif", ".pdf",
  ".woff", ".woff2", ".ttf", ".otf", ".zip", ".gz", ".tgz", ".mp4", ".webm",
]);

/** True when a file should not be scanned as text (by extension or a NUL byte in the first 8 KB). */
export function isBinary(filePath, buffer) {
  const dot = filePath.lastIndexOf(".");
  if (dot !== -1 && BINARY_EXTENSIONS.has(filePath.slice(dot).toLowerCase())) return true;
  return buffer.subarray(0, 8192).includes(0);
}
