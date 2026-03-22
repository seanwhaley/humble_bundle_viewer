---
name: review-repo-change-alignment
description: Review a proposed repository change and return the architecture, docs, tests, validation, and privacy impacts that should be handled before the work is considered complete.
argument-hint: "Describe the proposed change, touched files, or feature area"
---

Use [AGENTS.md](../AGENTS.md), [Architecture boundaries](../instructions/architecture-boundaries.instructions.md), [Secrets and artifacts safety](../instructions/secrets-and-artifacts.instructions.md), and [Repo change alignment](../skills/repo-change-alignment/SKILL.md).

For the described change:

1. Identify the repository layers involved (`backend/src`, `backend/app`, `frontend`, `tools`, `docs`, `.github`).
2. Flag any placement problems or likely duplication across layers.
3. List the docs, tests, validation commands, templates, or config files that should change with the implementation.
4. Call out secret, signed-URL, local-artifact, or rate-limit risks.
5. Return the smallest safe completion checklist.

Return a concise answer grouped into:

- touched layers and why
- required follow-up files
- validation to run
- security/privacy watch-outs