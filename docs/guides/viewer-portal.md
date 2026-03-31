# Viewer Portal Guide

This guide summarizes the current viewer portal behavior for setup, maintenance, styling, and browser storage.

## Viewer Home route (`/`)

Viewer Home keeps the first screen focused on the buyer view before the heavier inventory analysis opens up.

### Viewer Home behavior

- The top of the page prioritizes current sales status, core scope metrics, recent purchases, and the purchase-theme cloud before deeper breakdowns
- A dedicated **Deep dive** toggle keeps category, platform, publisher, key-type, and time-trend analysis out of the first scan until you ask for it
- Interactive summary tiles and chart sections now call out when they narrow the current dashboard scope
- The route still avoids duplicating current-sales destination links that already exist in the sidebar navigation

## Current sales routes

The current-sales family stays split into `Sales Overview`, `Current Choice`, and dedicated bundle-type routes.

### Sales Overview behavior (`/venue/overview`)

- The compact content filter remains the primary scope control instead of expanding into a larger dashboard-level filter wall
- A **Decision shortcuts** section summarizes all-new bundles, partial overlap, expiring-soon bundles, and deep discounts before the deeper charts
- Shortcut buttons deep-link directly to `Game bundles`, `Book bundles`, or `Software bundles` with the matching quick view pre-applied
- The chart-reading guide is collapsed behind **How to read the charts** so the first screen stays decision-oriented

### Current sales subtype behavior

- `Game bundles`, `Book bundles`, and `Software bundles` now support quick views for **All bundles**, **All-new**, **Partial overlap**, **Expiring ≤ 7 days**, and **90%+ savings**
- `Current Choice` now supports quick views for **All games**, **New to you**, and **Already owned**
- The legacy `/current-bundles` alias now redirects to `Sales Overview` instead of dropping directly into one bundle subtype

## Setup route (`/setup`)

The Setup route supports two workflows:

- **Capture new library** — run a fresh capture using the current `_simpleauth_sess` value
- **Use existing library file** — point the viewer at a previously captured `library_products.json`

### Setup behavior

- Returning users who already have `humble.libraryPath` stored see a compact **Last used library** note instead of the full orientation card grid
- Setup mode is persisted in `localStorage`
- Download preference inputs (`platforms`, `fileTypes`, `sizePolicy`) are persisted in `localStorage` under the `humble.setup.download.*` namespace
- The session cookie is used only for the active capture request and is not persisted
- After a successful capture or file selection, a post-success panel appears with direct links to:
  - Command Center
  - Schema
  - Overview
- The post-success panel includes a short automatic redirect countdown to Overview that can be canceled

## Command Center route (`/commands`)

The Command Center exposes viewer-safe maintenance workflows.

### Command Center behavior

- Advanced path and option inputs are persisted in `localStorage` under the `humble.commands.*` namespace
- Each Advanced Options disclosure remembers whether it is open for the current tab session using `humble.session.advancedOptions.*`
- Each advanced-options group provides a **Reset to defaults** action
- Recent command result state is persisted for the current tab session using `sessionStorage`
- A compact **Start here** summary links directly to **Guided workflows**, **Rebuilds and exports**, and **Metadata enrichment** so the first screen stays scan-friendly
- The redundant Setup shortcut card has been removed from the Guided Workflows section; use the sidebar or the compact inline Setup link instead
- The distinction between **Rebuild order models** and **Generate order models** is called out directly in the card copy

## Software route (`/software`)

The Software route keeps the table as the primary focus and moves heavier controls behind compact toggles.

### Software behavior

- Filters, bulk downloads, and managed sync open on demand instead of all rendering at the top of the page at once
- Bulk variant downloads scope the variant picker to the currently selected rows so large software libraries do not flood the selector with unrelated file types
- The route still uses the browser's normal download flow for direct downloads and the managed sync panel for folder-based local sync

## Media library routes (`/ebooks`, `/audiobooks`, `/videos`)

The media routes now follow the same scan-first pattern as `Software`, with the table and metadata staying primary while heavier route-level controls open on demand.

### Media route behavior

- Each route starts with a compact summary card that explains the route’s intended first action before the data table begins
- Filters, bulk browser downloads, and managed sync stay behind explicit toggles instead of rendering as one flat control wall
- Bulk format pickers scope themselves to the currently selected rows so the route-level selectors stay relevant to the active selection
- `Ebooks` keeps official product links and cached viewer-page links visible in the table while the heavier route-level controls stay collapsed until needed

## Schema route (`/structure`)

The Schema route explains the normalized library shape that powers both the viewer and the standalone validation tools.

### Schema behavior

- The page opens with the same active-library context strip used across the viewer so you can confirm which `library_products.json` file is in scope
- A two-mode toggle switches between **Blueprint** for relationship-level structure and **Inspector** for live JSON samples from the current library
- A compact **How to use this page** panel explains when to stay in-browser versus when to export a schema file from Command Center
- Focus buttons let you isolate **All branches**, **Products**, **Subproducts**, or **Metadata** when the full structure is too noisy for a first scan

## Styling and UI conventions

The viewer now uses semantic tokens and shared primitives for the maintenance and setup workflows.

Read:

- [`../development/styling-conventions.md`](../development/styling-conventions.md)
- [`../development/browser-storage-policy.md`](../development/browser-storage-policy.md)

## Operational notes

- Browser storage is used only for UI-layer convenience state, never for credentials or backend-owned artifacts
- `library_products.json`, generated models, schemas, and cached pages remain filesystem/backend artifacts
- If browser storage is unavailable, the UI falls back to in-memory state
