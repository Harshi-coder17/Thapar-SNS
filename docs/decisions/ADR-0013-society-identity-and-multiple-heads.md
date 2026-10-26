# ADR-0013: Society workspace, equal Heads and the society list import

Status: **Approved by the owner 2026-10-25 (revision 3: §10 settles the §8 questions); implemented 2026-10-25 (Slice 2a revision).** Revision 2 recorded the owner's corrected model of 2026-10-25, which replaced revision 1 of the same day. It revises the Slice 2a model (OI-10) and, with the owner's explicit instruction, deviates from the fixed role list of FR-SOC-2 (§7). The open questions in §8 still need the owner's answers.

## 1. Owner requirements (2026-10-25, corrected model)
1. **One page and one workspace per society.** Each society has one persistent page and one shared management workspace.
2. **Personal sign-in only.** Every student signs in with their own verified @thapar.edu Google account. There are no shared passwords and no per-society login.
3. **Switching.** Authorised Heads switch from their personal account into the society workspace.
4. **Equal Heads.** All Heads have equal, full management permissions: posts (create, publish, edit, delete), society information, membership, and every other society-level function. There can be any number of Heads (one, two, three or more); no fixed number is enforced.
5. **Access is not position.** Heads have personal profiles and positions independent of their workspace access. A society may display Heads, core members and general members as organisational positions, not as permission tiers. No mandatory hierarchy is imposed (no required President, Vice President, Editor, Event Manager or Secretary). Core and general members get no management access; only explicitly authorised Heads do.
6. **At least one Head.** There is always at least one active Head. A Head can hand over to an incoming Head who has signed in at least once; management access is never interrupted, and the handover is audit-logged.
7. **Admin oversight.** Admins keep platform-level recovery and oversight.
8. **Revocation.**
   - Removing someone's Head authorisation revokes management access immediately.
   - It never deletes their personal account, profile, membership history or content attribution.
9. **Attribution.** Students see content as published by the society; audit records name the individual.
10. **Society list.** Use the official student-activities directory as a source of names and facts, not as our category scheme. Nothing is invented; unverified data is not published automatically; faculty listed by the source are not society administrators in our app.

## 2. What changes in the current implementation (review, 2026-10-25)

The current design (Slice 2a) mixes **access** and **position** in one field: `societies_memberships.role` is one of HEAD / EDITOR / EVENT_MANAGER / MEMBER, and `permissions.ts` gives each value different powers.

| Where | Current behaviour | Change needed |
|---|---|---|
| `prisma/schema.prisma` `SocietyMemberRole` enum, `societies_memberships.role` | Four permission tiers | Split into (a) **Head authorisation** (access) and (b) a free **display position** plus a display group (core / general) |
| Migration index `societies_memberships_one_head` | At most one Head | Remove; at least one Head is enforced by the service |
| `permissions.ts` (`isPublisher`, `events.manage`, `membership.*` HEAD-only, `HEAD_ASSIGNABLE_ROLES`) | Tiered powers | One rule: an active Head of this society may do every society action; members may read members-only content; admins keep platform actions |
| `service.ts` `createSociety` (`headEmail`), `transferHead`, `setMemberRole`, `removeMember` ("Head cannot be removed") | One Head, transfer demotes | Create with ≥1 Head; add and remove Heads; handover; edit display position; removal never deletes content |
| `PUT /api/societies/{id}/head`, `PATCH /members/{userId}` `{ role }` | Transfer; role tiers | `POST/DELETE /heads`, `POST /heads/handover`, `PATCH /members/{userId}` `{ group, position }` |
| `societies_societies.categorySlug` NOT NULL, FK | **A category is required to create a society** | Make it optional (NULL = no category). Do not add an "uncategorised" placeholder category |
| `societies_societies.description` NOT NULL, CHECK 1..2000 | Description required | Optional; the page says when none has been provided |
| CHECK `societies_societies_name_length` 3..80; `NAME_MAX = 80` | Two official names are longer (84 and 101 characters) | Raise to 150 |
| UI: admin panel ("Current Head", "Transfer"), create form (one Head), members list (role dropdown with Editor/Event Manager), `membership-actions.tsx` (`isHead`), post cards and post page ("by <student>") | Tiered roles, one Head, personal attribution | Heads panel (list, add, remove, handover), position editor, workspace switcher with "Acting as" bar, society-only attribution |
| `admin_audit_logs` | Actor only | Add `onBehalfOfType`, `onBehalfOfId` |
| Tests: permission matrix (tiers), integration M05 to M07, S02, S03, P05; E2E Head flow | Tiers, one Head | Rewrite for equal Heads (§6) |
| Docs: `api/societies.md`, `database-design.md`, `open-issues.md` (OI-10, OI-55, OI-56, OI-57), `traceability.md` (FR-SOC-1..3, FR-EVT-1), `slice-2a.md` | Old model | Updated in this pass where they describe decisions; contracts updated with the implementation |

## 3. Decision (proposed)

### 3.1 Access: Head authorisations
- New table `societies_head_grants`:
  - columns: `id`, `societyId`, `userId`, `grantedAt`, `grantedById`, `grantReason` (`CREATED_WITH_SOCIETY`, `ADDED`, `HANDOVER`, `ADMIN_RECOVERY`), `revokedAt`, `revokedById`, `revokeReason` (`REMOVED`, `HANDOVER`, `ADMIN_RECOVERY`);
  - a partial unique index allows one active grant per (society, user);
  - rows are never deleted: the table is the tenure history.
- **A user may manage a society if and only if they have an active grant.** This is checked on every request from the database. Removing a grant takes effect on the next request; no session changes are needed.
- **At least one active Head.** Every operation that ends a grant runs in a transaction that locks the society row and refuses to leave zero active grants (except the admin recovery path, which grants and revokes in the same transaction).
- **Handover (owner requirement 6).** In one transaction:
  - the outgoing Head names an incoming person who has signed in at least once;
  - the incoming person gets an active grant (also made a member if they were not one);
  - only then is the outgoing grant revoked;
  - the result is audited.

  Access is never interrupted. The outgoing Head keeps their membership and position unless they choose otherwise.
- **Admins** create societies with ≥1 initial Head, can add or remove Heads (never leaving zero), and can recover a society (for example when every Head has left the university). Admin recovery is audited as such.

### 3.2 Position: membership display only
- `societies_memberships` keeps one row per member, with two new columns:
  - `group`: `CORE` | `GENERAL`, how the society displays the person;
  - `position`: optional free text, at most 60 characters (for example "General Secretary").

  Neither column grants anything.
- Heads are displayed as Heads because they hold an active grant. A Head may also have a position.
- Societies choose their own positions; nothing is mandatory.
- Heads manage membership (approve or reject requests, set group and position, remove members). Removing a member deletes only the membership row, never their account or content, and is audited.

### 3.3 Society workspace and switching
- The society context travels in each request's URL (`/api/societies/{id}/...`) and is authorised per request against `societies_head_grants`.
- There is no "active identity" in the session, so a stale tab cannot silently act as the wrong identity, and authentication is unchanged.
- The UI has an account switcher ("Personal" plus each society the user heads) that opens `/societies/{slug}/workspace`, with an "Acting as <society>" bar and "Switch back". Personal actions (follow, join, register) are not offered inside the workspace.

### 3.4 Attribution and audit
- Posts, and later events and membership decisions, are presented as the society.
- The individual is stored (`authorId`, `decidedById`, later `events.createdById`) and shown only to the society's Heads and to admins.
- Every workspace action writes an audit entry: `actorId` = the individual; `onBehalfOfType` = `society`; `onBehalfOfId` = the society. Two new nullable columns are added to `admin_audit_logs`; the append-only trigger is unaffected.
- Post create, edit and publish are audited in addition to delete.

### 3.5 Categories and provenance
- Category becomes optional. Our own category list (OI-55) is an optional browsing aid. The source site's type and subtype (society, club, chapter, cell, units; technical, social, ...) are **kept only as reference data** in the import dataset and are not used as application categories.
- New optional columns on `societies_societies`:
  - `shortName` (an acronym such as "CCS");
  - `sourceKey` (unique, the stable import key);
  - `sourceUrl`;
  - `sourceFetchedAt`;
  - `verifiedAt` and `verifiedById`, set when an admin or a Head confirms the imported profile.
- New table `societies_faculty_associations`:
  - columns: society, name, department, email, `sourceRole` exactly as published ("President", "Vice President", "Faculty Advisor"), `sourceUrl`, `verifiedAt`;
  - these are associations, not accounts or permissions.
  - **Unverified associations are not shown to students.**

### 3.6 Society lifecycle
- `isActive` stays: deactivation and reactivation behave as before (OI-38).
- An imported society without a Head is created inactive and shown to admins as **awaiting Head** (derived: inactive and no active grant). Assigning its first Head and reviewing the imported profile activates it (audited). Nothing from the import is visible to students before that.

### 3.7 Cross-module contract for events (Slice 2b)
- `societies.getSocietyActor(userId, societyId)` returns `{ society }` when the user holds an active Head grant for an active society, otherwise null.
- Events will store `societyId` (the owner of record) and `createdById` (the individual), and audit on behalf of the society.

## 4. Migration (one new migration; the applied `20261025000000_societies` is not edited)
1. Create `societies_head_grants`; copy every `role = 'HEAD'` membership into an active grant (`grantReason = CREATED_WITH_SOCIETY`, `grantedAt = joinedAt`).
2. Add `group` and `position` to `societies_memberships`:
   - HEAD becomes CORE, with no position;
   - EDITOR becomes CORE with position "Editor", and EVENT_MANAGER becomes CORE with position "Event Manager", so the old titles survive as display text;
   - MEMBER becomes GENERAL.

   Then drop `role`, the `societies_member_role` type and the index `societies_memberships_one_head`.
3. `societies_societies`:
   - `categorySlug` and `description` become nullable, and their CHECKs are adjusted;
   - the name limit goes to 150;
   - add `shortName`, `sourceKey` (unique), `sourceUrl`, `sourceFetchedAt`, `verifiedAt`, `verifiedById`.
4. Create `societies_faculty_associations`.
5. Add `onBehalfOfType` and `onBehalfOfId` to `admin_audit_logs`, with an index.

**Data impact:**
- Every existing society already has exactly one Head, so the at-least-one rule holds immediately.
- No posts, follows, requests or audit rows change.
- Former Editors and Event Managers lose posting rights, matching the new model; their titles remain as positions.
- The local database holds only fictitious test data (20 societies, checked 2026-10-25), which is migrated, not reset.
- Forward-only: the old tiers cannot be restored automatically, but the old titles are preserved as positions.

## 5. Society list import (OI-57)
- Research dataset: `data/society-import/thapar-student-organisations.2026-10-25.json` (full) and `.csv` (review sheet). The dry-run report is in `docs/status/society-import-dry-run-2026-10-25.md`.
- The importer (to be written) reads the dataset.
  - `--dry-run` writes nothing and prints the same report against the target database.
  - `--apply` (owner go-ahead only) creates every new record in one transaction as **inactive, unverified, awaiting Head**, with its faculty associations unverified.
  - It skips records whose `sourceKey` already exists, never overwrites, never deletes, and never merges a flagged duplicate without an explicit owner decision recorded in the dataset.
- Logos: the source's image links are kept as references only. Nothing is downloaded or hot-linked, because reuse rights are unknown (OI-30). Logos come later through uploads by Heads.
  - *Superseded 2026-10-25 by the owner's instruction to treat officially published Thapar data (including images) as verified and to use official logos and photos:* logos hosted on thapar.edu (and its subdomains) are downloaded over https and imported as system assets through the same quarantine-first validation as user uploads, with the published URL kept as provenance (`logoSourceUrl`). Logos hosted elsewhere (6 records: Google image cache, Wikimedia, LinkedIn, a personal site) are not imported. A Head's later upload replaces nothing automatically: an imported logo is attached only when no logo is set.
- Visibility, **revised by the owner on 2026-10-25** ("I want to see them on the app"; official Thapar data is authoritative):
  - Imported official organisations are shown to every signed-in student, in a separate section of the Societies page ("Official student organisations", marked "Official listing · awaiting a Head").
  - Their pages are readable, with the officially published description, links and logo.
  - They stay **read-only** until a platform admin appoints a first Head and activates them: no posts, membership, following or events. The Societies directory proper (FR-SOC-4) still lists active societies only.
  - Faculty associations that the import matched to the official faculty directory (by institutional email, or by name and department) are shown on the society page for information.
  - Unmatched associations stay visible to admins only until reviewed.
  - No permission is ever derived from an association.
- Contradictory fields (owner, 2026-10-25): fields flagged as contradictory in the source stay empty in the record until resolved from official sources; the original source values are preserved in the dataset file.

## 6. Tests to add with the implementation
- Permission matrix: Head vs member vs follower vs admin, active and inactive society.
- Multiple Heads: two or three Heads with equal powers; any Head can approve requests, publish, edit and delete posts, and edit the profile.
- The at-least-one-Head rule:
  - removing the last Head is refused;
  - concurrent removals of the last two Heads never leave zero (row lock);
  - handover keeps exactly the right grants;
  - the incoming person must have signed in.
- Revocation: a removed Head is refused on the next request; their account, membership, posts and attribution remain.
- Boundaries: a Head of A is refused in B; core and general members and followers cannot manage; positions grant nothing.
- Workspace: only active Heads can open it; a revoked Head is redirected.
- Audit attribution: `actorId` is the individual and `onBehalfOf` is the society, for posts, membership decisions, Head changes and handovers.
- Import:
  - the dry run writes nothing;
  - apply is idempotent (a second run creates nothing);
  - flagged duplicates are skipped;
  - imported societies are invisible to students until activated;
  - unverified faculty associations are hidden.
- Migration: tier data maps to grants and positions as in §4.

## 7. Requirement impact
- **FR-SOC-2** ("membership roles: Head, Editor, Event Manager, and Member"): replaced, on the owner's explicit instruction of 2026-10-25, by Head authorisation plus free display positions. Editor and Event Manager remain possible as position titles but grant nothing. Recorded as an owner-approved deviation in `traceability.md` and `open-issues.md` (OI-56).
- **FR-SOC-3** ("Heads and Editors"): all Heads.
- **FR-EVT-1** ("Heads and Event Managers"): all Heads of the society (Slice 2b).
- **SPEC-SOC-PERM** (per-row permissions): kept. Access comes from the head-grant row.

## 8. Questions for the owner (answered in §10)
1. **Co-Heads.** May any Head add or remove *other* Heads, or only admins (Heads can always hand over their own seat)?
2. **Electoral Club / Thapar Electoral Club.** One organisation or two (dry-run report §3)?
3. **Suspect source fields.** Energy Conservation Club shows EBSB's email and website, and CARE shows CCS's website. Import them empty and flagged for verification (recommended), or as published?
4. **Faculty associations.** Display them on the society page once verified by a Head or an admin (recommended), or keep them admin-only?

## 10. Owner decisions (2026-10-25, revision 3)
The owner's implementation instruction of 2026-10-25 is the authoritative specification and settles §8:
1. **Co-Heads.** Active Heads **and** platform admins can add and remove Heads. Safeguards:
   - an incoming Head must have signed in at least once;
   - the last active Head of an active society can never be removed, including under concurrent requests (row lock on the society);
   - handover is atomic (incoming access first).
2. **Electoral Club / Thapar Electoral Club.** Kept as two separate records, flagged as a possible duplicate.
3. **Questionable source fields.** Raw source values are kept and flagged as unverified. Text that is not a valid URL never becomes a link.
4. **Faculty associations.** Unverified and visible to admins only until reviewed.
5. **Dataset files.** Included in the change set after a safety review (secrets, unnecessary personal data, redistribution).
6. **Import.** Not run. A future import must keep stable identities, duplicate detection, a dry-run report and no automatic overwrites, and must create organisations hidden, inactive, unverified and awaiting their first Head. Every import needs the owner's explicit approval.
7. **Inactive societies** may have zero Heads (imported, awaiting their first Head). **Every active society has at least one active Head**; a society cannot be activated without one.

## 11. Owner decisions on faculty data (2026-10-25, later the same day)
1. **Faculty source.**
   - https://www.thapar.edu/faculties, together with every department or school faculty page it redirects to, is the **only** authoritative source for faculty names, designations, departments, institutional emails, photos and other details.
   - The student-organisations site, search snippets, third-party sites and guesses are not used.
   - Nothing about society leadership, appointments or permissions is inferred from faculty information.
2. **Dataset redactions applied.** The 99 unused faculty photo links and the 2 personal Gmail addresses were removed from the distributable dataset; each removal is recorded per entry.
3. **Result:**
   - 57 of 83 distinct faculty verified by exact institutional email;
   - 3 name-only matches flagged for review;
   - 23 unverified with a reason (`docs/status/society-import-dry-run-2026-10-25.md` §6).

   In the application, faculty associations still stay unverified and admin-visible until an admin reviews them.

## 12. Owner decision on official Thapar data (2026-10-25, latest)
1. Information published on the official Thapar website and its official department or school pages is **verified** for this project. This covers faculty names, institutional emails, designations, profile photos and photo URLs, department affiliations and other official details.
2. Official values are kept as published. Where the student-activities portal and the official faculty directory differ, both are kept with their sources; nothing is silently replaced.
3. Third-party sites, guesses and search snippets are never used.
4. Official data grants **no** application permission. Faculty information, society contact details and faculty associations never create Head or platform-admin access.
5. The import stays on hold.

Applied to the dataset:
- `review.sourceStatus = official_published`, `review.appReview = pending`;
- faculty: 59 people verified (57 by institutional email, 2 by name and department), 1 needs review, 23 with no official record.

## 13. Capacity separation (owner review 2026-10-25)
**Finding:** permissions were checked as "admin OR Head", so an admin without a Head grant passed Head-only checks, and an account holding both was audited "on behalf of the society" even when acting from the Administration tab.

**Fix:** every request now acts in exactly one capacity.
- **Society** (default): an active Head grant for that society only.
- **Platform admin** (`?as=admin`, or implicit on admin-only endpoints): the ADMIN role is confirmed on the server; the Head grant and membership are ignored, and there is no on-behalf-of attribution.

**Effect:**
- The society page exposes two separate permission maps (`can`, `adminCan`).
- The switcher lists only societies with an active Head grant.
- Tests: `tests/unit/societies/permissions.test.ts`; integration HD16 (one account heading two societies, revocation scoped to one), HD17 (swapped ids across societies), HD18 (capacity separation and audit).

## 9. History
- Revision 1 (2026-10-25, superseded): a permission hierarchy with Head, Editor and Event Manager powers, a "Heads only" switch, and transfer-style handover.
- Revision 2 (this): equal Heads, positions are display only, optional categories, import with provenance.
