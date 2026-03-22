# Command Line Reference

## Entry point

Run the tool with:

- `python -m hb_library_viewer`

The command reads settings from `backend/.env` and `backend/config.yaml`.
By default, the CLI prompts before downloading files.

Relative path values in `backend/config.yaml` are resolved from the repository
root, so running the CLI from a different working directory does not change
where config-driven artifacts, cache files, or default download folders land.

## Arguments

Optional flags:

- `--download`: skip the prompt and download files.
- `--skip-downloads`: skip downloading files.
- `--config`: override the configuration file path (sets `HUMBLE_CONFIG_YAML`).
- `--auth-cookie`: provide the session cookie for the current run.
- `--save-auth-cookie/--no-save-auth-cookie`: save the session cookie to `backend/.env` without prompting.
- `--prompt-auth-save`: prompt for the session cookie and save it without asking.
- `--prompt-auth/--no-prompt-auth`: prompt for the session cookie if missing.
- `--artifacts-dir`: override the artifacts root directory.
- `--output-products`: override the `library_products.json` output path.
- `--order-model`: override the order payload model file path.
- `--order-model-class`: override the order model class name.
- `--save-api-batches/--no-save-api-batches`: override batch saving.
- `--save-captured-responses/--no-save-captured-responses`: override raw capture saving.
- `--save-gamekeys/--no-save-gamekeys`: override game key capture.
- `--save-html-on-failure/--no-save-html-on-failure`: override HTML capture on failures.
- `--platform/-p`: limit downloads to one or more platforms (repeatable, overrides `platforms`).
- `--file-type/-t`: limit downloads to one or more file types (repeatable, ex: `pdf`, `epub`).
- `--size-policy`: choose `all`, `smallest`, or `largest` downloads per product.

## Commands

- `python -m hb_library_viewer rebuild-order-models`
- `python -m hb_library_viewer generate-order-models`
- `python -m hb_library_viewer rebuild-library-artifacts`
- `python -m hb_library_viewer build-viewer-assets`
- `python -m hb_library_viewer analyze-current-bundles`
- `python -m hb_library_viewer analyze-current-choice`
- `python -m hb_library_viewer sync-downloads --target-folder <path>`
- `python -m hb_library_viewer cache-subproduct-pages`
- `python -m hb_library_viewer extract-subproduct-metadata`

Rebuilds the order payload model from saved API batch files under
`artifacts.base_dir/api_responses/` by default. The command exits with an
error if the artifacts are missing.

Generate-order-models builds a fresh order model from saved API batches.
Rebuild-library-artifacts regenerates `library_products.json` from saved batches.
Build-viewer-assets generates the viewer schema file from `LibraryData`.
Analyze-current-bundles captures the current Humble bundle pages, stores the
bundle HTML/catalog artifacts, and writes JSON + markdown overlap reports
against the active library file.
Analyze-current-choice captures the current Humble Choice membership page,
stores the saved HTML snapshot, and writes JSON + markdown overlap reports for
the current month against the active library file.
Cache-subproduct-pages downloads external publisher/product pages referenced by
subproducts into a cache manifest plus one HTML file per URL.
Extract-subproduct-metadata reads that cache and writes a separate structured
metadata artifact for runtime viewer enrichment.

When you provide a session cookie at runtime (via `--auth-cookie` or prompt),
the CLI asks whether to save it to `backend/.env` unless you use `--save-auth-cookie`
or `--no-save-auth-cookie`. Use `--prompt-auth-save` to combine prompting and
automatic saving in one flag.

Command options:

- rebuild-order-models: `--artifacts-dir`, `--pattern`, `--order-model`, `--order-model-class`
- generate-order-models: `--api-dir`, `--pattern`, `--output-models`, `--class-name`
- rebuild-library-artifacts: `--api-dir`, `--pattern`, `--output-products`, `--order-model`, `--order-model-class`
- build-viewer-assets: `--schema-output`
- analyze-current-bundles: `--config`, `--output-dir`, `--library-file`, `--bundle-type`, `--timeout-seconds`
- analyze-current-choice: `--config`, `--output-dir`, `--library-file`, `--timeout-seconds`
- sync-downloads: `--library-file`, `--target-folder`, `--platform`, `--file-type`, `--size-policy`, `--dry-run`
- cache-subproduct-pages: `--library-file`, `--config`, `--cache-dir`, `--redownload-existing/--no-redownload-existing`, `--subproduct-query`, `--url`, `--limit`, `--max-failures`, `--domain-workers`, `--log-file`
- extract-subproduct-metadata: `--config`, `--cache-dir`, `--output-file`, `--report-file`

## Current bundle overlap command

Use the current-bundle analysis command when you want a saved comparison between
the live Humble bundle lineup and your captured library.

Examples:

- `python -m hb_library_viewer analyze-current-bundles`
- `python -m hb_library_viewer analyze-current-bundles --bundle-type books --bundle-type software`
- `python -m hb_library_viewer analyze-current-bundles --library-file D:/HB/library_products.json`

Behavior:

- Reads defaults from `current_bundles.*` in `backend/config.yaml`.
- Falls back to `current_bundles.library_path`, then `viewer.library_path`, then `artifacts.base_dir/library_products.json` unless `--library-file` is provided.
- Defaults to all three supported bundle types (`games`, `books`, `software`) unless narrowed with `--bundle-type` or config.
- Writes bundle index/page artifacts plus `bundle_overlap_report.json` and `bundle_overlap_report.md` under `current_bundles.base_dir` unless `--output-dir` is provided.
- Prints the important artifact output paths after the run so longer workflows leave a clear trail in the terminal.

## Current Choice overlap command

Use the current-Choice analysis command when you want a saved comparison between
the live Humble Choice membership page for the current month and your captured
library.

Examples:

- `python -m hb_library_viewer analyze-current-choice`
- `python -m hb_library_viewer analyze-current-choice --output-dir D:/HB/current-choice`
- `python -m hb_library_viewer analyze-current-choice --library-file D:/HB/library_products.json`

Behavior:

- Reads defaults from `current_choice.*` in `backend/config.yaml`.
- Falls back to `current_choice.library_path`, then `viewer.library_path`, then `artifacts.base_dir/library_products.json` unless `--library-file` is provided.
- Fetches `https://www.humblebundle.com/membership` and saves the current-month page HTML as `membership.html`.
- Writes `choice_snapshot.json`, `choice_overlap_report.json`, and `choice_overlap_report.md` under `current_choice.base_dir` unless `--output-dir` is provided.
- Prints the important artifact output paths after the run so longer workflows leave a clear trail in the terminal.

## Managed local sync command

Use the managed sync command when you want the CLI to sync files into a local
folder, skip files already present, preserve mismatched files, and write a sync
manifest.

Examples:

- `python -m hb_library_viewer sync-downloads --target-folder D:/HB-Sync`
- `python -m hb_library_viewer sync-downloads --target-folder D:/HB-Sync --file-type epub --dry-run`
- `python -m hb_library_viewer sync-downloads --target-folder D:/HB-Sync --size-policy largest`

Behavior:

- Defaults to the `ebook` platform when `--platform` is omitted.
- Reads `viewer.library_path` when configured; otherwise falls back to `artifacts.base_dir/library_products.json` unless `--library-file` is provided.
- Organizes files into deterministic relative paths beneath the chosen target folder.
- Reuses the same managed-sync runtime knobs that power the viewer (`download.managed_sync_max_parallel_downloads` and `download.managed_sync_manifest_history_entries`), so the CLI and viewer share worker-count and manifest-retention behavior.
- Reuses compatible manifest history from `.hb-library-viewer/sync-manifest.json`, allowing previously viewer-synced files with older accepted payload sizes to be recognized as existing instead of being renamed unnecessarily.
- Shows live terminal progress while syncing, including the current bundle/title/file, running downloaded/skipped/renamed/failed counts, plus `HH:MM:SS` elapsed and ETA updates. Interactive runs now keep a fixed two-line display: one line for overall sync progress and one line for the latest active file, including byte progress plus transfer speed while a file is actively downloading and retry reason details when a file is recovering from an error, instead of printing a new terminal line for every file transition.
- Skips files that already exist when the local file size matches the expected size.
- Preserves mismatched files by downloading a numbered sibling filename instead of overwriting.
- Writes `.hb-library-viewer/sync-manifest.json` inside the target folder.

## Cached subproduct page command

Use the subproduct page cache command when you want a reusable local copy of
external publisher/product pages referenced by Humble subproducts.

Examples:

- `python -m hb_library_viewer cache-subproduct-pages`
- `python -m hb_library_viewer cache-subproduct-pages --cache-dir D:/HB-Page-Cache`
- `python -m hb_library_viewer cache-subproduct-pages --redownload-existing`
- `python -m hb_library_viewer cache-subproduct-pages --subproduct-query "Clean Code in JavaScript" --limit 1 --max-failures 1`
- `python -m hb_library_viewer cache-subproduct-pages --url https://www.simonandschuster.com/books/100-Things-to-See-in-the-Night-Sky/... --max-failures 1`
- `python -m hb_library_viewer cache-subproduct-pages --domain-workers 6`
- `python -m hb_library_viewer cache-subproduct-pages --log-file D:/HB-Page-Cache/cache_run.log`

Behavior:

- Reads `viewer.library_path` when configured; otherwise falls back to `artifacts.base_dir/library_products.json` unless `--library-file` is provided.
- Stores a manifest at `subproduct_pages.base_dir/index.json`.
- Includes per-domain run summaries in that manifest so repeated problem domains are easier to spot without scanning every item.
- Stores one cached HTML file per URL under `subproduct_pages.base_dir/pages/`.
- Writes a plain-text run log to `subproduct_pages.base_dir/cache_run.log` by default, so you do not need to pipe terminal output through `Tee-Object` to keep a readable log.
- Sorts and processes URLs by domain so an unavailable domain is identified early and the rest of that domain can be skipped for the current run when diagnostics show it is unavailable.
- Can process multiple domains in parallel via `subproduct_pages.domain_workers` or `--domain-workers`, while still keeping each domain serial and respecting per-host rate limits.
- Records fetch provenance in the manifest, including attempt count, recovery method, replacement URL, and any domain-specific policy applied.
- Records fast domain diagnostics for unresolved transport failures, including DNS/TCP/TLS reachability and whether the remaining URLs for that domain were skipped.
- Records search provenance for host-specific replacement discovery, including the accepted search query and confidence score when a site-search fallback succeeds.
- Shows a clean Rich terminal view during interactive runs, a plain log stream when output is redirected, and periodic progress summaries in the run log during long runs.
- Retries transient upstream issues such as `429`, `500`, `502`, `503`, `504`, `522`, timeouts, and connection resets using the configured `subproduct_pages.retry_backoff_seconds` schedule.
- Uses a lower connect timeout (`subproduct_pages.connect_timeout_seconds`) plus the full request timeout to fail dead upstream sites faster without truncating slower healthy reads.
- Honors `Retry-After` headers for retriable HTTP responses when `subproduct_pages.respect_retry_after` is enabled.
- Supports domain-specific retry pacing under `subproduct_pages.host_policies`, which the default config now uses for `www.wiley.com`.
- Supports host-specific browser fallback for configured `403`-heavy domains; the default config enables this for `www.simonandschuster.com`.
- Supports host-specific site-search recovery for configured `404`-heavy domains; the default config enables this for `www.packtpub.com` and `www.blacklibrary.com`.
- Reuses cached HTML when `subproduct_pages.redownload_existing` is `false`.
- Refreshes cached HTML when `subproduct_pages.redownload_existing` is `true` or `--redownload-existing` is provided.
- Use `--subproduct-query` to test a single title or publisher match without processing the whole library.
- Use `--url` for an exact one-URL fetch.
- Use `--limit 1 --max-failures 1` when you want a strict single-subproduct smoke test.
- The command stops early only after `subproduct_pages.max_failures` consecutive non-HTTP fetch failures by default.
- When multi-domain workers are enabled, that consecutive-failure guardrail is evaluated within each active domain worker.
- HTTP responses such as `401`, `403`, and `404` are still recorded as failures in the manifest, but they do not trip the early-stop guardrail.
- Use `subproduct_pages.connect_timeout_seconds`, `subproduct_pages.domain_workers`, `subproduct_pages.domain_check_timeout_seconds`, `subproduct_pages.progress_log_every`, `subproduct_pages.retry_statuses`, `subproduct_pages.retry_backoff_seconds`, `subproduct_pages.max_retry_after_seconds`, `subproduct_pages.retry_transport_failures`, `subproduct_pages.search_scoring.*`, `subproduct_pages.log_path`, `subproduct_pages.host_policies[*].search_on_404`, and `subproduct_pages.host_policies[*].min_match_confidence` in `backend/config.yaml` to tune recovery behavior without changing the CLI surface area.
- Final CLI output includes elapsed time plus a compact failure breakdown so repeated host-level issues are easier to spot without opening the manifest first.

## Subproduct metadata extraction command

Use the metadata extraction command when you want to keep page-derived title,
author, summary, and publisher data separate from `library_products.json` while
still making that enrichment available to the viewer at runtime.

Examples:

- `python -m hb_library_viewer extract-subproduct-metadata`
- `python -m hb_library_viewer extract-subproduct-metadata --cache-dir D:/HB-Page-Cache`
- `python -m hb_library_viewer extract-subproduct-metadata --output-file D:/HB-Page-Cache/metadata.json`
- `python -m hb_library_viewer extract-subproduct-metadata --report-file D:/HB-Page-Cache/subproduct_metadata_coverage_summary.md`

Behavior:

- Reads the cached page manifest from `subproduct_pages.base_dir/index.json`.
- Reads cached HTML from `subproduct_pages.base_dir/pages/`.
- Writes structured metadata to `subproduct_pages.base_dir/metadata.json` by default.
- Can also write a structured markdown analysis report when `--report-file` is provided.
- Keeps `library_products.json` unchanged on disk; the viewer joins metadata during use.

When you omit maintenance-path options such as `--artifacts-dir`, `--api-dir`,
`--output-models`, `--output-products`, or `--library-file`, the CLI now
derives those defaults from `backend/config.yaml` (`artifacts.base_dir`,
`viewer.library_path`, and `subproduct_pages.base_dir`) instead of assuming a
fixed repo-local path.

- Prefers JSON-LD book/product metadata when available and falls back to meta tags plus visible DOM sections such as long descriptions.
- Logs periodic extraction progress with `HH:MM:SS` elapsed/ETA formatting and prints the final elapsed time in the same format.

## Web command center

The viewer app includes a **Command Center** page that exposes the same
CLI workflows in a web UI. It intentionally does **not** edit `backend/.env` or
`backend/config.yaml`; use the CLI or manual edits for configuration changes.

## Download confirmation

After writing aggregated outputs, the CLI prompts before downloading files.

- Respond `y` or `yes` to start downloads.
- Any other response skips downloads.
- If the prompt times out, the run exits without downloading.

Use `download.prompt_before_download`, `download.force_individual_file_downloads`,
and `download.prompt_timeout_seconds` to control this behavior.
Set `force_individual_file_downloads` to `null` to prompt, or `true`/`false` to
auto-decide.

## Exit codes

- `0` on success (including when you skip downloads via prompt/timeout)
- `1` on error

## Common overrides

- Set `HUMBLE_LOGGING__LEVEL` to `debug` for more logs.
- Set `HUMBLE_BROWSER__HEADLESS` to `false` to show the browser.
- Set `HUMBLE_DOWNLOAD__PROMPT_BEFORE_DOWNLOAD` to `false` to auto-download.
- Set `HUMBLE_DOWNLOAD__FORCE_INDIVIDUAL_FILE_DOWNLOADS` to `true` or `false` to skip the prompt.
