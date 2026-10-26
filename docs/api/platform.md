# Platform API (Slices 2b to 6)

Implemented 2026-10-25. Common rules (`src/shared/http/api-action.ts`), applied to every endpoint below in this order:

1. **Origin check** on every non-GET request (OI-52 CSRF protection).
2. **Rate limit per client address**, then **session** (401 without one), then **completed profile** (403 `PROFILE_INCOMPLETE`), then **rate limit per user**.
3. **Path ids** must be UUIDs (404 otherwise).
4. **Capacity** (ADR-0013 §3.4): one per request, never combined.
   - *personal*: the default. `?as=admin` is refused with 403.
   - *platform*: requires `?as=admin` and the ADMIN role. Gives no society powers.
   - *either*: personal by default, platform with `?as=admin`.
   - A society Head acts in the personal capacity: the society grant is checked from the database on every request.
5. **JSON body** of at most 64 KB (256 KB for rich text, 1.2 MB for placement CSV), otherwise 413.
6. Errors use the shape in [README.md](README.md). A failure inside the handler returns a safe 503. A client that disconnects mid-request gets nothing and nothing is logged.

**Rate rules** (per minute, per address / per user):

| Rule | Per address | Per user |
|---|---|---|
| read | 300 | 180 |
| write | 120 | 60 |
| create | 60 | 20 |
| admin | 120 | 60 |

## Uploads and files (2d, 3a)

| Method and path | Capacity | Notes |
|---|---|---|
| `POST /api/uploads/intents` | personal | `{ purpose, fileName, contentType, size, sha256 }`. Type and size are checked first (400 or 413). There is a daily quota (429). Returns `{ assetId, uploadUrl, contentType, expiresAt }`. The browser PUTs straight to storage within 15 minutes. |
| `POST /api/uploads/{assetId}/complete` | personal | Owner only. Moves the asset to UPLOADED and queues `file.uploaded` in the same transaction, then nudges the service. |
| `GET /api/uploads/{assetId}` | personal | Owner only: `{ status, rejectionReason }`. |
| `GET /api/assets/{assetId}/file?variant=thumbnail` | signed in | Society logos and banners and faculty photos only. Redirects (302) to a 5-minute signed URL; 404 unless APPROVED. |
| `GET /api/materials/{id}/file?download=1` | signed in | The material must still be visible (not hidden or deleted). |
| `GET /api/archive/{projectId}/screenshots/{assetId}` | signed in | The project must be visible to the viewer. |
| `PUT /api/societies/{id}/image` | either | `{ kind: "logo" or "banner", assetId or null }`. Society Heads (personal capacity) or admins. The asset must be the caller's own upload for that purpose. Audited on behalf of the society. |

## Events (2b)

| Method and path | Capacity | Notes |
|---|---|---|
| `POST /api/events` | either | With `societyId`: an active Head of that active society, personal capacity. Without it: a campus event, platform capacity. Body: `{ title, description, venue, startAt, endAt, capacity, registrationSchema[≤10], publish }`. Returns 201 `{ event: { id } }`. |
| `PATCH /api/events/{id}` | either | Same managers. Capacity cannot drop below the number registered. A capacity increase promotes the waitlist. |
| `POST /api/events/{id}/publish` | either | DRAFT only (422 otherwise). The start must be in the future. |
| `POST /api/events/{id}/cancel` | either | `{ reason }`. Terminal. Registrants are notified. Platform admins may cancel any event. |
| `POST /api/events/{id}/registration` | personal | `{ responses }` validated against the event's questions. Idempotent (returns `already: true`). Waitlist when full. 422 when cancelled or closed. |
| `DELETE /api/events/{id}/registration` | personal | Before the start only. Promotes the first waitlisted person. |
| `PUT /api/events/{id}/interest` | personal | `{ interested }`. PUBLISHED or LIVE only. Returns `{ interestCount, version }` and queues a realtime update. |
| `GET /api/events/{id}/interest` | signed in | Current count, used to re-sync after a reconnect. |

## Find Mates and chat (2c, 4a)

| Method and path | Capacity | Notes |
|---|---|---|
| `POST /api/mates` | personal | `{ title, description, type, subject?, skills[1..10], teamSize 2..10, expiresAt ≤ 90 days }`. |
| `POST /api/mates/{id}/responses` | personal | `{ message }`. Not on one's own, closed or expired requests. One per student (409). The requester is notified. |
| `POST /api/mates/{id}/responses/{responseId}/decision` | personal | `{ decision: ACCEPT or REJECT }`. Requester only. The row lock means acceptance never exceeds the team size. Accepting creates the chat connection. |
| `POST /api/mates/{id}/close` | personal | Requester only. |
| `GET /api/connections/{id}/messages?after=` | personal | Participants only (404 for anyone else). |
| `POST /api/connections/{id}/messages` | personal | `{ body }` plain text, at most 4000 characters. Stored, then announced over realtime. |

## Study material (2d)

| Method and path | Capacity | Notes |
|---|---|---|
| `POST /api/materials` | personal | `{ assetId, subjectCode, title, description?, type, semester, branchCode }`. The asset must be the caller's own STUDY_MATERIAL upload. The material is listed once the file is APPROVED. |
| `PUT` / `DELETE /api/materials/{id}/vote` | personal | One vote per student. Returns `{ upvoteCount, voted }`. |
| `DELETE /api/materials/{id}` | personal | Uploader only (soft delete). |

## Faculty (4b, ADR-0010)

| Method and path | Capacity | Notes |
|---|---|---|
| `POST /api/faculty/{profileId}/claim` | personal | `{ message? }`. Any signed-in account may request; nothing is granted until an admin approves. One pending claim per profile and one per account (409); refused if the account already has a faculty profile (422). |
| `PATCH /api/faculty/{profileId}` | personal | The linked faculty member only: `{ cabin, officeHours, specialization }`. Audited. |
| `POST /api/admin/faculty-claims/{claimId}/decision` | platform | `{ decision, reason }`. Never one's own claim. Approval links the profile, sets the FACULTY role, revokes the claimant's sessions, audits and notifies, all in one transaction. |
| `POST /api/faculty/{profileId}/revoke` | platform | `{ reason }`. Unlinks the profile and returns the user to STUDENT (an ADMIN keeps ADMIN). |

## Archive (4c)

| Method and path | Capacity | Notes |
|---|---|---|
| `POST /api/archive` | personal | `{ title, description, githubUrl, tags[≤8], screenshotAssetIds[≤5] }`. Screenshots must be the caller's own. The project is invisible until reviewed. |
| `POST /api/archive/{id}/review` | platform | `{ decision, note? }` (note required to reject). No self-review. The submitter is notified. |
| `PUT` / `DELETE /api/archive/{id}/vote` | personal | Approved projects only. One vote per student. |
| `POST /api/archive/{id}/comments` | personal | `{ body, parentId? }`. The parent must be on the same project. Depth at most 3 (422). |
| `DELETE /api/archive/{id}/comments/{commentId}` | personal | Author only (hidden; replies stay). |

## Calendar (4d)

| Method and path | Capacity | Notes |
|---|---|---|
| `POST /api/calendar/entries` | either | `{ layer, title, startAt, endAt, allDay, rrule?, location?, description? }`. PERSONAL in the personal capacity; ACADEMIC and CAMPUS in the platform capacity. RRULE subset: DAILY, WEEKLY, MONTHLY or YEARLY, with COUNT ≤ 1000 or UNTIL. |
| `PUT` / `DELETE /api/calendar/entries/{id}` | either | Someone else's personal entry is a 404. Changing the layer is refused. |
| `GET /api/calendar/export` | signed in | `text/calendar` (RFC 5545) with academic, campus, personal entries and the user's society events. |

## Placement (4e, PLC-1 to PLC-5)

| Method and path | Capacity | Notes |
|---|---|---|
| `POST /api/admin/placement/records` | platform | Create or replace one aggregate record (key: year, programme, branch, company, offer type). Audited. |
| `DELETE /api/admin/placement/records/{id}` | platform | Audited. |
| `POST /api/admin/placement/import` | platform | `{ csv }`. All-or-nothing. Any per-student column rejects the file. Audited. |

The matrix itself is a server-rendered page (`/placement`). It has no data API, so there is no export to students (placement-matrix.md §3.4).

## Notifications, realtime, reports, admin (3a, 3b, 5)

| Method and path | Capacity | Notes |
|---|---|---|
| `GET /api/notifications?cursor=` | personal | `{ items, nextCursor, unread }`. |
| `POST /api/notifications` | personal | `{ ids[≤100] }` or `{ all: true }`. Marks only the caller's own notifications. |
| `POST /api/realtime/ticket` | personal | `{ channels[≤20] }`. Each channel is checked now: the caller's own `user:` channel, public `event:` channels, and `connection:` channels they take part in. Returns `{ ticket, url, channels }`. The ticket is valid for 30 seconds and can be used once. |
| `POST /api/reports` | personal | `{ targetType, targetId, reason }`. Only for content the reporter can see (404 otherwise). One per item per user (409). |
| `POST /api/admin/reports/{reportId}` | platform | `{ action: HIDE or DISMISS, note }`. Resolves every open report on the item. Audited. |
| `POST /api/admin/moderation/restore` | platform | `{ targetType, targetId, note }`. |
| `POST /api/admin/users/{userId}/ban` | platform | `{ banned, reason }`. Never one's own account, never the last admin. Revokes sessions. Audited. |
| `POST /api/admin/users/{userId}/role` | platform | `{ role }`. Same guards. Revokes sessions. |
| `POST /api/admin/outbox/{eventId}/requeue` | platform | Re-queues a DEAD background job. |
| `PATCH /api/identity/profile` | personal | Edit your own name, branch, year and skills (OI-35). The roll number cannot be changed. `POST` on the same path is the first-time profile completion (identity.md). |

## Service endpoints (not public; bound to 127.0.0.1)

| Endpoint | Notes |
|---|---|
| `POST /internal/nudge` | HMAC-SHA256 over `timestamp.body` with a key derived from the server secret. Must be fresh within 60 seconds and is compared in constant time; 401 otherwise. |
| `GET /healthz` | `{ ok, clients, redis }`. |
| `WS /ws?ticket=` | The Origin must equal the app origin (403). The ticket is verified and its nonce consumed (401). Server-to-client only. |

Tests: `tests/integration/platform/*.test.ts`, `tests/unit/{events,findmates,calendar,placement,assets,service}/*`, `tests/e2e/platform.spec.ts`.
