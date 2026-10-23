import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { allNav, findNavItem, isActive, primaryNav } from "@/shared/layout/nav";

describe("isActive", () => {
  it("matches Home only on the root path", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/events", "/")).toBe(false);
  });

  it("matches a section and its sub-pages but not lookalike paths", () => {
    expect(isActive("/events", "/events")).toBe(true);
    expect(isActive("/events/abc", "/events")).toBe(true);
    expect(isActive("/eventsx", "/events")).toBe(false);
  });

  it("marks exactly one primary item active per module route (montage panels 6, 7, 9 fix)", () => {
    for (const item of allNav) {
      const active = primaryNav.filter((entry) => isActive(item.href, entry.href));
      expect(active.length).toBeLessThanOrEqual(1);
      if (primaryNav.includes(item)) expect(active).toEqual([item]);
    }
  });
});

describe("navigation config", () => {
  it("follows the reference sidebar order", () => {
    expect(primaryNav.map((item) => item.label)).toEqual([
      "Home", "Societies", "Events", "Find Mates", "Study Material", "Archive", "Faculty", "Calendar", "Placement",
    ]);
  });

  it("has unique routes and throws for unknown ones", () => {
    expect(new Set(allNav.map((item) => item.href)).size).toBe(allNav.length);
    expect(() => findNavItem("/messages")).toThrow();
  });

  it("has a page file for every route", () => {
    for (const item of allNav) {
      const file = item.href === "/" ? "src/app/(app)/page.tsx" : `src/app/(app)${item.href}/page.tsx`;
      expect(existsSync(path.join(import.meta.dirname, "../..", file)), file).toBe(true);
    }
  });
});

describe("brand asset", () => {
  it("serves the owner-provided TIET logo unchanged", () => {
    const served = readFileSync(path.join(import.meta.dirname, "../../public/brand/tiet-logo.png"));
    expect(createHash("sha256").update(served).digest("hex")).toBe("563efb5bd130889f5b7d97932bc6d5fbc30b64af4521d32290d69417230edc53");
  });
});
