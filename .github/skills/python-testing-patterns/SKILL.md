---
name: python-testing-patterns
description: "Use when writing or restructuring Python tests, fixtures, mocks, parametrized cases, async tests, or broader pytest-based test suite patterns."
---

# Python Testing Patterns

Use this skill for test design and pytest structure, especially when changes span more than a single trivial assertion.

## Apply this skill when

- creating or reorganizing unit, integration, or e2e-oriented Python tests
- deciding how fixtures, parametrization, or mocks should be structured
- testing async code or error paths
- improving test readability or maintainability

## Repository-specific focus

- follow the repository’s unit, integration, and e2e definitions under `backend/tests/`
- keep shared fixtures in `backend/tests/conftest.py` only when reuse justifies it
- prefer behavior-oriented tests over implementation-detail tests
- combine this skill with TDD when implementation order matters

## Working principles

1. protect behavior with focused tests
2. choose the lightest useful test level
3. use fixtures and mocks to clarify setup, not to hide the behavior under test
4. keep tests easy to read and quick to diagnose

## Checklist

- [ ] test scope matches unit, integration, or e2e intent
- [ ] fixtures and mocks are justified and readable
- [ ] edge cases and failure paths are covered where they matter
- [ ] tests still communicate behavior clearly to future readers

## Use alongside

- `test-driven-development` for red-green-refactor sequencing
- `.github/instructions/testing.instructions.md` for repository-specific test placement and fixture rules
- `webapp-testing` when browser-driven validation is also required
