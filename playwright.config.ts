import { defineConfig, devices } from "@playwright/test";

import { e2eDatabaseUrl } from "./scripts/e2e/database-url.mjs";
import { STUDENT_STATE } from "./tests/e2e/support";

const PORT = 3100;
const SERVICE_PORT = 4101;

/*
 * Cross-device matrix (docs/testing/test-strategy.md §8).
 * These are browser EMULATIONS: the real Chromium and WebKit engines with each device's viewport,
 * pixel density, touch input and mobile user agent. They are not physical devices; the manual
 * checklist in docs/testing/device-test-checklist.md covers real phones, tablets and computers.
 * WebKit stands in for every iOS and iPadOS browser (all of them use WebKit) and for macOS Safari.
 */
const matrix = [
  // Android phones (Samsung, Vivo and OnePlus phones use 360 to 412 CSS px widths)
  { name: "android-phone-360", device: "Galaxy S24" },
  { name: "android-phone-412", device: "Pixel 7" },
  { name: "android-phone-landscape", device: "Galaxy S24 landscape" },
  // iPhones (320 px: WCAG 1.4.10 reflow width and the smallest supported iPhone)
  { name: "iphone-320", device: "iPhone SE" },
  { name: "iphone-375", device: "iPhone SE (3rd gen)" },
  { name: "iphone-393", device: "iPhone 15" },
  { name: "iphone-landscape", device: "iPhone 15 landscape" },
  // Tablets in both orientations
  { name: "android-tablet-portrait", device: "Galaxy Tab S9" },
  { name: "android-tablet-landscape", device: "Galaxy Tab S9 landscape" },
  { name: "ipad-portrait", device: "iPad (gen 7)" },
  { name: "ipad-landscape", device: "iPad (gen 7) landscape" },
  // Desktops and laptops
  { name: "windows-chrome-1366", device: "Desktop Chrome", viewport: { width: 1366, height: 768 } },
  { name: "windows-edge-1920", device: "Desktop Edge", viewport: { width: 1920, height: 1080 } },
  { name: "macos-safari-1440", device: "Desktop Safari", viewport: { width: 1440, height: 900 } },
] as const;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Signs in once through the E2E-only test sign-in (tests/e2e/auth.setup.ts).
    { name: "auth-setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    ...matrix.map(({ name, device, ...overrides }) => ({
      name,
      dependencies: ["auth-setup"],
      use: { ...devices[device], ...overrides, storageState: STUDENT_STATE },
    })),
  ],
  webServer: [
    {
      // Serves the E2E build (`E2E_BUILD=1 next build`, output in .next-e2e), never the normal build.
      command: `npx next start -p ${PORT} -H 127.0.0.1`,
      // E2E-only identity settings (never on a deployment; config.ts refuses E2E_TEST_AUTH there).
      // The Google values are placeholders: no request ever reaches Google in these tests.
      env: {
        // Fixture isolation: E2E runs use their own database (scripts/e2e/prepare-db.mjs), never the
        // development one. Environment values take precedence over .env in `next start`.
        DATABASE_URL: e2eDatabaseUrl(),
        E2E_BUILD: "1",
        E2E_TEST_AUTH: "1",
        // Fictitious admin used by tests/e2e/societies.spec.ts (admin bootstrap, OI-09).
        ADMIN_EMAILS: "e2e.admin@thapar.edu",
        BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
        GOOGLE_CLIENT_ID: "e2e-test-client.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "e2e-test-client-secret",
        // The E2E background service below (uploads, notifications, realtime).
        SERVICE_URL: `http://127.0.0.1:${SERVICE_PORT}`,
        REALTIME_PUBLIC_URL: `ws://127.0.0.1:${SERVICE_PORT}/ws`,
      },
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Background service bound to the E2E database, so uploads are validated and approved in E2E.
      command: "npx tsx --conditions=react-server --env-file=.env src/service/main.ts",
      env: {
        DATABASE_URL: e2eDatabaseUrl(),
        SERVICE_PORT: String(SERVICE_PORT),
        BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
        // Keep the development origin allowed on the shared local bucket.
        STORAGE_CORS_EXTRA_ORIGINS: "http://localhost:3000",
        // Own key space on the shared local Valkey, apart from the development service.
        REALTIME_KEY_PREFIX: "rt-e2e:",
      },
      url: `http://127.0.0.1:${SERVICE_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
