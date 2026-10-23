import { expect, type Page } from "@playwright/test";

import { allNav } from "../../src/shared/layout/nav";

/** Every static route in the Slice 1a shell. */
export const ROUTES = [...allNav.map((item) => item.href), "/login"] as const;

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
