# Configuration

Settings load from these sources in order (highest to lowest):

1. Programmatic overrides via `Settings(...)`
2. Environment variables with `HUMBLE_` prefix
3. `backend/.env` file (secrets)
4. `backend/config.yaml` (non-secrets)
5. Defaults

## Core files

- `backend/config.yaml`: non-secret defaults like paths, timeouts, and logging.
- `backend/.env`: secrets like your session cookie.

## Common settings

- `server.cors_allowed_origins`: list of browser origins allowed to access the local FastAPI backend.
- `platforms`: list of target platforms used to filter downloads (for example `ebook`, `audio`).
- `browser.headless`: run with or without a visible window.
- `browser.timeout_ms`: increase if the library page takes longer to load.
- `browser.capture.*`: fine-tune post-navigation waits and API-response polling for library capture.
- `download.base_folder`: where files go. Relative paths in `backend/config.yaml` resolve from the repository root.
- `download.rate_limit_delay`: delay between requests (0.5 or more).
- `download.connect_timeout_seconds`: timeout for opening streamed download connections.
- `download.stream_timeout_seconds`: timeout for streamed download requests.
- `download.prompt_before_download`: prompt before downloading.
- `download.force_individual_file_downloads`: force download decision (`true`, `false`, or `null`).
- `download.prompt_timeout_seconds`: prompt timeout in seconds.
- `api.endpoint`: Humble Bundle base URL used for library capture, API retries, and expansion of relative download URLs.
- `api.per_key_max_retries`: retries per missing game key when validating API completeness.
- `logging.level`: `debug`, `info`, `warning`, `error`.
- `artifacts.base_dir`: base directory for artifacts (default: `data/artifacts`). Relative paths in `backend/config.yaml` resolve from the repository root. Standalone maintenance workflows derive their default `api_responses/`, `order_payload_models.py`, and `library_products.json` paths from this root unless you pass an explicit override.
- `artifacts.save_api_batches`: save `/api/v1/orders` batches to `data/artifacts/api_responses/`.
- `artifacts.save_captured_responses`: save raw captured responses (library HTML + API).
- `artifacts.save_html_on_failure`: save library HTML when capture fails (no API responses or missing batches).
- `artifacts.save_gamekeys`: save extracted game keys to `data/artifacts/gamekeys.json`.
- `artifacts.auto_rebuild_order_models`: auto-rebuild order payload models when new fields appear.
- `viewer.link_expiry_warning_hours`: hours before expiry to warn about download links (default: `6`).
- `viewer.default_library_dir`: optional default folder used by the viewer setup flow.
- `viewer.library_path`: optional default `library_products.json` path for the viewer backend. When omitted, the viewer falls back to `artifacts.base_dir/library_products.json`.
- `current_bundles.base_dir`: base directory for saved current bundle pages, bundle catalogs, and overlap reports.
- `current_bundles.library_path`: optional `library_products.json` path used specifically for current bundle overlap analysis.
- `current_bundles.bundle_types`: default live bundle categories to analyze (`games`, `books`, `software`).
- `current_bundles.timeout_seconds`: request timeout for current bundle index and page fetches.
- `current_choice.base_dir`: base directory for saved current Humble Choice HTML snapshots, parsed page snapshots, and overlap reports.
- `current_choice.library_path`: optional `library_products.json` path used specifically for current Humble Choice overlap analysis.
- `current_choice.timeout_seconds`: request timeout for current Humble Choice page fetches.
- `subproduct_pages.base_dir`: base directory for cached external page HTML, manifests, and extracted metadata. When the viewer cannot find a sibling `subproduct_pages/metadata.json` next to the active library file, it falls back to `subproduct_pages.base_dir/metadata.json`.
- `subproduct_pages.progress_log_every`: progress-log cadence for long cache runs.
- `subproduct_pages.search_scoring.*`: advanced heuristics for site-search replacement matching.

## Environment overrides

Use `HUMBLE_` plus `__` for nested fields:

- `HUMBLE_AUTH_COOKIE` sets the session cookie.
- `HUMBLE_SERVER__CORS_ALLOWED_ORIGINS` sets the backend CORS origin allow-list (use a JSON array string).
- `HUMBLE_DOWNLOAD__BASE_FOLDER` overrides the download folder.
- `HUMBLE_BROWSER__HEADLESS` toggles browser visibility.
- `HUMBLE_DOWNLOAD__CONNECT_TIMEOUT_SECONDS` sets the stream connect timeout.
- `HUMBLE_DOWNLOAD__PROMPT_BEFORE_DOWNLOAD` toggles the download prompt.
- `HUMBLE_DOWNLOAD__FORCE_INDIVIDUAL_FILE_DOWNLOADS` forces the download decision.
- `HUMBLE_DOWNLOAD__PROMPT_TIMEOUT_SECONDS` sets the prompt timeout.
- `HUMBLE_ARTIFACTS__BASE_DIR` sets the base artifact directory.
- `HUMBLE_SUBPRODUCT_PAGES__BASE_DIR` sets the default cached subproduct-page directory.
- `HUMBLE_ARTIFACTS__SAVE_API_BATCHES` toggles API batch snapshots.
- `HUMBLE_ARTIFACTS__SAVE_CAPTURED_RESPONSES` toggles raw response capture.
- `HUMBLE_ARTIFACTS__SAVE_HTML_ON_FAILURE` toggles HTML capture on failures.
- `HUMBLE_ARTIFACTS__SAVE_GAMEKEYS` toggles game keys output.
- `HUMBLE_ARTIFACTS__AUTO_REBUILD_ORDER_MODELS` toggles model auto-rebuilds.
- `HUMBLE_VIEWER__LINK_EXPIRY_WARNING_HOURS` sets the expiring link warning window.
- `HUMBLE_VIEWER__DEFAULT_LIBRARY_DIR` sets the viewer setup default folder.
- `HUMBLE_VIEWER__LIBRARY_PATH` sets the viewer's default active library file.
- `HUMBLE_CURRENT_BUNDLES__BASE_DIR` sets the current bundle artifact directory.
- `HUMBLE_CURRENT_BUNDLES__LIBRARY_PATH` sets the current bundle analysis library file.
- `HUMBLE_CURRENT_BUNDLES__BUNDLE_TYPES` sets the default current bundle categories (use a JSON array string).
- `HUMBLE_CURRENT_BUNDLES__TIMEOUT_SECONDS` sets the current bundle request timeout.
- `HUMBLE_CURRENT_CHOICE__BASE_DIR` sets the current Choice artifact directory.
- `HUMBLE_CURRENT_CHOICE__LIBRARY_PATH` sets the current Choice analysis library file.
- `HUMBLE_CURRENT_CHOICE__TIMEOUT_SECONDS` sets the current Choice request timeout.

To use a different configuration file, set `HUMBLE_CONFIG_YAML`.

## CLI overrides

Configuration-backed defaults (set in `backend/config.yaml`):

- `server.*`, `platforms`, `browser.*`, `download.*`, `api.*`, `logging.*`, `artifacts.*`, `viewer.*`, `current_bundles.*`, `current_choice.*`, and `subproduct_pages.*`

CLI runtime flags (overrides, ignored by `backend/config.yaml`):

- `--config` (sets `HUMBLE_CONFIG_YAML` for the current run)
- `--auth-cookie`, `--save-auth-cookie`, `--prompt-auth-save`, `--prompt-auth`
- `--artifacts-dir`, `--output-products`, `--order-model`, `--order-model-class`
- `--artifacts-dir`, `--output-products`, `--order-model`, `--order-model-class`, `--platform/-p`

Session information is still preferred in `backend/.env`, but you can pass
`--auth-cookie` or use `--prompt-auth` for an interactive prompt. When you
provide a session cookie at runtime, the CLI asks whether to save it to `backend/.env`
unless you opt into `--save-auth-cookie` or `--no-save-auth-cookie`.

## Tips

- Keep secrets out of `backend/config.yaml`.
- Never commit `backend/.env`.
- When troubleshooting, set `logging.level` to `debug`.
