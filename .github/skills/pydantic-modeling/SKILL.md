---
name: pydantic-modeling
description: "Use when designing Pydantic v2 models, typed settings, validation rules, serialization behavior, or schema boundaries for backend or tooling workflows."
---

# Pydantic Modeling

Use this skill when strict typed data boundaries matter.

## Apply this skill when

- creating or updating request/response models
- designing typed settings or configuration loading
- adding validators or serialization rules
- converting raw JSON or YAML into trusted application models

## Repository-specific focus

- prefer Pydantic v2 patterns
- keep configuration and API boundaries explicit and validated
- use model fields and validators to explain intent, not just to coerce data silently
- keep sensitive fields safe in logs and serialized output

## Checklist

- [ ] model names and field names reflect the domain clearly
- [ ] validators enforce real business or data constraints
- [ ] serialization behavior matches API or artifact expectations
- [ ] settings and schema changes are documented where needed

## Use alongside

- `fastapi-backend` for API model integration
- `config-best-practices` for settings and secret-handling decisions
- `json-standards` for payload structure conventions
