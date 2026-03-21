# PRD — Testing Capabilities Improvements

## Summary

Improve repository testing in two targeted ways:

1. strengthen backend coverage by closing meaningful branch/file gaps in high-value wrapper modules
2. expand frontend testing from a tiny utility-only surface into a practical unit/component testing setup

## Problem Statement

The repository already has a strong backend test base, but coverage artifacts still reveal specific wrapper modules with untested fallback and error branches. At the same time, the frontend has very little automated coverage and lacks a DOM-capable test harness for reusable components and shared state.

This leaves two risks:

- backend regressions can still slip through in path-resolution and error-mapping logic
- frontend behavior changes can land without enough fast automated feedback

## Goals

1. Improve backend confidence in branch-heavy viewer API/service wrappers.
2. Add a maintainable frontend testing harness for unit and component tests.
3. Increase frontend automated coverage on reusable shared logic and UI.
4. Keep the test suite fast and aligned with repository conventions.

## Non-Goals

- replacing browser smoke testing with full browser e2e coverage
- introducing auth-required frontend automation
- chasing coverage on every low-coverage backend file in one pass
- rewriting existing application code solely to satisfy tests unless a small testing seam is justified

## Requirements

### Backend

- Add targeted unit tests for high-value branch behavior in current-choice, current-bundles, downloads, and viewer-config related wrappers.
- Prefer behavior-oriented tests over implementation-detail assertions.
- Keep tests in the mirrored `backend/tests/unit/app/...` structure.

### Frontend

- Add jsdom-capable Vitest support suitable for React component tests.
- Add tests for shared utilities and data helpers that do not require browser automation.
- Add tests for at least a small set of reusable UI/state modules that justify the harness.
- Keep frontend tests fast and local; avoid introducing network-dependent tests.

### Documentation

- Update `docs/development/testing.md` to describe the expanded frontend testing capability and expected commands/setup.
- Keep this work effort status updated while implementation is active.

## Acceptance Criteria

- New backend tests cover previously untested branches in the targeted files.
- Frontend tests include both pure logic tests and jsdom-based component/state tests.
- `npm test` passes with the updated frontend setup.
- Backend pytest passes with the added tests.
- Documentation reflects the new frontend testing capability.
