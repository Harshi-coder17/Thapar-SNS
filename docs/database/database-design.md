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
- Module table separation: one Postgres schema per module vs table-name prefixes is decided in Slice 1a (ADR-0011).

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
