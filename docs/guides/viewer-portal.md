# Viewer App (FastAPI + React)

The viewer app is a multi-page UI for exploring `data/artifacts/library_products.json`.
The FastAPI backend lives under `backend/`, and the React frontend lives under `frontend/`.

## Overview

- **Backend**: FastAPI API that loads and validates `library_products.json` (`Pydantic` v2)
- **Frontend**: React + `Vite` + Tailwind
- **Charts**: ECharts
- **Tables**: Data table component

## Web app structure

- `frontend/src/app/` — route-level pages and layout shell
- `frontend/src/components/` — reusable UI components (tables, charts, cells)
- `frontend/src/components/ui/` — small UI primitives (button, input, sheet, hint)
- `frontend/src/data/` — API hooks and selector helpers
- `frontend/src/state/` — global filter context
- `frontend/src/utils/` — formatting utilities
- `frontend/src/styles/` — global Tailwind layers and shared styles

## Quick start (local dev)

### One-command startup

Run both the API server and the web app with:

`python tools/start_dev.py`

This is the preferred startup command in the current IDE as well as regular terminals. It stops stale listeners on the backend/frontend dev ports, starts both services, waits for them to become reachable, and shuts the sibling process down if one exits during startup or runtime.

On Windows you can also run the optional non-blocking launcher, which starts both services
as background jobs in the current PowerShell/VS Code terminal session (no extra
console windows) and writes logs under `tools/logs/`:

`tools\start_dev.ps1`

### API server (manual)

`cd backend`

`pip install -r requirements.txt`

`python -m uvicorn app.main:app --reload --port 8000`

### Web app (manual)

`cd frontend`

`npm install`

`npm run dev`

The web app expects the API server at `http://localhost:8000` and proxies `/api/*` requests.

## Data path

By default, the API server uses `viewer.library_path` when it is configured.
Otherwise, it falls back to:

`artifacts.base_dir/library_products.json`

If neither of those points at an existing file yet, local repo runs still search upward for:

`data/artifacts/library_products.json`

You can set an explicit default viewer library path in `backend/config.yaml` with:

`viewer.library_path: /absolute/path/to/library_products.json`

or override it with:

`HUMBLE_VIEWER__LIBRARY_PATH=/absolute/path/to/library_products.json`

The viewer also tries to load extracted subproduct metadata from a sibling
`subproduct_pages/metadata.json` next to the active library file first, then
falls back to `subproduct_pages.base_dir/metadata.json` from `backend/config.yaml`.

Relative path values in `backend/config.yaml` such as `artifacts.base_dir`,
`viewer.library_path`, `viewer.default_library_dir`, and
`subproduct_pages.base_dir` resolve from the repository root so the viewer and
CLI do not drift when started from different working directories.

## Setup page

Use `/setup` to load your library data:

- **Capture new library**: paste the `_simpleauth_sess` cookie (used for the run, never stored) and choose a save folder (defaults to `viewer.default_library_dir` when configured, otherwise your Downloads directory).
- **Use existing library file**: point the viewer at a previously downloaded `library_products.json`.
- the page now leads with scan-first workflow guidance so the difference between a fresh capture, a saved-file switch, and the related follow-up tools is clearer before you reach the form fields
- capture mode also frames the download options as an optional scope step instead of presenting those fields as equal-priority setup requirements

After a successful capture or selection, the viewer refreshes and loads the chosen library file.

## Pages

- `/` Viewer Home dashboard with shell-level library context, current-scope summary, live current-sales status, recent purchases, and attention rollups
- `/venue/overview` Sales Overview page combining current Choice plus games/books/software bundle analysis in one filterable dashboard
- `/venue/bundles/games` Live game-bundle overlap page backed by the Python current-bundles analyzer
- `/venue/bundles/books` Live book-bundle overlap page backed by the Python current-bundles analyzer
- `/venue/bundles/software` Live software-bundle overlap page backed by the Python current-bundles analyzer
- `/venue/choice` Current-month Humble Choice overlap page backed by the Python current-choice analyzer
- `/current-bundles` Legacy shortcut that redirects to `/venue/bundles/games`
- `/commands` Command center (maintenance workflows mirrored from the CLI)
- `/orders` Purchases route for reviewing purchase summaries and included-item analysis
- `/category/:category` Category detail dashboards
- `/steam-keys` Steam key inventory
- `/non-steam-keys` Non-Steam key inventory
- `/downloads` **Other Downloads** — direct download links not already surfaced on the dedicated eBook, Audiobook, Video, or Software routes; when no matching items exist, the empty state now points you toward those dedicated routes instead of acting like a dead end
- `/software` Software titles grouped into one row per subproduct, with platform/file-type-aware downloads and managed local sync
- `/videos` Video titles grouped into one row per subproduct, with format-aware downloads and managed local sync
- `/ebooks` eBook titles with format-aware downloads, filtering, and advanced local sync
- `/audiobooks` Audiobook titles with format-aware downloads and advanced local sync
- `/setup` Capture and data-path configuration

The sidebar only shows download-page links when the active library has matching
content for that route. Direct URLs for those routes still resolve and show a
consistent empty state instead of redirecting when the current library
selection has no valid matching subproducts.

## Viewer Home dashboard

The Viewer Home route now emphasizes guided browsing before deeper analysis:

- **Current scope** panel kept intentionally compact so the active filter summary stays visible without consuming excess vertical space
- active scope chips surface the current search, category, platform, date, and presence filters directly in the compact summary row when filters are active, while a small **Filters** toggle keeps the full control set closed by default until you need it
- the overview now borrows the tighter downloads-page pattern for filter placement: compact summary first, optional filter panel second, then the main dashboard sections
- a buyer-facing **Current sales** block now sits immediately under the optional filter panel so the homepage leads with today’s live opportunities before deeper owned-library analysis
- the Current sales card now drops duplicate in-page shortcuts and instead points buyers back to the sidebar’s dedicated current-sales section for deeper route navigation
- an **At a glance** KPI strip keeps purchases, included items, downloads, keys, size, and spend together as the first owned-library scan layer, while only the tiles with clear filtering value stay interactive
- **Recent purchases** list for newest additions in the current filter scope
- a **Purchase themes** word cloud beside recent purchases surfaces recurring terms from recent subproduct titles, tags, and descriptions, filters common filler words, and uses the existing ECharts stack plus `echarts-wordcloud` for weighted sizing/rotation; each theme can set the overview search directly
- grouped chart sections keep inventory mix, activity trends, and supporting publisher/key breakdowns visually separate so the dashboard reads from primary metrics to deeper analysis
- normalized category/platform labels in overview-facing charts and shortcuts
- the trend time-scale control now lives inside the activity-trends section header instead of floating between unrelated charts
- the shell now promotes urgent key follow-up more directly: the **Expiring** sidebar entry gets a warning badge when unredeemed keys are expired or within 30 days of expiry, and Viewer Home plus Steam Keys show a top warning banner with the same shared summary

The historical charts and publisher/key-type breakdowns remain available farther down the page for analytical exploration.

## Navigation and library context

The shell groups navigation into goal-oriented sections:

- **Viewer**: Viewer Home
- **Current sales**: Sales Overview, Current Choice, Game Bundles, Book Bundles, Software Bundles
- **Purchases**: Purchases
- **Downloads**: eBooks, Audiobooks, Videos, Software, Other (shown only when the active library has matching content for that route)
- **Keys**: Expiring, Steam, Non-Steam
- **Tools**: Setup, Command Center, Schema

When a library file is loaded, the shell also shows an **Active library** banner
above the route content with:

- the active `library_products.json` path
- the capture timestamp from the loaded artifact
- a download-link expiry summary that distinguishes the next upcoming expiry, partially expired link sets, and fully expired signed links when timestamp data is available
- compact whole-library totals for products, subproducts, files, and keys

The banner is intentionally compact so it stays relevant on every page. The totals strip is library-wide, while route-level tiles (such as the Overview page) can still reflect the current filtered scope without losing the always-visible whole-library counts.

The current-sales routes intentionally hide this shell banner so those pages stay focused on live bundle and Choice analysis instead of repeating whole-library context above the report viewers.

## Purchases route

The purchases route now emphasizes ownership comprehension first:

- a top summary block with purchase counts, included items, and mixed/keys-only rollups
- a **Purchases** mode with richer previews for:
  - compact bundle names that shorten repeated Humble bundle prefixes
  - purchase type
  - access type
  - included item count
  - media mix
  - amount and purchase date
- an **Included-item analysis** mode for deeper row-level inspection across contained bundle items
- a full-page purchase detail view with a back button, summary cards, quick actions, and included-item tables

Use the purchases mode for browsing. Use included-item analysis when you need deeper inspection across subproducts or bundle contents.

## Search and table tools

Data-heavy routes now keep the shared search state visible directly above the table instead of hiding it behind the global filter panel alone.

- route-aware search boxes appear on Purchases, Downloads, Software, Videos, Steam Keys, Non-Steam Keys, eBooks, Audiobooks, Categories, and Expiring Keys
- **Steam Keys** and **Non-Steam Keys** now expose compact summary strips plus quick scopes such as **Needs reveal**, **Revealed**, **Redeemable**, and route-specific urgency/action slices so the broader inventory pages match the scan-first triage pattern introduced on **Expiring Keys**
- **Expiring Keys** now keeps its strongest call to action on unexpired rows: the route highlights open redemption windows first, quick scopes treat **Needs action** as still-claimable rows by default, expired rows remain visible as reference, and the in-row **Action** control appears only where a key can still be acted on under the current viewer policy
- key inventory tables now use **Revealed** instead of **Claimed** for the yes/no visibility column because the viewer knows whether Humble exposed the key value, not whether a third-party platform accepted redemption
- the viewer config endpoint now exposes a reveal-policy toggle set that defaults to treating revealed keys as already handled for unexpired windows while still letting you ignore revealed status separately for expired and unexpired keys in `backend/config.yaml`
- the shared table toolbar keeps search, active-filter chips, and row-selection helpers in a denser single block so more of the table stays on screen
- each column header exposes a labeled **Filter** control on its own row instead of a filter icon alone, reducing header collisions on denser tables
- open column filter menus close when you click outside them or press `Escape`
- shared route filter panes now show only the filter families relevant to that page’s content, so media/download routes do not surface key-only filters and key-focused routes do not surface unrelated download/platform controls
- subproduct-focused tables now expose an **Info** action that opens the external publisher or product page when Humble includes one in the captured order payload
- the **E-books** page keeps broad page filters behind a top-right toggle and includes route-level **Author** and **Format** filters there for quick narrowing before you use the table’s dedicated **Author** and **Description** columns
- **E-books** keeps the key library fields in dedicated table columns so header sorting and column filters still work for bundle/date-oriented analysis, while the row download actions show only valid links
- the **E-books** route collapses bulk browser downloads and advanced local sync into compact toggles so those occasional-use tools do not dominate the page
- redemption-backed rows in **Steam Keys**, **Non-Steam Keys**, and **Expiring Keys** expose compact in-row actions when Humble provides external claim or instruction links in the captured key metadata
- interactive charts still group long-tail categories into **Other** buckets when needed; when a route already has a real **Other** category, the chart merges those counts into a single **Other** bar and leaves that aggregated bucket non-clickable because it represents multiple underlying values
- purchase detail views expose the same redemption action so keys-only bundles can be claimed without detouring through unrelated routes
- shared tables now prefer wrapping content instead of forcing a table-scoped horizontal scrollbar on the denser media routes
- `Downloads` rows use explicit **Download** and **Copy link** actions for faster scanning

Use the route filter panel for broad scope changes, then use the table search box and header filters for row-level refinement.

## Browser downloads

The **Software**, **Videos**, **E-books**, **Audiobooks**, and **Downloads** pages start downloads in the
user's browser so files save to the device running the browser, not the backend
machine. For multi-file actions, the browser may prompt the user to allow
multiple downloads before continuing.

On the media-focused pages, bulk **Smallest** and **Largest** browser download
actions now ask `/api/downloads/plan` to choose the per-title file list first,
so the viewer reuses the shared Python size-selection rules instead of
recomputing them independently in the route components before opening the final
browser download URLs.

The **E-books** and **Videos** pages now also ask `/api/downloads/plan` to
apply backend file-type filtering for bulk format downloads, so those routes
reuse the same normalized file-type metadata and planner contract before the
browser opens the final URLs.

Viewer download labels are now derived by the backend at library-load time,
with a committed JSON policy controlling how media formats and software
variants are translated into `content_label`, `package_label`, and
`display_label`. See `guides/download-labeling-policy.md` for the canonical
rules.

The **Command Center** now also exposes the subproduct enrichment maintenance
flows used by the CLI:

- rebuild order models
- rebuild `library_products.json`
- build the viewer schema
- analyze current Humble bundles against the active library
- cache external subproduct pages
- extract structured subproduct metadata and an optional markdown report

The route now groups commands by intent — guided workflows, rebuilds/exports,
and metadata enrichment — and keeps path-heavy overrides behind expandable
advanced sections so the default action remains visible first.

## Current sales pages

The current sales routes keep the overlap logic on the Python side and treat the React
pages as typed report viewers.

Sales Overview page:

- `/venue/overview`

This route combines the saved current-bundles and current-choice reports into one dashboard.

- provides a compact current-sales summary strip instead of a second large hero block
- lets you filter the analysis to all content or any combination of current Choice, game bundles, book bundles, and software bundles
- keeps the topline summary pills as the combined total for the current filter instead of repeating one card per selected source
- keeps a lighter included-sources section with quick links and short in-scope summaries so the dashboard still preserves source context without repeating another set of heavyweight metric boxes
- uses four aggregate bundle-criteria cards covering all-new bundles, partial-overlap bundles, expiring-soon bundles, and 90%+ tracked-savings bundles
- uses pie charts for the categorical bundle-state breakdowns, while switching expiry to a days-remaining line chart that counts down toward day 0 on the right and savings to a tighter percentage-distribution curve so those charts better match the underlying data shape
- keeps chart hover details focused on bundle counts, product counts, top-tier spend, tracked retail, and savings context instead of listing example package names
- keeps Current Choice in the overall totals when selected, while excluding it from the bundle-type bundle-analysis charts because those visuals are specifically about the games/books/software bundle breakdown

Bundle pages:

- `/venue/bundles/games`
- `/venue/bundles/books`
- `/venue/bundles/software`

These routes read the typed JSON report produced by
`hb_library_viewer.current_bundles`.

- surface new-content-first summary pills while keeping overlap logic in Python
- show one venue category per page instead of mixing all bundle types into one screen
- let the sticky shell header carry the page title/subtitle while the route itself keeps only a compact stats strip instead of repeating a second large in-page heading block
- render a table-only tier comparison view for the selected bundle type
- surface the earliest saved bundle expiry in the page stats strip, show per-bundle countdown badges in the table, and mirror the selected bundle countdown inside the lower tier inspector when timing data is available from the saved bundle index
- let you click any populated tier cell to split the tier-analysis section into a scrollable comparison pane above and a persistent scrollable details pane below, with page-level scrolling paused while the split view is open so the table and inspector behave like separate panes instead of one page scrolling behind the other
- keep the selected bundle row pinned near the top of the upper pane when you open a tier so the bundle link and status remain visible while you read the lower details pane
- show the selected tier contents in one compact inspector, using dense inline KPI chips and marking titles that were introduced at the current step-up directly inside the owned/new lists instead of repeating them in a separate step-up callout
- surface per-title unlock prices, tracked MSRP values, and saved bundle-page descriptions inside the inspector so you can review value and synopsis details without leaving the viewer
- summarize tracked retail coverage, savings percentage, and value multiple for the selected tier whenever the saved bundle HTML includes MSRP metadata
- move refresh actions into **Command Center** instead of duplicating them on every bundle page
- use the bundle display title/type, per-item metadata, and tier overlap metrics already prepared by Python
- keep artifact-path debugging in **Command Center** and related tools instead of repeating those details on every current-sales route

Choice page:

- `/venue/choice`

This route reads the typed JSON report produced by
`hb_library_viewer.current_choice`.

- refreshes the saved current-month Choice report through **Command Center**
- compares the current Humble Choice lineup against the active library using backend title matching
- uses the sticky shell header plus a compact month/status strip instead of a second large in-page hero block
- shows a table-first game list with ownership status and matched library titles
- keeps artifact-path debugging in **Command Center** and related tools instead of repeating those details on the page

The legacy `/current-bundles` route now exists only as a compatibility shortcut
and immediately redirects to `/venue/bundles/games`.

Successful maintenance runs now keep the backend-provided structured summary in
view instead of collapsing everything into a generic success line, so the
Command Center can surface important artifact paths and compact result counts
directly from the typed API response details.

The **Schema** page now adds summary context for products and subproducts,
lets you focus the blueprint on products, subproducts, or metadata, and adds a
library-metadata inspector sample alongside the product and subproduct JSON
views.

Server-side or NAS automation is a separate advanced workflow and should not be
treated as the default browser download path.

### Advanced local sync for software, videos, eBooks, and audiobooks

The **Software**, **Videos**, **E-books**, and **Audiobooks** pages now include an **Advanced local sync**
panel for managed downloads into a user-selected folder on the current device. On the denser media pages, that panel stays behind a compact route-level toggle until you need it.

- Uses the browser's local folder picker (File System Access API) to choose a target root.
- Asks the backend to build the managed-sync plan first, so shared Python rules now determine file types, filenames, and relative paths before the browser writes local files.
- The backend loader now normalizes legacy file-type metadata while reading `library_products.json`, keeping media-format labels more consistent across the viewer before planner-backed download actions run.
- When a managed-sync size policy such as **Smallest per title** or **Largest per title** is selected, the backend planner now also chooses that per-title file during planning instead of the browser deciding it locally first.
- Streams file bytes through `/api/downloads/stream` so the browser can save them locally without backend-side file storage.
- Processes a bounded set of files in parallel for better local-sync throughput; tune that worker count with `download.managed_sync_max_parallel_downloads` in `backend/config.yaml`, while the backend still spaces upstream stream starts so the repository's 0.5s minimum rate limit applies.
- Skips files that already exist when the local file size matches the expected size, and also reuses previously synced local payload sizes recorded in the managed-sync manifest when upstream metadata proves inconsistent.
- Preserves mismatched files and writes the new file with a numbered suffix instead of overwriting.
- Reuses a previously renamed numbered copy when it matches either the expected size or a previously synced local payload size, avoiding duplicate re-downloads on later sync runs.
- Writes a manifest to `.hb-library-viewer/sync-manifest.json` inside the selected folder and updates it progressively during the run so long syncs still leave usable history after an interruption; tune retained history with `download.managed_sync_manifest_history_entries` in `backend/config.yaml`.
- Shows live sync progress while the managed sync runs, including total titles/files in scope, reviewed counts, downloaded/skipped totals, and the current title/file being processed.
- Displays a final completion summary after the manifest is written so the last sync result is still visible even after progress reaches 100%.

This advanced mode is intended for Chromium-based browsers such as Chrome and
Edge. If the browser does not support the local folder picker, use the CLI
managed sync command instead.

Expired/expiring download links are highlighted in the UI. Adjust the warning
window with `viewer.link_expiry_warning_hours` in `backend/config.yaml`.

## External subproduct info pages

When Humble includes an outbound metadata link for a subproduct, the viewer now
surfaces it directly in the relevant subproduct tables, including Purchases,
Software, Videos, eBooks, Audiobooks, Categories, and the purchase detail drawer.

For offline enrichment workflows, the CLI can cache those external pages under
`subproduct_pages.base_dir` using a manifest plus one HTML file per URL. Cached
HTML is reused by default; set `subproduct_pages.redownload_existing: true` or
pass the CLI redownload flag when you want a fresh fetch. For debugging or
smoke tests, target a single title with `--subproduct-query ... --limit 1`
and use `--max-failures 1` to stop immediately if that one fetch fails. Full
library runs stop only after consecutive non-HTTP failures, so clusters of
stale old `401`/`403`/`404` pages do not abort an otherwise healthy scrape.

Once those pages are cached, metadata extraction can also be triggered from the
Command Center so refreshed summaries, authors, publishers, and descriptions
flow back into the Purchases, Software, Videos, eBooks, and Audiobooks pages without leaving the
viewer app.
