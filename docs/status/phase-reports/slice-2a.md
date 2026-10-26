# Phase Report: Slice 2a (Society Hub)

Date: 2026-10-24. Status: **complete locally, with two documented partials; revision requested by the owner on 2026-10-25** (equal Heads of any number with at least one, display-only positions, a society workspace with switching, optional categories, and an import of the 56 organisations on the official student-activities directory: design in ADR-0013 revision 2, OI-56, OI-57; dry run in `docs/status/society-import-dry-run-2026-10-25.md`; not implemented yet). Nothing has been committed, pushed or deployed by Claude. Slice 1c (first deployment) is on hold at the owner's request; 2a depends only on 1b (`phases-and-acceptance.md`).

## Revision of 2026-10-25: the owner's society model (ADR-0013 rev. 3, OI-56, OI-57)

**What changed (plain language):**
- **Society management access** now comes only from an explicit **Head grant** (`societies_head_grants`).
  - Any number of Heads, all with the same full access: posts, profile, membership, display titles, adding and removing Heads.
  - Every active society always keeps at least one Head.
- **A Head hands over** to an incoming Head who has signed in at least once. The new Head gets access first, then the outgoing Head loses it, in one step, and it is audit-logged.
- **Heads and platform admins** add and remove Heads.
  - The last Head of an active society can never be removed, even by simultaneous requests (row lock).
  - Heads cannot remove themselves; they hand over.
  - Removing someone's Head access takes effect on their next request and keeps their account, membership, posts and history (revoked grants stay as tenure history).
- **Positions are display only.** Members are shown as Heads, core members or general members, with optional free-text titles such as "General Secretary". Former "Editor" and "Event Manager" roles became titles.
- **Society workspace** (`/societies/<name>/workspace`):
  - Heads switch into it from the sidebar's **"Acting as"** list, and a bar on every workspace page says "Acting as <society>".
  - Tabs: Posts, Members, Heads, Profile.
  - Anyone who is not an active Head gets a 404, checked on the server for every page and every API call.
- **Attribution:** students see posts as published by the society. The individual Head is shown only to the society's Heads and platform admins, and every workspace action is audited as "this person, on behalf of this society".
- **Platform admins** have an Administration tab on each society page: activate or deactivate (activation needs a Head), add or remove Heads (recovery), and review faculty associations.
- **Categories and descriptions** are optional; names can be up to 150 characters; societies record their source and whether their profile is verified.
- **Faculty associations** (from the official directory, later) stay hidden from everyone except platform admins until an admin verifies them.
- **Society list:**
  - A research dataset of all 56 organisations on studentsocieties.thapar.edu is in `data/society-import/`.
  - A read-only dry run is `npm run societies:import:dry-run`; the report is `docs/status/society-import-dry-run-2026-10-25.md`.
  - **Nothing is imported.** An import needs the owner's explicit approval.
- **Spec deviation (owner-approved 2026-10-25):** FR-SOC-2's fixed roles (Head, Editor, Event Manager, Member) are replaced by Head grants plus display groups and titles (traceability, OI-56).

**Faculty data and dataset redactions (later on 2026-10-25):**
- Faculty details in the society dataset were checked **only** against https://www.thapar.edu/faculties and the department faculty pages it redirects to.
- Result, after the owner's decision that officially published data is verified (ADR-0013 §12): 59 of 83 distinct faculty verified (57 by institutional email, 2 by name and department), 1 needs review, 23 have no official record.
- The 99 faculty photo links and 2 personal Gmail addresses were removed from the dataset.
- No society leadership or permission is inferred from faculty data.
- Details are in `docs/status/society-import-dry-run-2026-10-25.md` §6; still nothing is imported.

**Migration `20261025010000_societies_heads_identity` (data-preserving):**
- New columns and tables are added first.
- Every old HEAD membership is copied into an active grant; EDITOR and EVENT_MANAGER become CORE members titled "Editor" and "Event Manager"; MEMBER becomes GENERAL.
- Only then is the old `role` column dropped. The migration aborts if any HEAD row was not converted.
- Rehearsed on a temporary copy of the local database (then dropped), then applied locally with no schema drift. Row counts before and after are identical for users (69), sessions (109), audit entries (67), societies (20), memberships (28), posts (42), follows (18) and requests (8); 20 HEAD rows became 20 active grants.
- Tested again from scratch by `tests/integration/societies/migration.test.ts`.

**Verification of the revision (2026-10-25, local machine; actual results):**

| Command | Result |
|---|---|
| `npm run check:prerelease`, `npm run lint`, `npm run typecheck` | exit 0 |
| `npm run test:unit` | exit 0; 201 passed (11 files), including the new permission matrix (equal Heads; groups and titles grant nothing), schema rules and the import-plan / dataset-safety tests |
| `npm run test:integration` | exit 0; 103 passed (7 files). New: `societies/heads.test.ts` HD01 to HD15 (equal Heads, add/remove, last-Head protection under 4 concurrent removals × 3 rounds, atomic and concurrent handover, revocation without data loss, admin recovery, cross-society refusal, on-behalf-of audit, append-only audit, faculty visibility, `getSocietyActor`); `societies/migration.test.ts` MG01 to MG05 (old-shape data migrated with nothing lost) |
| `npm run spike:auth` | exit 0; 37 passed, 1 todo (unchanged) |
| `npm run check:build` | exit 0; 553 files scanned; test sign-in absent from the normal build |
| `npm run test:e2e` (14 emulated devices) | exit 0; 638 passed, 133 skipped (device-specific tests that run on one or two representative profiles; none failed). The Society Hub flow (two Heads, switcher, "Acting as", society attribution, approval by the second Head, display title, handover with immediate loss of access, admin deactivation) also passed 10 of 10 repeated runs on desktop Chrome and iPhone |
| `npm run check:em-dash` | **fails only on `AGENTS.md`** (two em-dashes added by `next dev`; not edited by Claude, owner decision pending). Every project file passes |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run societies:import:dry-run` | 56 would be created, 0 skipped, 0 invalid, 1 possible-duplicate pair kept separate, 6 records with unverified fields. **Nothing written** |

Screenshots: [workspace-1280.png](slice-2a/workspace-1280.png), [workspace-iphone-393.png](slice-2a/workspace-iphone-393.png), [workspace-heads-1280.png](slice-2a/workspace-heads-1280.png), [workspace-heads-iphone-393.png](slice-2a/workspace-heads-iphone-393.png), [identity-switcher-1280.png](slice-2a/identity-switcher-1280.png), [identity-switcher-iphone-393.png](slice-2a/identity-switcher-iphone-393.png).

Test-support fixes made on the way, all in tests only:
- `completeTestProfile` now uses its own test client address per call, as `testSignIn` already did, so the real per-address limit on profile completion is not shared by every simulated user.
- Two E2E selectors were made unambiguous.
- Two E2E waits now wait for the server's response instead of the button's state.

## Decisions applied (owner, 2026-10-24)
- **OI-10: follow plus approved membership.**
  - Any signed-in student can follow a society without approval. Following only fills their Home feed and grants nothing.
  - Joining needs a request that the Head approves; approved students become MEMBER.
  - Admins create societies and appoint the first Head, and Head transfers go through an admin.
  - The Head assigns Editor and Event Manager. Requests, decisions and role changes are audit-logged.
- **OI-11:** recruitment fields are roles sought, eligible years and branches, deadline and an optional https application link. Posts are PUBLIC (all signed-in users) or MEMBERS-only. Stories are public and expire after 24 hours.
- **OI-38:** a deactivated society is hidden from the directory, stays readable by direct link, and accepts no new posts, members or followers.
- **Login photo (G-25):** the owner will provide a campus photo; the brand-colour panel stays until then.

## Routine choices (made under the owner's standing instruction; easy to change)
- Only the Head decides membership requests (Editors cannot).
- A society has exactly one Head (database constraint).
- Members can leave. The Head cannot leave or be removed until an admin transfers the role.
- Deactivating a society cancels its pending requests.
- Nine seeded categories (OI-55, `[PROPOSED]`).
- A public core team (Head, Editors, Event Managers) is shown on the About tab. The full member list is visible to members only.
- Stories are short plain text (≤ 280 characters) until uploads exist.
- Post bodies use a small rich-text editor (bold, italic, lists, https links). The server sanitises every body with an allow-list, on write and again on read. The library is sanitize-html 2.18.1, the one planned in ADR-0008.

## What was built (plain language)
- **Directory** (`/societies`):
  - Every active society, with search and category filters.
  - Tabs: All, Following, My societies, and Inactive (admins only).
- **Society page** (`/societies/<name>`):
  - Header with counts, Follow, and Request to join / Withdraw request / Leave.
  - Tabs:
    - **Posts:** stories strip and type filters.
    - **About:** description, links, core team.
    - **Members:** members only.
    - **Manage:** for the Head, membership requests, role changes and profile editing; for admins, deactivate/reactivate and Head transfer.
- **Posts:** Heads and Editors write updates, recruitment drives and stories; save drafts; publish; edit; delete (deletion is audited). Members-only posts and drafts are a 404 for anyone who may not see them.
- **Home:** stories and the latest posts from societies the user follows or belongs to, then the module cards.
- **Create society** (`/societies/new`, admins only).

## Verification (2026-10-24, local machine)
| Command | Result |
|---|---|
| `npm run check:prerelease`, `npm run lint`, `npm run typecheck`, `npm run test:unit` | exit 0; 184 unit tests passed (112 before this slice) |
| `npm run check:em-dash` | **fails only on `AGENTS.md`** (not a project file Claude edits): `next dev` appended a "nextjs-agent-rules" block containing two em-dashes. Every project file passes. See "Owner action" below |
| `npm run test:integration` | exit 0; 83 passed (25 new in `tests/integration/societies/societies.test.ts`) |
| `npm run check:build` | exit 0; 464 files scanned; test sign-in absent from the normal build |
| `npm run test:e2e` (E2E build, 14 emulated devices) | exit 0; 638 passed, 133 skipped (device-specific) |
| `npm audit --omit=dev` | 0 vulnerabilities |

Acceptance criteria for 2a (`phases-and-acceptance.md`):
- **Permission matrix unit tests:** `tests/unit/societies/permissions.test.ts` checks every action for every global role × membership role × active/inactive society.
- **Cross-society 403:** integration P05. The Head of society A gets 403 in society B, and a post of B addressed through A's URL is 404.
- **Story invisible after 24 h (fake clock):** integration P02, at 23 h 59 m 59 s and at 24 h.
- **XSS corpus neutralised:** 40 payloads in `tests/unit/security/sanitize-html.test.ts` (scripts, event handlers, `javascript:`/`data:`/`vbscript:` links and encodings, SVG/MathML, CSS, forms, frames, mutation shapes). Integration P01 confirms stored bodies are clean.
- Also tested:
  - concurrent duplicate join requests (exactly one pending);
  - concurrent decisions (exactly one wins);
  - the one-Head rule;
  - CSRF, 401, `PROFILE_INCOMPLETE`, malformed ids;
  - rate limits (429) and fail-closed behaviour (503);
  - audit entries.
- **E2E** (`tests/e2e/societies.spec.ts`, desktop Chrome and iPhone):
  - The full flow works through the UI: create, publish, story, search, follow, Home feed, request, approve, deactivate.
  - Axe finds no serious or critical issues.
  - Students get 404 on admin pages and 403 from the API.

A real bug found by the tests and fixed: searching for `%` matched every society (SQL wildcards were not escaped).

## Screenshots
| Screen | 1280 px | Phone (iPhone 393) | Reference panel |
|---|---|---|---|
| Directory | [societies-1280.png](slice-2a/societies-1280.png) | [societies-iphone-393.png](slice-2a/societies-iphone-393.png) | – (no directory panel; cards follow panel 3 style) |
| Society page | [society-1280.png](slice-2a/society-1280.png) | [society-iphone-393.png](slice-2a/society-iphone-393.png) | 3 (no banner photo or logo until uploads; Message button omitted, G-07) |
| Home feed | [home-feed-1280.png](slice-2a/home-feed-1280.png) | [home-feed-iphone-393.png](slice-2a/home-feed-iphone-393.png) | 2 (trending and global search omitted, G-02/G-03) |
| New post | [new-post-1280.png](slice-2a/new-post-1280.png) | [new-post-iphone-393.png](slice-2a/new-post-iphone-393.png) | – |

## Partial or not yet built (honest list)
- **Logos and banners (FR-SOC-1):** need the upload pipeline (2d) and file validation (3a). Initials and a brand-colour banner are shown meanwhile.
- **Expired-story cleanup job (FR-SOC-3):** Slice 3a. Expired stories are already invisible on every read.
- **Image stories:** need uploads.
- **Notifications** (for example "your request was approved"): Slice 3a.
- **Admin dashboard consolidation:** Slice 5. Admin controls currently live on each society's Manage tab.
- **JSON read endpoints:** pages render on the server; read APIs are added when a client needs them (PWA, Slice 6).

## Owner actions
1. **`AGENTS.md`:** `next dev` (Next.js 16.4) re-adds a "nextjs-agent-rules" block with em-dashes every time it starts, which fails `npm run check:em-dash`.
   - Suggested fix: remove the block and set `agentRules: false` in `next.config.ts`.
   - Claude has not touched `AGENTS.md`; your approval is needed.
2. Review the routine choices above, and the category list (OI-55).
3. Provide the login photo (G-25) when convenient.
4. To try it locally:
   - Add your own @thapar.edu address to `ADMIN_EMAILS` in `.env`.
   - Restart `npm run dev` and sign in again: the admin role is granted at sign-in and older sessions are revoked.
   - Then create a society. The Head must be someone who has signed in once; it can be yourself.

## Local data note
E2E runs create fictitious societies in the local development database. Each run deactivates the societies it creates, so they are hidden from the directory; admins can still see them under "Inactive".
