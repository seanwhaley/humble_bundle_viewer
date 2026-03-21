# Quick Start

Get your first capture fast.

## What you need

- Python 3.9+ installed
- `Playwright` browser binaries installed
- A valid Humble Bundle session cookie (`_simpleauth_sess`)

## Steps

1. Install dependencies: `pip install -r requirements.txt` and `python -m playwright install`.

2. Install the package: `pip install -e .`.

3. Create `backend/.env` with your cookie. Use the key shown in `backend/.env.example`.

4. Optional: edit `backend/config.yaml` for artifact paths or logging.

5. Run the CLI: `python -m hb_library_viewer`.

## What happens next

- If you opt into downloads, files go to `download.base_folder` (default: `./Humble_Library_Downloads`).
- Set `artifacts.save_api_batches: true` to save API batches to
  `data/artifacts/api_responses/`.
- Set `artifacts.save_captured_responses: true` to save raw captured responses (library
  HTML + `/api/v1/orders`) to `data/artifacts/captured_responses/`.
- Set `artifacts.save_html_on_failure: true` to save the library HTML when capture fails
  (no API responses or missing batches).
- Set `artifacts.save_gamekeys: true` to write `data/artifacts/gamekeys.json`.
- Structured data goes to `data/artifacts/library_products.json`.
- The CLI prints a platform → file-type summary after the run.
- The CLI prompts before starting downloads by default.
- If you already have API batches saved, you can rebuild
  `library_products.json` with
  `python -m hb_library_viewer rebuild-library-artifacts`.

## Next steps

- Installation details: `getting-started/installation.md`
- First full run: `getting-started/first-download.md`
- Authentication guide: `guides/authentication.md`
- Viewer app guide: `guides/viewer-portal.md`
