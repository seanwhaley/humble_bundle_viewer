# Agent Skills Index

This directory contains the repository’s active GitHub Copilot skill packages. Each skill now uses the folder-based layout at `.github/skills/<skill-name>/SKILL.md`, which keeps discovery metadata explicit, keeps the skill manifest concise, and leaves room for supporting assets when a workflow grows.

## Installed skills

- **[code-refactoring](code-refactoring/SKILL.md)** — Source: `sickn33/antigravity` (adapted). Refactoring workflow for reducing complexity, improving maintainability, and preparing modules for safer feature work.
- **[config-best-practices](config-best-practices/SKILL.md)** — Source: `sickn33/antigravity` (adapted). Configuration format, validation, and secret-handling guidance across YAML, JSON, and environment variables.
- **[doc-standards](doc-standards/SKILL.md)** — Source: `anthropics/skills` (adapted). Structure and readability guidance for PRDs, specs, proposals, and maintainer-facing documentation.
- **[fastapi-backend](fastapi-backend/SKILL.md)** — Source: `local` (modernized). Backend route, schema, service, and safety guidance for `backend/app/**`.
- **[frontend-testing](frontend-testing/SKILL.md)** — Source: `local`. Frontend Vitest/RTL/Playwright structure and test-scope guidance for `frontend/tests/**`.
- **[json-standards](json-standards/SKILL.md)** — Source: `sickn33/antigravity` (adapted). JSON payload, error, metadata, and machine-readable data design guidance.
- **[modern-python](modern-python/SKILL.md)** — Source: `trailofbits/skills` (adapted). Repository-aligned modern Python structure, typing, and tooling guidance.
- **[project-tools-and-reporting](project-tools-and-reporting/SKILL.md)** — Source: `local`. Tooling, maintenance script, artifact analysis, and report-generation guidance.
- **[pydantic-modeling](pydantic-modeling/SKILL.md)** — Source: `sickn33/antigravity` (adapted). Pydantic v2 modeling, validation, settings, and serialization guidance.
- **[python-patterns](python-patterns/SKILL.md)** — Source: `sickn33/antigravity` (adapted). Python architecture, async-vs-sync, and module-boundary decision guidance.
- **[python-pro](python-pro/SKILL.md)** — Source: `sickn33/antigravity` (adapted). Advanced Python guidance for profiling, concurrency, optimization, and deeper runtime tradeoffs.
- **[python-testing-patterns](python-testing-patterns/SKILL.md)** — Source: `sickn33/antigravity` (adapted). Pytest-oriented testing structure, fixtures, mocks, and test-scope guidance.
- **[react-frontend](react-frontend/SKILL.md)** — Source: `local` (modernized). Frontend component, route, data-hook, and safety guidance for `frontend/src/**`.
- **[repo-change-alignment](repo-change-alignment/SKILL.md)** — Source: `local`. Cross-cutting repository change coordination for architecture boundaries, docs/tests/validation mapping, and security/privacy follow-through.
- **[test-driven-development](test-driven-development/SKILL.md)** — Source: `sickn33/antigravity` (adapted). Red-green-refactor workflow tailored to repository test conventions.
- **[viewer-portal-workflows](viewer-portal-workflows/SKILL.md)** — Source: `local`. Full-stack viewer portal workflow coordination across backend, frontend, docs, and tests.
- **[webapp-testing](webapp-testing/SKILL.md)** — Source: `anthropics/skills` (adapted). Browser-level validation guidance for the local viewer web app.
- **[writing-plans](writing-plans/SKILL.md)** — Source: `obra/superpowers` (adapted). Copilot-first implementation planning and tracked work-effort guidance.
- **[yaml-standards](yaml-standards/SKILL.md)** — Source: `sickn33/antigravity` (adapted). YAML guidance for workflows, infrastructure-style config, and operational readability.

## Usage

These skills are maintained for **GitHub Copilot in this repository**. The agent can load them on demand when the description matches the task.

All current repository skills use the folder-based `SKILL.md` package layout. Keep skill manifests concise and discovery-oriented; place examples, templates, or supporting material beside `SKILL.md` only when that extra structure materially improves the workflow.

## Recommended combinations

- **Viewer feature work**: start with `viewer-portal-workflows`, then pair it with `fastapi-backend` and `react-frontend`.
- **Cross-cutting repository changes**: start with `repo-change-alignment`, then pair it with the surface-specific skills for backend, frontend, tools, or `.github` customizations.
- **Frontend test work**: pair `frontend-testing` with `react-frontend`; add `webapp-testing` when browser or route-level validation is involved.
- **Test-first backend changes**: pair `test-driven-development` with `python-testing-patterns`; add `webapp-testing` when browser or e2e validation is part of the change.
- **API payload and schema changes**: combine `fastapi-backend`, `json-standards`, and `pydantic-modeling`.
- **Python architecture or performance work**: combine `python-patterns` with `python-pro`; add `modern-python` when tooling or structure changes too.
- **Planning or specification work**: combine `writing-plans` with `doc-standards`.
- **Repository tooling and reports**: start with `project-tools-and-reporting`; add `modern-python` or `config-best-practices` when tooling changes affect Python workflow or settings.

## Skill packaging standard

- Keep skills at `.github/skills/<skill-name>/SKILL.md`.
- Use a precise `name` and a description that starts with concrete trigger phrasing such as “Use when…”.
- Keep `SKILL.md` focused on discovery, scope, workflow, and checklists.
- Add supporting assets only when they materially improve the skill instead of bloating the manifest.
- Update this README whenever a skill is added, renamed, removed, or substantially repackaged.

## Adding or updating a skill

- First, check whether an existing skill already covers the concern closely enough to extend it.
- If the capability is reusable, durable, and distinct, update or add the skill using the decision matrix in `.github/instructions/github-customizations.instructions.md`.
- Preserve repository-specific constraints inside the skill instead of copying broad third-party guidance verbatim.
- Keep trigger wording specific enough that GitHub Copilot can discover the skill when a prompt matches its intended use.

Project-specific prompt files live under `.github/prompts/` and should be used for lighter-weight, repeatable workflows that do not need the richer packaged structure of a skill.

For complex tasks, the intended operating model is: the main chat agent owns planning, edits, validation, and the final response; subagents are best used for scoped exploration, inventory, or targeted research that feeds back into the main agent.

When deciding whether to add or change a customization file, follow the decision matrix in `.github/instructions/github-customizations.instructions.md`.
