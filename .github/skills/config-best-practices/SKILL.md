---
name: config-best-practices
description: "Use when designing configuration formats, validating settings, handling environment variables, or deciding between JSON, YAML, and `.env`-style inputs."
---

# Configuration Best Practices

Use this skill when configuration shape, validation, or secret-handling choices are part of the task.

## Apply this skill when

- choosing a config format for a new workflow
- adding or validating settings in Python models
- introducing environment-variable overrides
- reviewing config security and secret handling

## Repository-specific focus

- keep secrets out of committed config and documentation
- prefer validated settings models over ad-hoc dictionaries
- keep committed non-secret defaults in `backend/config.yaml` when appropriate
- use `.env` only for secrets or machine-local overrides

## Decision guide

- **YAML**: human-edited operational config
- **JSON**: machine-to-machine payloads or generated artifacts
- **Environment variables**: secrets and deployment overrides
- **Typed settings models**: the preferred runtime boundary for config loading and validation

## Checklist

- [ ] format choice matches the editor and runtime use case
- [ ] secrets stay out of versioned files and logs
- [ ] configuration is validated by typed models or schema rules
- [ ] docs/examples reflect the supported config path

## Use alongside

- `pydantic-modeling` for typed settings and validation
- `json-standards` for payload structure decisions
- `yaml-standards` for workflow or infrastructure YAML
