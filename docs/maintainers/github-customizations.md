# Repository Customizations

This guide explains how `HB Library Viewer` uses repository-owned GitHub Copilot customizations under `.github/`, when to extend each customization surface, and how to keep them consistent over time.

It is written for maintainers and contributors who are updating the repo's AI-assistance layer rather than the product code alone.

## Why this exists

This repository is **Copilot-first** for shared agent behavior. The goal is not to create a maze of instructions. The goal is to make common contributor workflows more consistent, safer around secrets and local artifacts, and easier to validate.

The main design rule is:

- keep durable repository-wide rules in `.github/AGENTS.md`
- keep scoped policy in `.github/instructions/`
- keep repeatable focused tasks in `.github/prompts/`
- keep reusable multi-step workflows in `.github/skills/`
- keep specialized read-only subagent roles in `.github/agents/`
- keep validation and enforcement support in `.github/workflows/`, `CODEOWNERS`, templates, and the customization validator

## The customization surfaces

### `AGENTS.md`

Use `.github/AGENTS.md` for repository-wide rules that should shape most work in this repo.

Examples in this project include:

- CLI compatibility expectations such as keeping `python -m hb_library_viewer` working
- privacy and secret-handling rules around `_simpleauth_sess`, `.env`, and signed URLs
- architecture boundaries across `backend/src/`, `backend/app/`, `frontend/`, and `tools/`
- documentation and validation expectations that apply broadly

If a rule is high importance, long-lived, and broadly applicable, it probably belongs here.

### Instructions

Use `.github/instructions/*.instructions.md` for **scoped policy** tied to a file set or workflow surface.

Examples in this repo:

- `cli-runtime.instructions.md` for long-running CLI output and artifact-path reporting
- `frontend-testing.instructions.md` and `testing.instructions.md` for test layout rules
- `architecture-boundaries.instructions.md` for code placement across layers
- `secrets-and-artifacts.instructions.md` for privacy-safe documentation, logging, and artifact handling

Choose an instruction when the repository wants an always-on convention for a defined surface.

### Prompts

Use `.github/prompts/*.prompt.md` for focused, repeatable tasks that benefit from a checklist or a structured answer.

Examples in this repo:

- preparing a subagent brief
- reviewing a CLI change checklist
- reviewing repository change alignment
- reviewing `.github` customization changes for consistency

Choose a prompt when you want a reusable one-task accelerator, not a large workflow package.

### Skills

Use `.github/skills/<name>/SKILL.md` for reusable **multi-step capabilities**.

Examples in this repo:

- `viewer-portal-workflows` for full-stack viewer work
- `project-tools-and-reporting` for maintenance scripts and artifact reports
- `repo-change-alignment` for mapping docs, tests, validation, and safety follow-up across surfaces

Choose a skill when the behavior needs richer workflow guidance, reusable checklists, or supporting assets later.

### Custom agents

Use `.github/agents/*.agent.md` for reusable subagent roles with **focused responsibility** and **minimal tool access**.

Examples in this repo:

- `Repo Alignment Review` for architecture/docs/tests/privacy review of proposed changes
- `GitHub Customization Auditor` for reviewing `.github/**` edits for overlap, discoverability, README sync, CODEOWNERS, workflows, and validator impact

Choose a custom agent when you want a delegable persona for read-only review or tightly scoped research. Avoid using it as a substitute for repo-wide policy or full implementation workflows.

## How to choose the right surface

Use this rule of thumb:

- **Repository-wide and durable** → `AGENTS.md`
- **Scoped convention** → instruction file
- **Focused repeatable task** → prompt file
- **Reusable multi-step workflow** → skill
- **Scoped subagent persona** → custom agent

When in doubt, extend an existing file whose scope already matches the concern before creating a new one.

## Repo-specific expectations when changing `.github/**`

When you add or substantially change repository customizations, review the following sync points:

- `.github/skills/README.md`
- `.github/CODEOWNERS`
- `.github/pull_request_template.md`
- `.github/workflows/validate-customizations.yml`
- `tools/scripts/validate_chat_customizations.py`

Not every `.github` edit requires every file to change, but each of these should be checked intentionally.

## Validation workflow

After updating repository customizations, run the repo validator:

- `python tools/scripts/validate_chat_customizations.py`

The validator currently checks for:

- instruction frontmatter and body presence
- prompt frontmatter and body presence
- custom agent frontmatter and body presence
- skill folder packaging and `name` alignment
- skills README drift relative to actual skill directories
- `CODEOWNERS` references to missing repo paths

If the validator fails, fix the customization drift before treating the change as complete.

## Good patterns for this repository

### Keep the main agent in charge

Subagents in this repo are intended for read-only exploration, inventory, or review. The main agent should still own:

- the plan
- the edits
- the validation
- the final synthesis

### Prefer explicit scope over clever scope

Good customization files in this repo tend to:

- use precise descriptions with clear trigger phrases
- keep `applyTo` patterns reasonably narrow
- define expected outputs for prompts and custom agents
- avoid duplicating the same policy in five places with slightly different wording

### Keep secrets and local artifacts out of examples

Never include:

- live `_simpleauth_sess` values
- real cookie or auth-token examples
- signed URLs from local artifacts
- raw authenticated artifact payloads

Use placeholders and summaries instead.

## Suggested review checklist

Before finishing a `.github/**` change, confirm:

- the chosen customization surface is the best fit
- the description/frontmatter is discoverable and valid
- overlapping files were extended instead of duplicated when possible
- README, CODEOWNERS, templates, workflow hooks, and validator rules were reviewed for sync impact
- examples and guidance stay consistent with current repo behavior
- no secrets, signed URLs, or local artifact payloads were introduced

## Related references

- [Agent Guidelines](../agent-guidelines.md)
- [Contributing](contributing.md)
- [Testing](testing.md)
- [`.github/AGENTS.md`](https://github.com/seanwhaley/humble_bundle_viewer/blob/main/.github/AGENTS.md)
