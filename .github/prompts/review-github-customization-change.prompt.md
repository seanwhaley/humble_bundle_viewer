---
name: review-github-customization-change
description: Review a proposed `.github` customization change and identify the required sync points across AGENTS, instructions, prompts, skills, agents, workflows, CODEOWNERS, templates, and the customization validator.
argument-hint: "Describe the .github change or list the files you plan to add/update"
---

Use [AGENTS.md](../AGENTS.md) and [GitHub customizations instructions](../instructions/github-customizations.instructions.md).

For the described `.github` change:

1. Identify which customization primitive is the right fit: `AGENTS.md`, instruction, prompt, skill, agent, workflow, template, or documentation.
2. List any related files that should be updated for consistency, such as:
   - `.github/skills/README.md`
   - `.github/CODEOWNERS`
   - `.github/pull_request_template.md`
   - `tools/scripts/validate_chat_customizations.py`
   - `.github/workflows/validate-customizations.yml`
3. Flag scope or frontmatter issues that could reduce discoverability.
4. Return the smallest complete set of follow-up edits.

Return:

- recommended customization surface
- required consistency updates
- validation checks
- any scope/overlap warnings