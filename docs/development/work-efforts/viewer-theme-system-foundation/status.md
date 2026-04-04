# Status — viewer theme system foundation

## Current status

- State: implementation and validation complete; future-theme guidance follow-up remains
- Owner: Copilot-assisted maintainer workflow
- First created: 2026-04-01
- Scope: establish a real theme system for the viewer portal, shipping the current dark mode as `hb-dark` while preparing the site for future theme selection

## Why this effort exists

The frontend already uses semantic Tailwind tokens, but repeated design-role decisions still live in route files. That makes cross-page consistency fragile and future theme support more expensive than it should be.

This effort tracks the work needed to:

- extract the current dark mode into a named theme
- centralize shared visual roles
- remove route-owned common surface styling
- prepare the application for future additional themes

## Staged execution plan

### Stage 1 — theme contract and inventory

Status: completed

Tasks:

- [x] define the approved theme token taxonomy for the viewer
- [x] define the root theme application mechanism (`data-theme` or equivalent)
- [x] inventory repeated cross-page UI roles that need shared ownership
- [x] identify existing route-local style patterns that must be replaced by shared roles

### Stage 2 — first named theme (`hb-dark`)

Status: completed

Tasks:

- [x] convert the current dark mode token set into a named theme scope
- [x] add any missing semantic tokens needed to avoid route-local visual decisions
- [x] verify no intentional visual regression beyond consistency fixes

### Stage 3 — runtime provider and persistence

Status: completed

Tasks:

- [x] add a theme provider or equivalent root runtime wrapper
- [x] persist the selected theme in browser storage with graceful fallback behavior
- [x] apply the active theme consistently at startup
- [x] decide whether the initial one-theme selector is public immediately or remains internal until a second theme exists

### Stage 4 — shared role variants and wrappers

Status: completed

Tasks:

- [x] expand `Card` into approved shared role variants
- [x] centralize shared filter, disclosure, summary, and table roles
- [x] create wrapper components where reusable page patterns are larger than a single primitive variant

### Stage 5 — route migration

Status: completed

Tasks:

- [x] migrate reference routes first (`Overview`, `LibrarySetup`, `CommandCenter`)
- [x] migrate media/download routes
- [x] migrate current-sales routes
- [x] migrate purchases and schema/maintenance routes
- [x] remove obsolete route-local styling helpers once replacements are complete

### Stage 6 — runtime visuals and follow-on theme readiness

Status: in progress

Tasks:

- [x] align chart and visualization rendering with the active theme contract
- [x] remove remaining fixed-dark assumptions
- [ ] document how future themes should be added without route rewrites

## Validation checklist

Implementation work under this effort should validate with:

- [x] `npm run build`
- [x] relevant frontend tests under `frontend/tests/**`
- [x] browser smoke checks on reference routes and each major route family
- [x] targeted cross-page visual review of shared roles
- [x] updated docs for theme/styling behavior

## Implementation notes

Completed implementation highlights:

- added named theme registry/runtime under `frontend/src/app/theme/**`
- wired persistent theme application through the root app entry
- expanded shared primitive ownership in `Card`, `Badge`, and table helpers
- created centralized role definitions in `frontend/src/styles/roles.ts`
- migrated reference, media/download, current-sales, purchases, schema, and workflow routes away from repeated opacity-tuned shells
- aligned chart shells and chart token resolution with the active theme contract
- added a work-effort-scoped audit prompt for future regression passes

Remaining follow-up:

- decide whether to expose additional public theme choices immediately when a second theme lands

## Validation notes

- `frontend`: `npm run build` passed on Windows
- `frontend`: `npm test` passed with 45 test files and 142 tests
- browser smoke on `http://127.0.0.1:5173/` confirmed the themed shell, theme selector, and route mounting for `/`, `/setup`, `/command-center`, `/sales`, and `/library/other-downloads`
- the smoke environment did not include the viewer backend, so data-dependent routes remained at `Loading view…`; this was treated as shell-and-mount verification rather than end-to-end API validation

## Open decisions

- Should the initial one-theme selector be visible to users immediately, or should the runtime/theme registry land first with the UI exposed only once a second theme exists?
- Which card-role variants belong directly in `Card`, and which should become higher-level shared wrappers?
- Do we need additional semantic surface tokens beyond the current `card` / `muted` split to eliminate opacity-driven route decisions cleanly?

## Notes for implementation

- The initial goal is not to redesign the site; it is to formalize the current dark presentation as a durable, shared theme system.
- No page should keep a unique visual system for common UI roles.
- Route-level differences should be limited to content structure, layout, and typographic emphasis.
- Future themes should be primarily token additions plus QA, not another site-wide restyling exercise.
