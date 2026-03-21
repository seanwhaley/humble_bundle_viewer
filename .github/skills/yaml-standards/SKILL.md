---
name: yaml-standards
description: "Use when editing YAML for repository workflows, CI/CD configuration, infrastructure-style manifests, or other human-edited structured configuration."
---

# YAML Standards

Use this skill when YAML structure, readability, and operational safety matter.

## Apply this skill when

- updating GitHub Actions or other YAML workflows
- designing human-edited YAML configuration
- reviewing CI/CD structure and job composition
- checking YAML for maintainability, comments, and safe secret handling

## Working principles

1. keep YAML declarative and readable
2. avoid hidden complexity when simpler structure will do
3. keep secrets out of committed YAML values
4. document assumptions when workflows have non-obvious behavior

## Repository-specific focus

- treat `.github/workflows/**` as operational code that deserves reviewability
- prefer clear job names, explicit steps, and safe defaults
- keep workflow and config YAML aligned with repository structure and tooling

## Checklist

- [ ] YAML remains readable and minimally surprising
- [ ] secret handling is safe
- [ ] workflow names, paths, and commands match the repository
- [ ] related docs were updated when operational behavior changed

## Use alongside

- `config-best-practices` for broader config-format decisions
- `project-tools-and-reporting` when YAML changes affect maintenance tooling or generated outputs
