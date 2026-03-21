---
name: "Frontend Testing Structure"
description: "Use when creating or updating frontend tests, Vitest configuration, or frontend test scripts. Covers the repository's unit, integration, and e2e frontend test layout and shared helper conventions."
applyTo: "frontend/tests/**"
---

# Frontend testing structure

## Test folders

- `frontend/tests/unit/`: pure selectors, utilities, isolated hooks, and reusable components exercised with local mocks only.
- `frontend/tests/integration/`: app shell, routes, provider-backed components, and other stateful UI behavior that composes multiple frontend modules in jsdom.
- `frontend/tests/e2e/`: browser-driven viewer journeys. Prefer Playwright-style tests and keep any auth-sensitive scenarios opt-in.

## Layout and naming

- Mirror the source area beneath the test scope where practical, for example:
  - `frontend/tests/unit/data/selectors.test.ts`
  - `frontend/tests/integration/app/routes/Downloads.test.tsx`
- Keep test filenames aligned with the source target they cover.
- Do not reintroduce colocated `frontend/src/**/*.test.{ts,tsx}` files for repository-owned tests.

## Shared helpers

- Put Vitest/jsdom setup in `frontend/tests/setup.ts`.
- Prefer local helper functions inside a test file when only one file needs them.
- If a frontend test helper is reused in 2+ files, move it under `frontend/tests/` rather than duplicating setup.

## Testing style

- Prefer React Testing Library queries that reflect user-visible behavior.
- Use `data-testid` only when semantic queries are not practical.
- Mock expensive charting, routing, or network layers at the narrowest useful boundary.
- Keep unit tests fast and focused; move provider/router/app composition checks into integration tests.