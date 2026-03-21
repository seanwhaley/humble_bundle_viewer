---
name: python-patterns
description: "Use when making Python architecture decisions such as module boundaries, async vs sync choices, service layering, or overall project structure."
---

# Python Patterns

Use this skill for architecture-level Python decisions, especially before code starts spreading across the wrong shape.

## Apply this skill when

- choosing async vs sync boundaries
- deciding how to structure a new module or service
- selecting between lightweight helpers and richer service abstractions
- reorganizing Python code to reduce coupling or clarify ownership

## Working principles

1. **match structure to the workload**
   - choose async for I/O concurrency, not by reflex
2. **prefer explicit boundaries**
   - separate orchestration, domain logic, and I/O concerns
3. **fit the repo before importing a framework habit**
   - align with existing project structure and conventions first
4. **optimize for maintainability**
   - make future changes easier, not just current code shorter

## Checklist

- [ ] async vs sync choices are justified by the workload
- [ ] module and service boundaries are explicit
- [ ] structure matches existing repository conventions where practical
- [ ] tests still map cleanly to the resulting design

## Use alongside

- `python-pro` for deeper performance or advanced runtime concerns
- `modern-python` for syntax and tooling modernization
- `fastapi-backend` when architecture decisions land in the backend app
