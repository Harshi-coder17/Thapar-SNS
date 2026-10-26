import AxeBuilder from "@axe-core/playwright";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";

import { completeTestProfile, openNavIfDrawer, SIGNED_OUT, testSignIn } from "./support";

// Society Hub end to end (Slice 2a, revised by ADR-0013 on 2026-10-25): an admin creates a society
// with two equal Heads (FR-SOC-1); a Head switches from their personal account into the society
// workspace ("Acting as"), publishes an update and a story that appear as the society (FR-SOC-3); a
// student finds it (FR-SOC-4), follows it and sees the update on Home, then requests to join; the
// other Head approves and gives the student a display title (display only); a Head hands over to an
// incoming Head and loses workspace access; the admin deactivates the society (OI-38), which also
// keeps the local development directory clean. Fictitious @thapar.edu users only.
const ADMIN_EMAIL = "e2e.admin@thapar.edu";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function signedInPage(browser: Browser, baseURL: string, email: string, rollNumber: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...test.info().project.use, storageState: SIGNED_OUT });
  const signedIn = await testSignIn(context.request, baseURL, { email, name: email.split("@")[0]!.replace(/\./g, " ") });
  expect(signedIn.status(), `test sign-in ${email}`).toBe(200);
  await completeTestProfile(context.request, baseURL, rollNumber);
  return { context, page: await context.newPage() };
}

async function expectNoSeriousAxeViolations(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

test.describe("Society Hub", () => {
  test.use({ storageState: SIGNED_OUT });

  test("two Heads, workspace switching, society attribution, membership, display titles, handover, deactivation", async ({ browser, baseURL }) => {
    test.skip(!["windows-chrome-1366", "iphone-393"].includes(test.info().project.name), "full flow on one desktop and one phone");
    test.setTimeout(180_000);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
    const societyName = `E2E Society ${unique}`;
    const headA = `soc.heada.${unique}@thapar.edu`;
    const headB = `soc.headb.${unique}@thapar.edu`;
    const incomingEmail = `soc.incoming.${unique}@thapar.edu`;
    const studentEmail = `soc.student.${unique}@thapar.edu`;

    const admin = await signedInPage(browser, baseURL!, ADMIN_EMAIL, "E2EADMIN01");
    const a = await signedInPage(browser, baseURL!, headA, `HA${unique}`);
    const b = await signedInPage(browser, baseURL!, headB, `HB${unique}`);
    const incoming = await signedInPage(browser, baseURL!, incomingEmail, `IN${unique}`);
    const student = await signedInPage(browser, baseURL!, studentEmail, `S${unique}`);

    // 1. The admin creates the society with two Heads (no category: it is optional).
    await admin.page.goto("/societies");
    await admin.page.getByRole("link", { name: "Create society" }).click();
    await admin.page.getByLabel("Society name").fill(societyName);
    await admin.page.getByLabel("Description (optional)").fill("A fictitious society created by the end-to-end tests.");
    await admin.page.getByLabel("Heads' email addresses").fill(`${headA}, ${headB}`);
    await admin.page.getByRole("button", { name: "Create society" }).click();
    await expect(admin.page.getByRole("heading", { level: 1, name: societyName })).toBeVisible();
    const societyUrl = new URL(admin.page.url()).pathname;
    const workspaceUrl = `${societyUrl}/workspace`;

    // 2. Head A switches from their personal account into the society workspace.
    await a.page.goto("/");
    await openNavIfDrawer(a.page);
    const switcher = a.page.getByRole("navigation", { name: "Switch identity" });
    await expect(switcher.getByRole("link", { name: /\(personal\)/ })).toHaveAttribute("aria-current", "true");
    await switcher.getByRole("link", { name: societyName }).click();
    await expect(a.page).toHaveURL(new RegExp(`${workspaceUrl}$`));
    await expect(a.page.getByRole("region", { name: "Acting as" })).toContainText(`Acting as ${societyName}`);
    await expectNoSeriousAxeViolations(a.page);

    // 3. Head A publishes an update and a story as the society.
    await a.page.getByRole("link", { name: "New post" }).click();
    await a.page.getByLabel("Title").fill("Welcome to the new session");
    await a.page.getByRole("textbox", { name: "Post" }).click();
    await a.page.keyboard.type("Orientation is on Friday. <script>alert(1)</script> stays text.");
    await a.page.getByRole("button", { name: "Publish" }).click();
    await expect(a.page).toHaveURL(new RegExp(`${workspaceUrl}$`));
    await expect(a.page.getByRole("link", { name: "Welcome to the new session" })).toBeVisible();
    // Heads see who posted; students will not.
    await expect(a.page.getByText(/posted by .* \(visible to Heads and admins\)/).first()).toBeVisible();
    await a.page.getByRole("link", { name: "New post" }).click();
    await a.page.getByText("Story", { exact: true }).click();
    await a.page.getByRole("textbox", { name: "Story" }).fill("Stall open at the TAN today!");
    await a.page.getByRole("button", { name: "Post story" }).click();
    await expect(a.page).toHaveURL(new RegExp(`${workspaceUrl}$`));
    await expect(a.page.getByText("Stall open at the TAN today!")).toBeVisible();

    // 4. Heads panel: two equal Heads; Head A cannot remove themselves.
    await a.page.goto(`${workspaceUrl}/heads`);
    await expect(a.page.getByRole("heading", { name: "Heads (2)" })).toBeVisible();
    const selfRow = a.page.getByRole("listitem").filter({ hasText: "(you)" });
    await expect(selfRow.getByRole("button", { name: "Remove Head access" })).toBeDisabled();
    await expectNoSeriousAxeViolations(a.page);

    // 5. A student finds the society, sees content as the society, follows, sees it on Home, requests to join.
    await student.page.goto(`/societies?q=${encodeURIComponent(societyName)}`);
    await student.page.getByRole("link", { name: new RegExp(societyName) }).click();
    await expect(student.page.getByRole("heading", { level: 1, name: societyName })).toBeVisible();
    await expect(student.page.getByRole("link", { name: "Open society workspace" })).toHaveCount(0);
    await expect(student.page.getByText(/posted by/)).toHaveCount(0);
    await student.page.getByRole("button", { name: "Follow" }).click();
    await student.page.mouse.move(0, 0);
    await expect(student.page.getByRole("button", { name: "Following" })).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expectNoSeriousAxeViolations(student.page);
    await student.page.goto("/");
    await expect(student.page.getByRole("link", { name: "Welcome to the new session" })).toBeVisible();
    await student.page.goto(societyUrl);
    await student.page.getByRole("button", { name: "Request to join" }).click();
    await student.page.getByLabel("Message to the Head (optional)").fill("I would like to help with design.");
    await student.page.getByRole("button", { name: "Send request" }).click();
    await expect(student.page.getByText("Membership requested")).toBeVisible();
    // The workspace is not reachable for a student, even by URL.
    expect((await student.page.goto(workspaceUrl))?.status()).toBe(404);

    // 6. Head B (equal access) approves the request and gives the new member a display title.
    await b.page.goto(`${workspaceUrl}/members`);
    await expect(b.page.getByText("I would like to help with design.")).toBeVisible();
    await b.page.getByRole("button", { name: "Approve" }).click();
    await expect(b.page.getByText("No pending requests.")).toBeVisible();
    // The only member without a Head badge is the new student (every test user is named "E2E Student").
    const row = b.page
      .getByRole("region", { name: /^Members/ })
      .getByRole("listitem")
      .filter({ hasNot: b.page.getByText("Head", { exact: true }) });
    await expect(row).toHaveCount(1);
    await row.getByLabel("Display group").selectOption("CORE");
    await row.getByLabel("Title (optional)").fill("Design Lead");
    const saved = b.page.waitForResponse((response) => response.url().includes("/members/") && response.request().method() === "PATCH");
    await row.getByRole("button", { name: "Save" }).click();
    expect((await saved).status()).toBe(200);
    await student.page.goto(`${societyUrl}?tab=about`);
    await expect(student.page.getByText("Design Lead")).toBeVisible();
    // The title grants nothing: the student still has no workspace.
    expect((await student.page.goto(workspaceUrl))?.status()).toBe(404);

    // 7. Head B hands over to the incoming Head and loses workspace access immediately.
    await b.page.goto(`${workspaceUrl}/heads`);
    b.page.once("dialog", (dialog) => void dialog.accept());
    await b.page.getByLabel("Incoming Head's email address").fill(incomingEmail);
    await b.page.getByRole("button", { name: "Hand over" }).click();
    await expect(b.page).toHaveURL(new RegExp(`${societyUrl}$`));
    expect((await b.page.goto(workspaceUrl))?.status()).toBe(404);
    await incoming.page.goto(workspaceUrl);
    await expect(incoming.page.getByRole("region", { name: "Acting as" })).toBeVisible();

    // 8. The admin deactivates the society from the Administration tab.
    await admin.page.goto(`${societyUrl}?tab=admin`);
    admin.page.once("dialog", (dialog) => void dialog.accept());
    const deactivated = admin.page.waitForResponse((response) => response.url().endsWith("/status") && response.request().method() === "PUT");
    await admin.page.getByRole("button", { name: "Deactivate society" }).click();
    expect((await deactivated).status()).toBe(200);
    await expect(admin.page.getByRole("button", { name: "Activate society" })).toBeVisible();
    await student.page.goto(`/societies?q=${encodeURIComponent(societyName)}`);
    await expect(student.page.getByText("No societies found.")).toBeVisible();

    for (const session of [admin, a, b, incoming, student]) await session.context.close();
  });

  test("students cannot open admin or publisher pages", async ({ browser, baseURL }) => {
    test.skip(test.info().project.name !== "windows-chrome-1366", "device-independent; runs once");
    const unique = `${Date.now()}`.slice(-9);
    const student = await signedInPage(browser, baseURL!, `soc.plain.${unique}@thapar.edu`, `P${unique}`);
    const response = await student.page.goto("/societies/new");
    expect(response?.status()).toBe(404);
    await student.page.goto("/societies");
    await expect(student.page.getByRole("link", { name: "Create society" })).toHaveCount(0);
    const api = await student.context.request.post("/api/societies", {
      headers: { origin: baseURL! },
      data: { name: `Rogue ${unique}`, description: "x", headEmails: [`soc.plain.${unique}@thapar.edu`] },
    });
    expect(api.status()).toBe(403);
    await student.context.close();
  });
});
