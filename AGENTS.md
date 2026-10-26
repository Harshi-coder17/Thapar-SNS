# AGENTS.md: Thapar SNS

Instructions for Codex and any other coding agent working in this repository.

**The authoritative instructions are in [`CLAUDE.md`](CLAUDE.md) in this folder.** It holds the working rules (phase-gated delivery, no side effects without approval, never weaken a requirement, no em-dash characters anywhere, never commit or push), the status labels, the architecture rules and the current project state. Read it before doing anything. Every rule in it applies to you as well: where it says "Claude", read "the coding agent".

Do not copy its contents here. A copy goes out of date (an earlier copy in this file did).

## Next.js version note

This project uses Next.js 16.4.2, whose APIs, conventions and file structure differ from older versions. Read the matching guide in `node_modules/next/dist/docs/` before changing framework code, and heed deprecation notices. (`next dev` would normally write a similar reminder into this file; that is turned off with `agentRules: false` in `next.config.ts`, because the generated text contains em-dash characters, which `CLAUDE.md` rule 10 forbids.)
