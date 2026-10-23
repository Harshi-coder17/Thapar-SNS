# Open Issues, Assumptions and Approval Gates

Every item is `[OPEN]` until the owner decides. **Recommended defaults are `[PROPOSED]`, not approved.** Nothing here removes or redefines a spec requirement. Where a default narrows behaviour, the affected requirement stays in the traceability matrix with this issue linked.

Format per issue: *Affects* · *Blocks* · *Context* · *Recommended default* · *Alternatives / trade-offs* · *Dependencies* · *Approval needed*.

## 1. Decisions needed before Slice 1a (Gate G-0)

Gate G-0 passed: Phase 0 approved 2026-10-23. OI-02 and OI-03 resolved by the owner (below). OI-01 is being verified by the owner separately; it blocks real-OAuth testing in 1b, not 1a.

| Priority | Issue | Status |
|---|---|---|
| – | OI-02 Deadline | **Resolved 2026-10-23**: academic timeline disregarded |
| – | OI-03 Team and review | **Resolved 2026-10-23**: Claude solo implementer; owner reviews all PRs |
| 1 | OI-01 Google Workspace access | Owner verifying separately; needed before G-1b-oauth |
| 2 | OI-11 / OI-31 / OI-42 | Minor; can be decided during 1a–2a |

All other issues are needed only by the slice listed in *Blocks*.

## 2. Blockers and risks

### OI-01 Thapar Google Workspace third-party OAuth access (needed before production launch; **not** a development blocker)
- *Affects:* FR-AUTH-1, all modules · *Blocks:* 1b (real OAuth), 1c
- *Context:* university Workspace admins can restrict which third-party apps may use Google sign-in. If restricted, no one can log in.
- *Recommended default:* the team asks Thapar IT now. After gate G-1b-oauth, test with a throwaway OAuth client using a team member's account.
- *Alternatives:* none that satisfy FR-AUTH-1. Request IT allow-listing of the app's client ID.
- *Approval needed:* creating the Google Cloud OAuth client (G-1b-oauth).
- *Owner update 2026-10-23:* the owner will verify Thapar IT Google Workspace sign-in separately.
- *Owner decision 2026-10-23 (G-1b-oauth):* Google Sign-In is **approved** as the authentication method. This check must not block development of the integration. Still to verify with Thapar IT: whether external apps may request `openid email profile` for @thapar.edu accounts, or whether the client ID must be allow-listed. Setup steps: `docs/auth/google-oauth-setup.md`.

### OI-02 Final deadline and schedule `[RESOLVED 2026-10-23]`
- *Affects:* all · *Blocks:* G-0
- *Context:* the spec targets "Week 17 (EST)" with inconsistent week counts (INC-9). Today is 2026-10-23 and no code exists. The goal is the complete application.
- *Recommended default:* the owner confirms the final evaluation date. Slices are then scheduled with parallel tracks (4b and 4e can run after 1b). Nothing is cut without explicit approval; if the date cannot hold the full scope, a sequencing proposal comes back for decision.
- *Approval needed:* yes (date).
- *Resolution:* disregard all academic semester timelines and submission dates in the spec. The project runs on the owner's own fast-paced schedule; slices proceed as each is approved. INC-9 is closed by this decision.

### OI-03 Team mapping, ownership, reviewers, Claude's scope `[RESOLVED 2026-10-23]`
- *Affects:* SPEC-WORKFLOW, modules.md · *Blocks:* 1a (CODEOWNERS)
- *Recommended default:* map Persons A–D to names. Each PR is reviewed by the module owner (or another member if the owner authored it), per spec §5.4. Claude implements only approved slices; humans approve merges. Assign an owner for Placement.
- *Approval needed:* yes.
- *Resolution:* Claude implements the complete application as solo developer/architect across all modules (Persons A to D ownership in spec Table 5.2 no longer applies to implementation). The owner reviews and approves every pull request. CODEOWNERS lists the owner for all paths once a GitHub remote exists.

## 3. Authentication and security

### OI-04 FR-AUTH-3 representation (see ADR-0006)
- *Blocks:* 1b production auth · Decision after spike findings and owner review.
- *Spike result 2026-10-23:* the single hashed-token design passed T01 to T09 and T14 (`docs/auth/spike-findings.md`). **Decision needed:** accept it as satisfying FR-AUTH-3.

### OI-05 Session rotation and lifetime
- *Affects:* FR-AUTH-3, A-R12/A-R14
- *Recommended default:* new token on every sign-in; revoke all sessions on privilege change; 7-day sliding expiry; **30-day absolute cap**; no periodic rotation.
- *Alternatives:* 24-hour rotation with a grace window. This gives theft signals, but adds complexity and race handling with parallel requests.
- *Approval needed:* yes.
- *Spike fact:* Better Auth does not rotate the token on refresh (T17); the absolute cap needs our own check. Spike test T10 waits on this decision.

### OI-08 Identifying faculty vs students
- *Affects:* FACULTY role, FR-FAC-3
- *Recommended default:* every new user is STUDENT. FACULTY is granted **only** by an approved claim (ADR-0010). No inference from email patterns.
- *Alternatives:* email-pattern heuristics (unreliable; not "verified").
- *Approval needed:* confirm.

### OI-09 First admin and admin management
- *Affects:* FR-AUTH-4, FR-SOC-1, UCD-19 · *Blocks:* 1b
- *Recommended default:* `ADMIN_EMAILS` server-side allow-list grants ADMIN on login. Admins can grant/revoke ADMIN; at least one admin must remain. Every change is audit-logged and revokes the affected user's sessions.
- *Approval needed:* yes.

### OI-27 Privacy: roll numbers, profiles, retention, deletion, legal pages
- *Affects:* FR-AUTH-2, UCD-2, G-01, G-12 · *Blocks:* 1b (profile fields), 5
- *Context:* the spec's problem statement cites privacy gaps around roll numbers. India's DPDP Act 2023 applies to personal data. This is not legal advice; confirm with the course supervisor.
- *Recommended default:*
  - Roll number visible only to the user and admins.
  - Public profile shows name, branch, year, skills, society memberships.
  - Privacy Policy + Terms pages (G-01).
  - Account deletion by request → admin process anonymises authored content.
  - Access ends when the @thapar.edu account is removed (no alumni access).
- *Approval needed:* yes.

### OI-37 Redis "OTP storage" (INC-8)
- *Context:* Table 4.1 lists OTP storage, but no OTP flow exists with Google-only login.
- *Recommended default:* record it as a spec inconsistency. No OTP feature. Redis covers rate limiting, ticket nonces, pub/sub and hot cache.
- *Approval needed:* confirm (no requirement is removed; this is a technology-table note).

## 4. Infrastructure

### OI-06 Neon compute vs five-minute sweep
- *Affects:* ADR-0003/0004, NFR-AVAIL · *Blocks:* 3a (production setting)
- *Context:* background-jobs.md §7. The approved fixed 5-minute sweep may keep Neon Free awake (~182 CU-h vs 100). Exhausting the allowance suspends the DB until the next billing period.
- *Recommended default:* measure in 1c/3a. For the evaluation period, use the **adaptive sweep** (5 minutes while active, hourly when idle). This is a deviation from the approved fixed sweep, so it needs approval.
- *Alternatives:* fixed sweep + Neon Launch (~$19/month always-on estimate); a longer fixed sweep (15 minutes).
- *Approval needed:* yes.

### OI-07 Nudge / publish transport
- *Recommended default:* signed HTTPS calls (HMAC + timestamp) from Vercel to the service.
- *Alternatives:* Redis pub/sub (spec-aligned for multi-instance; depends on OI-41 TCP SUBSCRIBE).
- *Approval needed:* yes (design detail).

### OI-31 Region co-location
- *Recommended default:* Singapore for Vercel functions, Fly, Neon, Upstash; R2 APAC hint. Neon has no Mumbai region.
- *Approval needed:* at G-1c.

### OI-33 Performance test environment
- *Recommended default:* run k6 against a production-like deployment in Singapore with a warm database. Report cold-start latency separately. 200 VUs; the scenario mix is documented in Slice 5.
- *Approval needed:* yes (definition of "pass").

### OI-40 Monitoring and error sink
- *Recommended default:* an external uptime monitor and an error-tracking service on free tiers, chosen at G-1c. These are new external services, so they need approval.
- *Approval needed:* at G-1c.

### OI-41 Verification tasks (no decision; must be done before relying on them)
| Item | When |
|---|---|
| Upstash TCP SUBSCRIBE / pub-sub over ioredis | 3b spike |
| ~~Garage support for checksum headers~~ **Done 2026-10-23:** Garage 2.4.1 verifies `x-amz-checksum-sha256` (mismatch → 400 InvalidDigest). Presigner signs only `host` unless `signableHeaders` is set (ADR-0007) | 1a contract test |
| R2 free-tier limits | G-1c |
| Fly `sin` price for 512 MB; Fly Proxy WebSocket idle timeout | G-1c |
| Neon minimum CU on Free (A-07); inactivity-timer semantics; Free PITR/restore window | 1c/3a measurement |
| Better Auth `email_verified` mapping; token entropy; rotation on refresh (T17) | 1b spike |
| Arctic maintenance status | 1b (if fallback) |
| `rrule` maintenance or alternative | 4d |

## 5. Functional gaps (recommended defaults)

### OI-10 Society membership: joining and Head appointment
- *Affects:* FR-SOC-2, G-06 · *Blocks:* 2a
- *Recommended default:*
  - The admin appoints the first Head when creating the society.
  - Students **request to join**; a Head approves. Approved members get the MEMBER role.
  - A Head assigns Editor/Event Manager; Head transfer goes through an admin.
  - All role changes are audit-logged.
- *Alternatives:* open join (instant, spam-prone); invite-only (higher friction).
- *Approval needed:* yes.

### OI-11 Recruitment fields and post visibility
- *Affects:* FR-SOC-3 · *Blocks:* 2a
- *Recommended default:*
  - Recruitment fields: roles sought, eligibility (years/branches), deadline, optional external application URL (https only).
  - `visibility`: PUBLIC (all logged-in users) | MEMBERS.
  - Stories: PUBLIC only, 24-hour expiry.
- *Approval needed:* yes.

### OI-12 Event custom registration fields (and category)
- *Affects:* FR-EVT-1, G-09 · *Blocks:* 2b
- *Recommended default:*
  - Field types: short text, long text, single select, multi-select, checkbox, number.
  - At most 10 fields; validated against the stored schema.
  - No file fields.
  - No event "category" field unless approved (montage only).
- *Approval needed:* yes.

### OI-13 Event lifecycle transitions
- *Affects:* FR-EVT-2 · *Blocks:* 2b
- *Recommended default:*
  - Draft → Published (manual); Published → Live at `start_at` and Live → Completed at `end_at` (automatic: derived at query time and tidied by a job).
  - Cancelled (manual) from Draft/Published/Live; terminal.
  - Capacity cannot drop below the registered count.
- *Approval needed:* yes.

### OI-14 Registration cancellation and waitlist promotion
- *Affects:* FR-EVT-3, UC-07 · *Blocks:* 2b
- *Recommended default:* students may cancel before `start_at`. The earliest waitlisted registrant is promoted (FIFO) in the same transaction and notified. Capacity increases also promote.
- *Alternatives:* no cancellation (simpler; poor UX); manual promotion by managers.
- *Approval needed:* yes.

### OI-15 Mate request "subject", description and team size (INC-4)
- *Affects:* FR-MATE-1/2, UC-10 · *Blocks:* 2c
- *Recommended default:*
  - Add optional `subject` (subject code or name, suggestions from study-material subject codes) so FR-MATE-2's filter is implementable.
  - Include UC-10's `description` (sanitised) and the team-size rule of 2–10.
- *Approval needed:* yes.

### OI-16 Chat model and request withdrawal
- *Affects:* FR-MATE-4, G-21 · *Blocks:* 4a
- *Recommended default:* one 1:1 chat per MateConnection (as specified). A requester with several accepted teammates has several 1:1 chats. No group chat. The requester may close a request early (status CLOSED).
- *Alternatives:* team group chat (montage), a new feature needing its own approval.
- *Approval needed:* yes (confirm 1:1 + close).

### OI-17 Match scoring (spec §6.1.1, INC-12)
- *Affects:* SPEC-MATCH · *Blocks:* 2c
- *Recommended default:* a transparent skill-overlap score (Jaccard of the request's `skills_needed` and the user's skill tags). Used to sort responses for the requester and to offer a "Best match" sort on browse.
- *Alternatives:* skip ranking. That leaves the spec's unit test with no feature.
- *Approval needed:* yes.

### OI-18 Asset states: QUARANTINED vs REJECTED
- *Affects:* FR-MAT-2, SPEC-ASSET, UC-13 E2 · *Blocks:* 2d
- *Recommended default:*
  - REJECTED = failed deterministic validation (type, magic bytes, size, checksum), with a user-visible reason; the object is deleted.
  - QUARANTINED = retained for admin review (suspicious structure or a moderation flag); not visible.
  - EXPIRED = never completed.
- *Approval needed:* yes.

### OI-19 Material visibility and moderation (INC-6)
- *Affects:* FR-MAT-2, UC-13 P2 · *Blocks:* 2d
- *Recommended default:*
  - "Publicly available" = visible to all logged-in users (not the open internet).
  - Downloads via 5-minute signed URLs.
  - Uploader can delete own material; any user can report → moderation queue (OI-28).
- *Approval needed:* yes.

### OI-20 Thumbnails and URL safety checks (SPEC-W1)
- *Affects:* SPEC-W1, FR-ARC-1, FR-SOC-1 · *Blocks:* 3a, 4c
- *Recommended default:*
  - Thumbnails generated for **images** (logos, banners, screenshots). PDFs show a type icon, as in the montage.
  - "URL safety" = strict validation of GitHub URLs (`https://github.com/<owner>/<repo>`) and recruitment links (https, no credentials, no IP literals). The server never fetches external URLs (avoids server-side request forgery, SSRF). Links render with `rel="noopener noreferrer nofollow"`.
- *Alternatives:* PDF first-page rendering (heavy dependency); a reputation API like Safe Browsing (external service + approval).
- *Approval needed:* yes.

### OI-21 Archive review
- *Affects:* FR-ARC-2 · *Blocks:* 4c
- *Recommended default:* admins review (approve/reject with reason). The submitter may edit and resubmit. Decisions are audit-logged and notified.
- *Alternatives:* verified faculty as reviewers.
- *Approval needed:* yes.

### OI-22 Archive voting (INC-2)
- *Affects:* SPEC-ARC-VOTE, G-16 · *Blocks:* 4c
- *Recommended default:* implement one upvote per student per project, mirroring FR-MAT-4 (unique constraint). The roadmap names it, but no FR exists, so it needs explicit approval.
- *Approval needed:* yes.

### OI-23 Comment model (INC-7)
- *Affects:* FR-ARC-3 · *Blocks:* 4c
- *Recommended default:* comments with a real FK to `archive_projects` (comments are only specified for the archive). This preserves referential integrity.
- *Alternatives:* polymorphic `(entity_type, entity_id)` as in the class diagram, which is reusable but loses FK integrity.
- *Approval needed:* yes.

### OI-24 Calendar layers: sources and editors
- *Affects:* FR-CAL-1 · *Blocks:* 4d
- *Recommended default:*
  - Academic + Campus: admin-maintained entries (manual, plus optional one-off `.ics` import of the official academic calendar).
  - Society: published events from all societies, with a toggle to show only events the user registered for or marked Interested.
  - Personal: user-owned entries, with RRULE support.
- *Approval needed:* yes.

### OI-25 Calendar export form
- *Affects:* FR-CAL-3 · *Blocks:* 4d
- *Recommended default:* authenticated `.ics` download of the user's visible layers.
- *Alternatives:* private subscription URL with a revocable secret token. Convenient, but it is a bearer secret; needs approval.
- *Approval needed:* yes.

### OI-26 Notification channels and types
- *Affects:* SPEC-W2, UC-07 step 6, UC-13 E2, ACT-4/6/7 · *Blocks:* 3a
- *Recommended default:* in-app notifications (list + unread badge), pushed live over WebSocket when connected. No email or web push in the first delivery.
  - Types: registration confirmed / waitlisted / promoted; mate response received / accepted / rejected; upload approved / rejected (with reason); archive decision; faculty claim decision.
- *Approval needed:* yes.

### OI-28 Admin capabilities
- *Affects:* SPEC-ADMIN, UCD-19/20, FR-AUTH-4 · *Blocks:* incremental, 5
- *Recommended default:*
  - Users: list/search, ban/unban, role changes, session revocation.
  - Societies: create, appoint Head, deactivate.
  - Moderation: report queue for posts, materials, comments, chat messages (reported only); hide/restore.
  - Queues: faculty claims, archive reviews, placement records, DEAD outbox rows.
  - Audit-log viewer; analytics (counts + time-to-match).
- *Approval needed:* yes.

### OI-29 Placement data source and salary bands
- *Affects:* PLC-1 · *Blocks:* 4e
- *Recommended default:* admins enter figures only from publicly published placement statistics, each with a citation. Proposed bands: < 5, 5–10, 10–20, 20–40, > 40 LPA.
- *Approval needed:* yes.

### OI-30 TIET logo and content seeding (logo part `[RESOLVED 2026-10-23]`)
- *Affects:* SPEC-SEED, design · *Blocks:* 1a (logo in shell), 6
- *Recommended default:* use the logo only with institutional permission; otherwise use a text wordmark plus an "Unofficial student project" notice. Faculty seeds contain professional fields only, from public departmental pages, and removal requests are honoured.
- *Approval needed:* yes.
- *Resolution (logo):* use the owner-provided TIET logo unchanged, with a discreet "Unofficial student project" note and no implication of endorsement (design rules §2.2). The content-seeding part stays open for Slice 6.

### OI-32 "Core tasks within 3 clicks" definition
- *Recommended default:* from Home after login, ≤ 3 navigation clicks to reach the action's form. Form input and the submit click are excluded. Applies to: create mate request, upload material, register for event.
- *Approval needed:* yes.

### OI-34 Events without a society
- *Affects:* FR-EVT-1, class diagram (Society 0..1 hosts Event)
- *Recommended default:* admins can create campus events (`society_id` null). They appear in the Campus calendar layer.
- *Approval needed:* yes.

### OI-35 Profile page scope (UCD-2)
- *Affects:* UCD-2, G-18/G-19
- *Recommended default:* name, branch, year, skills, society memberships, registered-events count; optional short bio (needs approval); edit own profile. Roll number stays private (OI-27).
- *Approval needed:* yes.

### OI-36 Interest toggle rules
- *Affects:* FR-EVT-4
- *Recommended default:* allowed on PUBLISHED and LIVE events only. The count is visible to all logged-in users.
- *Approval needed:* confirm.

### OI-38 Deactivated societies
- *Affects:* FR-SOC-4
- *Recommended default:* hidden from the directory; existing content stays readable via direct links; no new posts or events.
- *Approval needed:* confirm.

### OI-39 Upload limits
- *Affects:* FR-MAT-1, FR-ARC-1, FR-SOC-1, UC-13 E3
- *Recommended default:*
  - PDF ≤ 20 MB; JPEG/PNG ≤ 5 MB.
  - ≤ 5 screenshots per project.
  - Logo ≤ 2 MB; banner ≤ 5 MB.
  - Signed PUT URL valid 15 minutes; AWAITING_UPLOAD expires after 1 hour.
  - Per-user daily upload quota: 20 files.
- *Approval needed:* yes.

### OI-42 Skill/interest tag vocabulary
- *Affects:* FR-AUTH-2, FR-MATE-1/2 · *Blocks:* 1b
- *Recommended default:* an admin-curated controlled list (spec §4.4.1 "controlled set"), seeded with about 60 tags across programming, design, hardware, business and academic subjects. Users pick ≥ 3.
- *Approval needed:* yes (the seed list is reviewed in 1b).

## 5b. Issues found in Slice 1a (updated in the Slice 1a review, 2026-10-23)

Each item separates **Fact** (verified), **Recommendation** (proposed) and **Decision** (needs the owner).

### OI-43 Design montage and Git (unredacted exclusion `[APPROVED 2026-10-23]`)
- *Fact:* panel 10 of the montage shows a student's full name and @thapar.edu email. `project-docs/design-reference/` is gitignored and absent from both proposed commits (verified in the staging review).
- *Approved:* the unredacted montage and the original specification PDF stay out of Git (owner directive, 2026-10-23).
- *Recommendation:* keep the montage local only for now. Development works from the measured tokens recorded in `docs/design/frontend-design-rules.md` §2.1.
- *Decision:* whether a **redacted** copy (panel 10 name and email blurred) should ever be committed. Not needed for Slice 1b.

### OI-44 React and accessibility lint rules on ESLint 10 `[RESOLVED 2026-10-23]`
- *Facts (npm registry, 2026-10-23):*
  - `eslint-plugin-react` 7.37.5 (last release 2025-04-03) declares ESLint up to `^9.7`.
  - `eslint-plugin-jsx-a11y` 6.10.2 (2024-10-26) declares up to `^9`.
  - Installing them via `eslint-config-next` with ESLint 10 needs forced peer overrides.
  - ESLint 9 is end-of-life (2026-08-06).
- *Options:*
  1. **Keep the current setup** (no React/JSX-a11y lint rules). Accessibility stays covered at runtime by axe-core on every route and device profile. Lowest risk, but some static checks are missing (e.g. missing `key` props, some ARIA misuse caught before running).
  2. **Add `@eslint-react/eslint-plugin` 5.28.0** (released 2026-10-16, actively maintained, declares any ESLint version, flat-config native). It is a modern replacement for most `eslint-plugin-react` rules. The rule set differs, so expect a few new findings.
  3. **Add `eslint-plugin-jsx-a11y-x` 0.2.0** (a fork of jsx-a11y; declares ESLint `^9 || ^10`; last release 2026-05-10; pre-1.0). It restores static accessibility rules, but the project's maturity is lower.
  4. Force the original plugins with npm overrides. **Rejected:** contradicts the "no forced peers" rule.
- *Recommendation:* option 2 now, plus option 3 only after a trial run shows it is stable on our code. Both would be pinned and dry-run first, like every other dependency.
- *Decision (owner, 2026-10-23):* option 2 approved.
- *Resolution:* `@eslint-react/eslint-plugin` 5.28.0 added (dry-run clean, no install scripts). `recommended-typescript` rules apply to `.tsx` files (56 active). The 9 rules that duplicate the official `eslint-plugin-react-hooks` are switched off, derived from eslint-react's own conflict preset. Lint passes; a planted violation was reported. Option 3 (jsx-a11y fork) not adopted; axe-core still covers runtime accessibility.

### OI-45 GitHub repository and first push `[RESOLVED 2026-10-23]`
- *Facts:*
  - The owner created the empty private repository `https://github.com/Harshi-coder17/Thapar-SNS.git`.
  - `origin` points to exactly that URL.
  - A non-interactive `git ls-remote` succeeded using credentials already stored in the macOS keychain (no token shared in chat) and returned no refs, so the remote is empty.
  - The `gh` CLI is not installed; it is not required for pushing. It would only be needed to open pull requests from the terminal; PRs can also be opened on github.com.
  - The owner committed and pushed `main` (`84d73ec`) and `feat/platform/skeleton` (`47cb31f`, `d002d49`).
- *Resolution:* pushed by the owner. Pull request review and CI results are visible on github.com (not verifiable from here without the `gh` CLI).

### OI-46 Release cooldown policy `[APPROVED 2026-10-23]`
- *Fact:* applied in Slice 1a. Used once more in the review: `eslint-plugin-boundaries` 7.2.0 to 7.2.1 under the **security-fix exception**. 7.2.0 bundled `handlebars` 4.7.9, which has critical advisories GHSA-8r5x-fm3f-whwj and GHSA-p8wg-vrv2-v86f; 7.2.1 bundles 4.7.10.
- *Recommendation:* keep the 7-day cooldown with the security-fix exception.
- *Decision (owner, 2026-10-23):* approved. New releases wait at least 7 days; exceptions for urgent security fixes or critical blockers, with the reason documented (ADR-0008). Keep locked versions unless an update is justified.

### OI-47 Local port for PostgreSQL
- *Fact:* another PostgreSQL install already listens on 5432 on the development machine; it is not touched. The project database uses host port **55432**. No action needed.

### OI-48 Native apps and device attestation
- *Fact:* native apps are out of scope (LIM-1). Play Integrity and App Attest/DeviceCheck apply only to native apps; a web app or PWA cannot use them, nor reliably detect rooted or jailbroken devices (SEC-CLIENT-1).
- *Decision:* none now. Revisit only if native apps are proposed.

### OI-49 Edge-to-edge PWA layout (`viewport-fit=cover`) `[APPROVED DEFERRAL 2026-10-23]`
- *Fact:* the app uses the browser default viewport fit, so iOS and Android keep content inside safe areas. Edge-to-edge needs `env(safe-area-inset-*)` padding and cannot be verified by emulation.
- *Recommendation:* introduce it only with the PWA work (Slice 6), verified on physical iPhone and Android devices.
- *Decision (owner, 2026-10-23):* deferral approved until the PWA phase. Meanwhile the interface must stay usable on mobile, with essential content and controls never obscured by system UI (current browser-default viewport fit; checked in the physical-device checklist).

### OI-50 npm audit: withdrawn `braces` advisory `[RESOLVED 2026-10-23]`
- *Fact:* after the boundaries fix, `npm audit` still lists 6 "high" entries. All of them trace to `braces` 3.0.3 (GHSA-vfj7-8cjw-p6xm), which GitHub has marked **withdrawn**, with no patched version. They are dev-only lint dependencies. npm's suggested "fix" is a major downgrade of `@next/eslint-plugin-next` to 14.2.35, which is rejected. Production dependencies: 0 vulnerabilities.
- *Recommendation:* no action; recheck each slice.
- *Resolution:* a later `npm audit` (2026-10-23) reports **0** vulnerabilities across all dependencies; npm has dropped the withdrawn advisory.

### OI-51 Allowed sign-in accounts: @thapar.edu only, or any Google account?
- *Fact:* the specification requires it explicitly. **FR-AUTH-1** `[SPEC]`: "authenticate users exclusively via Google OAuth restricted to @thapar.edu email addresses"; also OBJ-5 and spec §6.1.4 ("non-Thapar email addresses are rejected"). The owner asked (2026-10-23) not to impose a domain restriction silently without confirming it.
- *Current state:* nothing is enforced in the application yet. The spike implements the restriction as **configuration** (`AUTH_ALLOWED_EMAIL_DOMAIN`), applied both through Google's `hd` and a server-side check (exact domain, verified email). Tested with `thapar.edu` and another domain.
- *Options:*
  1. **Keep FR-AUTH-1:** @thapar.edu only (current spec; recommended, because the platform is campus-only and other modules assume TIET identities).
  2. Allow any Google account. This changes FR-AUTH-1 and the trust model (faculty claims, placement, society roles), so it needs a spec change and threat-model update.
  3. @thapar.edu plus an explicit allow-list (e.g. invited guests).
- *Decision:* confirm option 1, or choose another. Production configuration waits for this answer.

## 6. Assumptions (to be confirmed or corrected)

| ID | Assumption |
|---|---|
| A-01 | All users have @thapar.edu Google Workspace accounts |
| A-02 | Thapar's Workspace allows third-party OAuth apps (unverified → OI-01) |
| A-03 | Scale per spec: ~12,000 potential users, hundreds concurrent, ~500 faculty, a few thousand materials |
| A-04 | The project is non-commercial, so the Vercel Hobby plan is permitted |
| A-05 | English UI; times displayed in Asia/Kolkata |
| A-06 | Browser support follows Next.js 16 (Chrome/Edge/Firefox 111+, Safari 16.4+) |
| A-07 | Neon Free minimum compute is 0.25 CU (unverified) |
| A-08 | Realtime and notification traffic is small (< 1 GB/month egress) |
| A-09 | Displaying publicly available faculty information with an "unofficial" label is acceptable |
| A-10 | The owner reviews PRs within each slice's cadence |
| A-11 | Claude works only on approved slices; the owner approves merges and external actions |

## 7. Approval gates
Defined in `status/phases-and-acceptance.md`: **G-0** (Phase 0 review), **G-1a-git**, **G-1b-spike**, **G-1b-oauth**, **G-1c** (any external service, infrastructure, secret or deployment), **G-each** (every slice).
