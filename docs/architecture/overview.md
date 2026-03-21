# Architecture Overview

The project uses small modules that each handle one task. This keeps changes isolated and makes testing easier.

## Main flow

1. Load settings with `Settings`.
2. Capture API responses with `BrowserManager` (module: `browser.manager`).
3. Parse responses with `build_library_json`.
4. Download files with `FileDownloader`.

## Key ideas

- `Playwright` handles pages that load data with JavaScript.
- `Pydantic` models keep settings and parsed data consistent.
- Rate limiting stays at 0.5 seconds or higher.
