# Agent Guidelines

This page summarizes the most important constraints and conventions for AI-assisted contributions.

## Safety & Privacy

- Never print or log credentials (cookies, auth tokens, session IDs).
- Do not commit `backend/.env` (use `backend/.env.example` for placeholders).
- Keep API rate limits at **0.5s or higher** per request.

## CLI & Compatibility

- Preserve the primary entry point: `python -m hb_library_viewer`.
- Maintain Python **3.10+** compatibility.

## Configuration Sources (Priority)

1. CLI arguments
2. Environment variables (`HUMBLE_*`)
3. `backend/.env` (secrets only)
4. `backend/config.yaml` (non-secrets)
5. Defaults

## Tests

- `backend/tests/unit/`: isolated logic only.
- `backend/tests/integration/`: multi-module with mocks; no real network.
- `backend/tests/e2e/`: opt-in real auth/download flows only.

## Documentation Expectations

- Update docs whenever user-facing behavior changes.
- Validate with a MkDocs build to catch broken links.

## Full Policy

For the complete policy and workflow guidance, see the full agent document:

- [AGENTS.md](https://github.com/seanwhaley/humble_bundle_viewer/blob/main/.github/AGENTS.md)
- [Repository Customizations](development/github-customizations.md) for maintainers extending `.github/**`
