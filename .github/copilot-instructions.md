# Copilot Instructions

Follow `.github/AGENTS.md` as the source of truth for repository rules.

Use the scoped files in `.github/instructions/` for task-specific guidance and the project skills in `.github/skills/` when work matches their described workflows.

Key reminders:

- Do not log or commit secrets (especially `.env`).
- Keep `python -m hb_library_viewer` working.
- CLI branding should use “HB Library Viewer”.
- Respect the 0.5s minimum rate limit.
- Update docs when behavior or config changes.
- Print or log important artifact output paths for long-running CLI and maintenance workflows.
- Use subagents for broad read-only exploration or tightly scoped research, but keep the main chat agent responsible for planning, edits, validation, and final synthesis.
- CLI uses `typer`, `rich`, and `tqdm`.
- Viewer web app uses FastAPI (backend) + React/Vite/TypeScript/Tailwind (frontend).
- Never surface `_simpleauth_sess` or other secrets in frontend responses or logs.
- Prefer `response_model` + typed request models for FastAPI endpoints.
- Auth-required e2e tests are opt-in with:
  - `HUMBLE_RUN_AUTH_TESTS=1`
  - `HUMBLE_AUTH_COOKIE` (valid `_simpleauth_sess`)
  - `HUMBLE_RUN_DOWNLOAD_TESTS=1` for real downloads.
