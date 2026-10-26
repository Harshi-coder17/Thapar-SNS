// Module-boundary rules (docs/architecture/modules.md §2, ADR-0001).
// Shared by eslint.config.mjs and the boundary rule tests in tests/lint/.

/** Architectural elements, classified by path. The first matching element wins. */
export const boundaryElements = [
  { type: "app", pattern: "src/app" },
  // Next.js requires the proxy as a single file (src/proxy.ts). Element patterns match folders only;
  // `mode: "file"` is deprecated in eslint-plugin-boundaries 7 but is the only way to keep this file
  // classified (and its imports checked). Revisit when upgrading to the plugin's next major version.
  { type: "proxy", pattern: "src/proxy.ts", mode: "file" },
  { type: "module", pattern: "src/modules/*", capture: ["moduleName"] },
  { type: "shared-db", pattern: "src/shared/db" },
  { type: "shared", pattern: "src/shared" },
  { type: "service-realtime", pattern: "src/service/realtime" },
  { type: "service-workers", pattern: "src/service/workers" },
  { type: "service", pattern: "src/service" },
  { type: "generated", pattern: "src/generated" },
];

const allowTo = (from, to) => ({ from: { element: from }, allow: { to } });
const elementTypes = (...types) => ({ element: { types: { anyOf: types } } });
const moduleEntry = { element: { type: "module", fileInternalPath: "index.ts" } };
/** E2E-only module entry points (e2e.ts); only `*.e2e.ts` routes may use them (eslint.config.mjs). */
const moduleE2eEntry = { element: { type: "module", fileInternalPath: "e2e.ts" } };
const sameModule = { element: { type: "module", captured: { moduleName: "{{from.element.captured.moduleName}}" } } };

/** Dependency policies. Default is disallow; the last matching policy wins. */
export const boundaryPolicies = [
  // Third-party packages and Node built-ins are allowed by default; specific bans follow below.
  { allow: { to: { module: { origin: "external" } } } },
  { allow: { to: { module: { origin: "core" } } } },

  // The request proxy (src/proxy.ts): shared code and module public interfaces only.
  allowTo({ type: "proxy" }, elementTypes("shared")),
  allowTo({ type: "proxy" }, moduleEntry),

  // Next.js routes: shared code and module public interfaces (index.ts) only.
  allowTo({ type: "app" }, elementTypes("app", "shared", "shared-db")),
  allowTo({ type: "app" }, moduleEntry),
  allowTo({ type: "app" }, moduleE2eEntry),

  // Modules: shared code, their own internals, other modules' index.ts only.
  allowTo({ type: "module" }, elementTypes("shared", "shared-db")),
  allowTo({ type: "module" }, sameModule),
  allowTo({ type: "module" }, moduleEntry),

  // Shared code never depends on modules, app or service code.
  allowTo({ type: "shared" }, elementTypes("shared", "shared-db")),
  // Only the database layer may import the generated Prisma client.
  allowTo({ type: "shared-db" }, elementTypes("shared", "shared-db", "generated")),

  // Service: workers may use modules (index.ts) and the DB layer.
  allowTo({ type: "service-workers" }, elementTypes("shared", "shared-db", "service", "service-workers")),
  allowTo({ type: "service-workers" }, moduleEntry),
  allowTo({ type: "service" }, elementTypes("shared", "service", "service-realtime", "service-workers")),

  // Realtime has no database access (spec §4.8): shared code and service utilities only.
  allowTo({ type: "service-realtime" }, elementTypes("shared", "service", "service-realtime")),
  ...["pg", "pg/**", "@prisma/**"].map((source) => ({
    from: { element: { type: "service-realtime" } },
    disallow: { to: { module: { origin: "external", source } } },
    message: "The realtime layer must not access the database (spec §4.8).",
  })),
];

/** Flat-config entry applying the boundary rules to `files`. */
export function boundariesConfig({ files, tsconfigProject, plugin }) {
  return {
    files,
    plugins: { boundaries: plugin },
    settings: {
      "boundaries/elements": boundaryElements,
      "import/resolver": { typescript: { alwaysTryTypes: true, project: tsconfigProject } },
    },
    rules: {
      "boundaries/dependencies": [2, { default: "disallow", checkAllOrigins: true, policies: boundaryPolicies }],
      "boundaries/no-unknown-files": 2,
    },
  };
}
