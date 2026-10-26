import { expect, test } from "@playwright/test";

import { isPublicRoute, openNavIfDrawer, ROUTES, SIGNED_OUT, usesDrawer } from "./support";

// Cross-device layout checks, run in every emulated device project (playwright.config.ts).
const MIN_TOUCH_TARGET = 44; // CSS px: Apple HIG 44 pt; above WCAG 2.2 AA 2.5.8 minimum of 24.
const MIN_FONT_PX = 12;

test.describe("responsive layout", () => {
  for (const route of ROUTES) {
    test.describe(`${route} layout`, () => {
      if (isPublicRoute(route)) test.use({ storageState: SIGNED_OUT });

      test(`${route} has no horizontal scrolling and readable text`, async ({ page }) => {
        await page.goto(route);
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scrollWidth, "page is wider than the viewport").toBeLessThanOrEqual(innerWidth);

        const smallest = await page.evaluate(() => {
          let min = Infinity;
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const element = node.parentElement;
            if (!element || !node.textContent?.trim()) continue;
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            if (style.visibility === "hidden" || box.width === 0 || element.closest(".sr-only")) continue;
            min = Math.min(min, parseFloat(style.fontSize));
          }
          return min;
        });
        expect(smallest).toBeGreaterThanOrEqual(MIN_FONT_PX);
      });
    });
  }

  test("pinch zoom is not disabled", async ({ page }) => {
    await page.goto("/");
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport).toContain("width=device-width");
    expect(viewport ?? "").not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/);
  });

  for (const route of ROUTES) {
    test.describe(`${route} targets`, () => {
      if (isPublicRoute(route)) test.use({ storageState: SIGNED_OUT });

      test(`${route} links and buttons are large enough to tap`, async ({ page }) => {
        await page.goto(route);
        // Pages outside the app shell (e.g. /login) have no navigation drawer to open.
        const hasDrawer = usesDrawer(page) && (await page.getByRole("button", { name: "Open navigation" }).count()) > 0;
        if (hasDrawer) await openNavIfDrawer(page);
        const scope = hasDrawer ? page.getByRole("dialog", { name: "Navigation" }) : page.locator("body");
        const controls = await scope.locator("a[href], button").all();
        expect(controls.length).toBeGreaterThan(0);
        for (const control of controls) {
          // Skip controls that are not rendered or are visually hidden until focused (the skip link,
          // which is measured separately in its focused state below).
          if (!(await control.isVisible())) continue;
          const visuallyHidden = await control.evaluate((el) => getComputedStyle(el).clipPath.startsWith("inset(50%"));
          if (visuallyHidden) continue;
          const box = await control.boundingBox();
          const label = (await control.getAttribute("aria-label")) ?? (await control.innerText()).trim();
          expect(box?.height, `height of "${label}"`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
          expect(box?.width, `width of "${label}"`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        }
      });
    });
  }

  test("every navigation item stays reachable on short screens", async ({ page }) => {
    await page.goto("/");
    await openNavIfDrawer(page);
    const scope = usesDrawer(page) ? page.getByRole("dialog", { name: "Navigation" }) : page.getByRole("complementary", { name: "Sidebar" });
    // The sign-out button is the last control in the menu.
    const last = scope.getByRole("button", { name: "Sign out" });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });

  test("layout switches between drawer and sidebar when the device rotates", async ({ page }) => {
    const size = page.viewportSize();
    test.skip(!size || Math.max(size.width, size.height) < 1024, "only devices whose long side reaches the sidebar breakpoint");
    await page.goto("/");
    const sidebar = page.getByRole("complementary", { name: "Sidebar" });
    const menu = page.getByRole("button", { name: "Open navigation" });
    for (const [width, height] of [[size!.width, size!.height], [size!.height, size!.width]]) {
      await page.setViewportSize({ width: width!, height: height! });
      if (width! >= 1024) {
        await expect(sidebar).toBeVisible();
        await expect(menu).toBeHidden();
      } else {
        await expect(sidebar).toBeHidden();
        await expect(menu).toBeVisible();
      }
    }
  });

  test("keyboard users can skip to the main content", async ({ page, browserName }) => {
    test.skip(usesDrawer(page), "hardware-keyboard check on sidebar layouts");
    // WebKit only moves Tab focus to links when "tab to links" is enabled; use Alt+Tab there.
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await page.goto("/");
    await page.keyboard.press(tab);
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    const box = await skip.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});
