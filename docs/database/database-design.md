# Database Design

`[PROPOSED]` draft derived from the spec's class diagram (Figure 9.1), entity table (Table 4.3), FR text and use cases. Prisma schema and migrations are written in the slice that owns each module, and this document is updated alongside them.

## 1. Global rules `[SPEC]`
- UUID primary keys (non-guessable).
- `TIMESTAMPTZ` for every timestamp (stored UTC; displayed Asia/Kolkata).
- Business rules enforced by **constraints** (unique, check, FK), not only application code.
- Module isolation: tables owned per module (see `architecture/modules.md`).
- Enumerated status columns for state machines.

## 2. Platform `[PROPOSED]`
- PostgreSQL on Neon (ADR-0003); local development and integration tests use Docker PostgreSQL of the **same major version**.
- Prisma ORM 7.10.1 (ADR-0008) with `@prisma/adapter-pg`.
- Features Prisma can't model go in raw SQL migration steps: `pg_trgm` extension, generated `tsvector` columns, GIN indexes, partial indexes, check constraints.
- Module table separation `[APPROVED 2026-10-24]`: table-name prefixes per module in the `public` schema (`identity_*`, then `societies_*`, …), see ADR-0011.
- Migrations: `prisma/migrations/` (committed). Applied with `npm run db:migrate` (`prisma migrate deploy`): `20261024000000_identity_init`, `20261024010000_identity_profile_admin_audit`, `20261025000000_societies`, `20261025010000_societies_heads_identity` (ADR-0013).

### Implemented: identity (Slice 1b)
| Table | Purpose | Key constraints |
|---|---|---|
| `identity_users` | One row per Google identity that passed the domain policy | `id uuid`, `email` unique (lower-cased), `role identity_user_role` default `STUDENT` |
| `identity_sessions` | Server-side sessions | `token` unique: stores **SHA-256(token)** only (ADR-0006); `expires_at`, `created_at` (absolute caps), `lastActiveAt` (inactivity limit, written at most every 30 s; `docs/auth/session-policy.md`), `userAgent` (device class, fixed at sign-in); FK to user, cascade |
| `identity_accounts` | Google account link | unique (`provider_id`, `account_id`); `account_id` is Google's `sub` |
| `identity_verifications` | Short-lived OAuth state (PKCE verifier) | expires in 10 minutes |
| `identity_rate_limits` | Auth rate-limit counters (C5) | `key` unique |
| `identity_users` (profile columns) | `roll_number`, `branch_code`, `year`, `profile_completed_at` (FR-AUTH-2) | roll number unique; year 1 to 5; CHECK: completed profile has all fields |
| `identity_branches` | Programme reference data (seeded, `[PROPOSED]` list) | `code` pk, `name` unique; FK from users (RESTRICT) |
| `identity_skill_tags` | Controlled tag vocabulary (OI-42, 65 seeded) | `slug` pk, `label` unique, `active` |
| `identity_user_skills` | A user's 3 to 10 tags | pk (`user_id`, `tag_slug`) |
| `admin_audit_logs` (admin module) | Append-only audit log | trigger rejects UPDATE, DELETE, TRUNCATE; `actor_id`/`target_id` without FKs so history survives |

### Implemented: societies (Slice 2a, revised by ADR-0013 on 2026-10-25)
| Table | Purpose | Key constraints |
|---|---|---|
| `societies_categories` | Category reference data (OI-55, 9 seeded, `[PROPOSED]`) | `slug` pk, `label` unique |
| `societies_societies` | Society profile and identity (FR-SOC-1): name, slug, optional `shortName`, optional description, **optional** category, `socialLinks` jsonb (https only), contact email, `isActive` (OI-38), creator; provenance `sourceKey`, `sourceUrl`, `sourceFetchedAt`, `verifiedAt`/`verifiedById`; official listing labels `sourceType`, `sourceSubtype` (kept exactly as published; mapped to a category by an explicit table, `source-categories.ts`) | `slug` unique and URL-safe (CHECK); unique `lower(name)`; name 3..150, description NULL or 1..4000, short name 1..30, source URL https (CHECKs); `sourceKey` unique; category FK RESTRICT (nullable) |
| `societies_memberships` | Who belongs to the society and how it **displays** them: `group` CORE / GENERAL and an optional free-text `position` (title). **Grants nothing** | pk (`societyId`, `userId`); position 1..60 (CHECK) |
| `societies_head_grants` | **The only source of management access** (ADR-0013): one row per Head tenure; `grantReason` MIGRATED / CREATED_WITH_SOCIETY / ADDED / HANDOVER / ADMIN_RECOVERY; `revokedAt`, `revokedById`, `revokeReason` REMOVED / HANDOVER. Never deleted (history) | **one active grant per society and person** (partial unique index `WHERE revokedAt IS NULL`); revocation needs a reason (CHECK); at least one active grant per active society is enforced by the service under `SELECT ... FOR UPDATE` on the society row |
| `societies_faculty_associations` | Faculty linked to a society by a source, exactly as published (`sourceRole`); not accounts, not permissions; `verifiedAt`/`verifiedById` | visible to platform admins only until verified |
| `societies_membership_requests` | Join requests and decisions (OI-10), kept as history | **one PENDING request per student and society** (partial unique index); decided requests need `decidedAt` (CHECK); message ≤ 500 |
| `societies_follows` | Following (owner decision 2026-10-24); grants nothing | pk (`societyId`, `userId`) |
| `societies_posts` | Updates, recruitment drives, stories (FR-SOC-3, OI-11); `body` is sanitised HTML (stories: plain text); `publishedAt` null = draft | CHECKs: stories are public, published and expire, and have no title; only stories expire; recruitment posts list 1..10 roles, other types carry no recruitment fields; years ⊂ 1..5; application URL https; body ≤ 20000 |

`admin_audit_logs` gained `onBehalfOfType` / `onBehalfOfId` (nullable, indexed): a Head acting in the society workspace is recorded as the individual on behalf of the society.

Migration `20261025010000_societies_heads_identity` copied every old HEAD membership into an active grant (`MIGRATED`) and turned EDITOR / EVENT_MANAGER into CORE members with the titles "Editor" / "Event Manager" before dropping the old `role` column; it aborts if any HEAD row was not converted. Rehearsed on a copy of the local database and verified by `tests/integration/societies/migration.test.ts`.

Foreign keys to `identity_users` (cross-module FKs for integrity only, modules.md §2 rule 3). Logo and banner columns were added with the asset tables (Slice 2d, migration `20261026000000_platform_modules`).

All ids are UUIDs (generated by Prisma), all timestamps `timestamptz`.

### Implemented: platform modules (Slices 2b to 6, migration `20261026000000_platform_modules`, 2026-10-25)
Additive only: no existing column or row was changed. Rehearsed on a temporary copy of the local database, then applied; `prisma migrate diff` reports no drift.

| Module | Tables | Key constraints |
|---|---|---|
| assets | `assets_assets` (quarantine, published and thumbnail keys; declared and actual size, MIME, SHA-256; status; rejection reason; source URL for official imports) | keys unique; size > 0, SHA-256 hex, APPROVED needs a published key, REJECTED needs a reason (CHECKs) |
| outbox | `outbox_events` (type, payload, dedupe key, status, attempts, lease) | `dedupeKey` unique; partial index on due rows |
| notifications | `notifications_notifications` | unique (`sourceKey`, `recipientId`): re-runs never duplicate |
| events | `events_events`, `events_interests`, `events_registrations` | end after start, capacity 1..100000, 0 ≤ registered ≤ capacity, title 3..150 (CHECKs); pk (event, user) for interest; unique (event, user) registration (FR-EVT-5) |
| findmates | `findmates_requests`, `findmates_request_skills`, `findmates_responses`, `findmates_connections`, `findmates_chat_messages` | team size 2..10, 1 ≤ current count ≤ team size (CHECKs); unique (request, responder); one connection per response |
| studymaterial | `studymaterial_materials`, `studymaterial_votes` | semester 1..10, votes ≥ 0 (CHECKs); pk (material, user) vote; full-text index (title, subject code, description) |
| archive | `archive_projects`, `archive_project_tags`, `archive_screenshots`, `archive_votes`, `archive_comments` | GitHub URL pattern, comment depth 1..3, screenshot position 0..4 (CHECKs); pk (project, user) vote; full-text index |
| faculty | `faculty_profiles`, `faculty_claims` | `sourceKey` unique (stable import key); one PENDING claim per profile and one per claimant (partial unique indexes); full-text and trigram (`pg_trgm`) indexes for typo-tolerant name search |
| calendar | `calendar_entries` (RRULE, rule version, expanded-to), `calendar_occurrences` | end ≥ start; PERSONAL exactly when it has an owner (CHECKs); pk (entry, start) occurrence |
| placement | `placement_records` (aggregate counts only, citation and source date) | unique (year, programme, branch, company, offer type); counts ≥ 0 and placed ≤ eligible (CHECKs); no per-student column exists |
| admin | `admin_moderation_reports` | unique (target, reporter) |

Also added: `identity_users.bannedAt` / `bannedReason`; `societies_societies.logoAssetId`, `bannerAssetId`, `logoSourceUrl`; `societies_faculty_associations.facultyProfileId` and `matchBasis` (link to the official directory profile).

## 3. Tables by module

Columns listed are the minimum; `id uuid pk`, `created_at`, `updated_at` are implied.

### identity
| Table | Key columns | Constraints / indexes |
|---|---|---|
| users | email, name, roll_number, branch, year, role (STUDENT/FACULTY/ADMIN), profile_completed_at, banned_at | unique(lower(email)); check email domain = thapar.edu; unique(roll_number) where not null (OI-27) |
| user_skills | user_id, tag | pk(user_id, tag); tag ∈ controlled vocabulary (OI-42) |
| sessions | user_id, **token_hash**, expires_at, ip, user_agent | unique(token_hash); index(user_id). Shape depends on the auth spike (ADR-0006) |
| accounts / verifications | as required by the auth library | owned by identity |

### societies
| Table | Key columns | Constraints |
|---|---|---|
| societies | name, slug, description, category, logo_asset_id, banner_asset_id, social_links jsonb, is_active | unique(slug) |
| society_memberships | society_id, user_id, role (HEAD/EDITOR/EVENT_MANAGER/MEMBER), joined_at | pk(society_id, user_id) |
| society_posts | society_id, author_id, post_type (UPDATE/RECRUITMENT/STORY), title, body (sanitised), visibility, recruitment fields (OI-11), expires_at, published_at | check(post_type <> 'STORY' or expires_at is not null) |

### events
| Table | Key columns | Constraints |
|---|---|---|
| events | society_id (nullable: admin events), title, description, venue, start_at, end_at, capacity, status, registration_schema jsonb | check(end_at > start_at); check(capacity > 0) |
| event_interests | event_id, user_id | pk(event_id, user_id) |
| event_registrations | event_id, user_id, status (REGISTERED/WAITLISTED/CANCELLED per OI-14), responses jsonb, waitlist_position | unique(event_id, user_id) `[SPEC FR-EVT-5]` |
| (counter) events.interest_count, events.registered_count | maintained in the same transaction | Capacity enforced with `SELECT … FOR UPDATE` on the event row |

### findmates
| Table | Key columns | Constraints |
|---|---|---|
| mate_requests | creator_id, title, description, type (HACKATHON/PROJECT/CASUAL), skills_needed text[], subject (OI-15), team_size, current_count, status (OPEN/CLOSED/EXPIRED), expires_at | check(team_size between 2 and 10); check(current_count between 1 and team_size) |
| mate_responses | request_id, responder_id, message, status (PENDING/ACCEPTED/REJECTED), decided_at | unique(request_id, responder_id); responder ≠ creator |
| mate_connections | request_id, response_id, user_a_id, user_b_id | unique(response_id) |
| chat_messages | connection_id, sender_id, body, created_at | index(connection_id, created_at) |
| Metric support | first_accepted_at on mate_requests | for MET-1 |

### studymaterial / assets
| Table | Key columns | Constraints |
|---|---|---|
| assets (shared) | owner_id, purpose, original_name, declared_mime, detected_mime, size_bytes, sha256_declared, sha256_actual, storage_key, status, rejection_reason | status transitions forward-only (enforced in service + trigger `[PROPOSED]`) |
| study_materials | uploader_id, asset_id, subject_code, title, description, type (NOTES/PYQ/REFERENCE), semester, branch, upvote_count, search_tsv (generated) | unique(asset_id); GIN(search_tsv); index(subject_code, semester) |
| study_material_votes | material_id, user_id | pk(material_id, user_id) `[SPEC FR-MAT-4]` |

### archive
| Table | Key columns | Constraints |
|---|---|---|
| archive_projects | submitter_id, title, description, github_url, status (SUBMITTED/APPROVED/REJECTED), reviewed_by, review_note, search_tsv | GIN(search_tsv) |
| archive_project_tags | project_id, tag | pk |
| archive_project_screenshots | project_id, asset_id, position | |
| comments | see OI-23: polymorphic (entity_type, entity_id) as in the class diagram, **or** per-entity FK `archive_project_id`. Both include parent_id, depth (check ≤ 3), is_hidden | |

### faculty
| Table | Key columns | Constraints |
|---|---|---|
| faculty_profiles | user_id (nullable), name, department, designation, cabin, specialization text[], office_hours, public_email, is_verified, search_tsv | unique(user_id) where not null; GIN(search_tsv); GIN(name gin_trgm_ops) |
| faculty_claims | profile_id, claimant_id, status (PENDING/APPROVED/REJECTED/REVOKED), decided_by, reason | unique(profile_id) where status='PENDING' (one active claim) |

### calendar
| Table | Key columns | Constraints |
|---|---|---|
| calendar_entries | owner_id (nullable for academic/campus), layer (ACADEMIC/CAMPUS/SOCIETY/PERSONAL), source_event_id (nullable), title, start_at, end_at, rrule, timezone | |
| calendar_occurrences | entry_id, starts_at, ends_at | unique(entry_id, starts_at); index(starts_at) |

### placement
`placement_records`: see `requirements/placement-matrix.md` §2.

### shared / admin
| Table | Purpose |
|---|---|
| outbox_events | background-jobs.md §3.1 |
| notifications | recipient_id, type, payload, source_event_id, read_at; unique(source_event_id, recipient_id) |
| audit_logs | actor_id, action, target_type, target_id, details jsonb, created_at. Append-only (no UPDATE/DELETE grant for the app role `[PROPOSED]`) |
| moderation_reports | OI-28 |

## 4. Concurrency hot spots (tested in their slices)
- Event registration capacity: row lock on the event during registration.
- Mate acceptance on the last spot: row lock on the request; check `current_count < team_size`.
- Interest toggle and votes: unique constraint, plus counter update in the same transaction.
- Outbox claims: `FOR UPDATE SKIP LOCKED`.

## 5. Retention and privacy `[PROPOSED]`, subject to OI-27
Sessions are deleted after expiry. Outbox `DONE` rows are kept for 14 days. Chat and notifications are retained while the account exists. Account deletion anonymises authored content (policy pending OI-27).
