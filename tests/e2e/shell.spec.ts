import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { primaryNav } from "../../src/shared/layout/nav";

import { EM_DASH, isPublicRoute, mainNav, openNavIfDrawer, ROUTES, SIGNED_OUT, usesDrawer } from "./support";

test.describe("static app shell", () => {
  for (const route of ROUTES) {
    test.describe(route, () => {
      if (isPublicRoute(route)) test.use({ storageState: SIGNED_OUT });

      test(`${route} renders without em-dashes or serious accessibility violations`, async ({ page }) => {
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.locator("body").innerText()).not.toContain(EM_DASH);
        expect(await page.title()).not.toContain(EM_DASH);

        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });
    });
  }

  test("highlights exactly the current section in the navigation", async ({ page }) => {
    for (const item of primaryNav) {
      await page.goto(item.href);
      await openNavIfDrawer(page);
      const current = mainNav(page).locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(item.label);
    }
  });

  test("navigates between modules from the sidebar or drawer", async ({ page }) => {
    await page.goto("/");
    await openNavIfDrawer(page);
    await mainNav(page).getByRole("link", { name: "Find Mates" }).click();
    await expect(page).toHaveURL(/\/mates$/);
    await expect(page.getByRole("heading", { level: 1, name: "Find Mates" })).toBeVisible();
    if (usesDrawer(page)) await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("shows the TIET logo and the unofficial project note", async ({ page }) => {
    await page.goto("/");
    const region = usesDrawer(page) ? page.getByRole("banner") : page.getByRole("complementary", { name: "Sidebar" });
    await expect(region.getByAltText("TIET logo")).toBeVisible();
    await expect(region.getByText("Unofficial student project")).toBeVisible();
  });

  test.describe("login page", () => {
    test.use({ storageState: SIGNED_OUT });

    test("offers Google sign-in and states the @thapar.edu rule", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
      await expect(page.getByText("Only @thapar.edu accounts are allowed.")).toBeVisible();
      await expect(page.getByText(/Not affiliated with or endorsed by Thapar Institute/)).toBeVisible();
    });

    test("explains a rejected sign-in without revealing internals", async ({ page }) => {
      // Next.js also renders an empty route-announcer alert, so match the alert that has text.
      const alert = page.getByRole("alert").filter({ hasText: /\S/ });
      await page.goto("/login?error=unable_to_create_user");
      await expect(alert).toHaveText("Sign in with your verified @thapar.edu Google account.");
      await page.goto("/login?error=<script>alert(1)</script>");
      await expect(alert).toHaveText("Sign-in failed. Please try again.");
    });
  });

  test("unknown routes return 404 without internal details", async ({ page }) => {
    const response = await page.goto("/messages");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/at \w+ \(|node_modules|\.tsx?:\d+/);
  });

  test("the drawer closes with Escape and returns focus to the menu button", async ({ page }) => {
    test.skip(!usesDrawer(page), "drawer layouts only");
    await page.goto("/");
    const menu = page.getByRole("button", { name: "Open navigation" });
    await menu.click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(menu).toBeFocused();
  });
});
