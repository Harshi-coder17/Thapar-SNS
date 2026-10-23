import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

// Security checks for what exists in Slice 1a: response headers and the built client bundle.
// Device-independent, so they run once (in one project).
test.describe("security baseline", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "windows-chrome-1366", "device-independent; runs once");
  });

  test("sends the baseline security headers and hides the framework", async ({ request }) => {
    for (const route of ["/", "/login", "/events"]) {
      const response = await request.get(route);
      const headers = response.headers();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["strict-transport-security"]).toMatch(/^max-age=\d{8,}/);
      expect(headers["x-powered-by"]).toBeUndefined();
    }
  });

  test("the client bundle contains no server secrets or server-only configuration", async () => {
    const root = path.join(import.meta.dirname, "../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(js|css|html|json|txt)$/.test(entry)) files.push(full);
      }
    };
    walk(path.join(root, ".next/static"));
    expect(files.length).toBeGreaterThan(0);

    // Values from the local .env (if present) must never reach the browser. Values are compared,
    // never printed: a failure reports only the variable name.
    const secrets: Array<[string, string]> = [];
    try {
      for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
        const match = /^([A-Z0-9_]+)=(.+)$/.exec(line.trim());
        if (match && match[2]!.length >= 8 && /SECRET|KEY|PASSWORD|DATABASE_URL/.test(match[1]!)) secrets.push([match[1]!, match[2]!]);
      }
    } catch {
      // No .env (e.g. CI): only the name checks below apply.
    }
    const bundle = files.map((file) => readFileSync(file, "utf8")).join("\n");
    for (const [name, value] of secrets) expect(bundle.includes(value), `${name} value found in client bundle`).toBe(false);
    for (const name of ["DATABASE_URL", "S3_SECRET_ACCESS_KEY", "S3_ACCESS_KEY_ID"]) {
      expect(bundle.includes(name), `${name} referenced in client bundle`).toBe(false);
    }
  });
});
