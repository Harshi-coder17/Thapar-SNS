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

## Consequences
Faculty access depends on admin responsiveness. The admin dashboard needs a claims queue (Slice 4b).
