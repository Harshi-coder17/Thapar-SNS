import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";

import { completeTestProfile, SIGNED_OUT, testSignIn } from "./support";

// OI-32 (recommended default, applied 2026-10-26): from Home after sign-in, each core task's form is
// at most 3 navigation clicks away. Form input and the submit click are not counted. Core tasks: create
// a teammate request, upload study material, register for an event (NFR-USE, EVAL-4).
const ONCE = ["windows-chrome-1366", "iphone-393"];
const ADMIN_EMAIL = "e2e.admin@thapar.edu";
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);

async function signedInPage(browser: Browser, baseURL: string, email: string, rollNumber: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...test.info().project.use, storageState: SIGNED_OUT });
  expect((await testSignIn(context.request, baseURL, { email, name: email.split("@")[0]!.replace(/\./g, " ") })).status()).toBe(200);
  await completeTestProfile(context.request, baseURL, rollNumber);
  return { context, page: await context.newPage() };
}

/** Clicks through the app like a user and counts every click. */
function clicker(page: Page) {
  let clicks = 0;
  return {
    get count() {
      return clicks;
    },
    async click(locator: ReturnType<Page["getByRole"]>) {
      clicks += 1;
      await locator.click();
    },
    /** Opens a primary section from the sidebar, or from the menu on small screens. */
    async section(label: string) {
      const sidebar = page.getByRole("complementary", { name: "Sidebar" }).getByRole("link", { name: label, exact: true });
      if (await sidebar.isVisible()) return this.click(sidebar);
      await this.click(page.getByRole("button", { name: "Open navigation" }));
      await this.click(page.getByRole("dialog").getByRole("link", { name: label, exact: true }));
    },
  };
}

test.describe("core tasks within 3 clicks (OI-32)", () => {
  test.use({ storageState: SIGNED_OUT });

  test("teammate request, study material upload and event registration are each at most 3 clicks from Home", async ({ browser, baseURL }) => {
    test.skip(!ONCE.includes(test.info().project.name), "one desktop and one phone");
    const id = unique();
    const admin = await signedInPage(browser, baseURL!, ADMIN_EMAIL, "E2EADMIN01");
    const start = new Date(Date.now() + 2 * 86_400_000);
    const title = `E2E Click Event ${id}`;
    const created = await admin.context.request.post("/api/events?as=admin", {
      headers: { origin: baseURL! },
      data: { title, description: "<p>A click-count test event.</p>", venue: "Main auditorium", startAt: start.toISOString(), endAt: new Date(start.getTime() + 3_600_000).toISOString(), capacity: 50, registrationSchema: [], publish: true },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { page, context } = await signedInPage(browser, baseURL!, `clicks.${id}@thapar.edu`, `CK${id}`);

    await page.goto("/");
    const mates = clicker(page);
    await mates.section("Find Mates");
    await mates.click(page.getByRole("link", { name: "New request" }));
    await expect(page).toHaveURL(/\/mates\/new$/);
    expect(mates.count).toBeLessThanOrEqual(3);

    await page.goto("/");
    const material = clicker(page);
    await material.section("Study Material");
    await material.click(page.getByRole("link", { name: "Share material" }));
    await expect(page).toHaveURL(/\/materials\/upload$/);
    expect(material.count).toBeLessThanOrEqual(3);

    await page.goto("/");
    const event = clicker(page);
    await event.section("Events");
    await event.click(page.getByRole("link", { name: title }).first());
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
    expect(event.count).toBeLessThanOrEqual(3);

    await context.close();
    await admin.context.close();
  });
});
