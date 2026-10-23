# Requirements

Sections 1–6 reproduce the baseline specification **verbatim** (only formatting changed; em-dashes in quoted spec text are replaced by other punctuation under the project-wide no-em-dash rule). They are `[SPEC]` and must not be edited except to fix transcription errors. Section 7 holds approved additions. Section 8 lists spec inconsistencies that are tracked as open issues rather than silently resolved.

Status of each requirement (delivery, slice, completeness) lives in [traceability.md](traceability.md).

---

## 1. Project objectives `[SPEC]` (spec §1.2)

| ID | Objective | Measurable target (as stated) |
|---|---|---|
| OBJ-1 | Unified Society and Event Platform: societies maintain profile pages, publish posts, create events with structured registration and real-time interest tracking. | At least 3 society profiles and 5 events created in the prototype. |
| OBJ-2 | Teammate Matching (Find Mates): skill-based matching; post collaboration requests, browse and filter by skills/interests, respond, communicate via built-in chat upon mutual acceptance. | Median time-to-match under 24 hours for 80% of requests with responses (target metric). |
| OBJ-3 | Academic Resource Sharing: upload, browse, search, upvote notes, previous-year papers, references, organised by subject code and semester. | Upload-to-availability pipeline completes within 5 seconds. |
| OBJ-4 | Faculty and Calendar Services: searchable faculty directory with office hours; multi-layer academic calendar (academic, campus, society, personal) with iCalendar export. | Faculty search returns results in under 100 ms for the campus-scale dataset. |
| OBJ-5 | Security and Data Integrity: authentication restricted to @thapar.edu Google accounts, RBAC, quarantine-first upload validation, input sanitisation, CSRF protection. | System passes all relevant OWASP Top 10 checks applicable to the platform. |

## 2. Scope `[SPEC]` (spec §1.3)

In scope:
- **SCOPE-1** Eight feature modules: Society Hub, Events, Find Mates, Study Material, Archive, Faculty, Calendar, and Placement Matrix (basic version).
- **SCOPE-2** Web application accessible via modern browsers, with Progressive Web App (PWA) support for mobile installation.
- **SCOPE-3** Deployment on Vercel (free tier) with PostgreSQL on Neon (free tier). *(Refined by ADR-0002/0003; see §8.)*

Out of scope / limitations:
- **LIM-1** Native mobile applications (iOS/Android) are not planned for this semester.
- **LIM-2** Faculty and placement data is self-reported and labelled as unofficial; the system does not have access to university databases.
- **LIM-3** Real-time video/voice communication is not included.
- **LIM-4** Multi-campus support is documented as a future evolution but not implemented.

Future work `[OUT-OF-SCOPE]` (spec §7.3): pgvector semantic matching; realtime service extraction; ClamAV; CDN/WAF/load balancer; multi-campus; native mobile app.

## 3. Functional requirements `[SPEC]` (spec §3.1)

### 3.1 Identity and Authentication
- **FR-AUTH-1** The system shall authenticate users exclusively via Google OAuth restricted to @thapar.edu email addresses.
- **FR-AUTH-2** The system shall require first-time users to complete a profile with name, roll number, branch, year, and at least 3 skill/interest tags.
- **FR-AUTH-3** The system shall store sessions as hashed refresh tokens in the database, with access tokens delivered via HTTP-only secure cookies.
- **FR-AUTH-4** The system shall support session revocation by administrators.

### 3.2 Society Hub
- **FR-SOC-1** The system shall allow system administrators to create society profiles with name, description, category, logo, and banner.
- **FR-SOC-2** The system shall support society membership roles: Head, Editor, Event Manager, and Member.
- **FR-SOC-3** Society Heads and Editors shall be able to create, edit, and publish posts (updates, recruitment drives, and ephemeral stories with 24-hour expiry).
- **FR-SOC-4** Students shall be able to browse a directory of all active societies with search and category filtering.

### 3.3 Events and Registration
- **FR-EVT-1** Society Heads and Event Managers shall be able to create events with title, description, venue, date/time, capacity, and optional custom registration fields.
- **FR-EVT-2** Events shall follow a lifecycle: Draft → Published → Live → Completed / Cancelled.
- **FR-EVT-3** Students shall be able to register for published/live events. If capacity is reached, subsequent registrants shall be waitlisted.
- **FR-EVT-4** Students shall be able to toggle "Interested" on events, with the interest count updating in real time for all viewers.
- **FR-EVT-5** The system shall enforce one registration per student per event via a database-level unique constraint.

### 3.4 Find Mates
- **FR-MATE-1** Students shall be able to create teammate requests specifying: title, type (hackathon / project / casual), skills needed, team size, and an expiry date.
- **FR-MATE-2** Students shall be able to browse and filter mate requests by type, skills, and subject.
- **FR-MATE-3** Students shall be able to respond to mate requests with a message.
- **FR-MATE-4** The requester shall be able to accept or reject each response. Upon acceptance, a Mate Connection is created and a chat channel is opened between the two students.
- **FR-MATE-5** Mate requests shall automatically expire on the specified date if not closed earlier.

### 3.5 Study Material
- **FR-MAT-1** Students shall be able to upload study materials (PDF, JPEG, PNG) with metadata: subject code, title, type (notes / PYQ / reference), semester, and branch.
- **FR-MAT-2** Uploaded files shall pass through the quarantine-first validation pipeline before becoming publicly available.
- **FR-MAT-3** Students shall be able to browse materials by subject code and semester, and search by keywords.
- **FR-MAT-4** Students shall be able to upvote materials (one vote per student per material, enforced by a unique constraint).

### 3.6 Archive
- **FR-ARC-1** Students shall be able to submit past projects with title, description, technology tags, GitHub URL, and screenshots.
- **FR-ARC-2** Submitted projects shall be reviewed before publication.
- **FR-ARC-3** Students shall be able to browse, search, and comment on archived projects with threaded replies (maximum depth: 3).

### 3.7 Faculty Directory
- **FR-FAC-1** The system shall provide a searchable faculty directory with name, department, designation, cabin number, specialization, and office hours.
- **FR-FAC-2** The search shall support full-text search with typo tolerance (using PostgreSQL tsvector and pg_trgm).
- **FR-FAC-3** Faculty members shall be able to claim and verify their profiles after logging in.

### 3.8 Calendar
- **FR-CAL-1** The system shall provide a multi-layer calendar displaying academic, campus, society, and personal events.
- **FR-CAL-2** Recurring events shall be stored as RFC 5545 recurrence rules [Des09] and expanded by a background worker into a 90-day rolling window of concrete occurrences.
- **FR-CAL-3** Users shall be able to export their calendar in iCalendar format.

## 4. Non-functional requirements `[SPEC]` (spec Table 3.1, Table 6.1)

| ID | Category | Requirement (verbatim) |
|---|---|---|
| NFR-PERF | Performance | API response time (p95) under 200ms for CRUD operations. Full-text search under 100ms. |
| NFR-SEC | Security | OWASP Top 10 compliance. HTTP-only cookies. CSRF protection. Input sanitization. CSP headers. Quarantine-first file uploads. |
| NFR-SCAL | Scalability | Stateless API suitable for horizontal scaling. Database designed for campus scale (hundreds of concurrent users). |
| NFR-AVAIL | Availability | Deployed on Vercel with automatic failover. Target 99% uptime during the semester. |
| NFR-USE | Usability | Responsive design for desktop and mobile browsers. Core tasks completable within 3 clicks. |
| NFR-MAINT | Maintainability | Modular monolith with enforced module boundaries. TypeScript for compile-time safety. |
| NFR-PORT | Portability | Standard web technologies. No vendor-locked dependencies. Architecture portable to any Node.js hosting. |

Target performance metrics (spec Table 6.1; explicitly *targets*, status "Planned"):

| ID | Metric | Target |
|---|---|---|
| MET-1 | Find Mates time-to-match | < 24 hours (80%) |
| MET-2 | API response time (p95) | < 200 ms |
| MET-3 | File upload validation | < 5 seconds |
| MET-4 | Full-text search latency | < 100 ms |
| MET-5 | Concurrent users | 200+ |

Evaluation criteria (spec §6.3): **EVAL-1** functional correctness of all eight modules end-to-end; **EVAL-2** performance targets under 200 simulated concurrent users; **EVAL-3** OWASP Top 10 checks (emphasis: injection, broken authentication, IDOR); **EVAL-4** usability without guidance for creating a mate request, uploading study material, registering for an event; **EVAL-5** time-to-match improvement from 3–5 days to under 24 hours (median).

## 5. Actors `[SPEC]` (spec §3.3)

| Actor | Description (verbatim) |
|---|---|
| Authenticated User | Any user who has logged in via Google OAuth. Can view profile and access common features. |
| Student | The core user. Can browse, register, upload, create requests, and interact with all modules. |
| Society Head | A student with elevated permissions for a specific society. Can manage the society profile, create events, and publish posts. |
| Faculty Member | A user with a @thapar.edu faculty email. Can claim and edit their faculty profile. |
| System Administrator | Manages users, moderates content, verifies faculty claims, and views audit logs. |

Society membership roles (Head, Editor, Event Manager, Member) are internal permission levels within the Society module. Enumerations (spec §9.3): UserRole STUDENT, FACULTY, ADMIN; MemberRole HEAD, EDITOR, EVENT_MANAGER, MEMBER; EventStatus DRAFT, PUBLISHED, LIVE, COMPLETED, CANCELLED; AssetStatus AWAITING_UPLOAD, UPLOADED, SCANNING, APPROVED, QUARANTINED, REJECTED, EXPIRED.

## 6. Workflows `[SPEC]` (spec §8–§10)

### 6.1 Use-case diagram (spec Figure 8.1)
Use cases shown (labels `UCD-n` are assigned here for traceability; the spec numbers only UC-07, UC-10, UC-13):
UCD-1 Login · UCD-2 View Profile · UCD-3 Browse Societies · UCD-4 Manage Society Profile · UCD-5 Create Society Post · UCD-6 Browse Events · UCD-7 Toggle Event Interest (≪extends≫ Browse Events) · UCD-8 Register for Event (= UC-07) · UCD-9 Create Event (≪includes≫ Validate Input) · UCD-10 Create Mate Request (= UC-10, ≪includes≫ Validate Input) · UCD-11 Respond to Mate Request · UCD-12 Accept / Reject Response · UCD-13 Browse Study Materials · UCD-14 Upload Study Material (= UC-13, ≪includes≫ Upload File) · UCD-15 Submit Project (≪includes≫ Upload File) · UCD-16 Search Faculty · UCD-17 Claim Faculty Profile · UCD-18 Verify Faculty Claims · UCD-19 Manage Users · UCD-20 Moderate Content · included: Validate Input, Upload File.

### 6.2 UC-10 Create Mate Request (spec Tables 8.1–8.2)
Pre-condition: Student is authenticated and has a verified profile with skills/interests populated.
1. (AA) Student navigates to Find Mates section and selects "Create Request."
2. (SR) System displays the mate request form with fields: title, type (hackathon/project/casual), skills needed (tag selection), team size, description, and expiry date.
3. (AA) Student fills in the form fields and submits.
4. (SA) System validates all required fields, checks team size is between 2 and 10, verifies expiry date is in the future.
5. (SA) System sanitizes the description text (HTML allowlist).
6. (SA) System creates the mate request record in the database with status "open."
7. (SR) System displays a confirmation message with the published request details.

Exceptions: E1 (step 4) validation failure → highlight invalid fields, return form with errors. E2 (step 3) session expired → redirect to login; after re-authentication, the partially filled form is restored.
Post-conditions: P1 visible to all students in Browse Mate Requests; P2 creator's "current count" set to 1; P3 automatically expires on the expiry date.

### 6.3 UC-13 Upload Study Material (spec Tables 8.3–8.4)
Pre-condition: Student is authenticated.
1. (AA) Student navigates to Study Material and selects "Upload."
2. (SR) System displays the upload form: subject code, title, description, type (notes/PYQ/reference), semester, branch, and file selector.
3. (AA) Student fills metadata and selects a file (PDF, JPEG, or PNG).
4. (SA) System creates an upload intent: asset record with status AWAITING_UPLOAD and a time-limited signed PUT URL for the quarantine prefix.
5. (SA) Client uploads the file directly to object storage using the signed URL.
6. (AA) Client signals upload completion to the API.
7. (SA) System writes an outbox record (file.uploaded) in the same transaction as updating the asset status to UPLOADED.
8. (SA) Background worker picks up the outbox event, validates file signature (magic bytes), true MIME type, and file size limits.
9. (SA) If validation passes, worker moves the file from quarantine to published prefix and updates asset status to APPROVED.
10. (SR) System displays the study material as available in the listing.

Exceptions: E1 (step 5) upload fails → asset remains AWAITING_UPLOAD; system automatically expires it after the timeout period. E2 (step 8) validation fails → REJECTED; material not in public listing; **student is notified of the rejection reason**. E3 (step 4) file too large → intent rejected before a signed URL is issued.
Post-conditions: P1 listed in browse view, searchable by subject code and keywords; P2 file stored in published prefix, accessible via signed download URLs.

### 6.4 UC-07 Register for Event (spec Tables 8.5–8.6)
Pre-condition: Student is authenticated. Event is in "published" or "live" status.
1. (AA) Student views event details and selects "Register."
2. (SA) System checks: already registered? capacity reached?
3. (SR) System displays custom registration fields (if configured).
4. (AA) Student fills in custom fields and confirms.
5. (SA) System creates registration with status "registered" (or "waitlisted" if at capacity). Unique constraint prevents duplicates.
6. (SA) System writes outbox event for registration confirmation notification.
7. (SR) System displays registration confirmation with status.

Exceptions: E1 already registered → inform, no duplicate (DB constraint). E2 event full → waitlist. E3 event cancelled → registration not permitted; show cancellation notice.

### 6.5 Find Mates activity (spec Figure 10.1, §10.2.2)
ACT-1 Requester creates request (title, type, skills, team size) → ACT-2 System validates (invalid → error end) and publishes → ACT-3 Responder browses/filters, views details, submits response with message → ACT-4 System notifies requester → ACT-5 Requester reviews and decides → ACT-6 Reject: response status updated, **rejection notification sent**, requester continues reviewing → ACT-7 Accept: fork {create mate connection, update request status, send acceptance notification}, join → ACT-8 open chat channel → ACT-9 capacity check: team full → close request; spots remaining → wait for more responses.

### 6.6 Other specified behaviour (spec §4.4–4.9)
- **SPEC-SOC-PERM** Permission checks are per-row (membership row with role), not blanket roles. Society profile includes social links. Story expiry enforced by `expires_at > NOW()` filter plus periodic cleanup.
- **SPEC-EVT-JSONB** Custom registration fields stored as JSONB. "Interested" uses a unique constraint (event_id, user_id); count broadcast via WebSocket + Redis pub/sub.
- **SPEC-MATE-COUNT** On acceptance, `current_count` incremented; request auto-closes when `current_count` reaches team size or expiry passes. Chat scoped to MateConnections only.
- **SPEC-MAT-VOTE** One upvote per student per material via composite primary key.
- **SPEC-ARC-DEPTH** Comment depth limit 3 enforced at application level.
- **SPEC-FAC-SEED** Faculty profiles pre-seeded by administrators from public departmental information; `user_id` null until claimed.
- **SPEC-CAL-EXP** Occurrences pre-expanded into `calendar_occurrences` (90-day window).
- **SPEC-ASSET** Asset state machine: AWAITING_UPLOAD → UPLOADED → SCANNING → APPROVED / QUARANTINED / REJECTED / EXPIRED; no backward transitions. Files never go directly to a public location and never pass through the API server.
- **SPEC-W1** Worker 1: file validation, thumbnail generation, URL safety checks. **SPEC-W2** Worker 2: notifications, calendar recurrence expansion, data reconciliation.
- **SPEC-RT** WebSocket authenticated via short-lived JWT tickets (30-second expiry, single-use nonce); realtime layer does not access the database directly; cross-instance via Redis pub/sub.
- **SPEC-DB** UUID primary keys; TIMESTAMPTZ everywhere; business rules enforced by unique constraints; module isolation.
- **SPEC-SECTBL** Security mitigations table (spec Table 4.4); see `docs/security/threat-model.md`.
- **SPEC-ADMIN** Admin dashboard: user management, content moderation, analytics (roadmap Phase 5); audit logs (actor table).
- **SPEC-METRICS** Metrics dashboard with Find Mates time-to-match tracking (roadmap Phase 6).
- **SPEC-WORKFLOW** Feature branches, PR CI (ESLint, `tsc --noEmit`, Vitest) must pass, Vercel previews, auto-deploy on merge, ≥1 reviewer other than the author (spec §5.4).

## 7. Approved additions

### 7.1 Placement Matrix (basic) `[APPROVED 2026-10-23]`: fulfils SCOPE-1 "Placement Matrix (basic version)"

Approved text (preserve verbatim):
- **PLC-1** Admins enter or CSV-import **aggregate** records only: academic year, programme/branch, optional company, offer type (full-time or internship), offer count, optional eligible/placed counts, median salary (CTC) and salary band, source citation and date.
- **PLC-2** Logged-in users see a branch × year matrix (offers, placement %, median CTC), filterable by year, branch and company.
- **PLC-3** **No per-student data is stored**: no names, roll numbers or individual salaries. Any cell covering fewer than **k = 5** students shows as "<5" (small-cell suppression). Min/max salary is never shown.
- **PLC-4** Every view is labelled *"Unofficial: compiled from [source]; not endorsed by TIET."*
- **PLC-5** Every change is audit-logged. No student self-reporting in the first delivery.

Suppression method, complementary suppression and re-identification limits: [placement-matrix.md](placement-matrix.md).

### 7.2 Faculty claim verification `[APPROVED 2026-10-23]`: refines FR-FAC-3
Faculty profile claims require **admin approval** unless a stronger verified method is established and approved later. See ADR-0010.

### 7.3 Cross-device support `[APPROVED 2026-10-23]` (owner directive)
- **NFR-DEVICE-1** Responsive web application (PWA capabilities where appropriate) that works on Android phones (including OnePlus, Vivo and Samsung), iPhones, Android tablets, iPads, Windows desktops/laptops and macOS desktops/laptops.
- **NFR-DEVICE-2** Mobile-first layouts that work in portrait and landscape.
- **NFR-DEVICE-3** Touch-friendly controls and navigation (project target: 44 CSS px minimum for links and buttons).
- **NFR-DEVICE-4** Correct mobile keyboard behaviour for forms and search; safe-area handling on devices with notches and home indicators.
- **NFR-DEVICE-5** Responsive dialogs, menus, tables and cards; loading, empty, success and error states; readable typography at narrow widths; keyboard navigation and basic accessibility.
- **NFR-DEVICE-6** Verification distinguishes browser emulation (automated) from physical-device testing (manual); neither is claimed for the other.

### 7.4 Client-trust security principle `[APPROVED 2026-10-23]` (owner directive)
- **SEC-CLIENT-1** Assume users can inspect and modify client code and requests, including from rooted Android or jailbroken iOS devices. A web application or PWA cannot reliably detect or prevent rooting or jailbreaking, and the project must not claim that it does.
- **SEC-CLIENT-2** Authentication, authorization, resource ownership, validation and business rules are enforced on the server. Hidden UI elements and client-side checks are never the security boundary.
- **SEC-CLIENT-3** Platform attestation (Google Play Integrity, Apple App Attest/DeviceCheck) applies only to native apps, which are out of scope (LIM-1). Any native-app work needs separate approval (OI-48).

## 8. Known inconsistencies in the specification (tracked, not silently resolved)

| ID | Inconsistency | Tracking |
|---|---|---|
| INC-1 | "Eight modules" lists differ: §1.3 includes Placement; §3.1 has 8 FR groups including Identity and no Placement; §4.2 lists 9 incl. Admin; §6.3/§7.1 say "Placement V2". | Resolved for Placement by §7.1; module list in `architecture/modules.md` |
| INC-2 | Archive "voting" appears in roadmap (Table 5.1) but no FR. | OI-22 |
| INC-3 | Security table (4.4) puts file validation in Phase 2; roadmap puts it in Phase 3. Rate limiting appears in Phase 1/3/5. | Phases in `status/phases-and-acceptance.md` |
| INC-4 | FR-MATE-2 filters by "subject" but no subject field exists on requests. UC-10 adds description and team size 2–10 not in FR-MATE-1. | OI-15 |
| INC-5 | FR-MAT-1 has `branch`; class diagram StudyMaterial lacks it. UC-13 adds `description`. | Database design follows the FR + UC (superset) |
| INC-6 | FR-MAT-2 "publicly available" vs UC-13 P2 "signed download URLs". | OI-19 |
| INC-7 | Polymorphic `Comment(entityType, entityId)` vs "full referential integrity". | OI-23 |
| INC-8 | Redis is listed for "OTP storage" (Table 4.1) but no OTP flow exists with Google-only sign-in. | OI-37 |
| INC-9 | "15-week semester" vs plan to Week 17; roadmap Phase 1 in Weeks 3–4 vs §2.4 Weeks 5–7. | OI-02 (resolved 2026-10-23: academic timelines disregarded) |
| INC-10 | FR-AUTH-3 wording (refresh + access tokens) vs DB-session libraries' single-token model. | ADR-0006, OI-04 |
| INC-11 | SCOPE-3 "Vercel free tier" vs realtime/worker processes needing a long-running host. | ADR-0002 |
| INC-12 | Match scoring (spec §6.1.1 test) has no FR. | OI-17 |
