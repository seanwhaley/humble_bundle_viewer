# Development Docs

This folder contains implementation-facing documentation for the Humble Bundle viewer.

## Active references

- [`styling-conventions.md`](./styling-conventions.md) — semantic tokens, shared UI primitives, and migration rules for frontend styling
- [`browser-storage-policy.md`](./browser-storage-policy.md) — browser storage boundaries, key namespaces, and safety rules
- `work-efforts/` — planning and status tracking for discrete work efforts

## How to use these docs

- Read `styling-conventions.md` before adding or restyling frontend components.
- Read `browser-storage-policy.md` before persisting any UI state in `localStorage` or `sessionStorage`.
- Use the work-effort docs only for active planning and in-progress implementation tracking.
- Once an effort is complete, move the lasting product or workflow guidance into the canonical docs and remove the finished work-effort folder.
