# Modules: Boundaries, Ownership and Contracts

## 1. Module list

The spec lists the API modules (§4.2) as Identity, Societies, Events, FindMates, StudyMaterial, Faculty, Calendar, Archive, Admin. Placement is added from SCOPE-1, approved 2026-10-23. Shared infrastructure modules are `[PROPOSED]`.

| Module | Owns tables (proposed) | Spec owner (Table 5.2, historical) | Implementer |
|---|---|---|---|
| identity | users, user_skills, sessions, accounts, verifications | – (shared infra) | Claude (owner reviews) |
| societies | societies_categories, societies_societies, societies_memberships, societies_membership_requests, societies_follows, societies_posts (Slice 2a) | Person A | Claude (owner reviews) |
| events | events, event_interests, event_registrations | Person B | Claude (owner reviews) |
| findmates | mate_requests, mate_responses, mate_connections, chat_messages | Person C | Claude (owner reviews) |
| studymaterial | study_materials, study_material_votes | Person D | Claude (owner reviews) |
| archive | archive_projects, archive_project_tags, comments* | Person A | Claude (owner reviews) |
| faculty | faculty_profiles, faculty_claims | Person B | Claude (owner reviews) |
| calendar | calendar_entries, calendar_occurrences | Person C | Claude (owner reviews) |
| placement | placement_records | unassigned | Claude (owner reviews) |
| admin | audit_logs, moderation_reports | Person A | Claude (owner reviews) |
| assets (shared) | assets | Person D | Claude (owner reviews) |
| outbox (shared) | outbox_events | Person D (Worker 1), Person C (Worker 2) | Claude (owner reviews) |
| notifications (shared) | notifications | Person C | Claude (owner reviews) |
| realtime (shared) | – (no DB access) | Person B | Claude (owner reviews) |

\* Comment ownership depends on OI-23.

## 2. Boundary rules `[SPEC]` + `[PROPOSED]` enforcement

1. A module's tables are read and written **only** by that module's repository layer `[SPEC]`.
2. Other modules call the module's **public service interface** (`modules/<name>/index.ts` exports). They never deep-import its internals `[PROPOSED]`.
3. Cross-module **foreign keys** are allowed for integrity (e.g. `event_registrations.user_id → users.id`). Cross-module **queries/joins in code** are not. If a page needs data from two modules, the route composes two service calls, or one module exposes a purpose-built read method `[PROPOSED]`.
4. Modules talk to background work only through the outbox (`outbox.enqueue(tx, event)`), inside the caller's transaction.
5. The realtime code path imports no DB client.
6. Enforcement: an ESLint boundaries rule plus a CI test that fails on forbidden imports (Slice 1a) `[PROPOSED]`.

Proposed folder shape (ADR-0011):

```
src/
  app/                      # Next.js routes (thin: parse → call service → map errors)
  modules/<name>/
    index.ts                # public interface (only importable file)
    service.ts  repo.ts  schemas.ts  permissions.ts  events.ts
  shared/                   # db client, outbox, storage adapter, auth helpers, sanitiser
  service/                  # long-running service entry: realtime/ + workers/
```

## 3. Service contracts (initial, `[PROPOSED]`)

These are the cross-module calls known today. Each is filled in when its slice starts. All functions take an `actor` (authenticated user context) unless marked system.

| Module | Public operation | Used by |
|---|---|---|
| identity | `getUser(id)`, `getUsers(ids)`, `requireSession(req)`, `revokeSession(sessionId)`, `revokeUserSessions(userId)`, `setRole(userId, role)` (system/admin) | all |
| societies | `getSocietyActor(userId, societyId)` (implemented 2026-10-25, ADR-0013 §3.7: the society when the user holds an active Head grant for that active society, else null; call it on every request), `getSocietySummaries(ids)` (to add in 2b) | events, calendar |
| events | `listEventsForCalendar(range, actor)`, `getEventSummaries(ids)` | calendar |
| assets | `createUploadIntent(actor, spec)`, `completeUpload(actor, assetId)`, `getDownloadUrl(actor, assetId)`, `assertApproved(assetId)` | studymaterial, archive, societies |
| notifications | `notify(tx, recipientId, type, payload)` (writes via outbox) | events, findmates, studymaterial, archive, faculty |
| outbox | `enqueue(tx, type, payload, dedupeKey?)` | all |
| realtime | `publish(channel, event)` (system; via adapter) | events, findmates, notifications |
| admin | `audit(tx, actor, action, target, details)` | all |
| faculty | `requestClaim`, `decideClaim` (admin) | admin UI |
| placement | `getMatrix(filters)` (suppression applied inside) | placement UI |

## 4. Outbox event catalogue (initial, `[PROPOSED]`)

| Event type | Producer | Handler (worker) | Idempotency key |
|---|---|---|---|
| `file.uploaded` | assets | W1 validate → approve/reject | asset_id (state-conditional) |
| `asset.approved` / `asset.rejected` | W1 | notifications, owning module status | asset_id |
| `event.registration.created` | events | notifications | registration_id |
| `event.interest.changed` | events | realtime publish | event_id + version |
| `mate.response.created` / `.accepted` / `.rejected` | findmates | notifications (+ realtime) | response_id + status |
| `calendar.rule.changed` | calendar | W2 re-expand | entry_id + rule version |
| `archive.project.decided` | archive | notifications | project_id + decision |
| `faculty.claim.decided` | faculty | notifications, identity.setRole | claim_id |
| scheduled ticks (sweep) | service | W2: story cleanup, mate expiry, stale assets, occurrence window, outbox retention | job name + window |
