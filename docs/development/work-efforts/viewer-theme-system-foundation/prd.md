# PRD — viewer theme system foundation

## Summary

Create a Tailwind-compatible theming architecture for the viewer portal that:

- preserves the current dark presentation as the first official theme (`hb-dark`)
- centralizes shared design decisions across the site
- prepares the application for future user-selectable themes without requiring per-route restyling

This effort is about establishing a real theme system, not just cleaning up isolated class strings.

## Audience

Primary audience:

- maintainers implementing frontend theming and shared UI roles
- reviewers validating that route-level chrome is being removed in favor of shared abstractions

Secondary audience:

- future contributors adding new themes or new route surfaces

## Problem statement

The frontend already uses semantic Tailwind tokens backed by CSS variables, but the current implementation is not yet a complete theme system.

Specific problems:

- only one unnamed dark token set exists
- there is no root theme registry or persistent theme selection state
- common visual roles are not centralized enough in shared components
- routes still make too many local design decisions for cards, panels, filters, disclosures, and similar repeated surfaces
- future themes would require re-auditing route files because the design system contract is too weak

## Goals

1. ship the current dark mode as a named first theme, `hb-dark`
2. make the frontend theme-ready for future user-selectable themes
3. ensure shared UI roles are visually consistent across all routes
4. reduce route-owned styling so pages do not create unique visual systems
5. keep Tailwind compatibility through semantic utilities backed by CSS variables

## Non-goals

This effort does not initially require:

- shipping a second public theme in the first implementation slice
- redesigning route content hierarchy or information architecture
- introducing route-specific theme exceptions
- replacing Tailwind with another styling system
- making every page visually identical in layout or typography

## Product requirements

## R1 — named theme contract

The frontend must support a named theme contract applied at the document root.

Requirements:

- the first shipped theme is `hb-dark`
- theme definitions are based on semantic CSS variables
- Tailwind semantic utilities remain the primary styling API for components and routes
- future themes can be added without editing route files for common UI roles

## R2 — persistent theme runtime

The frontend must support persisted theme selection state.

Requirements:

- theme state is initialized at app startup
- the active theme is applied to the root document consistently
- theme preference persists across reloads when storage is available
- storage failures degrade gracefully without breaking UI rendering

## R3 — shared component role variants

Common UI primitives must expose approved visual roles.

Requirements:

- `Card` must define shared variants for repeated panel roles instead of relying on repeated route-level class strings
- related shared primitives/helpers must cover recurring roles for badges, tables, disclosures, filter panels, and summary cards where appropriate
- routes must select approved roles rather than declaring local surface-strength decisions

## R4 — route migration discipline

Routes must use shared system roles for common UI elements.

Requirements:

- no route may define a unique card/panel visual system for standard UI roles
- cross-page elements with the same role must render from the same shared primitive/helper/wrapper
- route-specific styling is limited to content emphasis, layout, and truly one-off semantics that do not represent reusable surface roles

## R5 — runtime visualization alignment

Theme application must extend to runtime-rendered visuals.

Requirements:

- chart/theme helpers continue to resolve colors from semantic tokens
- fixed dark assumptions are removed or isolated behind the same theme contract
- visualization and overlay surfaces should visually align with the active theme

## R6 — docs and testing coverage

The effort must leave behind clear documentation and validation guidance.

Requirements:

- update `docs/development/styling-conventions.md` when shared role rules or token guidance change
- document the theme model and supported runtime behavior in relevant viewer docs when implementation lands
- add or update frontend tests for theme provider behavior and shared variants where practical

## Staging and implementation slices

## Slice A — define the theme system contract

Purpose:

- formalize the vocabulary before changing files broadly

Scope:

- approve the root theme mechanism (`data-theme` or equivalent)
- define the token taxonomy required for the viewer
- define approved shared UI roles

Exit criteria:

- maintainers can name the first theme and list the shared surface roles to centralize

## Slice B — implement the first named theme (`hb-dark`)

Purpose:

- convert the current dark mode into a formal named theme without changing its intended appearance

Scope:

- theme token scopes in CSS
- any Tailwind config additions needed for semantic coverage
- chart/runtime token compatibility review

Exit criteria:

- the app renders with `hb-dark` as the active named theme
- no visible regression relative to the current dark presentation beyond intentional consistency fixes

## Slice C — add theme runtime and persistence

Purpose:

- make the app theme-aware even before a second theme ships

Scope:

- theme provider or equivalent root state
- storage-backed selected theme value
- root document theme application
- optional initial settings UI or internal-only wiring

Exit criteria:

- theme selection infrastructure exists and is stable with one supported theme

## Slice D — centralize shared roles

Purpose:

- move repeated design choices out of routes

Scope:

- `Card` variants
- shared filter/disclosure/summary/table roles
- shared wrappers where variants alone are insufficient

Exit criteria:

- repeated cross-page patterns no longer depend on route-local class duplication

## Slice E — route migration

Purpose:

- apply the shared system across the viewer

Scope:

- migrate route families in manageable batches
- remove legacy route-local surface decisions

Suggested migration order:

1. shared UI primitives and helpers
2. overview/setup/command-center reference routes
3. download/media routes
4. current-sales routes
5. purchases and schema/maintenance routes

Exit criteria:

- routes use shared roles for common UI concepts
- route-specific visual drift is materially eliminated

## Slice F — prepare for additional themes

Purpose:

- ensure the first-theme implementation truly supports future theme expansion

Scope:

- verify a second theme could be added through token sets and limited shared-role review
- document constraints for future theme additions

Exit criteria:

- future theme work is primarily additive, not architectural rework

## Impacted files and systems

Expected implementation touchpoints include:

- `frontend/tailwind.config.js`
- `frontend/src/styles/main.css`
- `frontend/src/main.tsx`
- `frontend/src/hooks/usePersistentState.ts` or a theme-specific wrapper built on it
- `frontend/src/components/ui/card.tsx`
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/components/ui/table.ts`
- `frontend/src/components/charts/theme.ts`
- `frontend/src/components/charts/*.tsx`
- `frontend/src/app/routes/**`
- relevant frontend tests under `frontend/tests/**`
- `docs/development/styling-conventions.md`
- relevant viewer/frontend docs once implementation lands

## Acceptance criteria

The effort is complete when:

- `hb-dark` is implemented as the first named theme
- the app has a persistent root theme runtime compatible with future theme selection
- major repeated UI roles have shared variants or wrappers
- routes do not define unique common surface styles outside the shared system
- page-level differences are limited to layout and text emphasis rather than unique chrome
- implementation passes build/test/visual validation
- documentation reflects the new theme contract and styling rules

## Risks and mitigations

### Risk: premature route migration without shared roles

If routes are migrated before shared roles exist, class duplication will simply move around.

Mitigation:

- require shared role definitions before large route migration batches

### Risk: theme support that only changes colors, not design roles

If the effort stops at root token values, future themes will still be blocked by route-owned styling.

Mitigation:

- treat shared role centralization as part of the same effort, not optional cleanup

### Risk: runtime visuals lag behind the theme contract

Charts and visualizations may continue to assume dark defaults.

Mitigation:

- include charts/runtime surfaces in scope from the start

### Risk: selector UI ships before it is meaningful

A public theme picker with one theme may confuse users.

Mitigation:

- complete provider/runtime infrastructure now, but decide separately whether the one-theme selector is public immediately or stays internal until a second theme exists
