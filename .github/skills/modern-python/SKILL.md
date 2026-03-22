---
name: modern-python
description: "Use when modernizing Python code style, developer tooling, project structure, or typing practices while staying aligned with this repository’s supported Python workflow."
---

# Modern Python

Use this skill for Python modernization work that should improve code quality without fighting the repository’s existing setup.

## Apply this skill when

- adding type hints or improving Python ergonomics
- cleaning up package structure or module layout
- improving linting, formatting, or test workflow choices
- updating scripts or package code to clearer modern idioms

## Repository-specific focus

- preserve the repository’s supported Python version expectations
- prefer changes that work with the existing `pyproject.toml`, requirements files, and selected environment tooling
- use standard library features and clear typing before reaching for new dependencies
- keep `python -m hb_library_viewer` working

## Working principles

1. prefer clear modern syntax that matches the supported runtime
2. keep tooling recommendations consistent with the repository’s actual workflow
3. use type hints to clarify contracts, not to impress the compiler gods
4. modernize incrementally so changes remain reviewable

## Checklist

- [ ] syntax and tooling choices match repository support constraints
- [ ] new dependencies are justified
- [ ] typing and structure changes improve readability
- [ ] tests and docs were updated when workflow changed

## Use alongside

- `python-pro` for deeper performance or advanced Python work
- `python-patterns` for architecture-level Python decisions
- `config-best-practices` when modernization affects settings or environment loading
