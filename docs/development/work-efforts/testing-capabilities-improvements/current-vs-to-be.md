# Testing Capabilities Improvements — Current vs To-Be

## Purpose

Track a focused testing improvement pass across the HB Library Viewer backend and frontend.

## Current State

### Backend

- The backend suite is healthy and already clears the repository coverage gate.
- Coverage artifacts still show branch and file gaps concentrated in a handful of wrapper and workflow-adjacent modules.
- The most actionable gaps are in viewer-facing API/service wrappers such as:
  - `backend/app/api/current_choice.py`
  - `backend/app/api/current_bundles.py`
  - `backend/app/api/downloads.py`
  - `backend/app/api/viewer_config.py`
  - `backend/app/services/current_choice.py`
  - `backend/app/services/current_bundles.py`
- These files are good candidates for focused unit tests because they contain important branch behavior but relatively little setup cost.

### Frontend

- The frontend currently has only two test files:
  - `frontend/src/data/selectors.test.ts`
  - `frontend/src/utils/downloads.test.ts`
- Current frontend tests mostly cover pure data helpers.
- The test runner is configured for `node`, which limits DOM/component coverage.
- There is no existing jsdom-based component harness or React Testing Library setup.
- Important pure and UI-level files remain untested, including formatting helpers, redemption-link parsing, shared filter state, and reusable route/dialog components.

## Target State

### Backend target

- Add focused tests that close unhit branches in high-value API and service wrapper files.
- Prefer unit tests for branch behavior and small integration tests only when multiple modules must be wired together.
- Raise confidence in path resolution, fallback behavior, error mapping, and runtime-setting normalization.

### Frontend target

- Add a lightweight jsdom-capable Vitest setup suitable for component and hook tests.
- Keep pure utility tests fast and simple.
- Add coverage for:
  - shared utilities
  - shared data helpers
  - shared state/context behavior
  - reusable UI components with meaningful interaction behavior

## Success Criteria

- Backend branch gaps are reduced in the targeted wrapper/service files.
- Frontend test capability expands beyond node-only utility tests.
- New frontend tests cover both pure helpers and reusable components.
- Backend and frontend test suites continue to pass cleanly after the changes.
- `docs/development/testing.md` reflects the expanded frontend testing capability.
