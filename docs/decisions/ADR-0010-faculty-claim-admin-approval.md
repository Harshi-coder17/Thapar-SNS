# ADR-0010: Faculty profile claims require admin approval

Status: **Approved 2026-10-23.** Applies unless a stronger verified method is later established and approved.

## Context
FR-FAC-3 lets faculty "claim and verify" profiles after logging in. Students and faculty share the @thapar.edu domain, so login alone does not prove faculty identity (OI-08).

## Decision
1. Any authenticated user may request a claim on an unclaimed profile. The claim is created as `PENDING`. Only one pending claim per profile.
2. An admin approves or rejects it with a reason. If the login email matches the profile's seeded public email, the admin sees a **hint**, but approval is still required.
3. On approval, in one transaction:
   - link `faculty_profiles.user_id`
   - set `is_verified = true`
   - set the user role to FACULTY
   - write an audit log entry
   - enqueue an outbox notification

   The user's sessions are revoked so the new role takes effect on re-login (auth evaluation §5).
4. Admins can revoke a claim (unlink, unverify, role back to STUDENT), with an audit log entry.
5. A claimed faculty member can edit only an allow-listed set of fields (office hours, cabin, specialization). Edits are audit-logged.

## Amendment 2026-10-26: one pending claim per account
- **Who sees the button.** Every signed-in account sees "This is me: claim this profile" on an unclaimed profile. This is intended:
  - students and faculty share @thapar.edu, and faculty sign in first with the default role, so the server cannot tell them apart;
  - requesting grants nothing;
  - the page says the claim is for the named faculty member only and is checked by an administrator.
- **Defect found.** An account could hold pending claims on any number of profiles. Each profile allows only one pending claim, so one account could block every real faculty member until an administrator rejected each claim.
- **Fix.**
  - At most one pending claim per account: a service check plus the partial unique index `faculty_claims_one_pending_per_claimant` (migration `20261030000000`).
  - The form is not offered to an account that already has a faculty profile or a claim waiting elsewhere.
- **Unchanged.** Approval, profile edits and revocation stay server-enforced (platform capacity; linked member only). Tests: `tests/integration/platform/authorization.test.ts` ("faculty claims by students").

## Consequences
Faculty access depends on admin responsiveness. The admin dashboard needs a claims queue (Slice 4b).
