import AxeBuilder from "@axe-core/playwright";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";

import { completeTestProfile, SIGNED_OUT, testSignIn } from "./support";

// Slices 2b to 6 end to end: admin area gate, campus event registration with notification, Find Mates
// through to chat, calendar export, placement label, faculty search, login photograph.
const ADMIN_EMAIL = "e2e.admin@thapar.edu";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ONCE = ["windows-chrome-1366", "iphone-393"];

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

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);

test.describe("platform modules", () => {
  test.use({ storageState: SIGNED_OUT });

  test("the admin area is for administrators only, and admin APIs refuse students", async ({ browser, baseURL }) => {
    test.skip(!ONCE.includes(test.info().project.name), "one desktop and one phone");
    const id = unique();
    const student = await signedInPage(browser, baseURL!, `plat.student.${id}@thapar.edu`, `PS${id}`);
    expect((await student.page.goto("/admin"))?.status()).toBe(404);
    const refused = await student.context.request.post("/api/admin/users/00000000-0000-4000-8000-000000000000/role?as=admin", { headers: { origin: baseURL! }, data: { role: "ADMIN" } });
    expect(refused.status()).toBe(403);
    const admin = await signedInPage(browser, baseURL!, ADMIN_EMAIL, "E2EADMIN01");
    await admin.page.goto("/admin");
    await expect(admin.page.getByRole("heading", { level: 1, name: "Administration" })).toBeVisible();
    await expectNoSeriousAxeViolations(admin.page);
    for (const path of ["/admin/users", "/admin/moderation", "/admin/claims", "/admin/archive", "/admin/placement", "/admin/outbox", "/admin/audit"]) {
      expect((await admin.page.goto(path))?.status(), path).toBe(200);
    }
    await student.context.close();
    await admin.context.close();
  });

  test("a campus event: created by an admin, registered for by a student, confirmed by notification", async ({ browser, baseURL }) => {
    test.skip(!ONCE.includes(test.info().project.name), "one desktop and one phone");
    const id = unique();
    const admin = await signedInPage(browser, baseURL!, ADMIN_EMAIL, "E2EADMIN01");
    const start = new Date(Date.now() + 5 * 86_400_000);
    const title = `E2E Campus Talk ${id}`;
    const created = await admin.context.request.post("/api/events?as=admin", {
      headers: { origin: baseURL! },
      data: { title, description: "<p>An end-to-end test event.</p>", venue: "Main auditorium", startAt: start.toISOString(), endAt: new Date(start.getTime() + 7_200_000).toISOString(), capacity: 2, registrationSchema: [{ id: "team", label: "Team name", type: "short_text", required: true }], publish: true },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { event } = (await created.json()) as { event: { id: string } };
    // A Head-capacity request (no ?as=admin) by an admin without a Head grant is refused.
    const asHead = await admin.context.request.post("/api/events", { headers: { origin: baseURL! }, data: { title: "Not as a Head", description: "<p>A valid event body.</p>", venue: "Main auditorium", startAt: start.toISOString(), endAt: new Date(start.getTime() + 3_600_000).toISOString(), capacity: 1, registrationSchema: [] } });
    expect(asHead.status()).toBe(403);

    const student = await signedInPage(browser, baseURL!, `plat.event.${id}@thapar.edu`, `PE${id}`);
    await student.page.goto(`/events/${event.id}`);
    await expect(student.page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expectNoSeriousAxeViolations(student.page);
    // A required question left empty is caught before anything is sent (the server checks again).
    await student.page.getByRole("button", { name: "Register" }).click();
    expect(await student.page.getByLabel("Team name (required)").evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true);
    await expect(student.page.getByText("You are registered.")).toBeHidden();
    await student.page.getByLabel("Team name (required)").fill("Team E2E");
    await student.page.getByRole("button", { name: "Register" }).click();
    await expect(student.page.getByText("You are registered.")).toBeVisible();
    await student.page.getByRole("button", { name: "Mark as interested" }).click();
    await expect(student.page.getByText("1 interested")).toBeVisible();
    // With the background service running, the registration notification arrives live and the page
    // refreshes itself; a navigation started at that moment is interrupted, so retry it.
    await expect(async () => {
      await student.page.goto("/notifications");
      await expect(student.page.getByRole("link", { name: `You are registered for ${title}` })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
    await student.context.close();
    await admin.context.close();
  });

  test("Find Mates: request, response, acceptance and chat", async ({ browser, baseURL }) => {
    test.skip(!ONCE.includes(test.info().project.name), "one desktop and one phone");
    test.setTimeout(120_000);
    const id = unique();
    const owner = await signedInPage(browser, baseURL!, `plat.owner.${id}@thapar.edu`, `PO${id}`);
    const member = await signedInPage(browser, baseURL!, `plat.member.${id}@thapar.edu`, `PM${id}`);
    const title = `E2E team ${id}`;
    const created = await owner.context.request.post("/api/mates", { headers: { origin: baseURL! }, data: { title, description: "<p>Looking for a Python developer.</p>", type: "PROJECT", skills: ["python"], teamSize: 3, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() } });
    expect(created.status(), await created.text()).toBe(201);
    const { request } = (await created.json()) as { request: { id: string } };

    await member.page.goto(`/mates/${request.id}`);
    await expectNoSeriousAxeViolations(member.page);
    await member.page.getByLabel("Introduce yourself").fill("I write Python every day.");
    await member.page.getByRole("button", { name: "Send response" }).click();
    await expect(member.page.getByText("You responded.")).toBeVisible();

    await owner.page.goto(`/mates/${request.id}`);
    await owner.page.getByRole("button", { name: "Accept" }).click();
    await owner.page.getByRole("link", { name: "Open chat" }).click();
    await expect(owner.page).toHaveURL(/\/chat\//);
    await expect(owner.page.getByRole("list", { name: "Messages" })).toBeVisible();
    await owner.page.waitForLoadState("networkidle");
    const chatUrl = owner.page.url();
    await owner.page.getByLabel("Message", { exact: true }).fill("Welcome to the team!");
    await owner.page.getByRole("button", { name: "Send message" }).click();
    await expect(owner.page.getByText("Welcome to the team!")).toBeVisible();

    await member.page.goto(new URL(chatUrl).pathname);
    await expect(member.page.getByText("Welcome to the team!")).toBeVisible();
    // A third student cannot open the conversation.
    const outsider = await signedInPage(browser, baseURL!, `plat.outsider.${id}@thapar.edu`, `PX${id}`);
    expect((await outsider.page.goto(new URL(chatUrl).pathname))?.status()).toBe(404);
    for (const c of [owner, member, outsider]) await c.context.close();
  });

  test("calendar export, placement label and faculty search", async ({ browser, baseURL }) => {
    test.skip(!ONCE.includes(test.info().project.name), "one desktop and one phone");
    const id = unique();
    const student = await signedInPage(browser, baseURL!, `plat.cal.${id}@thapar.edu`, `PC${id}`);
    const ics = await student.context.request.get("/api/calendar/export");
    expect(ics.status()).toBe(200);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    expect(await ics.text()).toMatch(/^BEGIN:VCALENDAR\r\n/);
    const signedOut = await browser.newContext({ storageState: SIGNED_OUT });
    expect((await signedOut.request.get(`${baseURL}/api/calendar/export`)).status()).toBe(401);
    await signedOut.close();

    await student.page.goto("/calendar");
    await expectNoSeriousAxeViolations(student.page);
    await student.page.goto("/placement");
    await expect(student.page.getByText(/Unofficial, aggregate data/)).toBeVisible();

    await student.page.goto("/faculty");
    const count = await student.page.getByRole("status").innerText();
    test.skip(count.startsWith("0 "), "the faculty directory has not been imported into this database");
    await expectNoSeriousAxeViolations(student.page);
    await student.page.goto("/faculty?q=Amrita%20Kour");
    await expect(student.page.getByRole("link", { name: /Amrita Kaur/ }).first()).toBeVisible();
    await student.context.close();
  });

  test("faculty claim: a student may request one claim, is told it needs an administrator, and cannot hold a second", async ({ browser, baseURL }) => {
    test.skip(!ONCE.includes(test.info().project.name), "one desktop and one phone");
    const id = unique();
    const student = await signedInPage(browser, baseURL!, `plat.claim.${id}@thapar.edu`, `PK${id}`);
    await student.page.goto("/faculty?q=Professor");
    const hrefs = [...new Set((await student.page.locator('a[href^="/faculty/"]').evaluateAll((links) => links.map((a) => a.getAttribute("href")))).filter((h): h is string => Boolean(h && /^\/faculty\/[0-9a-f-]{36}$/.test(h))))];
    test.skip(hrefs.length === 0, "the faculty directory has not been imported into this database");
    const button = student.page.getByRole("button", { name: "This is me: claim this profile" });
    // Earlier runs leave pending claims in the E2E database: use profiles still open for a claim.
    const open: string[] = [];
    for (const href of hrefs) {
      await student.page.goto(href);
      if (await button.isVisible()) open.push(href);
      if (open.length === 2) break;
    }
    expect(open).toHaveLength(2);
    await student.page.goto(open[0]!);
    await expect(student.page.getByText("Only for the faculty member named on this page.")).toBeVisible();
    await button.click();
    await student.page.getByRole("button", { name: "Send claim" }).click();
    await expect(student.page.getByText("Your claim is waiting for an administrator.")).toBeVisible();
    // The claim granted nothing: no profile editing.
    await expect(student.page.getByRole("heading", { name: "Edit your profile" })).toHaveCount(0);
    await student.page.goto(open[1]!);
    await expect(student.page.getByText("Your account already has a faculty profile or a claim waiting for review.")).toBeVisible();
    await expect(button).toHaveCount(0);
    // The server refuses a second claim even without the page.
    const profileId = open[1]!.split("/").pop();
    const second = await student.context.request.post(`/api/faculty/${profileId}/claim`, { headers: { origin: baseURL! }, data: {} });
    expect(second.status()).toBe(409);
    await student.context.close();
  });

  test("the login photograph fades in without covering the sign-in form", async ({ page }) => {
    await page.goto("/login");
    const button = page.getByRole("button", { name: "Sign in with Google" });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    const photo = page.locator(".login-photo");
    if ((await photo.count()) === 0) test.skip(true, "no login photograph in public/brand");
    const mask = await photo.evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
    expect(mask).toContain("linear-gradient");
    // The form is above the photo and fully on screen.
    const box = await button.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(await button.evaluate((el) => document.elementFromPoint(el.getBoundingClientRect().x + 5, el.getBoundingClientRect().y + 5)?.closest("button") === el)).toBe(true);
  });

  test("UC-10 E2: an expired session keeps the teammate request draft and restores it after signing in again", async ({ browser, baseURL }) => {
    test.skip(!ONCE.includes(test.info().project.name), "one desktop and one phone");
    const id = unique();
    const email = `plat.draft.${id}@thapar.edu`;
    const student = await signedInPage(browser, baseURL!, email, `PD${id}`);
    await student.page.goto("/mates/new");
    await student.page.getByLabel("Title").fill(`Draft kept ${id}`);
    await student.page.getByRole("textbox", { name: "What are you looking for?" }).fill("Looking for a backend developer.");
    await student.page.getByRole("checkbox", { name: "Python" }).check();
    // The session ends (expired or revoked) while the student is writing.
    await student.context.clearCookies();
    await student.page.getByRole("button", { name: "Post request" }).click();
    await expect(student.page).toHaveURL(/\/login/);
    const again = await testSignIn(student.context.request, baseURL!, { email, name: email.split("@")[0]!.replace(/\./g, " ") });
    expect(again.status()).toBe(200);
    await student.page.goto("/mates/new");
    await expect(student.page.getByText("Your unsaved request was restored after you signed in again.")).toBeVisible();
    await expect(student.page.getByLabel("Title")).toHaveValue(`Draft kept ${id}`);
    await expect(student.page.getByRole("checkbox", { name: "Python" })).toBeChecked();
    await student.page.getByRole("button", { name: "Post request" }).click();
    await expect(student.page.getByRole("heading", { level: 1, name: `Draft kept ${id}` })).toBeVisible();
    await student.context.close();
  });

  test("PWA: manifest, service worker and the offline page", async ({ page, context }) => {
    test.skip(test.info().project.name !== "windows-chrome-1366", "service worker behaviour checked once, in Chromium");
    const manifest = await page.request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const json = (await manifest.json()) as { name: string; display: string; icons: { src: string }[] };
    expect(json.name).toBe("Thapar SNS");
    expect(json.display).toBe("standalone");
    for (const icon of json.icons) expect((await page.request.get(icon.src)).status(), icon.src).toBe(200);
    await page.goto("/login");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await context.setOffline(true);
    await page.goto("/events").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await context.setOffline(false);
  });

  test("the editor never runs markup from a restored draft (OWASP A05 hardening)", async ({ browser, baseURL }) => {
    test.skip(!ONCE.includes(test.info().project.name), "one desktop and one phone");
    const id = unique();
    const student = await signedInPage(browser, baseURL!, `plat.xss.${id}@thapar.edu`, `PX${id}x`.slice(0, 15));
    await student.page.goto("/mates/new");
    await student.page.evaluate(() => {
      sessionStorage.setItem("thapar-sns:mate-request-draft", JSON.stringify({ title: "Draft", description: '<img src="x" onerror="window.__xss = 1"><p>Kept <strong>text</strong><a href="javascript:alert(1)">link</a></p><script>window.__xss = 2</script>' }));
    });
    await student.page.reload();
    const editor = student.page.getByRole("textbox", { name: "What are you looking for?" });
    await expect(editor).toContainText("Kept text");
    await student.page.waitForTimeout(500);
    expect(await student.page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    const html = await editor.evaluate((el) => el.innerHTML);
    expect(html).not.toMatch(/<img|<script|onerror|javascript:/i);
    expect(html).toContain("<strong>text</strong>");
    await student.context.close();
  });

  test("FR-AUTH-4: an admin revokes a student's session from the Users page", async ({ browser, baseURL }) => {
    test.skip(test.info().project.name !== "windows-chrome-1366", "admin UI checked once");
    const id = unique();
    const email = `plat.revoke.${id}@thapar.edu`;
    const student = await signedInPage(browser, baseURL!, email, `PR${id}`);
    expect((await student.context.request.get("/api/notifications")).status()).toBe(200);
    const admin = await signedInPage(browser, baseURL!, ADMIN_EMAIL, "E2EADMIN01");
    await admin.page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
    await admin.page.getByText(/^Sessions \(1\)$/).click();
    await admin.page.getByRole("button", { name: "Revoke" }).click();
    await expect(admin.page.getByText(/^Sessions \(0\)$/)).toBeVisible();
    expect((await student.context.request.get("/api/notifications")).status()).toBe(401);
    await student.context.close();
    await admin.context.close();
  });
});

