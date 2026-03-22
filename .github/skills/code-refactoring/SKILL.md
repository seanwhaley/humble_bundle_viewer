---
name: code-refactoring
description: "Use when refactoring tangled code, reducing complexity, improving maintainability, or preparing a module for safer feature work in this repository."
---

# Code Refactoring

Use this skill for meaningful refactors, not for tiny one-line edits.

## Apply this skill when

- simplifying complex or duplicated logic
- extracting helpers, services, or reusable modules
- improving testability before or alongside feature work
- reducing coupling without changing external behavior

## Do not use this skill when

- the task is a trivial bug fix with no structural work
- a change freeze prohibits non-essential code movement
- documentation-only changes are requested

## Working principles

1. **Stabilize behavior first**
   - identify the current behavior and protect it with tests before large moves
2. **Refactor in small slices**
   - make reviewable changes and validate each step
3. **Improve structure, not novelty**
   - prefer clearer names, smaller functions, and explicit boundaries over clever abstractions
4. **Keep public contracts stable**
   - avoid breaking CLI behavior, API contracts, or repository conventions unless explicitly requested

## Checklist

- [ ] current behavior is understood and protected by tests when needed
- [ ] refactor steps are incremental and reversible
- [ ] naming, structure, and boundaries are clearer after the change
- [ ] docs/tests were updated if the refactor changed behavior or workflow

## Use alongside

- `test-driven-development` when behavior needs protection through failing tests first
- `python-testing-patterns` when refactors require better fixture or mock structure
- `writing-plans` for larger multi-file refactors
