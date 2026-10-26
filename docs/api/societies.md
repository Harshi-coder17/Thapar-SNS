# API Contract: societies (Slice 2a, revised by ADR-0013 on 2026-10-25)

Mirrors `src/modules/societies` (schemas in `schemas.ts`, rules in `permissions.ts`, handlers in `http.ts`) and the route handlers in `src/app/api/societies/`. Pages read data on the server through the module's query functions; every change goes through the endpoints below.

## Common rules
- **Auth:** every endpoint requires a session cookie **and a completed profile** (FR-AUTH-2). No session: 401 `UNAUTHENTICATED`. Incomplete profile: 403 `PROFILE_INCOMPLETE`.
- **CSRF:** strict Origin check on every endpoint (OI-52). Missing, foreign or cross-site: 403 `FORBIDDEN_ORIGIN`.
- **Authorisation, on every request, from the database:**
  - Society management needs an **active Head grant** for that society (`societies_head_grants`). All active Heads have the same full permissions.
  - Display groups and titles grant nothing; following grants nothing.
  - Platform admins (global role ADMIN) keep oversight and recovery actions only.
  - Nothing sent by the browser (roles, groups, flags) is trusted.
- **Capacity (platform admin vs society Head, kept separate):** every request acts in exactly one capacity.
  - **Society** (default): only an active Head grant (or membership, for reading) counts. The ADMIN role adds nothing.
  - **Platform admin** (`?as=admin`, or implicit on admin-only endpoints): the server confirms the ADMIN role; the Head grant and membership are ignored, and actions are audited without an on-behalf-of society.
  - The add-Head, remove-Head and profile endpoints accept both capacities.
  - `POST /api/societies`, `PUT /status` and `PATCH /faculty/{id}` are platform-only.
  - All other endpoints are society-only: `?as=admin` gives 403 there, and so does `?as=admin` from an account without the ADMIN role.
  - An account that is both a Head and an admin is therefore always audited correctly. Tests: HD16 to HD18.
- **Ids:** path ids must be UUIDs. Anything else, or an id that does not exist **or is not visible to the actor** (drafts, members-only posts), is 404 `NOT_FOUND`.
- **Rate limits** (PostgreSQL, fixed 60 s windows, keys prefixed `societies:`):
  - `write`: 120 per address and 60 per user;
  - `posts`: 60 and 20;
  - `admin` (also Head changes): 60 and 30.

  Over the limit: 429 `RATE_LIMITED` with `Retry-After`. If the limit store or the session lookup fails: 503 `UNAVAILABLE`, nothing changed.
- **Errors:** 400 `VALIDATION` with `fields`; 403 `FORBIDDEN`; 404; 409 `CONFLICT`; 422 `INVALID_STATE` (for example the last Head, an inactive society, a request already decided).
- **Unknown fields are rejected** (400), so clients cannot set `isActive`, `slug`, roles, groups-as-permissions or authors.
- **Audit:** every privileged action writes an append-only `admin_audit_logs` row with the individual (`actorId`), the action, the target, the time (`createdAt`) and, when a Head acted in the society workspace, `onBehalfOfType = "society"` and `onBehalfOfId = <society id>`. Platform-admin actions and a student's own actions have no on-behalf-of value.
- **Rich text:** post bodies are sanitised on the server with an allow-list (`src/shared/security/sanitize-html.ts`) before they are stored, and again when read. Stories, descriptions, titles and messages are plain text.

## Societies

### POST /api/societies
Permission: platform admin (FR-SOC-1). Limit: admin.

Request:
```
{ name: 3..150,
  shortName?: ≤30,
  description?: ≤4000,
  categorySlug?: string (optional; omit for no category),
  headEmails: string[1..20],
  links?: { website?, instagram?, linkedin? } (https only),
  contactEmail? }
```
Every Head email must belong to someone who has **signed in at least once**; otherwise 400 (`fields.headEmails` lists the unknown addresses) and nothing is created. Each Head gets an active grant (`CREATED_WITH_SOCIETY`) and a membership (display group CORE). The society is created active and verified (reviewed by the creating admin).

Response 201: `{ society: { id, slug } }`. Errors: 400 (`name` taken ignoring case, unknown `categorySlug`, `headEmails`), 403.
Audit: `societies.society.created`, then `societies.head.added` for each Head. Tests: S02 to S04.

### PATCH /api/societies/{societyId}
Permission: any active Head (active society), or a platform admin. Limit: write.
Request: `{ description?, shortName?, categorySlug?, links?, contactEmail?, name? }`. Omitted optional fields are cleared. `name` is accepted from platform admins only, because the name is the society's identity; the URL name (`slug`) never changes.
Audit: `societies.society.updated` (on behalf of the society when a Head acts). Tests: D03, HD01, HD13.

### PUT /api/societies/{societyId}/status
Permission: platform admin (OI-38). Limit: admin. Request: `{ active: boolean }`.
- **Activating** needs at least one active Head (422 otherwise). Activating an unverified (imported) society records the admin's review.
- **Deactivating** hides the society from the directory, keeps its content readable by link, blocks new posts, follows and membership requests, and cancels pending requests.

Audit: `societies.society.status_changed`. Tests: D02, HD11.

## Heads (ADR-0013 §3.1)

### POST /api/societies/{societyId}/heads
Permission: an active Head of this active society, or a platform admin (recovery, any state). Limit: admin. Request: `{ email }`.
The person must have signed in at least once (400 otherwise). An already-active Head gives 409. The person becomes a member if they were not one, and existing display data is kept. Grant reason: `ADDED` (by a Head) or `ADMIN_RECOVERY` (by an admin).
Response 201. Audit: `societies.head.added`. Tests: HD03, HD11.

### DELETE /api/societies/{societyId}/heads/{userId}
Permission: an active Head of this active society (not for themselves: Heads hand over instead), or a platform admin.
- **Never removes the last active Head of an active society** (422). The society row is locked (`SELECT ... FOR UPDATE`) for the whole check-and-revoke, so concurrent requests cannot get around this.
- The grant is revoked (`revokedAt`, `revokedById`, reason `REMOVED`) and kept as history. The person's account, membership, posts and attribution stay.
- Access ends on their next request.

Audit: `societies.head.removed`. Tests: HD04 to HD07.

### POST /api/societies/{societyId}/heads/handover
Permission: the acting Head themselves (their own seat), in an active society. Platform admins use add/remove instead (403 here). Request: `{ email }` (an incoming person who has signed in at least once; not the actor).
Atomic, under the society lock:
1. The incoming person gets an active grant (`HANDOVER`) and membership (skipped if they are already a Head).
2. Then the outgoing grant is revoked (`HANDOVER`).

The outgoing Head stays a member.
Audit: `societies.head.handed_over` (`details.from`, `details.to`, on behalf of the society). Tests: HD08 to HD10.

## Following (owner decision 2026-10-24)

### PUT /api/societies/{societyId}/follow · DELETE /api/societies/{societyId}/follow
Permission: any signed-in user; PUT needs an active society (422 otherwise). Limit: write. Idempotent. Not audited (no privilege involved). Following only selects what appears in the user's Home feed. Tests: F01 to F03.

## Membership (OI-10)

### POST /api/societies/{societyId}/membership-requests
Permission: a non-member, non-Head, active society. Limit: write. Request: `{ message?: ≤500 }`.
Response 201 `{ request: { id } }`. Returns 409 if the person is already a member or a request is pending (one pending request per student and society, enforced by a partial unique index). Audit: `societies.membership.requested` (personal). Tests: M01, M03.

### DELETE /api/societies/{societyId}/membership-requests
The requester withdraws their own pending request. 404 if none. Audit: `societies.membership.cancelled`. Tests: M02.

### POST /api/societies/{societyId}/membership-requests/{requestId}/decision
Permission: any active Head. Limit: write. Request: `{ decision: "APPROVE" | "REJECT" }`.
A request is decided once (conditional update); a second decision is 422. Approval creates a GENERAL member.
Audit: `societies.membership.approved` / `.rejected` (on behalf of the society). Tests: M01, M02, M04, HD13.

### PATCH /api/societies/{societyId}/members/{userId}
Permission: any active Head. Request: `{ group?: "CORE" | "GENERAL", position?: string ≤60 | null }` (at least one). **Display information only:** it never grants anything; `role`, `HEAD` and any other field are rejected (400).
Audit: `societies.member.display_changed`. Tests: M05, HD01, HD13.

### DELETE /api/societies/{societyId}/members/{userId}
- With the caller's own id: leave the society. Not allowed for a Head (422): hand over first.
- Otherwise: a Head removes a member. A member who is a Head cannot be removed this way (422): remove their Head access first.

Deletes only the membership row, never the account or content.
Audit: `societies.member.left` / `.removed`. Tests: M06.

## Posts (FR-SOC-3, OI-11)

### POST /api/societies/{societyId}/posts
Permission: any active Head of an active society. Limit: posts.

Request:
```
{ type: "UPDATE" | "RECRUITMENT" | "STORY",
  title?,
  body,
  visibility?: "PUBLIC" | "MEMBERS",
  publish?: boolean (default true),
  recruitment?: {
    rolesSought: 1..10,
    eligibleYears?: 1..5[],
    eligibleBranchCodes?: string[],
    deadline?: ISO-8601 with offset,
    applicationUrl?: https } }
```
Rules:
- UPDATE and RECRUITMENT: title 3..120; body is rich text, 1..5000 characters of text after sanitising; `publish: false` saves a draft.
- RECRUITMENT needs `recruitment.rolesSought`; branches must exist; the deadline must be in the future when the post is published. Other types reject `recruitment`.
- STORY: plain text ≤ 280, no title, always PUBLIC, published at once, invisible 24 hours later.

**Shown publicly as the society.** The individual Head (`authorId`) is visible only to the society's Heads and platform admins.
Response 201 `{ post: { id } }`. Audit: `societies.post.published` / `.drafted`. Tests: P01 to P05, HD02, HD13.

### PATCH /api/societies/{societyId}/posts/{postId}
Permission: any active Head of an active society. Same fields as create, without `type`. Stories cannot be edited (422). Published posts stay published; `publish: true` publishes a draft.
Audit: `societies.post.updated` / `.published`. Tests: P04, P05, HD13.

### DELETE /api/societies/{societyId}/posts/{postId}
Permission: any active Head (also of an inactive society). Audit: `societies.post.deleted`. Tests: P05, P06, HD13.

## Faculty associations (ADR-0013 §3.5)

### PATCH /api/societies/{societyId}/faculty/{associationId}
Permission: platform admin. Request: `{ verified: boolean }`. Unverified associations are returned only to platform admins; verified ones are shown on the society page.
Audit: `societies.faculty.reviewed`. Tests: HD15.

## Server-rendered pages (no JSON read endpoints yet)
- `/societies`: directory of active societies (search, optional category, Following and My societies). Admins also see Inactive, labelled "Awaiting Head" when a society has no Head.
- `/societies/{slug}`: the single public page. Tabs: Posts, About (Heads, core members, verified faculty), Members (members, Heads, admins), Administration (platform admins: status, Head recovery, faculty review).
- `/societies/{slug}/workspace` (Posts, Members, Heads, Profile; posts/new and posts/{id}/edit): **active Heads only**, re-checked on the server for every page; anyone else gets 404. An "Acting as <society>" bar is always shown.
- Workspace switcher: the sidebar's "Acting as" list (personal account plus every society the user is an active Head of), read on the server.

## Cross-module contract
`getSocietyActor(userId, societyId)` (from `@/modules/societies`) returns `{ id, slug, name }` when the user holds an active Head grant for that **active** society, otherwise null. Slice 2b (Events) must call it on every request that creates or changes an event for a society, and must audit on behalf of the society. Tests: HD07, HD12.
