# Status -- Styling Centralization

## Status summary

- **State**: Implemented
- **Created**: 2026-03-29
- **Last updated**: 2026-03-29
- **Owner**: TBD

## Scope

Migrate the viewer portal from ad-hoc hardcoded Tailwind palette values to the semantic
token layer already defined in `tailwind.config.js`. Deliverables touch the two files that
define the token layer (`tailwind.config.js`, `main.css`), the three existing `ui/`
primitives (`button.tsx`, `input.tsx`, `tooltip.tsx`), two new shared components
(`card.tsx`, `badge.tsx`), and the two highest-impact routes (`CommandCenter.tsx`,
`LibrarySetup.tsx`).

This effort is a **prerequisite** for both `setup-and-command-center-flow` and
`viewer-browser-storage`: any new UI elements added by those efforts must be built on the
centralized primitives established here.

## Deliverables

- [x] Create `prd.md`
- [x] Create `current-vs-to-be.md`
- [x] Create `status.md`
- [x] Add status tone CSS variables to `main.css` (T-1)
- [x] Map status tokens in `tailwind.config.js` (T-2)
- [x] Migrate `button.tsx` variants to semantic tokens (P-1)
- [x] Migrate `input.tsx` to semantic tokens (P-2)
- [x] Migrate `tooltip.tsx` to semantic tokens (P-3)
- [x] Create `src/components/ui/card.tsx` with `Card`, `CardHeader`, `CardContent` (P-4)
- [x] Create `src/components/ui/badge.tsx` with status variants (P-5)
- [x] Migrate `CommandCenter.tsx` -- cards, status pills, message classes (R-1)
- [x] Migrate `LibrarySetup.tsx` -- category labels, card containers (R-2)
- [x] Audit: zero raw palette identifiers in both migrated route files (R-3)
- [x] Create `docs/development/styling-conventions.md` (D-1, D-2)
- [ ] Validate: frontend build passes with no visual regressions

## Implementation order

1. **Token layer** (T-1, T-2) -- no component changes, pure config; validates that the
   new `bg-status-success` etc. classes are available before any component uses them.
2. **Migrate `button.tsx`** (P-1) -- highest-impact single change; all routes using
   `<Button>` immediately reflect the semantic tokens.
3. **Migrate `input.tsx` and `tooltip.tsx`** (P-2, P-3) -- low risk, isolated.
4. **Create `card.tsx`** (P-4) -- required before route migration of any card containers.
5. **Create `badge.tsx`** (P-5) -- required before removing `ReportStatusPill` from
   `CommandCenter`.
6. **Migrate `CommandCenter.tsx`** (R-1, R-3 partial) -- largest change; do in one
   focused commit to keep the diff reviewable.
7. **Migrate `LibrarySetup.tsx`** (R-2, R-3 partial) -- coordinate with
   `setup-and-command-center-flow` if that effort has already started modifying the file.
8. **Audit** (R-3) -- automated grep to confirm zero raw palette references in both files.
9. **Documentation** (D-1, D-2) -- write `styling-conventions.md` after the
   implementation is verified so examples reflect the real final code.

## Dependencies

- **Blocks** `setup-and-command-center-flow` implementation: the success panel and reset
  buttons in that effort must use `<Card>` and `<Badge>`, which do not exist until
  this effort delivers steps 4 and 5 above. The documentation work in
  `setup-and-command-center-flow` (planning, PRD, current-vs-to-be) can proceed
  independently.
- **Blocks** `viewer-browser-storage` UI implementation: persistent `<Input>` fields and
  "Reset to defaults" `<Button>` elements must use semantically styled primitives.
  Again, the storage planning work can proceed independently.
- **Does not block** any backend work, CLI changes, or read-only route work.

## Notes

- Token HSL values for the new status variables must match the current visual output of
  `buildToneClasses` in `CommandCenter.tsx` exactly. Do not change the look; only
  centralize the definition. Confirm visually before committing.
- The `<Card>` component API should accept an optional `className` prop via `cn()` to
  allow callers to override padding or border when genuinely needed.
- `<Badge>` should not forward an `onClick` prop -- it is a presentational element only.
  Interactive pills (if ever needed) should use `<Button variant="outline" size="sm">`.
- After migrating `button.tsx`, run a visual spot check of the full app since `<Button>`
  is imported everywhere. Look especially at Command Center action buttons and the
  LibrarySetup submit button, where the current indigo-600 is the most prominent.
