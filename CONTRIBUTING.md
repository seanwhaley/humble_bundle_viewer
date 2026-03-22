# Contributing to HB Library Viewer

Thanks for your interest in contributing.

**Project owner and maintainer:** Sean Whaley (`crazyandol@gmail.com`)

## Before opening a change

- read [docs/maintainers/contributing.md](docs/maintainers/contributing.md)
- keep secrets, cookies, signed URLs, and local artifacts out of commits
- make sure your change matches the project's actual scope: local-first capture, normalization, viewer workflows, and optional downloads/sync

## Development basics

- install Python dependencies from `requirements-dev.txt`
- install Playwright browsers with `python -m playwright install`
- install the package with `pip install -e .`
- install frontend dependencies in `frontend/` with `npm install`

## Validation

Run the checks that apply to your change:

- `pytest backend/tests -v`
- `cd frontend && npm run build`
- `mkdocs build --strict`

Update documentation in the same change whenever public behavior changes.

If you are unsure whether a proposed change fits the current scope or roadmap, ask the maintainer at `crazyandol@gmail.com` before investing heavily in implementation work.

## Security

Do not use public issues for cookie leaks, signed URL exposure, or other sensitive reports. Follow [SECURITY.md](SECURITY.md).
