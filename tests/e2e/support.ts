import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

import { adminNav, primaryNav, secondaryNav } from "../../src/shared/layout/nav";

/** App routes every signed-in student may open, admin-only routes (404 for students), public routes. */
export const APP_ROUTES = [...primaryNav, ...secondaryNav].map((item) => item.href);
export const ADMIN_ROUTES = adminNav.map((item) => item.href);
export const PUBLIC_ROUTES = ["/login"];
export const ROUTES = [...APP_ROUTES, ...PUBLIC_ROUTES];
export const isPublicRoute = (route: string) => PUBLIC_ROUTES.includes(route);

/** Saved session of the E2E student (written by auth.setup.ts) and an empty, signed-out state. */
export const STUDENT_STATE = "playwright/.auth/student.json";
export const SIGNED_OUT = { cookies: [], origins: [] };
export const E2E_STUDENT = { email: "e2e.student@thapar.edu", name: "E2E Student" };

/** Built from a code point so test files stay free of the forbidden character (CLAUDE.md rule 10). */
export const EM_DASH = String.fromCodePoint(0x2014);

/** The sidebar is replaced by a drawer below the Tailwind `lg` breakpoint (1024 px). */
export const usesDrawer = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

export async function openNavIfDrawer(page: Page) {
  if (!usesDrawer(page)) return;
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
}

/** The navigation region currently in use (sidebar, or the open drawer). */
export const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" }).last();

/**
 * Completes the signed-in user's profile (FR-AUTH-2); a profile completed by an earlier run is fine.
 * Like testSignIn below, each call uses its own test client address, so the real per-address limit
 * on this endpoint (30 per minute) is not shared by every simulated user of a run.
 */
export async function completeTestProfile(request: APIRequestContext, baseURL: string, rollNumber: string) {
  const response = await request.post("/api/identity/profile", {
    headers: { origin: baseURL, "x-forwarded-for": nextTestAddress() },
    data: { name: "E2E Student", rollNumber, branchCode: "COE", year: 2, tags: ["python", "web-development", "machine-learning"] },
  });
  expect([200, 409], await response.text()).toContain(response.status());
}

let ipCounter = 0;
/** A documentation-range client address, unique per call and per Playwright worker. */
function nextTestAddress(): string {
  ipCounter += 1;
  return `10.${test.info().workerIndex % 250}.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}
/**
 * Signs in through the E2E-only test sign-in (src/modules/identity/test-sign-in.ts), which uses
 * Better Auth's real ID-token path and its real rate limit (10 sign-ins per address per minute).
 * Each call uses its own documentation-range client address, unique per Playwright worker, so
 * parallel workers do not share one rate-limit bucket.
 */
export async function testSignIn(request: APIRequestContext, baseURL: string, body: Record<string, unknown> = E2E_STUDENT) {
  return request.post("/api/test-auth/sign-in", {
    headers: { origin: baseURL, "x-forwarded-for": nextTestAddress() },
    data: body,
  });
}
