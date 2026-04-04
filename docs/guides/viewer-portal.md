# Viewer Portal Guide

This guide summarizes the current viewer portal behavior for setup, maintenance, styling, and browser storage.

## Home route (`/`)

Home is now the single canonical homepage route. It starts with the library currently in scope, then surfaces live bundle and Current Choice status before opening into deeper analytics.

### Home behavior

- The top of the page starts with **Library in scope**, including summary tiles, library freshness, and download-expiry status for the current purchase scope
- A dedicated **Filters** action owns homepage-level search, category, platform, key/download toggles, purchase date range, and live bundle card visibility
- The next section highlights **Games**, **Books**, **Software**, and **Current Choice** cards so the current sales state is visible without leaving the homepage
- A dedicated **Deep dive** toggle keeps category, platform, publisher, key-type, and time-trend analysis out of the first scan until you ask for it
- Interactive summary tiles and chart sections call out when they narrow the current homepage scope
- If no active library file is available yet, Home still loads the live current-sales section and a startup helper state instead of hard-gating the entire route
- The shared active-library context strip is hidden on Home because the route now owns that summary directly
- The temporary `/preview/viewer-home` route has been removed; the homepage now lives only at `/`

## Purchases route (`/library/purchases`)

The Purchases route now uses the same summary-first shell as the rest of the viewer while keeping the purchase hierarchy as the default way to browse your library.

### Purchases behavior

- The route opens with a compact **Purchases workspace** summary that emphasizes what is in scope before the table begins
- The shared layout-level active-library strip stays hidden on this route so the purchases workspace owns the scope summary directly, similar to Home
- A dedicated **Filters** action now lives in the upper-right page header, starts collapsed by default, and no longer takes a permanent full-width slot above the table
- **Purchases** remains the primary mode for understanding what each bundle or order contains
- **Included-item analysis** is available as a secondary mode through a compact view-mode switch when you need row-level inspection across contained titles
- Opening **View** on a purchase expands into a full-width detail view instead of a cramped side sheet, then returns cleanly to the purchases table with **Back to purchases**
- Purchase actions still deep-link into the dedicated downloads and key routes so inspection can move directly into fulfillment workflows

## Current sales routes

The current-sales family stays split into `Sales Overview`, `Current Choice`, and dedicated bundle-type routes.

### Sales Overview behavior (`/sales`)

- The compact content filter remains the primary scope control instead of expanding into a larger dashboard-level filter wall
- A **Decision shortcuts** section summarizes all-new bundles, partial overlap, expiring-soon bundles, and deep discounts before the deeper charts
- Shortcut buttons deep-link directly to `Game bundles`, `Book bundles`, or `Software bundles` with the matching quick view pre-applied
- The chart-reading guide is collapsed behind **How to read the charts** so the first screen stays decision-oriented

### Current sales subtype behavior

- `Game bundles`, `Book bundles`, and `Software bundles` now support quick views for **All bundles**, **All-new**, **Partial overlap**, **Expiring ≤ 7 days**, and **90%+ savings**
- `Current Choice` now supports quick views for **All games**, **New to you**, and **Already owned**
- `Game Bundles`, `Book Bundles`, and `Software Bundles` now live at `/sales/games`, `/sales/books`, and `/sales/software`
- `Current Choice` now lives at `/sales/choice`

## Setup route (`/setup`)

The Setup route supports two workflows:

- **Capture new library** — run a fresh capture using the current `_simpleauth_sess` value
- **Use existing library file** — point the viewer at a previously captured `library_products.json`

### Setup behavior

- Returning users who already have `humble.libraryPath` stored see a compact **Last used library** note instead of the full orientation card grid
- The active `library_products.json` path is synced into `humble.libraryPath` so Setup can reopen with the remembered file already filled in
- Setup mode is persisted in `localStorage`
- The **Save Folder** field includes a **Select folder…** action that asks the local backend to open the native folder picker and fill the selected path when the viewer is running on your desktop
- A compact **Select folder…** shortcut remains visible even if Setup reopens in **Use existing library file** mode, so you can jump straight back into choosing a new capture destination
- **Use existing library file** can point the viewer at any local `library_products.json` path, not just the default artifact folders
- Download preference inputs (`platforms`, `fileTypes`, `sizePolicy`) are persisted in `localStorage` under the `humble.setup.download.*` namespace
- The session cookie is used only for the active capture request and is not persisted
- After a successful capture or file selection, a post-success panel appears with direct links to:
  - Command Center
  - Schema
  - Home
- The post-success panel includes a short automatic redirect countdown to Home that can be canceled

## Command Center route (`/command-center`)

The Command Center exposes viewer-safe maintenance workflows.

### Command Center behavior

- Advanced path and option inputs are persisted in `localStorage` under the `humble.commands.*` namespace
- Each Advanced Options disclosure remembers whether it is open for the current tab session using `humble.session.advancedOptions.*`
- Each advanced-options group provides a **Reset to defaults** action
- Recent command result state is persisted for the current tab session using `sessionStorage`
- A compact **Start here** summary links directly to **Guided workflows**, **Rebuilds and exports**, and **Metadata enrichment** so the first screen stays scan-friendly
- The redundant Setup shortcut card has been removed from the Guided Workflows section; use the sidebar or the compact inline Setup link instead
- The distinction between **Rebuild order models** and **Generate order models** is called out directly in the card copy
- The current bundle refresh still checks the live bundles index every run, but it now reuses saved active bundle page details for unchanged live bundle URLs instead of redownloading every bundle page on every refresh
- Current bundle report status still uses an age-based freshness window, while current Choice status stays fresh through the saved month and only turns stale after that month is no longer current

## Software route (`/library/software`)

The Software route keeps the table as the primary focus, drops the shared active-library strip, and uses a route-owned summary pane for software-specific KPIs and actions.

### Software behavior

- A dedicated **Filters** action now lives in the upper-right page header so route-level filtering stays in the same place as `Home` and `Purchases`
- The first pane now stays focused on software-specific scope, current selection, and variant coverage instead of repeating whole-library totals
- Filters, bulk browser downloads, and advanced local sync open on demand instead of all rendering at the top of the page at once
- Bulk variant downloads scope the variant picker to the currently selected rows so large software libraries do not flood the selector with unrelated file types
- The route still uses the browser's normal download flow for direct downloads and the managed sync panel for folder-based local sync

## Media library routes (`/library/ebooks`, `/library/audiobooks`, `/library/videos`)

The media routes now follow the same scan-first pattern as `Software`, with the table and metadata staying primary while the first pane owns type-specific KPIs and the heavier route-level controls open on demand.

### Media route behavior

- Each route starts with a compact summary pane that stays focused on media-specific scope, current selection, and format coverage instead of repeating whole-library totals
- A dedicated **Filters** action now lives in the upper-right page header for `eBooks`, `Audiobooks`, and `Videos` so the shared route-level control stops moving between pages
- Filters, bulk browser downloads, and managed sync stay behind explicit toggles instead of rendering as one flat control wall
- Bulk format pickers scope themselves to the currently selected rows so the route-level selectors stay relevant to the active selection
- `eBooks` keeps official product links and cached viewer-page links visible in the table while the heavier route-level controls stay collapsed until needed

## Other downloads route (`/library/other-downloads`)

The other-downloads route now follows the same scan-first pattern as the media pages instead of dropping straight into a full always-open filter wall or repeating whole-library context that belongs elsewhere.

### Other downloads behavior

- The route opens with a compact summary pane that explains this page is only for direct downloads not already covered by `Software`, `Videos`, `eBooks`, or `Audiobooks`
- The shared active-library strip no longer appears here; the route only surfaces KPIs relevant to this direct-download bucket
- The shared **Filters** action now lives in the upper-right page header, matching the rest of the modernized browsing routes
- Route-level filters are tucked behind that **Filters** toggle so the table remains the first thing to scan
- Download actions use semantic warning/error styling when a link is expiring or already expired, instead of older raw palette classes
- Empty-state suggestions still point back to the dedicated media/software routes when this bucket has nothing left to inspect

## Key inventory routes (`/library/steam-keys`, `/library/other-keys`, `/library/expiring-keys`)

The key inventory pages now follow the same summary-first shell and upper-right filter placement used by the other modernized browsing routes, without reusing the shared active-library pane.

### Key inventory behavior

- A dedicated **Filters** action now lives in the upper-right page header across `Steam`, `Other Keys`, and `Expiring` key routes
- `Steam`, `Other Keys`, and `Expiring` now keep their route-specific KPIs inside the first pane instead of splitting them between a hero card and a second summary strip
- `Steam` and `Other Keys` open with compact summary panes so scope, reveal work, and redeem context are visible before the table begins
- Quick scope buttons still stay close to the summary content so triage pivots remain one click away
- Key tables remain the primary surface; filters and secondary breakdowns only open when needed

## Expiring keys route (`/library/expiring-keys`)

The expiring-keys route now follows the same summary-first shell as the other modernized routes instead of opening with a one-off urgency banner.

### Expiring keys behavior

- The route opens with a compact deadlines-first summary pane covering total triage rows, still-actionable keys, reveal-sensitive work, and expired-reference rows
- **Focus open actions** remains the fastest way to narrow the table to keys that can still be claimed
- Quick scope buttons still pivot between **All**, **Needs action**, **Expired**, **Next 7 days**, **Next 30 days**, and **Needs reveal**
- Route filters now open from the shared upper-right **Filters** action and render inside a compact filter card so the triage table remains the main surface

## Schema route (`/schema`)

The Schema route explains the normalized library shape that powers both the viewer and the standalone validation tools.

### Schema behavior

- The page opens with the same active-library context strip used across the viewer so you can confirm which `library_products.json` file is in scope
- A two-mode toggle switches between **Blueprint** for relationship-level structure and **Inspector** for live JSON samples from the current library
- A compact **How to use this page** panel explains when to stay in-browser versus when to export a schema file from Command Center
- Focus buttons let you isolate **All branches**, **Products**, **Subproducts**, or **Metadata** when the full structure is too noisy for a first scan

## Styling and UI conventions

The viewer now uses semantic tokens, shared primitives, and a consistent route-shell hierarchy across homepage, purchases, current sales, setup, maintenance, media, and schema workflows.

Read:

- [`../development/styling-conventions.md`](../development/styling-conventions.md)
- [`../development/browser-storage-policy.md`](../development/browser-storage-policy.md)

## Operational notes

- Browser storage is used only for UI-layer convenience state, never for credentials or backend-owned artifacts
- `library_products.json`, generated models, schemas, and cached pages remain filesystem/backend artifacts
- If browser storage is unavailable, the UI falls back to in-memory state
