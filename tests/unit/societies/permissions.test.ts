// Society permission rules (ADR-0013 / OI-56, owner decisions 2026-10-25). Every action is checked
// in both capacities: society (Head grant, membership) and platform admin, for active and inactive societies. Display groups and
// titles are not inputs at all: they cannot grant anything.
import { describe, expect, it } from "vitest";

import { can, SOCIETY_ACTIONS, type SocietyAction, type SocietyActorFacts } from "@/modules/societies/permissions";

type Who = "HEAD" | "MEMBER" | "NONE";
const WHO: Who[] = ["NONE", "MEMBER", "HEAD"];
// Society capacity: powers come only from the Head grant (Heads are also members; a Head without a
// membership row is covered too). Platform capacity: a confirmed ADMIN account, Head grant and
// membership ignored. The two capacities never combine.
const societyFacts = (who: Who, societyActive: boolean, headIsMember = true): SocietyActorFacts => ({
  platformAdmin: false,
  isHead: who === "HEAD",
  isMember: who === "MEMBER" || (who === "HEAD" && headIsMember),
  societyActive,
});
const platformFacts = (societyActive: boolean): SocietyActorFacts => ({ platformAdmin: true, isHead: false, isMember: false, societyActive });

/** Expected rule per action: who may act in an active / inactive society, and whether a platform admin always may. */
const EXPECTED: Record<SocietyAction, { active: Who[]; inactive: Who[]; admin: boolean }> = {
  "society.create": { active: [], inactive: [], admin: true },
  "society.setActive": { active: [], inactive: [], admin: true },
  "society.rename": { active: [], inactive: [], admin: true },
  "faculty.viewUnverified": { active: [], inactive: [], admin: true },
  "faculty.review": { active: [], inactive: [], admin: true },
  "society.editProfile": { active: ["HEAD"], inactive: [], admin: true },
  "heads.manage": { active: ["HEAD"], inactive: [], admin: true },
  "society.follow": { active: ["NONE", "MEMBER", "HEAD"], inactive: [], admin: false },
  "society.requestMembership": { active: ["NONE"], inactive: [], admin: false },
  "society.leave": { active: ["MEMBER"], inactive: ["MEMBER"], admin: false },
  "workspace.open": { active: ["HEAD"], inactive: ["HEAD"], admin: false },
  "membership.decide": { active: ["HEAD"], inactive: [], admin: false },
  "membership.edit": { active: ["HEAD"], inactive: [], admin: false },
  "membership.remove": { active: ["HEAD"], inactive: [], admin: false },
  "members.viewAll": { active: ["MEMBER", "HEAD"], inactive: ["MEMBER", "HEAD"], admin: true },
  "posts.create": { active: ["HEAD"], inactive: [], admin: false },
  "posts.edit": { active: ["HEAD"], inactive: [], admin: false },
  "posts.delete": { active: ["HEAD"], inactive: ["HEAD"], admin: false },
  "posts.viewDrafts": { active: ["HEAD"], inactive: ["HEAD"], admin: false },
  "posts.viewMembersOnly": { active: ["MEMBER", "HEAD"], inactive: ["MEMBER", "HEAD"], admin: false },
  "posts.viewAuthor": { active: ["HEAD"], inactive: ["HEAD"], admin: true },
  "events.manage": { active: ["HEAD"], inactive: [], admin: false },
};

describe("society permission matrix (ADR-0013)", () => {
  it("covers every action", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...SOCIETY_ACTIONS].sort());
  });

  for (const action of SOCIETY_ACTIONS) {
    it(action, () => {
      const rule = EXPECTED[action];
      for (const societyActive of [true, false]) {
        for (const who of WHO) {
          const expected = (societyActive ? rule.active : rule.inactive).includes(who);
          expect(can(societyFacts(who, societyActive), action), `society/${who}/${societyActive ? "active" : "inactive"}`).toBe(expected);
        }
        expect(can(platformFacts(societyActive), action), `platform/${societyActive ? "active" : "inactive"}`).toBe(rule.admin);
      }
    });
  }

  it("every Head has the same full management permissions", () => {
    const management: SocietyAction[] = ["society.editProfile", "heads.manage", "membership.decide", "membership.edit", "membership.remove", "posts.create", "posts.edit", "posts.delete", "events.manage"];
    for (const action of management) expect(can(societyFacts("HEAD", true), action), action).toBe(true);
  });

  it("members, followers and non-members never manage", () => {
    const management: SocietyAction[] = ["workspace.open", "membership.decide", "membership.edit", "membership.remove", "posts.create", "posts.edit", "posts.delete", "events.manage", "heads.manage", "society.editProfile"];
    for (const who of ["NONE", "MEMBER"] as const) for (const action of management) expect(can(societyFacts(who, true), action), `${who} ${action}`).toBe(false);
  });

  it("the platform-admin capacity never acts as the society (no workspace, posting, membership decisions or events)", () => {
    for (const action of ["workspace.open", "posts.create", "posts.delete", "membership.decide", "membership.edit", "events.manage", "posts.viewMembersOnly"] as const) {
      expect(can(platformFacts(true), action), action).toBe(false);
    }
  });

  it("platform-admin powers are not available in the society capacity, even to a Head", () => {
    for (const action of ["society.create", "society.setActive", "society.rename", "faculty.review", "faculty.viewUnverified"] as const) {
      expect(can(societyFacts("HEAD", true), action), action).toBe(false);
    }
  });

  it("a Head grant works even without a membership row (access comes only from the grant)", () => {
    expect(can(societyFacts("HEAD", true, false), "posts.create")).toBe(true);
    expect(can(societyFacts("HEAD", true, false), "posts.viewMembersOnly")).toBe(true);
  });
});
