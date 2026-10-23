# ADR-0001: Modular monolith with enforced module boundaries

Status: **Approved**. This is the frozen baseline architecture (spec §4.2.1, frozen 2026-09-08).

## Context
A four-person team with a short timeline needs clear ownership boundaries without the operational cost of microservices (separate deployments, inter-service auth, distributed transactions).

## Options considered
Microservices (rejected in spec Table 4.2); traditional unstructured monolith; modular monolith.

## Decision
Single codebase and database, divided into modules (see `architecture/modules.md`). No module accesses another module's tables; cross-module calls go through public service interfaces. Boundaries are enforced by code organisation, TypeScript import rules and lint checks.

## Consequences
- One deployable web/API unit. The realtime/worker service (ADR-0002) is a second **process** sharing the same modules, not a separate microservice.
- Cross-module FKs allowed for integrity; cross-module joins in code are not.
- Extraction to services remains possible later (spec §7.3).

## Verification
Lint rule + CI test that fails on forbidden imports (Slice 1a).
