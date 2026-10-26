import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { categoryForSource, sourceLabel } from "@/modules/societies/source-categories";

describe("official source labels to application categories (OI-55)", () => {
  it("maps every label pair explicitly", () => {
    expect(categoryForSource({ sourceType: "chapter", sourceSubtype: "technical-/-academic" })).toBe("professional");
    expect(categoryForSource({ sourceType: "society", sourceSubtype: "technical-/-academic" })).toBe("technical");
    expect(categoryForSource({ sourceType: "club", sourceSubtype: "technical-/-academic" })).toBe("technical");
    expect(categoryForSource({ sourceType: "society", sourceSubtype: "entrepreneurship" })).toBe("entrepreneurship");
    expect(categoryForSource({ sourceType: "club", sourceSubtype: "cultural-/-visual-arts" })).toBe("cultural");
    expect(categoryForSource({ sourceType: "society", sourceSubtype: "debate-/-literary" })).toBe("literary");
    expect(categoryForSource({ sourceType: "club", sourceSubtype: "physical-fitness" })).toBe("sports-fitness");
    expect(categoryForSource({ sourceType: "units", sourceSubtype: "social" })).toBe("social-service");
  });

  it("leaves unknown or missing labels without a category instead of guessing", () => {
    expect(categoryForSource({ sourceType: "society", sourceSubtype: "something-new" })).toBeNull();
    expect(categoryForSource({ sourceType: null, sourceSubtype: null })).toBeNull();
  });

  it("covers every label pair in the official dataset", () => {
    const { records } = JSON.parse(readFileSync("data/society-import/thapar-student-organisations.2026-10-25.json", "utf8")) as { records: { source: { sourceType: string; sourceSubtype: string } }[] };
    const unmapped = records.filter((r) => categoryForSource(r.source) === null);
    expect(unmapped).toEqual([]);
  });

  it("formats the source label for display", () => {
    expect(sourceLabel({ sourceType: "chapter", sourceSubtype: "technical-/-academic" })).toBe("Chapter · Technical / Academic");
    expect(sourceLabel({ sourceType: null, sourceSubtype: null })).toBeNull();
  });
});
