import { describe, expect, it } from "vitest";

import { createPostSchema, createSocietySchema, fieldErrors, memberDisplaySchema, NAME_MAX, socialLinksSchema, updateSocietySchema } from "@/modules/societies/schemas";
import { slugify } from "@/modules/societies/service";

describe("society schemas", () => {
  const valid = { name: "Coding Club", description: "We code.", categorySlug: "technical", headEmails: ["head@thapar.edu"] };

  it("accepts a valid society and treats empty optional fields as absent", () => {
    const parsed = createSocietySchema.parse({ ...valid, links: { website: "", instagram: " " }, contactEmail: "" });
    expect(parsed.links).toEqual({ website: undefined, instagram: undefined, linkedin: undefined });
    expect(parsed.contactEmail).toBeUndefined();
  });

  it("needs at least one Head, accepts several, and removes duplicates ignoring case (ADR-0013)", () => {
    expect(createSocietySchema.safeParse({ ...valid, headEmails: [] }).success).toBe(false);
    expect(createSocietySchema.parse({ ...valid, headEmails: ["A@thapar.edu", "a@thapar.edu", "b@thapar.edu", "c@thapar.edu"] }).headEmails).toEqual(["a@thapar.edu", "b@thapar.edu", "c@thapar.edu"]);
    expect(createSocietySchema.safeParse({ ...valid, headEmail: "head@thapar.edu" }).success).toBe(false);
  });

  it("makes category and description optional and allows names up to 150 characters", () => {
    const minimal = createSocietySchema.parse({ name: "Society for Community Engineering (SCE)", headEmails: ["h@thapar.edu"] });
    expect(minimal.categorySlug).toBeUndefined();
    expect(minimal.description).toBeUndefined();
    const longName = "International Association of Students in Economics and Commercial Sciences (AIESEC) - Patiala Chapter";
    expect(createSocietySchema.safeParse({ ...valid, name: longName }).success).toBe(true);
    expect(NAME_MAX).toBe(150);
    expect(createSocietySchema.safeParse({ ...valid, name: "x".repeat(151) }).success).toBe(false);
  });

  it("member display data is a group and a free-text title only, and cannot carry roles or permissions", () => {
    expect(memberDisplaySchema.parse({ group: "CORE", position: " General Secretary " })).toEqual({ group: "CORE", position: "General Secretary" });
    expect(memberDisplaySchema.parse({ position: null })).toEqual({ position: null });
    for (const bad of [{}, { role: "HEAD" }, { group: "HEAD" }, { isHead: true }, { position: "x".repeat(61) }]) expect(memberDisplaySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("allows only https links", () => {
    for (const url of ["http://x.example", "javascript:alert(1)", "//x.example", "ftp://x.example", "not a url"]) {
      expect(socialLinksSchema.safeParse({ website: url }).success, url).toBe(false);
    }
    expect(socialLinksSchema.parse({ website: "https://x.example/path" }).website).toBe("https://x.example/path");
  });

  it("rejects unknown fields (no mass assignment of isActive, slug or roles)", () => {
    expect(createSocietySchema.safeParse({ ...valid, isActive: false }).success).toBe(false);
    expect(updateSocietySchema.safeParse({ description: "x", categorySlug: "technical", slug: "x" }).success).toBe(false);
    expect(createPostSchema.safeParse({ type: "UPDATE", title: "Hello", body: "x", authorId: "00000000-0000-0000-0000-000000000000" }).success).toBe(false);
  });

  it("reports field errors under the field name, including nested link and recruitment fields", () => {
    const result = createSocietySchema.safeParse({ ...valid, name: "x", links: { website: "http://x" } });
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(["name", "website"]);
  });

  it("normalises recruitment roles, years and branches", () => {
    const post = createPostSchema.parse({
      type: "RECRUITMENT",
      title: "Join us",
      body: "x",
      recruitment: { rolesSought: [" Designer ", "Designer", "Developer"], eligibleYears: ["2", 1, 2], eligibleBranchCodes: ["COE", "COE"] },
    });
    expect(post.recruitment).toMatchObject({ rolesSought: ["Designer", "Developer"], eligibleYears: [1, 2], eligibleBranchCodes: ["COE"] });
    expect(createPostSchema.safeParse({ type: "RECRUITMENT", title: "x", body: "x", recruitment: { rolesSought: [], eligibleYears: [6] } }).success).toBe(false);
  });
});

describe("slugify", () => {
  it("builds lower-case URL names", () => {
    expect(slugify("Computer Society TIET")).toBe("computer-society-tiet");
    expect(slugify("  Music & Dance!! ")).toBe("music-and-dance");
    expect(slugify("Café Société")).toBe("cafe-societe");
    expect(slugify("!!!")).toBe("society");
    expect(slugify("Chemist\u2019s Association")).toBe("chemists-association");
    expect(slugify("a".repeat(100))).toHaveLength(60);
  });
});
