# Your First Capture

This guide walks through a full run using your existing Humble Bundle session cookie.

## Steps

1. Copy `backend/.env.example` to `backend/.env`.

2. Set your session cookie value in `backend/.env` (see `guides/authentication.md`).

3. Optional: edit `backend/config.yaml` to change download folder or logging.

4. Run the CLI: `python -m hb_library_viewer`.

The CLI asks before downloads start. Respond with `y` to proceed, or wait for the timeout to skip downloads.
Skip downloads when you need the structured artifacts.

## What you should see

- A log message that configuration loaded.
- Browser capture messages that include API batch counts.
- A prompt asking whether to start downloads.
- A download summary at the end.

## Output locations

- If enabled, downloads go to `download.base_folder` (default `./Humble_Library_Downloads`).
- Library HTML and `/api/v1/orders` responses: `data/artifacts/captured_responses/`.
- API batches: `data/artifacts/api_responses/`.
- Extracted game keys: `data/artifacts/gamekeys.json`.
- Structured data: `data/artifacts/library_products.json`.
