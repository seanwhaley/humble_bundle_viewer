# Simple Usage

Use this path when you want the shortest CLI-driven route from authentication to a browsable local library snapshot.

## Capture your library

1. Set your cookie in `backend/.env` (see `guides/authentication.md`).
2. Run the tool: `python -m hb_library_viewer`.
3. Confirm any optional download prompts you want to run during the capture.

## Work with captured data

After a successful run:

- inspect `data/artifacts/library_products.json` directly
- open the standalone viewer in `docs/assets/tools/library-products-viewer.html`
- or start the full web app with `python tools/start_dev.py` and use the **Setup** page to load the captured file

## Next steps

- `getting-started/first-download.md` for a fuller end-to-end workflow
- `guides/viewer-portal.md` for the web app routes and setup flow
- `guides/querying-products.md` for common JSON inspection patterns
