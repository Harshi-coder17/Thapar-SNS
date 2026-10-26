// Society permission rules (FR-SOC-1..4, SPEC-SOC-PERM; ADR-0013 / OI-56, owner decisions 2026-10-25).
// Pure functions over facts read from the database for each request. The two kinds of power are
// kept apart: a request acts in exactly ONE capacity (service.ts decides which, per request):
// - society capacity (the default): isHead = the actor holds an ACTIVE Head grant for THIS society
//   (societies_head_grants). Every active Head has the same full management permissions. The
//   account's global ADMIN role adds nothing here.
// - platform capacity (explicitly requested, and only for accounts whose ADMIN role is confirmed on
//   the server): platformAdmin = true, isHead = isMember = false. Oversight and recovery only
//   (create, activate/deactivate, rename, add or remove Heads, review faculty associations); a
//   platform admin never acts as the society.
// isMember: the actor has a membership row. Display groups and titles are never inputs here: they
// are organisational information and grant nothing. Following grants nothing. Unit-tested as a full
// matrix.

export type GlobalRole = "STUDENT" | "FACULTY" | "ADMIN";

export interface SocietyActorFacts {
  /** True only for a request made in the platform-admin capacity by a confirmed ADMIN account. */
  platformAdmin: boolean;
  isHead: boolean;
  isMember: boolean;
  /** OI-38: an inactive society accepts no new content, members or follows. */
  societyActive: boolean;
}

export const SOCIETY_ACTIONS = [
  "society.create",
  "society.setActive",
  "society.editProfile",
  "society.rename",
  "society.follow",
  "society.requestMembership",
  "society.leave",
  "workspace.open",
  "heads.manage",
  "membership.decide",
  "membership.edit",
  "membership.remove",
  "members.viewAll",
  "posts.create",
  "posts.edit",
  "posts.delete",
  "posts.viewDrafts",
  "posts.viewMembersOnly",
  "posts.viewAuthor",
  "faculty.viewUnverified",
  "faculty.review",
  "events.manage",
] as const;

export type SocietyAction = (typeof SOCIETY_ACTIONS)[number];

/** True when the actor may perform `action` in this society. */
export function can(facts: SocietyActorFacts, action: SocietyAction): boolean {
  const admin = facts.platformAdmin;
  const head = facts.isHead;
  const active = facts.societyActive;
  switch (action) {
    // Platform administration (also on inactive societies, for recovery).
    case "society.create":
    case "society.setActive":
    case "society.rename":
    case "faculty.viewUnverified":
    case "faculty.review":
      return admin;
    // Heads manage society information; admins keep oversight.
    case "society.editProfile":
      return admin || (active && head);
    // Heads (active society) and admins (any state, recovery) add and remove Heads.
    case "heads.manage":
      return admin || (active && head);
    // Personal actions: never in the platform-admin capacity.
    case "society.follow":
      return active && !admin;
    case "society.requestMembership":
      return active && !admin && !facts.isMember && !head;
    // A Head stays a member while they are a Head; they hand over (or are removed as Head) first.
    case "society.leave":
      return facts.isMember && !head;
    // The workspace stays open to Heads of an inactive society so they can remove content.
    case "workspace.open":
      return head;
    case "membership.decide":
    case "membership.edit":
    case "membership.remove":
    case "posts.create":
    case "posts.edit":
    case "events.manage":
      return active && head;
    case "posts.delete":
    case "posts.viewDrafts":
      return head;
    // Admins see member lists for oversight and Head recovery; members-only posts stay with members.
    case "members.viewAll":
      return head || facts.isMember || admin;
    case "posts.viewMembersOnly":
      return head || facts.isMember;
    // Public content appears as the society; the individual is visible to its Heads and to admins.
    case "posts.viewAuthor":
      return head || admin;
  }
}
