# Contributing

Thanks for helping improve `HB Library Viewer`.

This project is local-first, privacy-sensitive, and intentionally narrow in scope. Good contributions keep those qualities intact while improving usability, reliability, or maintainability.

## Before you start

- read the repository guidance in `.github/AGENTS.md` if you are contributing with an AI-assisted workflow
- read [Repository Customizations](github-customizations.md) if you are adding or changing `.github/**` instructions, prompts, skills, agents, templates, or validation workflows
- avoid committing secrets, local artifacts, screenshots with signed URLs, or `backend/.env`
- keep `python -m hb_library_viewer` working
- update documentation when user-facing behavior changes

## Development setup

1. Create and activate a virtual environment.
2. Install Python dependencies with `requirements-dev.txt`.
3. Install Playwright browsers with `python -m playwright install`.
4. Install the package in editable mode with `pip install -e .`.
5. Install frontend dependencies from `frontend/` with `npm install`.

## Contribution workflow

1. Start with a clear problem statement or proposed improvement.
2. Prefer small, reviewable changes.
3. Add or update tests when behavior changes.
4. Update docs in the same change when public behavior, configuration, or workflows change.
5. Keep secrets and signed URLs out of logs, screenshots, and examples.

## Documentation expectations

- user-facing behavior belongs in `docs/getting-started/`, `docs/guides/`, or `README.md`
- architecture and implementation notes belong in `docs/architecture/`
- evergreen maintainer workflow docs belong in `docs/maintainers/`
- active project-management work, when needed, belongs in `docs/development/work-efforts/<effort-name>/`
- roadmap/changelog material belongs in `docs/development/`
- completed work-effort folders should be removed after the final state is reflected in canonical docs and changelog entries

## Local verification

Run the checks relevant to your change:

- `pytest backend/tests -v`
- `python -m doctest backend/src/hb_library_viewer/config.py -v`
- `cd frontend && npm run build`
- `mkdocs build --strict`

If your change affects the viewer, also do a quick local browser smoke test.

## Security issues

Please do not open public issues for credential leaks, signed URL exposure, or other security-sensitive problems. Use the process in [Security](../help/security.md).
