---
name: react-frontend
description: "Use when updating `frontend/src/**` React components, routes, data hooks, or TypeScript/Tailwind UI behavior for the viewer portal."
---

# React Frontend

Use this skill when a task centers on the viewer UI, client-side state, or frontend ergonomics.

## Apply this skill when

- building or refactoring React components
- adding routes or page-level UI flows
- changing frontend data hooks or selectors
- adjusting Tailwind-based layout, interaction, or accessibility details

## Repository-specific focus

- keep pages in `frontend/src/app/`, reusable UI in `frontend/src/components/`, and data access in `frontend/src/data/`
- keep secrets, cookies, and signed URLs out of frontend logs and state
- avoid embedding raw fetch logic in presentational components when a data hook is more appropriate
- keep typed frontend models aligned with backend contracts

## Checklist

- [ ] UI code lives in the right layer
- [ ] data access is centralized and typed
- [ ] accessibility and semantics were considered
- [ ] docs/tests were updated when behavior changed

## Use alongside

- `viewer-portal-workflows` for cross-cutting website changes
- `frontend-testing` when adding or reorganizing frontend automation under `frontend/tests/**`
- `fastapi-backend` when frontend work changes API contracts
- `webapp-testing` for browser validation of UI flows
