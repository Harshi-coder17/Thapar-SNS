import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import pg from "pg";

import { e2eDatabaseUrl } from "../../scripts/e2e/database-url.mjs";
import { completeTestProfile, SIGNED_OUT, testSignIn } from "./support";

// Session policy (docs/auth/session-policy.md). Waiting 30 minutes is not practical, so these tests
// move a session's last-activity time back in the isolated E2E database and check what the user sees.
const DESKTOP = ["windows-chrome-1366"];
const PHONE = ["iphone-393"];
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);

async function signedInPage(browser: Browser, baseURL: string, email: string, rollNumber: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...test.info().project.use, storageState: SIGNED_OUT });
  expect((await testSignIn(context.request, baseURL, { email, name: email.split("@")[0]!.replace(/\./g, " ") })).status()).toBe(200);
  await completeTestProfile(context.request, baseURL, rollNumber);
  return { context, page: await context.newPage() };
}

async function setLastActivity(email: string, minutesAgo: number): Promise<void> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query(`UPDATE identity_sessions SET "lastActiveAt" = now() - make_interval(secs => $2::double precision * 60) WHERE "userId" = (SELECT id FROM identity_users WHERE email = $1)`, [email, minutesAgo]);
  } finally {
    await client.end();
  }
}

/** Makes the page re-read its session status now (as it does when a tab becomes visible again). */
const recheck = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

test.describe("session expiry", () => {
  test.use({ storageState: SIGNED_OUT });

  test("desktop: warns before the 30-minute inactivity limit, and 'Stay signed in' keeps the session", async ({ browser, baseURL }) => {
    test.skip(!DESKTOP.includes(test.info().project.name), "desktop policy");
    const id = unique();
    const email = `sess.warn.${id}@thapar.edu`;
    const { context, page } = await signedInPage(browser, baseURL!, email, `SW${id}`);
    // Wait for the page's own first activity ping, so it cannot overwrite the time set below.
    const firstPing = page.waitForResponse((r) => r.url().endsWith("/api/identity/activity"));
    await page.goto("/events");
    await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
    await firstPing;
    await setLastActivity(email, 28.5);
    await recheck(page);
    const warning = page.getByRole("alertdialog", { name: "Are you still there?" });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/signed out in \d:\d\d/);
    await warning.getByRole("button", { name: "Stay signed in" }).click();
    await expect(warning).toBeHidden();
    expect((await context.request.get("/api/identity/session")).status()).toBe(200);
    await context.close();
  });

  test("desktop: after 30 minutes without activity the session ends and the login page explains why", async ({ browser, baseURL }) => {
    test.skip(!DESKTOP.includes(test.info().project.name), "desktop policy");
    const id = unique();
    const email = `sess.idle.${id}@thapar.edu`;
    const { context, page } = await signedInPage(browser, baseURL!, email, `SI${id}`);
    // Wait for the page's own first activity ping, so it cannot overwrite the time set below.
    const firstPing = page.waitForResponse((r) => r.url().endsWith("/api/identity/activity"));
    await page.goto("/events");
    await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
    await firstPing;
    await setLastActivity(email, 31);
    // An open tab notices on its own (here: the visibility re-check) ...
    await recheck(page);
    await expect(page).toHaveURL(/\/login\?reason=expired/);
    await expect(page.getByText(/You were signed out for your security/)).toBeVisible();
    // ... and the server refuses the ended session everywhere.
    expect((await context.request.get("/api/notifications")).status()).toBe(401);
    await page.goto("/events");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("desktop: a page request with an ended session goes to the login page with the explanation", async ({ browser, baseURL }) => {
    test.skip(!DESKTOP.includes(test.info().project.name), "desktop policy");
    const id = unique();
    const email = `sess.page.${id}@thapar.edu`;
    const { context, page } = await signedInPage(browser, baseURL!, email, `SP${id}`);
    await setLastActivity(email, 45);
    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/login\?reason=expired/);
    await context.close();
  });

  test("phone: the sign-in persists through hours without activity", async ({ browser, baseURL }) => {
    test.skip(!PHONE.includes(test.info().project.name), "mobile policy");
    const id = unique();
    const email = `sess.phone.${id}@thapar.edu`;
    const { context, page } = await signedInPage(browser, baseURL!, email, `SM${id}`);
    await setLastActivity(email, 120);
    await page.goto("/events");
    await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
    const status = (await (await context.request.get("/api/identity/session")).json()) as { deviceClass: string };
    expect(status.deviceClass).toBe("mobile");
    await context.close();
  });
});
