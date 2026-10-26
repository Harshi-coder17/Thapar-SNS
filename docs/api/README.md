# API Contracts

`[PROPOSED]` conventions. Per-module contract files (`docs/api/<module>.md`) are created in the slice that implements each module, and are updated in the same pull request as the code.

## Conventions

- **Source of truth:** Zod schemas in `src/modules/<name>/schemas.ts`. The Markdown contract mirrors them, and a CI test fails if a documented endpoint has no schema.
- **Paths:** `/api/<module>/...` for route handlers. Upload paths follow the spec exactly: `POST /api/uploads/intents`, `POST /api/uploads/{assetId}/complete`.
- **Auth:** every endpoint states `public`, `authenticated`, `profile-complete`, or a specific permission (e.g. `society:EVENT_MANAGER`).
- **CSRF:** every mutating endpoint requires the CSRF mechanism defined in `security/threat-model.md` §4.
- **Errors:** JSON `{ "error": { "code": "STRING_CODE", "message": "human text", "fields"?: {...} } }`. Status codes: 400 validation, 401 no/invalid session, 403 permission, 404 not found **or not visible to this actor** (never reveal existence), 409 conflict/duplicate, 422 state-transition violation, 429 rate limited.
- **IDs:** UUIDs only, never sequential.
- **Pagination:** cursor-based (`?cursor=&limit=`, max 50).
- **Time:** ISO-8601 with offset; stored as UTC.
- **Idempotency:** creation endpoints that can be double-submitted (registration, response, vote, upload intent) are safe to retry. The DB unique constraint returns the existing record or a 409 with the current state.

## Contract template (copy per endpoint)

```
### METHOD /api/path
Auth: …            CSRF: yes/no      Rate limit: …
Request:  { field: type, rule }
Response 200/201: { … }
Errors: 400 …, 403 …, 409 …
Side effects: outbox events …, audit …
Requirement IDs: FR-…
Tests: path::name
```

## Contract files

- [identity.md](identity.md): sign-in, session, profile completion, admin session revocation.
- [societies.md](societies.md): societies, Heads, membership, posts (Slice 2a).
- [platform.md](platform.md): uploads, events, Find Mates and chat, study material, faculty, archive, calendar, placement, notifications, realtime, reports and administration (Slices 2b to 6).
