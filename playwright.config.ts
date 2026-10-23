import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

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
  projects: matrix.map(({ name, device, ...overrides }) => ({
    name,
    use: { ...devices[device], ...overrides },
  })),
  webServer: {
    command: `npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
