import { describe, expect, it } from "vitest";

import { leadershipRank } from "@/modules/faculty/leadership";

describe("faculty leadership order (official designations)", () => {
  it("ranks the university offices in the official order", () => {
    const designations = [
      "Professor",
      "Professor & Associate Dean (DCT)",
      "Sr Professor & Dean of Sustainability",
      "Professor & Dean (Faculty Affairs)",
      "Sr. Professor, Dean Research",
      "Professor & Dean of Academic Affairs",
      "Pro Vice-Chancellor & Professor",
      "Professor & Controller of Examinations",
      "Dean of Student Affairs",
    ];
    const ordered = [...designations].filter((d) => leadershipRank(d) !== null).sort((a, b) => leadershipRank(a)! - leadershipRank(b)!);
    expect(ordered).toEqual([
      "Pro Vice-Chancellor & Professor",
      "Professor & Dean of Academic Affairs",
      "Dean of Student Affairs",
      "Professor & Dean (Faculty Affairs)",
      "Sr. Professor, Dean Research",
      "Sr Professor & Dean of Sustainability",
      "Professor & Controller of Examinations",
      "Professor & Associate Dean (DCT)",
    ]);
  });

  it("does not treat associate deans of research or faculty as the deans themselves, nor heads as leadership", () => {
    expect(leadershipRank("Associate Professor & Associate Dean (Research)")).toBe(7);
    expect(leadershipRank("Professor & Associate Dean of Faculty")).toBe(7);
    expect(leadershipRank("Professor and ADOFA")).toBe(7);
    expect(leadershipRank("Professor & Head")).toBeNull();
    expect(leadershipRank("Assistant Professor (Contractual -II)")).toBeNull();
  });
});
