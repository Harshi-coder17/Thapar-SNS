import type { ESLint, Linter } from "eslint";

export declare const boundaryElements: ReadonlyArray<Record<string, unknown>>;
export declare const boundaryPolicies: ReadonlyArray<Record<string, unknown>>;
export declare function boundariesConfig(options: {
  files: string[];
  tsconfigProject: string;
  plugin: ESLint.Plugin;
}): Linter.Config;
