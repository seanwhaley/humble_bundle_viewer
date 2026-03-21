# Changelog

This project keeps a lightweight changelog for user-visible milestones and release-level changes.

## Unreleased

### Repository and docs

- refreshed public-facing documentation to match the current local-first viewer and sync workflows
- removed stale completed planning material from published docs
- added repository metadata files for public GitHub publication (`LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`)

## 1.0.0 - 2026-03-07

### Added

- Playwright-based library capture for JavaScript-rendered Humble Bundle responses
- typed configuration using `Pydantic` v2 and environment/config-file layering
- normalized `library_products.json` generation with products, subproducts, keys, and downloads
- FastAPI + React viewer for purchases, downloads, keys, eBooks, audiobooks, and setup flows
- advanced managed local sync for eBooks and audiobooks from the viewer and CLI

### Changed

- standardized repository layout around `backend/`, `frontend/`, `docs/`, and `tools/`
- clarified the project as a local-first library viewer rather than a generic downloader automation project
