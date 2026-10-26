import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { ADMIN_ROUTES, APP_ROUTES, completeTestProfile, E2E_STUDENT, openNavIfDrawer, SIGNED_OUT, testSignIn, usesDrawer } from "./support";

const SESSION_COOKIE = /better-auth\.session_token$/;
const CSP_VIOLATION = /Content Security Policy|Refused to (load|execute|apply)/i;

test.describe("signed-out access", () => {
  test.use({ storageState: SIGNED_OUT });

  test("every app page redirects to /login when signed out", async ({ page }) => {
    test.skip(!["windows-chrome-1366", "iphone-393"].includes(test.info().project.name), "Chromium and WebKit once each");
    for (const route of [...APP_ROUTES, ...ADMIN_ROUTES]) {
      await page.goto(route);
      await expect(page, route).toHaveURL(/\/login$/);
    }
  });

  test("the test sign-in still enforces @thapar.edu, verified email and hd", async ({ page, baseURL }) => {
    test.skip(test.info().project.name !== "windows-chrome-1366", "device-independent; runs once");
    for (const body of [
      { email: "someone@gmail.com", hd: "gmail.com" },
      { email: "unverified@thapar.edu", emailVerified: false },
      { email: "x@thapar.edu.evil.com", hd: "thapar.edu.evil.com" },
    ]) {
      await testSignIn(page.request, baseURL!, body);
      expect((await page.context().cookies()).some((c) => SESSION_COOKIE.test(c.name) && c.value !== ""), body.email).toBe(false);
    }
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sign-out ends the session on the server", async ({ page, baseURL }) => {
    test.skip(!["windows-chrome-1366", "iphone-393"].includes(test.info().project.name), "Chromium and WebKit once each");
    const signedIn = await testSignIn(page.request, baseURL!, { email: "sign.out@thapar.edu", name: "Sign Out Tester" });
    expect(signedIn.status(), "test sign-in").toBe(200);
    await completeTestProfile(page.request, baseURL!, "E2E000002");
    await page.goto("/");
    await openNavIfDrawer(page);
    const scope = usesDrawer(page) ? page.getByRole("dialog", { name: "Navigation" }) : page.getByRole("complementary", { name: "Sidebar" });
    await expect(scope.getByText("sign.out@thapar.edu")).toBeVisible();
    await scope.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/events");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("first-time profile (FR-AUTH-2)", () => {
  test.use({ storageState: SIGNED_OUT });

  test("a new user must complete the profile before using the app", async ({ page, baseURL }) => {
    test.skip(!["windows-chrome-1366", "iphone-375", "android-phone-360"].includes(test.info().project.name), "one desktop, WebKit phone and Chromium phone");
    // A fresh fictitious user per run and device (the local database keeps earlier runs).
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10);
    const email = `new.student.${unique}@thapar.edu`;
    const signedIn = await testSignIn(page.request, baseURL!, { email, name: "New Student" });
    expect(signedIn.status(), "test sign-in").toBe(200);

    for (const route of ["/", "/events"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/onboarding$/);
    }
    await expect(page.getByRole("heading", { level: 1, name: "Complete your profile" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("New Student");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    await page.getByLabel("Roll number").fill(`R${unique}`);
    await page.getByLabel("Branch").selectOption({ label: "Computer Engineering" });
    await page.getByLabel("Year of study").selectOption({ label: "Year 2" });
    await page.getByText("Python", { exact: true }).click();
    await page.getByText("Robotics", { exact: true }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Choose at least 3 tags.")).toBeVisible();

    await page.getByText("UI/UX Design", { exact: true }).click();
    await expect(page.getByText("3 selected. Choose 3 to 10.")).toBeVisible();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/$/);
    await openNavIfDrawer(page);
    const scope = usesDrawer(page) ? page.getByRole("dialog", { name: "Navigation" }) : page.getByRole("complementary", { name: "Sidebar" });
    await expect(scope.getByText(email)).toBeVisible();
    // OI-27: the roll number is never sent back to the browser after it is saved.
    for (const route of ["/", "/mates", "/api/identity/me"]) {
      const response = await page.request.get(route);
      expect((await response.text()).toUpperCase(), route).not.toContain(`R${unique}`);
    }
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/$/); // completed profiles are not shown the form again
  });

  test("the onboarding page requires a session", async ({ page }) => {
    test.skip(test.info().project.name !== "windows-chrome-1366", "device-independent; runs once");
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("signed-in session", () => {
  test("shows the signed-in user and keeps the session cookie HttpOnly and SameSite=Lax", async ({ page, context }) => {
    await page.goto("/");
    await openNavIfDrawer(page);
    const scope = usesDrawer(page) ? page.getByRole("dialog", { name: "Navigation" }) : page.getByRole("complementary", { name: "Sidebar" });
    await expect(scope.getByText(E2E_STUDENT.email)).toBeVisible();
    const cookie = (await context.cookies()).find((c) => SESSION_COOKIE.test(c.name));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/session_token/);
  });

  test("pages carry a nonce-based CSP and render without CSP violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (CSP_VIOLATION.test(message.text())) violations.push(message.text());
    });
    const response = await page.goto("/");
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toMatch(/style-src 'self' 'nonce-[A-Za-z0-9+/=]+';/); // <style> elements need the nonce
    // Interactivity proves hydrated scripts ran under the nonce.
    if (usesDrawer(page)) {
      await openNavIfDrawer(page);
      await page.keyboard.press("Escape");
    }
    await page.goto("/mates");
    await page.goto("/login"); // signed in: redirected back to /
    await expect(page).toHaveURL(/\/$/);
    expect(violations).toEqual([]);
  });
});
