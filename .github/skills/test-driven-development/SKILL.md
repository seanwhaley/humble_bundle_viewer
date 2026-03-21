---
name: test-driven-development
description: "Use when implementing a feature, bug fix, or behavior change and you want a failing test first, minimal code second, and refactoring only after green."
---

# Test-Driven Development

Use this skill when behavior should be driven by tests instead of retrofitted after implementation.

## Apply this skill when

- adding a feature or bug fix
- changing observable behavior
- refactoring code that needs stronger safety rails
- tightening confidence before touching fragile logic

## Core loop

1. **Red** — write the smallest failing test for the next behavior
2. **Verify red** — confirm it fails for the expected reason
3. **Green** — write the minimal implementation to pass
4. **Verify green** — run the targeted test and nearby suite coverage
5. **Refactor** — clean up only after behavior is protected

## Repository-specific focus

- use pytest-style tests for Python work in this repository
- keep test placement aligned with `backend/tests/` conventions
- prefer behavior-first tests over mock-heavy implementation tests
- keep refactors and new behavior separate when practical

## Checklist

- [ ] the new or changed behavior has a failing test first
- [ ] the failure reason is the intended one
- [ ] the implementation is the smallest step to green
- [ ] refactoring happened only after tests passed

## Use alongside

- `python-testing-patterns` for fixture, parametrization, and mock strategy
- `code-refactoring` when a protected cleanup follows the green step
- `webapp-testing` when the behavior includes browser-driven flows
