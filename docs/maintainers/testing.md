# Testing

## Quick checks

- Run unit tests: `pytest backend/tests/unit/ -v`
- Run full suite: `pytest backend/tests/ -v`
- Run coverage: `pytest backend/tests/ --cov=backend/src/hb_library_viewer --cov=backend/app --cov-report=html`
- Run frontend tests: `cd frontend && npm test`
- Run frontend tests in watch mode: `cd frontend && npm run test:watch`
- Run frontend unit tests only: `cd frontend && npm run test:unit`
- Run frontend integration tests only: `cd frontend && npm run test:integration`
- Run frontend coverage: `cd frontend && npm run test:coverage`
- Run frontend build: `cd frontend && npm run build`
- Run `doctest` for a module: `python -m doctest backend/src/hb_library_viewer/config.py -v`

## Linting

- Run pylint on application code: `pylint backend/src/hb_library_viewer backend/app tools`
- Tests are excluded by default via `.pylintrc` to avoid pytest-specific noise.
- Run Pylance-style type checks: `python -m pyright` (uses `pyrightconfig.json` and the active venv).

## Notes

- Some tests use fixtures in `backend/tests/`.
- Unit tests mirror the backend source areas beneath `backend/tests/unit/`, with FastAPI/backend tests under `backend/tests/unit/app/` and core package tests under `backend/tests/unit/hb_library_viewer/`.
- Keep the mirrored layout canonical; do not reintroduce duplicate flat `backend/tests/unit/test_*.py` files when a mirrored test already exists.
- Browser capture unit tests live under `backend/tests/unit/hb_library_viewer/browser/`.
- FastAPI route unit tests rely on the development dependencies in `requirements-dev.txt` (including `httpx` for the local test client).
- Select a Python environment in your editor before running tests.
- Backend coverage is enforced with an 85% fail-under threshold in `pytest.ini`.
- Frontend unit and component automation now runs through Vitest with a DOM-capable test environment.
- Frontend coverage reporting is available through `npm run test:coverage` using Vitest's V8 coverage provider.
- Frontend tests now live under `frontend/tests/unit/`, `frontend/tests/integration/`, and `frontend/tests/e2e/`.
- Frontend unit coverage focuses on selectors, shared download helpers, download planning, formatting, redemption-link parsing, shared filter state, class-merging utilities, and isolated reusable UI primitives/components.
- Frontend integration coverage focuses on app-shell wiring, route redirects, route rendering, provider-backed components, and stateful dialog/filter flows.
- Frontend jsdom tests use the shared setup file at `frontend/tests/setup.ts` and the repository's Vitest project configuration in `frontend/vite.config.ts`.
- Browser smoke testing is still useful for cross-route UX validation, but common shared frontend behavior should prefer fast Vitest coverage first.
- Authentication-required e2e tests stay skipped unless you set:
  - `HUMBLE_RUN_AUTH_TESTS=1`
  - `HUMBLE_AUTH_COOKIE` with a valid `_simpleauth_sess`
- Real download e2e tests also require `HUMBLE_RUN_DOWNLOAD_TESTS=1`.

## Test folder scope

- `backend/tests/unit/`: single-function or single-class behavior; no real network; no file system beyond temporary paths.
- `backend/tests/integration/`: two or more modules wired together with mocks; temporary file system allowed; no real network.
- `backend/tests/e2e/`: end-to-end flow tests (CLI + browser); may involve real services; real authentication/download tests are opt-in by explicit flags.
- `frontend/tests/unit/`: pure helpers, selectors, isolated hooks, and reusable UI contracts with local mocks only.
- `frontend/tests/integration/`: app shell, routes, provider-backed components, and multi-module jsdom flows.
- `frontend/tests/e2e/`: browser-driven viewer journeys; reserve for flows that genuinely need a browser harness.
- Keep tests under `backend/tests/` rather than moving them to a repo-root `tests/` folder so the repository's backend-specific test conventions, fixtures, and docs stay aligned.

## Shared fixtures guidance

- Put shared fixtures used across test files in `backend/tests/conftest.py`.
- If a fixture appears in 2+ files or you repeat it in 3+ tests, move it to `conftest.py`.
- Keep single-use fixtures close to the tests that consume them.
