# ADR-0005: Authentication library: Better Auth (spike), Arctic fallback

Status: **Approved for spike only (2026-10-23).** Not production-approved. Final status is set after the owner reviews `docs/auth/spike-findings.md`.

## Context
- The spec names NextAuth.js (Table 4.1).
- Auth.js v5 is still beta on npm (`5.0.0-beta.32`), which our no-beta rule excludes. Auth.js v4 is legacy, and like Better Auth it stores raw session tokens.
- Better Auth 1.7.12 (2026-10-20) supports:
  - Google `hd` restriction
  - DB sessions
  - revocation APIs, including admin and ban
  - HTTP-only Secure SameSite=Lax signed cookies
  - Origin-check CSRF on its own endpoints
- Better Auth **stores the session token unhashed**. The opt-in hashing (`storeTokenHash`) is only draft PR #11444.

## Options considered
1. Better Auth + a hashing adapter wrapper (session model only).
2. Arctic 3.7.0 (OAuth flow) + own session module following Lucia's published guidance.
3. Accept raw tokens (a deviation from FR-AUTH-3). **Not recommended; requires written approval.**

## Decision
Run a time-boxed spike of option 1 against tests T01–T17 (`auth/authentication-evaluation.md` §8). If any "Go" test fails, or the source audit finds an unwrapped token path, spike option 2 with the same tests.

## Consequences
- The wrapper depends on Better Auth internals. Requires an exact version pin, regression tests before any upgrade, and removal once upstream hashing ships and is verified.
- Cookie cache and secondaryStorage must remain disabled.
- App-level CSRF is still required for non-auth endpoints.
