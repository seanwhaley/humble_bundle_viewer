# PRD — Viewer Portal UX Improvements

## Summary

This effort defines a focused UX improvement pass for the HB Library Viewer portal based on a live endpoint review of the current website. The goal is to preserve the existing analytical depth while making the app easier to scan, safer to operate, and more action-oriented across its highest-value workflows.

## Problem Statement

The viewer portal already exposes strong data and workflow coverage, but several routes still present too much information and too many controls at the same visual priority. As a result:

- urgent tasks can take too many steps to complete
- dense routes feel operationally correct but cognitively expensive
- some pages explain state without guiding the next action
- duplicate headings and route aliases reduce polish and clarity

The product needs a route-by-route UX pass that emphasizes prioritization, progressive disclosure, and workflow clarity rather than adding new surface area.

## Goals

1. Make high-priority actions easier to discover on every major route.
2. Reduce perceived complexity on the densest pages without removing power-user functionality.
3. Improve route-level consistency in headings, empty states, and interaction cues.
4. Keep the portal aligned with its local-first privacy and operations model.
5. Preserve existing analytical capabilities while making them easier to approach.

## Non-Goals

- redesigning the underlying library artifact schema
- converting the portal into a hosted multi-user experience
- introducing account-management or remote sync capabilities
- removing advanced workflows such as managed sync or rebuild tools
- replacing route-specific tables with entirely new navigation models in one pass
- undoing previously accepted information-architecture decisions for `Viewer Home`, `Sales Overview`, and the split current-sales route family

## Established decisions this effort must preserve

- `Viewer Home` remains the label and purpose of `/`.
- `Sales Overview` remains the label and purpose of `/venue/overview`.
- `Current sales` remains split into overview, choice, and dedicated bundle-type routes rather than being collapsed back into one page.
- `Viewer Home` should not reintroduce duplicate shortcut links to destinations already represented in the sidebar navigation.
- The compact filter treatment on `Sales Overview` should be preserved.
- The expiring-key urgency treatment should continue to use the accepted banner plus sidebar-badge model.
- The purchase-theme word cloud on `Viewer Home` is part of the accepted direction and should be refined rather than removed by default.

## Users and jobs-to-be-done

### Primary users

- a library owner triaging expiring keys or current sales
- a collector browsing owned eBooks, audiobooks, videos, or software
- a maintainer running setup, analysis, metadata, or rebuild tasks from the portal

### Core jobs

- “Help me identify what needs action right now.”
- “Help me understand what I own without scanning a wall of controls.”
- “Help me find the right route for the type of media or task I care about.”
- “Help me run powerful maintenance workflows without making every page feel like an admin console.”

## UX principles

1. **Urgency first**
   - action-needed states should be obvious and sortable to the top
2. **Progressive disclosure**
   - advanced options should remain available without overwhelming the default view
3. **Media-appropriate browsing**
   - eBook, audiobook, video, and software routes should emphasize cues users care about most
4. **Explicit interactivity**
   - clickable charts, tiles, and controls should advertise what happens
5. **Operational safety**
   - mutating or long-running commands should be visually distinct from read-only analysis

## Functional requirements

### 1. Cross-route consistency

The implementation must:

- remove or reduce duplicate heading patterns where the route title and the immediate section title repeat the same label
- ensure empty states provide a next useful action where possible
- keep route intent clear through concise intro copy and predictable section ordering
- prefer canonical routes over ambiguous aliases where duplicate destinations exist
- preserve accepted route labels and navigation groupings unless there is a stronger backward-compatible replacement

### 2. Viewer Home

The home route must:

- prioritize urgency, recent activity, and current-sales summary above deeper analytics
- make chart or word-cloud interactions explicit when they affect filters or navigation
- reduce visual competition among lower-priority analytical sections
- retain the current purchase-theme word cloud and urgency treatment as part of the primary summary experience
- avoid reintroducing duplicate links to current-sales destinations that are already represented in the main navigation

### 3. Current sales routes

The current-sales area must:

- present a concise executive summary before deeper charts and tables
- provide quick filters or shortcuts that support decisions such as all-new, expiring soon, and highest savings
- collapse or simplify explanatory chart guidance when it is not needed immediately
- keep subtype routes decision-oriented rather than purely descriptive
- preserve the split-route current-sales structure and the compact filter treatment already chosen for `Sales Overview`

### 4. Purchases

The purchases route must:

- keep ownership comprehension as the default primary mode
- reduce row-level visual noise from secondary actions where possible
- make item detail viewing easier and more stable during browsing
- preserve or improve state continuity for mode selection, filtering, and targeted navigation into related routes

### 5. Keys

The key routes must:

- support one-click triage for urgent and unresolved states
- default to sorting or grouping that highlights unresolved urgent rows first on the most action-oriented routes
- make provider-specific paths easier to understand on `Non-Steam`
- keep expiring-key behavior aligned across nav badge, overview/banner treatment, and table defaults

### 6. Software and media routes

The software and media routes must:

- reduce flat control density by separating browsing from advanced execution flows when appropriate
- make variant or format selection easier to understand, especially on `Software`
- emphasize media-appropriate metadata for discovery when available
- preserve powerful filtering and bulk operations without letting them dominate the initial reading order

### 7. Tools routes

`Setup`, `Command Center`, and `Schema` must:

- distinguish safe, read-only, mutating, and advanced workflows visually
- reduce the default prominence of advanced parameters when they are not required
- expose command purpose, expected outputs, and latest run context clearly
- maintain explicit local-first language around config, artifacts, and browser-managed downloads

## Acceptance criteria

### Route behavior and presentation

- major routes present one clear route heading with non-duplicative supporting headings
- the densest routes no longer show all advanced controls at the same priority by default
- empty-state routes provide at least one clear follow-up action when relevant
- urgent key workflows can be narrowed with dedicated shortcuts rather than only generic filtering
- route improvements do not regress the accepted current-sales split, naming, or Viewer Home de-duplication decisions

### Interaction clarity

- any interactive chart, tile, or visual summary has a visible affordance or helper text explaining the action
- row-level actions on dense tables are calmer and easier to parse than the current baseline

### Workflow clarity

- `Software` clearly separates browsing, browser download, and managed sync concerns
- `Command Center` groups commands by intent and risk level
- current-sales routes lead with summary and decision support before deeper analysis

### Validation

- a browser route sweep confirms all major routes still render
- relevant frontend tests continue to pass
- frontend production build succeeds
- docs are updated alongside any implemented behavior changes

## Dependencies and assumptions

- existing backend contracts remain sufficient for the first UX pass unless a route-specific improvement proves otherwise
- metadata enrichment quality will affect how far discovery improvements can go on eBook, audiobook, and video routes
- current local-first constraints remain in force; secrets and signed URLs must stay out of frontend responses and logs

## Open questions

1. Should `current-bundles` remain a compatibility alias, and if so, which canonical current-sales route should it redirect to without muddying the split-route model?
2. Which dense routes benefit most from tabs versus collapsible advanced sections?
3. Which media metadata fields are already dependable enough to promote into primary browsing cues?
4. How much route state should be preserved in the URL for purchases, keys, and media browsing?

## Suggested execution slices

1. **Cross-route polish**
   - heading cleanup, empty-state next actions, alias decisions
2. **Urgency and triage**
   - keys routes and any urgency-led first-screen ordering
3. **Dense route simplification**
   - software, media routes, and command center progressive disclosure
4. **Current sales refinement**
   - summary-first ordering, quick filters, and chart-help simplification
5. **Viewer Home final pass**
   - first-screen prioritization and explicit interactive guidance

## Validation plan

- render and review the impacted routes locally in the browser
- run targeted frontend tests for changed selectors, routes, or components
- run `npm run build` in `frontend/`
- update `docs/guides/viewer-portal.md` when user-visible behavior changes
- update this work effort `status.md` as implementation progresses
