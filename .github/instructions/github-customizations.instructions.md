---
name: "GitHub Customizations"
description: "Use when creating or updating repository chat customizations under .github, including instructions, prompts, skills, templates, and validation workflows. Covers frontmatter, file placement, scope, and GitHub/Copilot best practices."
applyTo: ".github/**"
---

# GitHub customizations

- This repository is **GitHub Copilot-first**. Treat `.github/**` as the only repository-owned customization surface.
- Keep `.github/AGENTS.md` as the deep source of truth for repository-wide agent behavior.
- Keep `.github/copilot-instructions.md` short and delegating; avoid duplicating detailed guidance there.
- `*.instructions.md` files should use YAML frontmatter with a meaningful `description` and narrowly scoped `applyTo` patterns when practical.
- Use prompt files for focused repeatable tasks and skills for multi-step capabilities that may include scripts or additional resources.
- Use `.github/agents/*.agent.md` for repository-specific subagent roles that need a focused persona and minimal, explicit tool access.
- Use folder-based skills at `.github/skills/<skill-name>/SKILL.md` for repository skills.
- All current repository skills under `.github/skills/` are standardized on folder-based `SKILL.md` packaging.
- Design prompts, skills, and any subagent-facing guidance for a handoff model: the main agent owns the plan and validation, while subagents should return scoped findings or recommendations.
- When a customization is meant to support subagent work, make the expected scope, inputs, and return format explicit so the main agent can integrate results without re-discovery.
- Keep GitHub issue forms, PR templates, CODEOWNERS, and workflow validation aligned with current repository structure.
- Do not invent GitHub usernames, workflow paths, or file references; verify them against the repository or authoritative source first.

## Customization decision matrix

Use this decision matrix when adding or restructuring repository customization content.

### Put guidance in `.github/AGENTS.md` when

- it applies repository-wide
- it is long-lived and high importance
- it should shape most coding or validation behavior across the repo
- it governs how other customization files should be interpreted

Keep `AGENTS.md` concise enough to stay usable as a source of truth; delegate detailed operational rules to scoped instruction files.

### Put guidance in `.github/instructions/*.instructions.md` when

- it is policy or convention rather than a one-off task
- it should apply automatically to a specific file set or folder via `applyTo`
- it explains how to work within a surface such as `.github/**`, `backend/tests/**`, or a specific product area

### Put guidance in `.github/prompts/*.prompt.md` when

- the task is single-purpose and repeatable
- arguments or a narrow checklist are useful
- the content is meant to drive one focused outcome rather than define durable always-on policy
- the workflow does not need bundled supporting files

### Put guidance in `.github/agents/*.agent.md` when

- the repository benefits from a reusable subagent role with a sharply defined responsibility
- read-only review or scoped research should be delegated without giving the subagent broad editing or execution powers
- the agent should return a structured report that the main agent can verify and integrate
- a prompt or skill would be insufficient because you need a discoverable subagent persona with explicit tool limits

### Put guidance in `.github/skills/<name>/SKILL.md` when

- the content is a reusable multi-step workflow or capability
- the agent should load it on demand based on the description
- the task may benefit from richer structure, supporting assets, or a dedicated packaged workflow

Keep repository skills in folder-based `SKILL.md` packages. When modernizing an existing skill, preserve its active status unless the repository explicitly retires or rehomes it.

### Put content in human-oriented documentation when

- it is primarily explanatory or archival
- it should help maintainers understand a topic without acting as an active agent customization primitive
- it is reference material that should not be auto-discovered or treated as a live skill/prompt/instruction

## Rule for extending vs creating `.github` files

- First, prefer updating an existing `.github` file whose scope already matches the new concern.
- If no current file cleanly owns the concern and the guidance is reusable, durable, and discoverable, propose or create the appropriate new `.github` customization file.
- Do not create a new file for one-off notes, weakly scoped guidance, or content that would fit cleanly in an existing file.
- When creating a new file, make the ownership obvious through:
	- a precise filename
	- a meaningful description
	- a narrow scope or `applyTo` pattern when applicable
	- a clear distinction from neighboring prompts, skills, and instructions

## Consistency updates to check when `.github/**` changes

When you add or substantially change repository customizations, check whether the following files also need updates:

- `.github/skills/README.md` when skills are added, removed, renamed, or repackaged
- `.github/CODEOWNERS` when new protected customization directories or files are introduced
- `.github/pull_request_template.md` when maintainers should review a new kind of customization impact
- `tools/scripts/validate_chat_customizations.py` when validation rules or supported customization surfaces change
- `.github/workflows/validate-customizations.yml` when customization validation triggers, permissions, or execution expectations need to change

Favor the smallest complete set of edits that keeps the customization ecosystem synchronized.

## Skills folder expectations

- Keep `.github/skills/README.md` aligned with the actual contents of `.github/skills/`.
- Include all current skills in the index; do not omit active skill files from the README summary table.
- If a skill is modernized later, preserve its active status unless the repository explicitly decides to retire or rehome it.
- Treat unexpected flat skill files in `.github/skills/` as drift to resolve rather than as a second supported packaging style.