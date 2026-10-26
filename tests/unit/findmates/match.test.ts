import { describe, expect, it } from "vitest";

import { createRequestSchema, matchScore } from "@/modules/findmates/schemas";

describe("match score (OI-17)", () => {
  it("is the Jaccard index of the two skill sets", () => {
    expect(matchScore(["react", "node"], ["react", "node"])).toBe(1);
    expect(matchScore(["react", "node"], ["react", "python"])).toBeCloseTo(1 / 3);
    expect(matchScore(["react"], ["go"])).toBe(0);
    expect(matchScore([], [])).toBe(0);
  });
});

describe("teammate request input (UC-10 step 4)", () => {
  const base = { title: "Hackathon team", description: "<p>x</p>", type: "HACKATHON", skills: ["react"], teamSize: 4, expiresAt: "2026-12-01T00:00:00+05:30" };
  it("accepts team sizes 2 to 10 only", () => {
    expect(createRequestSchema.safeParse(base).success).toBe(true);
    expect(createRequestSchema.safeParse({ ...base, teamSize: 1 }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...base, teamSize: 11 }).success).toBe(false);
  });
  it("needs at least one skill and de-duplicates them", () => {
    expect(createRequestSchema.safeParse({ ...base, skills: [] }).success).toBe(false);
    const parsed = createRequestSchema.parse({ ...base, skills: ["react", "react"] });
    expect(parsed.skills).toEqual(["react"]);
  });
});
