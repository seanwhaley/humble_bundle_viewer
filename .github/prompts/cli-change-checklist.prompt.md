---
name: cli-change-checklist
description: Review a proposed HB Library Viewer CLI change and enforce the repository checklist for command UX, docs, tests, and output safety.
argument-hint: "Describe the command or CLI change you want reviewed"
---

Use [CLI runtime instructions](../instructions/cli-runtime.instructions.md) and the repository-wide rules in [AGENTS.md](../AGENTS.md).

For the described CLI change:

1. Identify the command(s), options, help text, progress output, and artifacts affected.
2. Check whether start/progress/completion status is needed.
3. Check whether elapsed or ETA output should use `HH:MM:SS` formatting.
4. Identify test updates required in `backend/tests/**`.
5. Identify documentation updates required in `docs/guides/cli-reference.md`, `README.md`, or other user-facing docs.
6. Flag any risk of leaking cookies, signed URLs, or other secrets through output.

Return a concise checklist grouped into:

- implementation changes
- validation to run
- docs/config/schema follow-ups