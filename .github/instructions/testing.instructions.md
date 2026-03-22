---
name: "Backend Testing Structure"
description: "Use when creating or updating tests under backend/tests. Covers the repository's unit, integration, and e2e definitions plus conftest.py sharing rules."
applyTo: "backend/tests/**"
---

# Testing Structure & conftest.py

## Test folders

- `backend/tests/unit/`: single-function or single-class behavior, no network, no real file system beyond `tmp_path`.
- `backend/tests/integration/`: cross-module behavior with mocks/stubs; temporary file system allowed; no real network.
- `backend/tests/e2e/`: end-to-end workflow; mocked by default; real auth/download flows must be opt-in.

## conftest.py

- Put shared fixtures in `backend/tests/conftest.py`.
- If a fixture appears in 2+ files or repeats in 3+ tests, move it into `conftest.py`.
- Keep `conftest.py` limited to fixtures and helpers; keep test logic in test files.
- Keep auth-required end-to-end coverage opt-in through the documented `HUMBLE_RUN_AUTH_TESTS`, `HUMBLE_AUTH_COOKIE`, and `HUMBLE_RUN_DOWNLOAD_TESTS` flags.
