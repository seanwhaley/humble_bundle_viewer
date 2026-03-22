# Configuration Model

`Settings` loads values from defaults, `backend/config.yaml`, `backend/.env`, and environment variables.

## Source order

1. Programmatic overrides via `Settings(...)`
2. Environment variables with `HUMBLE_` prefix
3. `backend/.env`
4. `backend/config.yaml`
5. Defaults

## Nested fields

Use `__` to reach nested fields. Example: `HUMBLE_DOWNLOAD__BASE_FOLDER`.

Runtime-only backend settings that do not require auth, such as
`server.cors_allowed_origins`, are available through `RuntimeSettings` for the
FastAPI app and other viewer surfaces.

## Secrets vs non-secrets

- Secrets belong in `backend/.env`.
- Non-secrets belong in `backend/config.yaml`.

## Required values

- `auth_cookie` must be present. The tool raises a configuration error if missing.
- Runtime API/viewer reads that do not need authentication use `RuntimeSettings`, which still honors `backend/config.yaml`, `backend/.env`, and `HUMBLE_*` overrides.

## Viewer paths

- `viewer.default_library_dir` controls the default folder shown by the viewer setup flow.
- `viewer.library_path` controls the default `library_products.json` path used by the viewer backend before a runtime selection is made.

## Download confirmation

- `download.prompt_before_download` enables confirmation before downloading files.
- `download.force_individual_file_downloads` forces the decision (`true`, `false`, or `null`).
- `download.prompt_timeout_seconds` controls how long the prompt waits before skipping downloads.
- `download.connect_timeout_seconds` controls how long the viewer waits while opening streamed download connections.

## API completeness

- `api.per_key_max_retries` controls retries per missing game key when validating API coverage.
- `api.endpoint` provides the canonical Humble base URL used by browser capture, retry requests, and relative download URL expansion.

## Backend viewer access

- `server.cors_allowed_origins` controls which local browser origins may call the viewer backend.
