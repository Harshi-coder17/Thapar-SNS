// ESLint 10 flat config.
// eslint-config-next 16.4.2 is not used: three of its bundled plugins (react, import, jsx-a11y)
// declare ESLint <= 9 peer ranges and npm installs them only by overriding peers.
// React rules come from @eslint-react/eslint-plugin instead (OI-44, approved 2026-10-23).
// See docs/decisions/ADR-0008-version-baseline.md.
import eslintReact from "@eslint-react/eslint-plugin";
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import { boundariesConfig } from "./eslint/boundaries.mjs";

// eslint-react ships ports of the React Hooks rules. The official eslint-plugin-react-hooks stays the
// authority for those, so the eslint-react copies are switched off. The overlap is derived from
// eslint-react's own conflict preset (react-hooks/<name> -> @eslint-react/<name>), so new
// overlapping rules in later versions are excluded automatically.
const reactRecommended = eslintReact.configs["recommended-typescript"];
const hooksOverlap = Object.keys(eslintReact.configs["disable-conflict-eslint-plugin-react-hooks"].rules)
  .map((rule) => rule.replace(/^react-hooks\//, "@eslint-react/"))
  .filter((rule) => rule in reactRecommended.rules);

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "src/generated/**", "coverage/**", "playwright-report/**", "test-results/**", "tests/fixtures/**", "spikes/auth/generated/**", "next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Threat model §3: raw SQL only through tagged templates.
      "no-restricted-properties": [
        "error",
        { property: "$queryRawUnsafe", message: "Use the $queryRaw tagged template (threat model §3)." },
        { property: "$executeRawUnsafe", message: "Use the $executeRaw tagged template (threat model §3)." },
      ],
    },
  },
  {
    ...reactRecommended,
    files: ["**/*.tsx"],
    rules: { ...reactRecommended.rules, ...Object.fromEntries(hooksOverlap.map((rule) => [rule, "off"])) },
  },
  boundariesConfig({ files: ["src/**/*.{ts,tsx}"], tsconfigProject: "./tsconfig.json", plugin: boundaries }),
);
