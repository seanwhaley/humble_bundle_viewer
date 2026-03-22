# HB Library Viewer

Local-first tools for capturing, normalizing, and exploring a Humble Bundle library.

![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Workflow: local--first](https://img.shields.io/badge/workflow-local--first-6f42c1)

`HB Library Viewer` combines a Python CLI, a FastAPI backend, and a React viewer so you can:

- capture your library with Playwright
- normalize the response into `library_products.json`
- inspect purchases, downloads, software, videos, keys, eBooks, and audiobooks in a local web UI
- run optional downloads or managed local sync without sending your data to a hosted service

> This project is not affiliated with or endorsed by Humble Bundle.

Whether you're a long-time bundle collector trying to inventory years of purchases, a reader cleaning up an eBook library, an audiobook listener syncing files into a chosen local folder, or a power user auditing keys and downloads before links expire, `HB Library Viewer` gives you a local-first workflow from capture to browsing to sync.

**Project owner and maintainer:** Sean Whaley (`crazyandol@gmail.com`)

## Who this is for

- **Collectors** who want a durable local snapshot of what they own
- **Readers and listeners** who want cleaner eBook and audiobook download workflows
- **Power users** who want keys, files, and bundle contents searchable in one place
- **Privacy-conscious users** who want local tooling instead of a hosted account dashboard

## Common user journeys

- **Refresh and normalize your library** with the CLI or viewer setup flow, then keep a structured `library_products.json` locally.
- **Browse what you own** in the viewer across purchases, software, videos, Steam keys, non-Steam keys, eBooks, audiobooks, and expiring items.
- **Download or sync software and media content** with browser-managed downloads or advanced managed local sync for software, videos, eBooks, and audiobooks.
- **Audit and troubleshoot your data** by rebuilding artifacts, exporting schema files, caching subproduct pages, and extracting structured metadata during maintenance work.

## Why use this beyond the Humble Bundle site?

- it gives you a **normalized local artifact** instead of requiring repeated manual browsing
- it makes purchases, keys, downloads, software, videos, eBooks, and audiobooks **searchable in one interface**
- it supports **managed local sync** for software, reading, and listening collections
- it helps you **audit expiring links and redemption data** before they become a problem

## What the project actually does

The current build supports:

- browser-based capture of Humble Bundle library data using a valid `_simpleauth_sess`
- normalized artifact generation under `data/artifacts/`
- a local viewer app for exploring captured library data
- browser-managed downloads from viewer routes such as `Software`, `Videos`, `Ebooks`, and `Audiobooks`
- advanced managed local sync for software, videos, eBooks, and audiobooks from either the CLI or viewer
- typed configuration and validation through `Pydantic` v2

## What it does not do

To keep scope honest and boring-in-a-good-way:

- it does **not** manage purchases, payments, or account settings
- it does **not** run as a hosted SaaS service
- it does **not** store browser-sync downloads on the backend
- it does **not** include the old queue-based or scheduled download automation flow

## Highlights

- **Playwright capture** for JavaScript-rendered Humble Bundle library pages
- **Normalized output** with products, subproducts, downloads, and keys in one artifact
- **Viewer app** with dashboards, filters, and setup flows for local library inspection
- **Advanced local sync** for eBooks and audiobooks with skip-existing and manifest support
- **Type-safe configuration** from CLI options, environment variables, `backend/.env`, and `backend/config.yaml`
- **Cross-platform** development support for Windows, macOS, and Linux with Python 3.10+

## Quick start

### Requirements

- Python 3.10+
- Chromium installed through Playwright
- a valid Humble Bundle session cookie stored locally as `_simpleauth_sess`

Playwright is part of the product for **capture and refresh** workflows because Humble Bundle library data is loaded dynamically. Once you already have `library_products.json`, normal viewer browsing, filtering, downloads, and managed local sync do not require you to interact with Playwright directly.

### Install

```bash
pip install -r requirements.txt
python -m playwright install
pip install -e .
```

### Configure

1. Copy `backend/.env.example` to `backend/.env`
2. Set `HUMBLE_AUTH_COOKIE` to your `_simpleauth_sess` value
3. Optionally adjust non-secret settings in `backend/config.yaml`

Nested environment overrides use the `HUMBLE_` prefix and `__` separator, for example:

```text
HUMBLE_DOWNLOAD__BASE_FOLDER=D:/Humble_Library
```

### Capture your library

```bash
python -m hb_library_viewer
```

Use `python -m hb_library_viewer --help` for the full command surface.

To run folder-aware managed sync from the CLI:

```bash
python -m hb_library_viewer sync-downloads --target-folder D:/HB-Sync
```

### Launch the viewer

```bash
python tools/start_dev.py
```

This is the preferred local dev command on every platform, including Windows and VS Code. The helper now stops stale listeners on ports `8000` and `5173`, starts both services, waits until each one is reachable, and shuts the other service down if either process exits early.

On Windows you can still use `tools\start_dev.ps1` if you specifically want PowerShell background jobs plus log files under `tools/logs/`, but `python tools/start_dev.py` is the primary supported workflow.

## Key outputs

- `data/artifacts/library_products.json` — normalized library artifact
- `data/artifacts/api_responses/` — saved API batches
- `data/artifacts/captured_responses/` — optional raw captures when enabled
- `data/artifacts/gamekeys.json` — optional extracted keys artifact
- `data/artifacts/subproduct_pages/` — optional cached external subproduct pages plus extracted metadata
- `Humble_Library_Downloads/` or your configured target folder — optional downloads

## Viewer capabilities

The local viewer includes:

- **Overview** and **Purchases** dashboards for browsing the captured library
- **Downloads**, **Expiring**, **Steam Keys**, and **Non-Steam Keys** views for operational review alongside the dedicated media/software pages
- **Software**, **Videos**, **E-books**, and **Audiobooks** routes with browser downloads and advanced local sync
- **Setup** and **Command Center** routes for capture and maintenance workflows, including schema export, artifact rebuilds, subproduct page caching, and metadata extraction

## Choose your workflow

- **CLI-first**: capture, rebuild artifacts, run maintenance commands, and optionally sync downloads from the terminal
- **Viewer-first**: load an existing library, browse it visually, trigger browser downloads, and use advanced local sync for software, videos, eBooks, and audiobooks
- **Hybrid**: capture with the CLI, then use the viewer as the day-to-day browsing and download surface

Advanced local sync in the viewer:

- uses the browser folder picker in supported Chromium-based browsers
- writes files only to the folder you choose on the current device
- skips matching existing files
- preserves mismatched files and writes renamed copies when needed
- reuses an existing numbered renamed copy when it already matches the expected file size
- writes `.hb-library-viewer/sync-manifest.json` in the chosen target folder

## Project layout

```text
backend/   FastAPI app, Python package, config, and tests
data/      Generated local artifacts such as library snapshots and API batches
frontend/  React/Vite/TypeScript viewer UI
docs/      MkDocs documentation site
tools/     Developer scripts and local startup helpers
```

## Documentation

- Getting started: `docs/getting-started/`
- User guides: `docs/guides/`
- Architecture: `docs/architecture/`
- API reference: `docs/api/`
- Development notes: `docs/development/`

To build the docs locally:

```bash
mkdocs build --strict
```

## Security and privacy

- treat `_simpleauth_sess` like a password
- never commit `backend/.env`
- keep `data/artifacts/` private because it can contain signed download URLs
- never expose session cookies or signed links in screenshots, logs, or issues

See [SECURITY.md](SECURITY.md) for reporting guidance.

## Contributing

Contributions are welcome. Start with:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- `docs/development/contributing.md`

For contribution-fit or maintainer questions, contact Sean Whaley at `crazyandol@gmail.com`.

## License

This project is released under the MIT License. See [LICENSE](LICENSE).
