# Status — Testing Capabilities Improvements

## Status summary

- **State**: Completed
- **Started**: 2026-03-21
- **Last updated**: 2026-03-21
- **Owner**: GitHub Copilot
- **Implementation state**: Backend branch-gap tests, frontend jsdom-capable test harness, frontend test taxonomy/customizations, and canonical testing docs are all implemented and validated

## Scope

Track a focused testing-improvement pass that strengthens backend branch coverage in targeted files and adds practical frontend unit/component testing capability.

## Deliverables

- [x] Create `current-vs-to-be.md`
- [x] Create `prd.md`
- [x] Create `status.md`
- [x] Add targeted backend tests for branch/file gaps
- [x] Add frontend jsdom/component test capability
- [x] Add new frontend tests for shared logic and reusable UI
- [x] Update canonical testing docs
- [x] Validate backend and frontend suites

## Planned implementation slices

1. Backend branch-gap tests
   - cover current-choice/current-bundles API status and error branches
   - cover current-choice/current-bundles runtime service fallback behavior
   - cover remaining viewer-config/download API helper branches where practical
2. Frontend test harness
   - enable jsdom-capable Vitest execution
   - add shared test setup for DOM assertions
3. Frontend tests
   - add utility/data-helper coverage
   - add shared state/component coverage for reusable viewer UI
4. Documentation and validation
   - update `docs/development/testing.md`
   - run backend and frontend validation suites

## Notes

- Backend coverage already clears the repository fail-under threshold, so this effort is focused on quality and gap reduction rather than emergency repair.
- Frontend coverage is the larger capability gap because current automated coverage is limited to two files and node-only execution.

## Recent progress

### Implemented

- backend
  - expanded API coverage in:
    - `backend/tests/unit/app/api/test_current_choice_api.py`
    - `backend/tests/unit/app/api/test_current_bundles_api.py`
    - `backend/tests/unit/app/api/test_viewer_config_api.py`
    - `backend/tests/unit/app/api/test_downloads_api.py`
  - added runtime-service coverage in:
    - `backend/tests/unit/app/services/test_current_choice_service.py`
    - `backend/tests/unit/app/services/test_current_bundles_service.py`
  - raised targeted coverage for:
    - `backend/app/services/current_choice.py` to 100%
    - `backend/app/services/current_bundles.py` to 100%
    - `backend/app/api/current_choice.py` to 98%
    - `backend/app/api/current_bundles.py` to 96%
    - `backend/app/api/viewer_config.py` to 97%
    - `backend/app/api/downloads.py` to 93%
  - follow-up maintenance API pass:
    - expanded `backend/tests/unit/app/api/test_maintenance_api.py` with additional override, abort, and exception-mapping coverage
    - raised focused coverage for `backend/app/api/maintenance.py` to 100%
- frontend
  - updated `frontend/package.json` and `frontend/vite.config.ts` so `npm test` now runs Vitest with the repository jsdom setup instead of a node-only environment
  - added frontend watch/coverage scripts and V8 coverage reporting configuration:
    - `npm run test:watch`
    - `npm run test:coverage`
  - added shared setup file `frontend/src/test/setup.ts`
  - added new frontend tests for:
    - `frontend/src/utils/format.test.ts`
    - `frontend/src/data/redemption.test.ts`
    - `frontend/src/state/filters.test.tsx`
    - `frontend/src/components/ExpiredLinkDialog.test.tsx`
    - `frontend/src/components/DownloadRouteEmptyState.test.tsx`
- docs
  - updated `docs/development/testing.md` to describe the new frontend automation support and commands

### Validation completed

- frontend tests
  - `cd frontend && npm test`
  - result: 16 files passed, 55 tests passed
- frontend production build
  - `cd frontend && npm run build`
  - result: passed
- backend full suite
  - `python -m pytest`
  - result: 734 passed, 3 skipped
  - coverage: 88.85% (fail-under 85% satisfied)

### Follow-up slice — maintenance API

- focused backend validation
  - `python -m pytest backend/tests/unit/app/api/test_maintenance_api.py -o addopts="--verbose --strict-markers --tb=short --cov=app.api.maintenance --cov-report=term-missing --cov-branch --cov-fail-under=0"`
  - result: 24 passed
  - focused coverage: `backend/app/api/maintenance.py` at 100%

### Follow-up slice — core bundle and choice helpers plus frontend coverage scripts

- backend
  - expanded `backend/tests/unit/hb_library_viewer/test_current_choice.py` with helper/path coverage for:
    - choice-section discovery and HTML slicing
    - non-title filtering rules
    - invalid embedded payload handling
    - missing-title parse failure
    - rendered-HTML retry path in `capture_and_report_current_choice(...)`
  - expanded `backend/tests/unit/hb_library_viewer/test_current_bundles.py` with helper/workflow coverage for:
    - bundle-link title and type fallback helpers
    - sparse filter-label and item-entry extraction
    - small formatter/helper branches
    - rendered fallback behavior in `fetch_current_bundle_catalog(...)`
    - orchestration in `capture_and_report_current_bundles(...)`
  - focused validation result:
    - `backend/tests/unit/hb_library_viewer/test_current_choice.py`
    - `backend/tests/unit/hb_library_viewer/test_current_bundles.py`
    - result: 33 passed
    - focused coverage: `backend/src/hb_library_viewer/current_choice.py` at 94%
    - focused coverage: `backend/src/hb_library_viewer/current_bundles.py` at 89%
- frontend
  - added coverage-friendly scripts and tests for:
    - `frontend/src/data/downloadPlanning.test.ts`
    - `frontend/src/components/FilterBar.test.tsx`
    - `frontend/src/components/StatTile.test.tsx`
    - `frontend/src/components/SubproductInfoLink.test.tsx`
    - `frontend/src/components/KeyValueCell.test.tsx`
    - `frontend/src/components/ProductCell.test.tsx`
    - `frontend/src/components/RedemptionLinksButton.test.tsx`
  - full frontend validation:
    - `cd frontend && npm test`
    - result: 14 files passed, 51 tests passed
  - full frontend coverage validation:
    - `cd frontend && npm run test:coverage`
    - result: 14 files passed, 51 tests passed
    - coverage summary: `All files` — statements 9.63%, branches 76.07%, functions 44.91%, lines 9.63%

### Follow-up slice — small helper/model gaps plus lightweight frontend utilities

- backend
  - added `backend/tests/unit/hb_library_viewer/test_api_batches.py` for:
    - dict-like `get(...)` and `__getitem__(...)` compatibility behavior
    - safe coercion of non-mapping and malformed batch inputs in `coerce_api_batch_record(...)`
  - expanded `backend/tests/unit/hb_library_viewer/test_download_labels.py` with helper/generic-family coverage for:
    - `_fallback_label(...)` empty, extension, uppercase-token, and phrase fallbacks
    - `_dedupe_parts(...)` empty-value skipping and case-insensitive de-duplication
    - generic-platform behavior in `derive_download_labels(...)`
  - expanded `backend/tests/unit/app/models/test_download_models.py` with validation coverage for:
    - negative `size_bytes` rejection in `ManagedDownloadPlanDownload`
    - non-empty field requirements in `ManagedDownloadPlanItemRequest`
    - nested download parsing and `size_policy` validation in `ManagedDownloadPlanRequest`
  - focused validation result:
    - `backend/tests/unit/hb_library_viewer/test_api_batches.py`
    - `backend/tests/unit/hb_library_viewer/test_download_labels.py`
    - `backend/tests/unit/app/models/test_download_models.py`
    - result: 27 passed
    - focused coverage: `hb_library_viewer.api_batches` at 96%
    - focused coverage: `hb_library_viewer.download_labels` at 91%
    - focused coverage: `app.models.downloads` at 100%
- frontend
  - added lightweight utility/component tests for:
    - `frontend/src/lib/utils.test.ts`
    - `frontend/src/components/KeyInventorySummaryStrip.test.tsx`
  - targeted validation:
    - `cd frontend && npm test -- src/lib/utils.test.ts src/components/KeyInventorySummaryStrip.test.tsx`
    - result: 2 files passed, 4 tests passed
  - refreshed full frontend validation:
    - `cd frontend && npm test`
    - result: 16 files passed, 55 tests passed
  - refreshed full frontend coverage validation:
    - `cd frontend && npm run test:coverage`
    - result: 16 files passed, 55 tests passed
    - coverage summary: `All files` — statements 9.77%, branches 76.34%, functions 45.50%, lines 9.77%

### Follow-up slice — frontend UI primitives and coverage confirmation

- frontend
  - confirmed the current full frontend coverage baseline from `frontend/coverage/coverage-final.json` after the prior slice:
    - 55 tracked files
    - 36 files at 0% statement coverage before this follow-up
    - overall statements at 9.78%
  - added lightweight UI primitive/overlay tests for:
    - `frontend/src/components/ui/button.test.tsx`
    - `frontend/src/components/ui/input.test.tsx`
    - `frontend/src/components/ui/tooltip.test.tsx`
    - `frontend/src/components/ui/sheet.test.tsx`
  - targeted validation:
    - `cd frontend && npm test -- src/components/ui/button.test.tsx src/components/ui/input.test.tsx src/components/ui/tooltip.test.tsx src/components/ui/sheet.test.tsx`
    - result: 4 files passed, 10 tests passed
  - refreshed full frontend coverage validation:
    - `cd frontend && npm run test:coverage`
    - result: 20 files passed, 65 tests passed
    - coverage summary: `All files` — statements 10.01%, branches 76.85%, functions 46.70%, lines 10.01%
    - `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/tooltip.tsx`, and `src/components/ui/sheet.tsx` now report 100% coverage
  - updated artifact snapshot after the new coverage run:
    - 55 tracked files
    - 35 files at 0% statement coverage

### Assessment

- The frontend coverage report is confirmed and working, but reaching 85% statement coverage plus 100% file coverage is still a large effort from the current baseline because many app routes and top-level layout files remain completely untested.

### Follow-up slice — frontend test taxonomy and repository customization

- repository customization
  - added `.github/instructions/frontend-testing.instructions.md` to codify frontend unit/integration/e2e placement and shared-helper conventions
  - added `.github/skills/frontend-testing/SKILL.md` for reusable frontend test-creation and maintenance workflow guidance
  - updated `.github/skills/README.md`, `.github/skills/react-frontend/SKILL.md`, and `.github/AGENTS.md` so the new frontend testing structure is discoverable from repository-owned customization entry points
- frontend structure
  - restructured frontend tests away from colocated `frontend/src/**/*.test.{ts,tsx}` files into mirrored folders under `frontend/tests/unit/` and `frontend/tests/integration/`
  - created `frontend/tests/e2e/README.md` to reserve the browser-driven e2e scope explicitly
  - moved shared jsdom setup from `frontend/src/test/setup.ts` to `frontend/tests/setup.ts`
  - updated `frontend/vite.config.ts` to use explicit Vitest `unit` and `integration` projects
  - updated `frontend/package.json` scripts to support the new test taxonomy with `test:unit` and `test:integration`
  - deleted the old colocated `frontend/src/**/*.test.{ts,tsx}` files so repository-owned frontend tests now follow the new structure consistently
- validation completed
  - `cd frontend && npm test`
  - result: 29 files passed, 92 tests passed
  - note: React Router future-flag warnings still appear in `frontend/tests/integration/app/routes/CurrentBundles.test.tsx`, but the suite remains green
  - `cd frontend && npm run test:coverage`
  - result: passed
  - coverage summary: `All files` — statements 20.15%, branches 79.72%, functions 56.88%, lines 20.15%
