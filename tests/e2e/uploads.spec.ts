import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";

import { completeTestProfile, SIGNED_OUT, testSignIn } from "./support";

// Browser-level uploads against the local S3 storage (Garage) and the E2E background service:
// signed PUT from the browser, completion, quarantine validation, approval or rejection (UC-13), and
// the society logo upload with its fallback when an image cannot load (Slice 2d).
const ONCE = ["windows-chrome-1366", "iphone-393"];
const ADMIN_EMAIL = "e2e.admin@thapar.edu";
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
// A real 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function signedInPage(browser: Browser, baseURL: string, email: string, rollNumber: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...test.info().project.use, storageState: SIGNED_OUT });
  expect((await testSignIn(context.request, baseURL, { email, name: email.split("@")[0]!.replace(/\./g, " ") })).status()).toBe(200);
  await completeTestProfile(context.request, baseURL, rollNumber);
  return { context, page: await context.newPage() };
}

test.describe("uploads through local storage", () => {
  test.use({ storageState: SIGNED_OUT });

  test("study material: upload, automatic validation, listing and download; a disguised file is rejected with its reason", async ({ browser, baseURL }) => {
    test.skip(!ONCE.includes(test.info().project.name), "one desktop and one phone");
    test.setTimeout(90_000);
    const id = unique();
    const { context, page } = await signedInPage(browser, baseURL!, `up.material.${id}@thapar.edu`, `UM${id}`);
    const title = `E2E notes ${id}`;
    await page.goto("/materials/upload");
    await page.getByLabel("File").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByText("Uploaded: notes.pdf")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Subject code").fill("UCS503");
    await page.getByLabel("Branch").selectOption({ index: 1 });
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Share material" }).click();
    await expect(page).toHaveURL(/\/materials\?view=mine/);
    // The background service validates the file (magic bytes, type, size, checksum), then lists it.
    await expect(async () => {
      await page.reload();
      await expect(page.getByText(new RegExp(`UCS503 · .* · Listed`))).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await page.goto(`/materials?q=${encodeURIComponent(title)}`);
    await expect(page.getByText(title)).toBeVisible();
    const download = await page.getByRole("link", { name: "Download" }).first().getAttribute("href");
    const redirect = await context.request.get(download!, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers().location).toMatch(/^http:\/\/127\.0\.0\.1:3900\//);
    const file = await context.request.get(redirect.headers().location!);
    expect(file.status()).toBe(200);
    expect(Buffer.from(await file.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // An executable renamed to .pdf passes the browser but not the validation: the reason is shown at
    // the file field, and nothing is shared.
    await page.goto("/materials/upload");
    await page.getByLabel("File").setInputFiles({ name: "disguised.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\x90\x00\x03\x00\x00\x00 not a pdf") });
    await expect(page.getByRole("alert").filter({ hasText: /The file was rejected: / })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Uploaded: disguised.pdf")).toBeHidden();
    await context.close();
  });

  test("society logo: a Head uploads it from the workspace; if the image cannot load, initials are shown", async ({ browser, baseURL }) => {
    test.skip(test.info().project.name !== "windows-chrome-1366", "checked once");
    test.setTimeout(90_000);
    const id = unique();
    const headEmail = `up.head.${id}@thapar.edu`;
    const head = await signedInPage(browser, baseURL!, headEmail, `UH${id}`);
    const admin = await signedInPage(browser, baseURL!, ADMIN_EMAIL, "E2EADMIN01");
    const created = await admin.context.request.post("/api/societies?as=admin", { headers: { origin: baseURL! }, data: { name: `E2E Logo Society ${id}`, headEmails: [headEmail] } });
    expect(created.status(), await created.text()).toBe(201);
    const { society } = (await created.json()) as { society: { slug: string } };
    await head.page.goto(`/societies/${society.slug}/workspace/profile`);
    await head.page.getByLabel("Upload a logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expect(head.page.getByText("The new logo is saved and will show once it has been checked.")).toBeVisible({ timeout: 40_000 });
    await head.page.goto(`/societies/${society.slug}`);
    const logo = head.page.locator("section[aria-labelledby='society-name'] img").last();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img) => (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
    // Storage unreachable or link expired: the page falls back to initials, never a broken image.
    await head.page.route("**/api/assets/**", (route) => route.fulfill({ status: 404, body: "" }));
    await head.page.reload();
    const header = head.page.locator("section[aria-labelledby='society-name']");
    await expect(header.locator("span[aria-hidden]").filter({ hasText: /^[A-Z0-9]{1,2}$/ }).first()).toBeVisible();
    await expect(header.locator("img")).toHaveCount(0);
    await head.context.close();
    await admin.context.close();
  });
});
