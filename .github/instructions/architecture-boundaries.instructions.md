---
name: "Architecture Boundaries"
description: "Use when changing backend core modules, FastAPI routes/services, frontend data flows, or repository tools. Covers the repository's core-vs-web-vs-tool boundaries and where shared logic should live."
applyTo: "{backend/src/hb_library_viewer/**,backend/app/**,frontend/src/**,tools/**}"
---

# Architecture boundaries

## Layer ownership

- `backend/src/hb_library_viewer/**` holds reusable domain logic, parsing, configuration, download workflows, and artifact handling that should remain testable outside the web app.
- `backend/app/**` is the FastAPI adapter layer. Keep request parsing, response shaping, and service orchestration there; avoid re-implementing core business logic in routes.
- `frontend/src/data/**` should own viewer-side API calls and lightweight response shaping. Keep secrets, auth cookies, filesystem paths, and signed URLs server-side.
- `frontend/src/components/**` and `frontend/src/app/**` should focus on presentation, user workflows, and route composition rather than backend-specific heuristics.
- `tools/**` should stay thin when a workflow can be reused by CLI commands, backend services, or multiple scripts. Prefer moving shared logic into `backend/src/hb_library_viewer/**`.

## Placement rules

- If code may be reused by both the CLI and the viewer backend, it probably belongs in `backend/src/hb_library_viewer/**`.
- If code exists only to expose or schedule an operation through HTTP, it belongs in `backend/app/**`.
- If logic is strictly UI-focused or tied to rendering and interaction, keep it in `frontend/src/**`.
- Avoid hiding durable business rules in tests, one-off scripts, or frontend route components.

## Change coordination

- Cross-layer changes should update contracts, docs, and tests together.
- When adding new behavior, make the boundary explicit in filenames, function placement, and imports so the next contributor does not have to rediscover the architecture.
- When in doubt, prefer a thin adapter over duplicating logic across CLI, FastAPI, and tooling surfaces.