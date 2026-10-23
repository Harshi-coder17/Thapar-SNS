import path from "node:path";

import { ESLint } from "eslint";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { boundariesConfig } from "../../eslint/boundaries.mjs";

// Fixture layout mirrors src/. Files named ok-* must be clean; bad-* must report exactly one
// boundaries/dependencies error. See tests/fixtures/boundaries/README.md.
const fixtureRoot = path.join(import.meta.dirname, "../fixtures/boundaries");

let results: Map<string, ESLint.LintResult>;

beforeAll(async () => {
  const eslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser } },
      boundariesConfig({
        files: ["src/**/*.ts"],
        tsconfigProject: path.join(fixtureRoot, "tsconfig.json"),
        plugin: boundaries,
      }),
    ],
  });
  const lintResults = await eslint.lintFiles(["src/**/*.ts"]);
  results = new Map(lintResults.map((r) => [path.relative(fixtureRoot, r.filePath).split(path.sep).join("/"), r]));
});

function messagesFor(file: string) {
  const result = results.get(file);
  if (!result) throw new Error(`Fixture not linted: ${file}`);
  return result.messages;
}

describe("module boundary rules", () => {
  it("lints every fixture file", () => {
    expect(results.size).toBeGreaterThanOrEqual(20);
  });

  it.each([
    "src/modules/alpha/ok-uses-own-internal-and-beta-index.ts",
    "src/modules/beta/ok-uses-external-package.ts",
    "src/service/realtime/ok-uses-shared.ts",
    "src/service/realtime/ok-uses-core-and-external.ts",
    "src/service/workers/ok-uses-db-and-module.ts",
    "src/app/ok-page.ts",
    "src/modules/alpha/index.ts",
    "src/shared/helper.ts",
  ])("allows %s", (file) => {
    expect(messagesFor(file)).toEqual([]);
  });

  it.each([
    ["src/modules/alpha/bad-deep-import-into-beta.ts", "module deep-imports another module"],
    ["src/modules/alpha/bad-relative-deep-import-into-beta.ts", "module deep-imports another module via a relative path"],
    ["src/shared/bad-imports-module.ts", "shared code imports a module"],
    ["src/service/realtime/bad-imports-db.ts", "realtime imports the database layer"],
    ["src/service/realtime/bad-imports-pg.ts", "realtime imports the pg driver"],
    ["src/service/realtime/bad-imports-prisma-client.ts", "realtime imports the Prisma client"],
    ["src/service/realtime/bad-imports-prisma-adapter.ts", "realtime imports the Prisma pg adapter"],
    ["src/app/bad-page-deep-import.ts", "a route deep-imports module internals"],
  ])("rejects %s (%s)", (file) => {
    const messages = messagesFor(file);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("boundaries/dependencies");
  });
});
