# Browser API

This package contains the browser capture logic split into focused modules.

## Modules

- `browser/manager.py`: `BrowserManager` orchestration and capture workflow.
- `browser/models.py`: `BrowserCaptureResult` data model.
- `browser/capture.py`: capture utilities and `ResponseRecorder`.
- `browser/persistence.py`: `ArtifactStore` persistence helpers.

## Browser manager

Class: `BrowserManager` (module: `browser.manager`)

Key methods:

- `capture_library_page()` returns a `BrowserCaptureResult`.
- Context manager methods handle startup and cleanup.

## Capture result

Class: `BrowserCaptureResult` (module: `browser.models`)

Key fields:

- `captured_responses`
- `api_batches`
- `gamekeys`
- `api_responses`
