# Agent Capabilities & Configuration

## Overview

This document describes how GitHub Copilot and other AI agents can interact with this repository, including available skills, tools, constraints, and recommended workflows for implementation tasks.

**Last Updated**: 2026-02-11  
**Agent Version**: v2.0

---

## Project Guidelines

### Code Style

- Python modules use type hints and `Pydantic` v2 models; see `backend/src/hb_library_viewer/config.py` and `backend/src/hb_library_viewer/parsing.py`.
- CLI UX uses `Typer` + `Rich` + `tqdm` (`backend/src/hb_library_viewer/cli.py`).
- FastAPI backend lives under `backend/app/` with routers in `app/api/`, services in `app/services/`, and Pydantic models in `app/models/`.
- Viewer UI uses Vite + React + TypeScript + Tailwind under `frontend/` (e.g., `frontend/src/app/`).

### Architecture

- Core pipeline: config → browser capture → parsing → optional downloads (`backend/src/hb_library_viewer/{config,browser,parsing,download}.py`).
- Viewer portal includes a FastAPI backend (`backend/app/`) and a React frontend (`frontend/`).
- FastAPI routes should use typed request/response models (`response_model`, Pydantic v2) and never surface secrets.
- Library data defaults to `data/artifacts/library_products.json`; prefer `viewer.library_path` in `backend/config.yaml` or `HUMBLE_VIEWER__LIBRARY_PATH` for overrides (`docs/guides/viewer-portal.md`).

### Build and Test

- Install core deps: `pip install -r requirements.txt`
- Install browsers: `python -m playwright install`
- Editable install: `pip install -e .`
- Run CLI: `python -m hb_library_viewer`
- Tests: `pytest`, `pytest backend/tests/unit -v` (`pytest.ini`)
- Viewer dev: `python tools/start_dev.py` (or backend `python -m uvicorn app.main:app --reload --port 8000` + frontend `npm run dev`).
- Frontend build: `cd frontend && npm run build`
- Docs: `mkdocs build` / `mkdocs gh-deploy` (`mkdocs.yml`)

### Project Conventions

- Keep `python -m hb_library_viewer` working; do not break the CLI entry point (`backend/src/hb_library_viewer/__main__.py`).
- Config source order is CLI → env (`HUMBLE_` + `__`) → `backend/.env` → `backend/config.yaml` → defaults (`backend/src/hb_library_viewer/config.py`).
- Artifacts live under `artifacts.base_dir` (e.g., `library_products.json`, `api_responses/`) and downloads under `download.base_folder` (`backend/config.yaml`).
- Respect the 0.5s minimum rate limit for downloads (`backend/src/hb_library_viewer/download.py`).
- FastAPI routes should declare request models and `response_model` and avoid leaking secrets to clients.
- React UI should fetch via `/api/*` and keep sensitive values (cookies, signed URLs) out of logs and telemetry.
- Keep reusable business logic in `backend/src/hb_library_viewer/**`; use `backend/app/**` for FastAPI adapters, `frontend/src/**` for viewer UI/data flows, and `tools/**` for thin operator-facing wrappers around reusable workflows.
- Domain errors should inherit from `HumbleBundleError` (or an appropriate project-specific subclass) and remain safe for logs, CLI output, and HTTP responses.
- When behavior changes, update matching docs/tests in the same change. Typical mappings are: CLI/runtime changes → `docs/guides/cli-reference.md`; viewer/API changes → `docs/guides/viewer-portal.md`, `docs/api/**`, or other affected guides; config changes → `README.md`, `backend/config.yaml`, and related guides; `.github/**` changes → `CODEOWNERS`, customization validation, and any affected indexes/templates.

### Integration Points

- Playwright browser automation captures Humble Bundle API responses (`backend/src/hb_library_viewer/browser.py`).
- Viewer backend exposes `/api/library` and `/api/library/run` (`backend/app/api/library.py`).
- Frontend proxies `/api/*` to `http://localhost:8000` (`frontend/vite.config.ts`).
- CLI subcommands rebuild models/artifacts and build viewer schema (`backend/src/hb_library_viewer/cli.py`).
- Backend services in `backend/app/services/` wrap core package calls; keep I/O and auth handling server-side.

### Web App Guidelines

- FastAPI endpoints should use `APIRouter`, explicit `response_model`, and Pydantic v2 request schemas.
- Keep `_simpleauth_sess` and other secrets server-side; return safe error messages to the UI.
- Prefer background tasks or worker threads for long-running capture/download steps.
- React frontend should keep API calls in `frontend/src/data/`, UI in `frontend/src/components/`, and pages in `frontend/src/app/`.
- Use the Vite proxy for `/api/*` calls during local development; avoid hard-coded backend URLs in components.

### Security

- Auth uses `_simpleauth_sess`; never log or commit it; `backend/.env` is git-ignored (`README.md`, `docs/guides/authentication.md`).
- Artifacts can include signed download URLs; treat `data/artifacts/` as sensitive (`README.md`).
- Auth-required e2e tests are opt-in via env flags (`docs/development/testing.md`).
- Keep signed URLs, authenticated HTML/JSON, cookies, and local artifact payloads out of screenshots, docs, issue text, generated reports, and frontend-visible responses.

## Repository Layering & Change Coordination

- `backend/src/hb_library_viewer/**` is the reusable core: parsing, configuration, downloads, artifact workflows, and other testable domain logic.
- `backend/app/**` is the web layer: FastAPI routes, services, and response shaping that adapt the core package for the viewer portal.
- `frontend/src/**` is the local viewer UI: routes, components, and data hooks that consume backend contracts through `/api/*`.
- `tools/**` is for operator convenience and maintenance scripts. If logic may be reused by the CLI, backend services, or multiple scripts, move it into `backend/src/hb_library_viewer/**` first and keep the script wrapper thin.
- Use docs and tests to reinforce those boundaries. Cross-layer changes should usually update multiple surfaces together rather than burying business logic in the wrong layer.

## Documentation & Validation Impact Map

- CLI behavior, progress output, runtime status, or artifact-path reporting changes should update `docs/guides/cli-reference.md` and any relevant CLI tests.
- Viewer workflow, route, or API contract changes should update the affected backend tests, frontend tests, and viewer/API docs.
- Configuration, schema, or environment handling changes should update committed config examples, docs, and validation coverage together.
- Tooling/report-generation changes should keep outputs explicit, sanitized, and documented when they become part of a stable maintainer workflow.
- `.github/**` customization changes should stay synchronized with `CODEOWNERS`, `.github/skills/README.md`, `tools/scripts/validate_chat_customizations.py`, and related workflow/template expectations when applicable.

---

## Agent Identity & Intent

- **Purpose**: Power HB Library Viewer — a web-first Humble Bundle library viewer with capture, analysis, and optional downloads
- **Primary User**: Individual privacy-conscious users wanting local copies of their eBook/audiobook library
- **Scope**: Library capture, analysis, and optional downloads (NOT account management, NOT payment processing)
- **Constraints**:
  - Never expose authentication credentials in logs, docstrings, or examples
  - Never surface `_simpleauth_sess` or other secrets in frontend responses or logs
  - Never commit backend/.env containing secrets
  - Respect API rate limits (0.5s minimum delay between requests)
  - No breaking changes to CLI interface (python -m hb_library_viewer)
  - Maintain Python 3.10+ compatibility
  - All public code reviewed for credential leakage before committing

## Repository Structure (Docs & Tests)

- Documentation follows the Divio layout under `docs/` (`getting-started/`, `guides/`, `architecture/`, `api/`, `examples/`, `development/`, `help/`).
- Avoid task-tracking or phase-based documents in `docs/`; keep only current-state and planned-work content.
- Backend tests live under `backend/tests/` with `unit/`, `integration/`, and `e2e/` subfolders.
- Frontend tests live under `frontend/tests/` with `unit/`, `integration/`, and `e2e/` subfolders.

## Project Management Documentation

- Store active project management docs under `docs/development/work-efforts/{effort-name}/`.
- Each effort folder must include:
  - `current-vs-to-be.md` (current vs. target analysis)
  - `prd.md` (product requirements, specification-driven design)
  - `status.md` (single status doc updated over time)
- Do not create separate interim/final/summary report files for the same effort.

## Test Folder Definitions

- `backend/tests/unit/`: single-function or single-class behavior, no network, no file system beyond temporary paths.
- `backend/tests/integration/`: cross-module behavior with mocks/stubs; temporary file system allowed; no real network.
- `backend/tests/e2e/`: end-to-end workflow (CLI + browser), may involve real services; real auth/download tests are opt-in by explicit flags.
- `frontend/tests/unit/`: pure selectors/helpers, isolated hooks, and UI/component contracts with local mocks only.
- `frontend/tests/integration/`: route, provider, stateful-component, and app-shell behavior that composes multiple frontend modules in jsdom.
- `frontend/tests/e2e/`: browser-driven viewer workflows; prefer Playwright-style user flows and keep auth-sensitive paths opt-in.

## conftest.py Guidance

- Place shared fixtures used across test files in `backend/tests/conftest.py`.
- If a fixture appears in 2+ files or repeats in 3+ tests, refactor it into `backend/tests/conftest.py`.
- Keep `conftest.py` focused on shared setup; keep single-use fixtures near their tests.
- Keep `conftest.py` limited to fixtures and helpers; keep test logic in test files.

---

## Available Tools

### 1. Configuration Management Tool (Pydantic)

- **Module**: `backend/src/hb_library_viewer/config.py`
- **Purpose**: Load, validate, and manage settings from multiple sources
- **Sources** (priority order):
  1. CLI arguments (highest priority)
  2. Environment variables (HUMBLE\_\* prefix)
  3. `backend/.env` file (secrets only)
  4. `backend/config.yaml` (non-secrets, committed)
  5. Default values (lowest priority)
- **Validation**: Automatic type checking, range validation, cross-field constraints
- **Error Handling**: ConfigError raised with specific validation failures
- **Usage Pattern**:
  ```python
  from config import Settings
  config = Settings()  # Auto-loads all sources
  assert config.auth_cookie is not None  # Never None, ConfigError raised if missing
  ```

### 2. Browser Automation Tool (Playwright)

- **Module**: `backend/src/hb_library_viewer/browser.py`
- **Purpose**: Headless browser automation with JavaScript execution and API response interception
- **Capabilities**:
  - Authenticate with stored cookie
  - Navigate JavaScript-heavy pages
  - Intercept HTTP/HTTPS responses
  - Handle dynamic content loading
  - Multiple wait strategies (domcontentloaded, load, networkidle)
- **Limitations**:
  - Cannot bypass CAPTCHA or 2FA at scale
  - Cannot extract data before JavaScript renders (requires wait)
  - Response size grows with very large libraries (243+ products tested)
- **Configuration**: Via BrowserConfig in `backend/config.yaml` (headless, timeout, user_agent)
- **Usage Pattern**:
  ```python
  from browser import BrowserManager
  with BrowserManager(browser_config, auth_cookie) as bm:
      result = bm.capture_library_page()  # Returns BrowserCaptureResult Pydantic model
  ```

### 3. File Download Tool

- **Module**: `backend/src/hb_library_viewer/download.py`
- **Purpose**: Concurrent file downloads with retry logic and rate limiting
- **Configuration**: Via DownloadConfig (max_retries, retry_delay, rate_limit_delay)
- **Rate Limit**: 0.5s minimum between requests (hardcoded, respect server resources)
- **Retry Strategy**: Exponential backoff, configurable max attempts
- **Usage Pattern**:
  ```python
  from download import FileDownloader
  dl = FileDownloader(download_config)
  result = dl.download_product(task)  # Returns DownloadResult with status
  ```

### 4. JSON Parsing & Structuring Tool

- **Module**: `backend/src/hb_library_viewer/parsing.py`
- **Purpose**: Parse API responses into structured, validated data models
- **Models**: Download, Product, LibraryData (all Pydantic v2)
- **Pattern**: Raw API JSON → Pydantic model validation → Structured output
- **Usage Pattern**:
  ```python
  from parsing import build_library_json, LibraryData
  lib_data: LibraryData = build_library_json(api_batches)
  ```

### 5. CLI UX Stack

- Use `typer` for CLI argument parsing and help output
- Use `rich` for console logging and prompts
- Use `tqdm` for download progress bars
- Entry point uses `typer.run(main)` in `backend/src/hb_library_viewer/__main__.py`

---

## Skills (What Agents Should Do)

### Customization ownership and decision rule

- GitHub Copilot is the primary supported coding agent for this repository.
- `.github/**` is the only repository-owned customization surface.
- Use `.github/instructions/github-customizations.instructions.md` as the decision matrix for when guidance belongs in `AGENTS.md`, an instruction, a prompt, a skill, or human-oriented reference documentation.
- When a reusable customization gap is found, first extend an existing `.github` file if its scope already matches. If no existing file cleanly owns the concern, propose or create the appropriate new `.github` customization file.
- Treat all current directories under `.github/skills/` as explicit project skills. Repository skills are standardized on folder-based `.github/skills/<skill-name>/SKILL.md` packaging.

### Project-specific customization entry points

Use the repository-wide constraints in this file as the durable baseline. Then layer in focused customizations when the task matches them:

- `.github/instructions/cli-runtime.instructions.md` for long-running CLI UX, status output, and artifact reporting expectations
- `.github/instructions/architecture-boundaries.instructions.md` for core-vs-web-vs-tool placement and layering decisions
- `.github/instructions/secrets-and-artifacts.instructions.md` for privacy, local artifact safety, and sanitized reporting expectations
- `.github/instructions/subproduct-enrichment.instructions.md` for cache, metadata extraction, provenance, and analysis/report workflows
- `.github/instructions/github-customizations.instructions.md` for authoring or restructuring `.github/**` customization files
- `.github/skills/repo-change-alignment/SKILL.md` for cross-cutting repository changes that need docs/tests/validation/security coordination
- `.github/skills/viewer-portal-workflows/SKILL.md` for cross-cutting viewer portal work spanning FastAPI, React, docs, and tests
- `.github/skills/project-tools-and-reporting/SKILL.md` for maintenance scripts, artifact analyzers, and reporting workflows
- `.github/agents/repo-alignment-review.agent.md` and `.github/agents/github-customization-auditor.agent.md` for read-only subagent reviews of implementation impact or `.github` customization drift

These focused customizations complement this file. They do not override the repository-wide requirements around secrets, CLI compatibility, documentation updates, or validation.

### Skill 1: Configuration Parameters

**What**: Add new parameters to config, modify defaults, add validation  
**When**: Before writing code that needs configurable settings  
**Safe Zone**: YES — This is expected agent work  
**Pattern**:

```python
# 1. Add to appropriate nested Pydantic model
class BrowserConfig(BaseModel):
    headless: bool = True
    new_param: str = Field(default="value", description="What this controls")

# 2. Update config.yaml example in docstring
# 3. Update docs/configuration.md with new setting
# 4. Test: python -c "from config import Settings; Settings()"
# 5. Update the relevant work-effort `status.md` if this change is part of an active effort
```

### Skill 2: Error Handling & Custom Exceptions

**What**: Create custom exception classes, improve error messages  
**When**: After implementing features that can fail  
**Safe Zone**: YES — Exception patterns are defined  
**Pattern**:

```python
# In utils.py
class HumbleBundleError(Exception):
    """Base exception. Never exposes credentials."""
    pass

class APIError(HumbleBundleError):
    """Raised when API call fails. Message must not include response body."""
    pass

# Usage
raise APIError(f"API returned {status_code}, see logs for details")
# NOT: raise APIError(f"API response: {response.json()}")  ← credential risk
```

### Skill 3: Type Hints & Data Models

**What**: Add type hints, create Pydantic models for data structures  
**When**: Working with structured data or function returns  
**Safe Zone**: YES — Encouraged throughout  
**Pattern**:

```python
from pydantic import BaseModel, Field
from typing import Annotated

# Define constrained types
PositiveInt = Annotated[int, Field(gt=0, description="Must be positive")]

# Use in models
class DownloadTask(BaseModel):
    gamekey: str = Field(..., description="Unique product key")
    max_retries: PositiveInt = Field(default=3)
```

### Skill 4: Docstrings & Examples

**What**: Write NumPy-style docstrings, add executable examples  
**When**: After writing public functions/classes  
**Safe Zone**: YES — Examples must use `# doctest: +SKIP` if they need credentials  
**Pattern**:

```python
def fetch_data(url: str, timeout: int) -> dict:
    """
    Fetch JSON data from URL with timeout.

    Parameters
    ----------
    url : str
        Full URL to fetch
    timeout : int
        Timeout in seconds (must be > 0)

    Returns
    -------
    dict
        Parsed JSON response body

    Raises
    ------
    requests.Timeout
        If request exceeds timeout

    Examples
    --------
    >>> fetch_data("https://api.example.com/public", 30)  # doctest: +SKIP
    {'status': 'ok'}
    """
```

### Skill 5: Unit Tests (pytest)

**What**: Write tests for new functions, test edge cases, validate error paths  
**When**: Alongside writing testable code  
**Safe Zone**: YES — Use pytest-mock for external dependencies  
**Pattern**:

```python
# tests/test_module.py - unit test
import pytest
from unittest.mock import Mock
from module import function_under_test

class TestUnit:
    """Unit tests for isolated functions."""

    def test_function_success(self):
        result = function_under_test(valid_input)
        assert result == expected

    @pytest.mark.parametrize("input,expected", [
        ("case1", "result1"),
        ("case2", "result2"),
    ])
    def test_function_variants(self, input, expected):
        assert function_under_test(input) == expected

# tests/test_module.py - integration test
class TestIntegration:
    """Tests that combine multiple components (still mocked)."""

    def test_config_to_browser_to_parser(self, tmp_path):
        config = Settings()
        # Verify components work together

```

### Skill 6: Auth-required E2E Tests

**What**: Run real browser/API/download flows only when explicitly enabled
**When**: Manual testing with valid credentials
**Safe Zone**: YES — must remain opt-in and documented
**Pattern**:

```bash
HUMBLE_RUN_AUTH_TESTS=1
HUMBLE_AUTH_COOKIE=...
HUMBLE_RUN_DOWNLOAD_TESTS=1  # only when testing real downloads
```

### Skill 7: Documentation Updates

**What**: Update docs/ files, mkdocs.yml, README, work-effort docs (as applicable)  
**When**: IMMEDIATELY AFTER any code change that affects behavior  
**Safe Zone**: YES — But MUST be explicit and linked to code changes  
**Pattern**:

```text
After implementing feature X:

1. Update module docstring if signature changed
2. Update docs/guides/relevant_guide.md with example
3. Update docs/configuration.md if new config options
4. Update `docs/development/work-efforts/{effort-name}/status.md` when tracking active work
5. Run mkdocs serve locally to verify
6. Commit with message: "feat(X): ... Also updates docs/guides/X.md"
```

---

## Constraints & Safety (Hard Boundaries)

### 🚫 NEVER DO THIS

1. **Print or log credentials**

```python
# ❌ FORBIDDEN
print(f"Cookie: {config.auth_cookie}")
logger.debug(f"Response: {api_response.text}")

# ✅ ALLOWED
logger.debug(f"API returned {response.status_code}")
```

1. **Commit .env file** — Only `backend/.env.example` committed; `backend/.env` in `.gitignore`; pre-commit hook can verify.

1. **Break CLI interface** — Always: `python -m hb_library_viewer`. Never change command name, never remove options.

1. **Ignore API rate limits** — Minimum 0.5s between requests (hardcoded in download.py); configurable only upward (longer delays); never reduce below 0.5s.

1. **Delete downloaded files** — Downloads are append-only; never delete or overwrite existing files; track what's been downloaded in metadata.

1. **Change Python version below 3.10** — Use modern syntax (match/case 3.10+, type unions 3.10+); type hints on all public functions; no six or future compatibility libraries.

---

## Soft Guidelines (Encouraged Best Practices)

1. **Code Organization**: Keep functions under 100 lines; extract subroutines for complex logic
2. **Error Messages**: Be specific ("Path '/tmp/file' not writable" not "IO Error")
3. **Logging**: INFO for milestones, DEBUG for detail, WARNING for recovery, ERROR for failures
4. **Docstrings**: Always for public functions; optional for private (\_func)
5. **Tests**: Write tests before features (TDD-light); aim for 85%+ coverage
6. **Performance**: Stream large files; use generators for large lists; avoid loading entire JSON in memory if possible
7. **Security**: Use pathlib.Path, not string concatenation; validate all inputs

---

## Recommended Agent Workflows

### Workflow 1: Bug Fix with Verification

```yaml
Steps:
  1. Read error from logs; identify root cause
  2. Write failing test case first (test_bug_fix.py)
  3. Implement minimal fix (3-5 lines if possible)
  4. Verify: test passes, no new failures
  5. Update the relevant work-effort `status.md` (blockers/fixes)
  6. Verify no credentials in diff: git diff | grep -i cookie
  7. Commit with message: "fix(component): description. Updates work-efforts status"
```

### Workflow 2: Feature Request Implementation

```yaml
Steps:
  1. Design config changes (backward compatible?)
  2. Update Pydantic models + config.yaml
  3. Implement feature with error handling
  4. Write tests (unit + integration)
  5. Add docstrings with examples
  6. Create/update guide in docs/guides/
  7. Update docs/configuration.md if config changed
  8. Update the relevant work-effort `status.md` (deliverables)
  9. Test end-to-end: python -m hb_library_viewer
  10. Commit with full documentation updates
```

### Workflow 3: Refactoring Safe Zone

```yaml
Constraints:
  - No changes to config structure (breaking)
  - No changes to CLI interface
  - No changes to credential handling
  - No removal of public APIs

Safe:
  - Extract functions (increase modularity)
  - Rename internal variables
  - Consolidate duplicate code
  - Improve error handling
  - Add type hints
  - Optimize performance
```

### Workflow 4: Documentation-Only Changes

```yaml
Steps:
  1. Update docs/guides/X.md or docs/configuration.md
  2. Test with: mkdocs serve (verify formatting)
  3. Check for broken links
  4. No code changes required
  5. Mark related todo as "in-progress" if applicable
```

### Workflow 5: Subagent Coordination

```yaml
When to use:
  - broad read-only exploration across many files
  - targeted research that can be scoped tightly
  - inventorying routes, artifacts, or test surfaces before implementation

Main agent responsibilities:
  - own the plan, task decomposition, and stop conditions
  - write the subagent brief with exact scope and expected output
  - reconcile subagent findings against repository rules
  - make edits, run validation, and produce the final response

Subagent responsibilities:
  - perform scoped discovery, research, or inventory
  - return concise findings, affected files, and recommended next actions
  - avoid broadening scope or making unsupported assumptions

Recommended pattern:
  1. Main agent defines the question and files/surfaces to inspect
  2. Subagent returns a structured summary, not final repository decisions
  3. Main agent verifies the results, implements changes, and runs tests/docs validation
```

---

## Tools & Code Patterns

### Configuration Pattern (Pydantic v2)

```python
from pydantic import BaseModel, Field, field_validator
from typing import Annotated

# Reusable constrained type
PositiveInt = Annotated[int, Field(gt=0)]

class AppConfig(BaseModel):
    """Root config combining subsystems."""
    auth_cookie: str = Field(..., description="Humble Bundle session cookie")
    timeout_ms: PositiveInt = Field(default=60000)

    @field_validator('auth_cookie')
    @classmethod
    def validate_cookie_format(cls, v):
        if not isinstance(v, str) or len(v) < 10:
      raise ValueError('Cookie format check failed')
        return v
```

### Exception Pattern

```python
# utils.py
class HumbleBundleError(Exception):
    """Base exception—safe for logging."""
    pass

class ConfigError(HumbleBundleError):
    """Configuration validation failed."""
    pass

# Usage
try:
    config = Settings()
except ConfigError as e:
    print(f"Config error: {e}")  # Safe—no credentials
    exit(1)
```

### Test Pattern (pytest)

```python
# tests/test_module.py
import pytest
from unittest.mock import Mock, patch
from module import function_under_test

class TestUnit:
    """Unit tests—isolated functions."""

    def test_success_path(self):
        result = function_under_test("input")
        assert result == "expected"

    def test_error_path(self):
        with pytest.raises(ValueError):
            function_under_test("bad_input")

class TestIntegration:
    """Integration tests—multiple components (mocked)."""

    @patch('module.external_service')
    def test_with_mock(self, mock_service):
        mock_service.return_value = "mocked"
        result = function_under_test("input")
        assert mock_service.called
```

### Documentation Pattern

```python
def fetch_library(config: Settings) -> LibraryData:
    """
    Fetch Humble Bundle library using headless browser.

    Parameters
    ----------
    config : Settings
        Application configuration (includes auth_cookie, browser settings)

    Returns
    -------
    LibraryData
        Structured product data with download URLs

    Raises
    ------
    APIError
        If library fetch fails
    ConfigError
      If config validation fails

    Examples
    --------
    >>> fetch_library(config)  # doctest: +SKIP
    LibraryData(products=[...], total_products=243, ...)

    Notes
    -----
    Capture waits up to 60s for JavaScript-triggered API calls.
    """
```

---

## Documentation Update Protocol (CRITICAL)

### Every Task Must Include Documentation Updates

When implementing code changes, agents MUST:

1. **Identify Documentation Files Affected**
   - Module docstrings (if signature changed)
   - docs/guides/ (if user-visible behavior changed)
   - docs/configuration.md (if config options changed)
   - docs/development/work-efforts/{effort-name}/status.md (task progress)

2. **Update in Same Commit**
   - Commit message: "feat(X): implements Y. Also updates docs/guides/Z.md, work-efforts status"
   - Never separate code changes from documentation updates
   - Verify with: `git log --oneline` shows both in same commit

3. **Validate Documentation**
   - mkdocs serve locally and verify rendering
   - Check for broken links: `grep -r "](docs/" docs/ | grep -v ".md)"`
   - Verify code examples in docstrings still valid

4. **Update Work-Effort Status**
   - Mark tasks as "in-progress" when starting
   - Log blockers or discoveries in "Known Issues" section
   - Update "Deliverables" checkboxes ✅
   - Mark complete when finished (do not leave as "in-progress")

---

## Version History

- **v2.0** (2026-01-30): Pydantic v2, modular architecture, pytest, mkdocs
- **v1.0** (2025-12-XX): Initial monolithic script, inline config

---

## References

- [Pydantic Settings Docs](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [Playwright Python Docs](https://playwright.dev/python/)
- [pytest Documentation](https://docs.pytest.org/)
- [mkdocs Documentation](https://www.mkdocs.org/)
- [MkDocs Material Theme](https://squidfunk.github.io/mkdocs-material/)

---

**Questions about agent capabilities?** See [docs/AGENTS.md comparison in root docs] or ask.
