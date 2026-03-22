---
name: frontend-testing
description: "Use when creating, moving, or maintaining frontend tests for the viewer portal, especially when deciding between unit, integration, and e2e coverage under `frontend/tests/**`."
---

# Frontend Testing

Use this skill when the task centers on frontend automation design, test placement, or maintainable Vitest/RTL coverage for the viewer portal.

## Apply this skill when

- adding tests for React components, routes, selectors, or hooks
- reorganizing frontend tests into unit, integration, and e2e scopes
- updating Vitest configuration or frontend test scripts
- deciding whether a browser-level flow belongs in Playwright-style e2e coverage instead of jsdom

## Repository-specific focus

- keep repository-owned frontend tests under `frontend/tests/`, not colocated in `frontend/src/`
- mirror source areas beneath `frontend/tests/unit/` and `frontend/tests/integration/` where practical
- reserve `frontend/tests/e2e/` for browser-driven viewer journeys
- keep shared jsdom setup in `frontend/tests/setup.ts`
- prefer React Testing Library queries that reflect what a user can see or do
- mock charts, router boundaries, and network calls narrowly so tests stay readable and deterministic

## Scope guide

### Unit

Use `frontend/tests/unit/` for:

- pure helpers and selectors
- formatting and transformation utilities
- isolated UI primitives and simple reusable components
- hooks or state helpers whose behavior stays within one module boundary

### Integration

Use `frontend/tests/integration/` for:

- route rendering and redirects
- provider-backed or router-backed components
- app-shell wiring and entrypoint behavior
- stateful components that combine several collaborators

### E2E

Use `frontend/tests/e2e/` for:

- browser flows that validate multiple routes or real rendered behavior
- interactions where jsdom confidence is not enough
- opt-in auth-sensitive or download-sensitive flows only when explicitly enabled

## Recommended workflow

1. Identify the smallest test scope that covers the behavior.
2. Place the file under `frontend/tests/unit/`, `frontend/tests/integration/`, or `frontend/tests/e2e/`.
3. Mirror the source area in the test path when practical.
4. Prefer semantic React Testing Library queries before falling back to `data-testid`.
5. Keep network and chart mocks at the narrowest useful boundary.
6. Update `frontend/package.json`, `frontend/vite.config.ts`, and docs when test structure or commands change.
7. Run the most targeted frontend validation first, then rerun the broader suite.

## Checklist

- [ ] the test lives in the correct scope folder
- [ ] imports point to `frontend/src/**` rather than colocated siblings
- [ ] shared setup lives in `frontend/tests/setup.ts`
- [ ] user-visible assertions are preferred over implementation-detail checks
- [ ] docs and scripts were updated when the test layout changed

## Use alongside

- `react-frontend` for source-layer conventions in `frontend/src/**`
- `viewer-portal-workflows` when the change spans backend, frontend, docs, and tests
- `webapp-testing` for browser-driven validation beyond jsdom