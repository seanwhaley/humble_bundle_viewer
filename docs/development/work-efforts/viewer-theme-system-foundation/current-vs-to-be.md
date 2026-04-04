# Viewer theme system foundation — current vs. target

## Audience and purpose

This document is for maintainers implementing a site-wide theming system for the viewer portal.

It captures:

- the current frontend styling state
- the target architecture for a Tailwind-compatible theme system
- the staging required to ship the first named theme (`hb-dark`, representing the current dark mode) while preparing the site for additional themes later

## Current state

### What already exists

The frontend already has part of the correct foundation:

- `frontend/tailwind.config.js` maps semantic Tailwind utilities to CSS variables such as `--background`, `--card`, `--primary`, and status tokens
- `frontend/src/styles/main.css` defines those variables globally in `:root`
- shared UI primitives exist for core elements such as `Card`, `Badge`, `Button`, `Input`, and `Tooltip`
- charts already use `frontend/src/components/charts/theme.ts` to resolve CSS-token values into runtime chart colors
- persistent UI state infrastructure already exists via `frontend/src/hooks/usePersistentState.ts`

### What is missing

The frontend does not yet have a complete theme system.

Current gaps:

1. only one unnamed token set exists
   - `main.css` defines a single dark palette in `:root`
   - there is no named theme registry such as `data-theme="hb-dark"`
2. there is no app-level theme provider or persisted theme preference
   - `frontend/src/main.tsx` does not wrap the app in theme state
   - the document root is not switched by a theme attribute or class
3. repeated design-role decisions still live in route files
   - many routes still choose panel strength or surface treatment locally using class strings such as `bg-card/60`, `bg-card/80`, `bg-muted/30`, custom disclosure styles, and route-local table/filter shells
4. shared primitives centralize base styling, but not enough role variants
   - `frontend/src/components/ui/card.tsx` centralizes the default card shell, but not common roles such as section card, filter panel, interactive summary card, or disclosure panel
5. page-level style consistency is enforced manually instead of structurally
   - visually similar elements across pages can drift because routes assemble the same concept with different class combinations
6. some runtime visuals still assume a fixed dark presentation
   - for example, ECharts usage in `frontend/src/app/routes/Structure.tsx` still passes `theme="dark"`

## Why the current model is insufficient

The current model centralizes tokens, but not enough design decisions.

That means:

- Tailwind utilities can already respond to theme-token changes in principle
- but routes still encode too many visual choices directly
- adding a new theme later would require auditing route files again instead of changing a theme definition and a small number of shared variants

This prevents the site from behaving like a true multi-theme design system.

## Target state

## Theme model

The site should support a named theme architecture built on semantic CSS variables.

Target properties:

- themes are applied at the root via a stable attribute or class, preferably `data-theme`
- the current dark mode is extracted into the first official theme: `hb-dark`
- all Tailwind semantic utilities continue to resolve through CSS variables
- future themes can be added by defining additional token scopes, not by editing route-level classes

Example target shape:

- `:root[data-theme="hb-dark"]` → current dark mode values
- future themes might include `hb-light`, `hb-midnight`, `hb-sepia`, etc.

## Design-system model

Shared styling should be enforced through component and pattern roles.

Target properties:

- `Card` exposes approved role variants instead of requiring routes to choose opacity or shell treatment inline
- repeated cross-page shells are promoted into shared primitives or wrapper components
- routes assemble content using shared roles instead of inventing page-specific chrome
- page-specific styling is limited to content semantics such as emphasis (`font-semibold`, `italic`, etc.) and layout needs that are not reusable patterns

## Route-level rule

No route should define a unique visual system for common UI roles.

This applies to:

- card shells
- filter panels
- disclosure surfaces
- summary/metric cards
- table header treatments
- neutral badges/pills
- section framing

Acceptable route-level differences are limited to:

- content hierarchy
- text emphasis such as bold, italic, code, or list formatting
- layout choices required by the page’s information architecture
- domain-specific status meaning expressed through approved semantic variants

## Recommended staging

## Stage 1 — theme contract and inventory

Define the semantic contract before moving visuals.

Deliverables:

- document the approved theme token set used by the viewer
- distinguish base tokens from role tokens
- inventory repeated cross-page surface roles that currently drift
- identify shared patterns that must be promoted out of routes

Likely files:

- `frontend/tailwind.config.js`
- `frontend/src/styles/main.css`
- `frontend/src/components/ui/card.tsx`
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/components/ui/table.ts`
- `frontend/src/components/charts/theme.ts`
- `docs/development/styling-conventions.md`

## Stage 2 — extract the current dark mode into the first named theme

Create the first official theme without changing the site’s intended appearance.

Deliverables:

- introduce `hb-dark` as the named theme that matches the current dark presentation
- move `:root` token definitions into a named theme scope
- keep Tailwind semantic utilities mapped to CSS variables
- add any missing tokens needed to avoid opacity-based or page-local design decisions

Important constraint:

- the initial rollout ships only `hb-dark`
- visual regressions should be minimal because this stage is architectural, not a redesign

## Stage 3 — app-level theme runtime and persistence

Add the runtime infrastructure for theme selection, even though only one theme ships initially.

Deliverables:

- add a theme provider or equivalent app-level state wrapper
- persist selected theme with `usePersistentState` or a thin theme-specific wrapper
- apply the active theme to the root element before or at initial render
- establish a theme registry/API that supports additional themes later

Implementation note:

- a settings surface may show only one theme initially, or the selector can remain internal until a second theme exists
- regardless of UI timing, the runtime contract should be complete enough that future themes do not require architectural rework

## Stage 4 — shared role variants and cross-page pattern components

Centralize design decisions that currently live in route files.

Deliverables:

- expand `Card` into role-based variants similar to `Badge`
- centralize reusable surface roles such as section cards, filter panels, interactive summary cards, and disclosure shells
- centralize remaining repeated table, badge, and panel styling
- create wrapper components for cross-page patterns where repeated roles are more than simple variants

Candidate shared abstractions:

- `RouteIntroCard`
- `SectionCard`
- `FilterPanelCard`
- `SummaryCard`
- `DisclosureCard`
- `StatTile`
- shared table header and inset surface helpers

## Stage 5 — migrate routes to shared roles

Remove route-owned visual decisions.

Deliverables:

- update all viewer routes to use shared variants/components for common UI roles
- remove page-local surface classes that duplicate system roles
- keep route code focused on content, hierarchy, and page-specific composition

Primary migration scope:

- `frontend/src/app/routes/**`
- route-adjacent shared components under `frontend/src/components/**`

## Stage 6 — runtime visuals and charts

Ensure non-Tailwind and runtime-rendered visuals also obey the active theme.

Deliverables:

- keep chart colors derived from CSS-token values
- remove hard-coded assumptions such as a fixed ECharts dark theme where possible
- ensure tooltips, overlays, and visualization surfaces render correctly under the active theme contract

## Stage 7 — additional themes (follow-on work)

Only after the site is structurally theme-ready should additional themes be added.

Deliverables:

- add one new named theme at a time
- verify all shared roles render correctly without route-level overrides
- avoid theme-specific route exceptions unless they become formal shared variants

## Success criteria

The effort is successful when:

- the site ships a named first theme, `hb-dark`, representing the current dark mode
- the frontend has a theme runtime contract that supports future theme switching without route rewrites
- cross-page elements with the same role use the same shared variant/component everywhere
- route files no longer invent unique visual systems for cards, panels, tables, or other repeated UI roles
- page-specific styling is limited to content emphasis and necessary layout differences
- adding a second theme is primarily a token-definition and QA exercise, not a full route restyling project

## Validation expectations

Implementation work under this effort should validate with:

- `npm run build`
- relevant frontend tests under `frontend/tests/**`
- browser smoke checks on the major route families
- targeted visual review of shared roles across multiple routes
- updated docs where shared styling rules or theme usage change
