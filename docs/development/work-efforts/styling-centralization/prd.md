# PRD -- Styling Centralization

## Summary

This effort migrates the viewer portal from ad-hoc, per-component Tailwind utility strings
to a fully realized design system grounded in the semantic token layer that already exists
in `tailwind.config.js`. It creates the shared primitive components (`<Card>`, `<Badge>`,
plus migrated `<Button>`, `<Input>`, `<Tooltip>`) that all current and future routes
-- including `setup-and-command-center-flow` and `viewer-browser-storage` -- must use.

## Problem Statement

The viewer already has a well-designed semantic token system in `tailwind.config.js` and
`src/styles/main.css`. Those CSS variables are correct and complete. The problem is that
the components and routes bypass this system entirely, coupling their visual appearance
directly to raw Tailwind palette identifiers (`slate-800`, `indigo-600`, `emerald-500`).

Specific consequences today:

1. `<Button>` -- the most-imported component in the app -- uses `bg-indigo-600` for its
   primary variant instead of `bg-primary`. Changing the primary action color site-wide
   requires editing the `cva` variant map in `button.tsx` and then auditing every
   location that overrides it inline.
2. `CommandCenter.tsx` has 38 lines containing hardcoded palette values and only 1 that
   uses a semantic token. It defines `buildToneClasses` and `buildMessageClasses` as local
   private functions returning raw strings -- there is no way to change the "success" green
   in one place.
3. `LibrarySetup.tsx` uses hardcoded `text-indigo-300` / `text-emerald-300` / `text-sky-300`
   for its three info-card category labels with no governing rule.
4. No shared `<Card>` component exists. The pattern
   `rounded-xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm` is duplicated across
   at least five files with slight pad/opacity variations.
5. No shared `<Badge>` component exists. Status pills are defined locally in `CommandCenter`
   and inline in `Overview` and `LibrarySetup`, all using different hardcoded color strings
   for the same semantic states (fresh, stale, missing).

The `setup-and-command-center-flow` effort plans to add new UI states (post-success
confirmation panel, "Reset to defaults" buttons). The `viewer-browser-storage` effort plans
to add persistent form controls. If both are implemented before styling is centralized,
those new elements will replicate the existing problem at greater scale.

## Goals

1. Migrate `button.tsx`, `input.tsx`, and `tooltip.tsx` from hardcoded palette values to
   the semantic tokens already defined in `tailwind.config.js`.
2. Add status semantic tokens for the five operational states (success, warning, info,
   error, neutral) to `main.css` and `tailwind.config.js`.
3. Create a shared `<Card>` component (`src/components/ui/card.tsx`) that standardizes
   the recurring card surface pattern.
4. Create a shared `<Badge>` component (`src/components/ui/badge.tsx`) that replaces
   all local status pill implementations, including `ReportStatusPill` in `CommandCenter`.
5. Migrate `CommandCenter.tsx` and `LibrarySetup.tsx` to use the new shared components and
   semantic tokens, eliminating their hardcoded palette references.
6. Establish and document an adoption rule: raw palette values (`slate-*`, `indigo-*`) are
   only acceptable inside `tailwind.config.js` and `main.css`.

## Non-Goals

- Introducing a light mode or theme switcher (the CSS variable infrastructure already
  supports this, but activating it is out of scope for this effort)
- Replacing Tailwind with a CSS-in-JS solution or external component library
- Changing any visual appearance observable to end users -- this is a refactor, not a
  redesign; the tokens must be set to match the current visual output
- Updating any routes outside `CommandCenter`, `LibrarySetup`, and `Overview` in this pass
  (other routes can be migrated separately without blocking the cross-effort gate)

## Cross-Effort Integration

**Setup and Command Center Flow** (`setup-and-command-center-flow`): The new UI states
introduced by that effort -- post-success confirmation in Setup, "Reset to defaults"
buttons in Command Center, the reworked order-model card -- must be built with the
`<Card>`, `<Button>`, and `<Badge>` components established here. This effort is a
prerequisite dependency: style the primitives first, then build the new states on top.

**Viewer Browser Storage** (`viewer-browser-storage`): Every new UI element added for
storage persistence (persistent path inputs, "Reset to defaults" affordances, degradation
notices) inherits the correct styles automatically once `<Input>` and `<Button>` are
migrated to semantic tokens. No additional styling coordination is required if the storage
effort uses the shared primitives.

## Users and jobs-to-be-done

### Primary audience for this effort

- **Future contributors** adding new routes or modifying existing ones: they need a
  clear, enforced convention so they do not have to decide case-by-case whether to use
  `bg-slate-800` or `bg-card`.
- **Current maintainer** changing the visual style: a single CSS variable edit in
  `main.css` should propagate everywhere; today that is impossible.

### Core jobs

- "Let me update the primary action color without touching 15 files."
- "Let me add a new command card to Command Center that automatically looks correct."
- "Let me implement the Setup success panel without inventing new one-off styles."

## Requirements

### Token layer

- **T-1**: Add `--status-success`, `--status-success-foreground`, `--status-warning`, `--status-warning-foreground`, `--status-info`, `--status-info-foreground`, `--status-error`, `--status-error-foreground`, `--status-neutral`, and `--status-neutral-foreground` CSS variables to the `:root` block in `main.css`. HSL values must match the current visual output of `buildToneClasses` exactly, preserving the existing look.
- **T-2**: Map each new variable in `tailwind.config.js` under the `colors` extension, following the existing pattern (for example, `"status-success": "hsl(var(--status-success))"`) so they are usable as `bg-status-success`, `text-status-success-foreground`, and related utilities.

### Shared primitive components

- **P-1**: Migrate `button.tsx` variant map to semantic tokens: `default` uses `bg-primary text-primary-foreground`, `destructive` uses `bg-destructive text-destructive-foreground`, `outline` uses `border-border hover:bg-accent hover:text-accent-foreground`, `secondary` uses `bg-secondary text-secondary-foreground`, `ghost` uses `hover:bg-accent hover:text-accent-foreground`, and `link` uses `text-primary`.
- **P-2**: Migrate `input.tsx` to `bg-background border-input text-foreground focus-visible:ring-ring`.
- **P-3**: Migrate `tooltip.tsx` to `bg-popover border-border text-popover-foreground`.
- **P-4**: Create `src/components/ui/card.tsx` exporting `<Card>`, `<CardHeader>`, and `<CardContent>`. `<Card>` applies `bg-card text-card-foreground rounded-xl border border-border shadow-sm`. `<CardHeader>` applies a consistent label and title layout. `<CardContent>` applies `p-5`.
- **P-5**: Create `src/components/ui/badge.tsx` exporting `<Badge>` with `cva` variants `success`, `warning`, `info`, `error`, and `neutral`. Each variant uses the matching `bg-status-*` and `text-status-*-foreground` tokens. The base class matches the current pill geometry: `inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]`.

### Route migration

- **R-1**: Migrate `CommandCenter.tsx` by replacing all card `div` containers with `<Card>/<CardHeader>/<CardContent>`, replacing `ReportStatusPill` and `buildToneClasses` with `<Badge>`, and replacing `buildMessageClasses` with `<Badge>` or semantic token classes.
- **R-2**: Migrate `LibrarySetup.tsx` by replacing all hardcoded `text-indigo-300`, `text-emerald-300`, and `text-sky-300` category labels with semantic tokens or the new `<Badge>` component, and replacing card `div` containers with `<Card>`.
- **R-3**: After migration, `CommandCenter.tsx` and `LibrarySetup.tsx` must contain zero occurrences of raw palette identifiers from the `slate-`, `indigo-`, `emerald-`, `amber-`, `sky-`, or `rose-` families, excluding comments.

### Adoption rule documentation

- **D-1**: Add a "Styling conventions" section to `docs/development/` in the new file `styling-conventions.md` that states the adoption rule: raw palette values are only acceptable inside `tailwind.config.js` and `main.css`; all other files must use semantic tokens or shared components.
- **D-2**: `styling-conventions.md` must include the complete token reference table, the `Card`/`Badge`/`Button`/`Input` component API summaries, and the migration example pattern.

## Success criteria

- A single edit to `--primary` in `main.css` changes the color of all primary buttons
  across every route without touching any `.tsx` file.
- A single edit to `--status-success` changes the "Fresh" report badge and all success
  `CommandState` result panels simultaneously.
- `CommandCenter.tsx` contains zero raw `slate-` / `indigo-` / `emerald-` palette references.
- `button.tsx` contains zero raw palette references (verified by CI grep or manual audit).
- The `styling-conventions.md` document is published and linked from the main
  `docs/development/` index.
- All new UI elements introduced by `setup-and-command-center-flow` and
  `viewer-browser-storage` use only the centralized primitives; no new hardcoded strings
  are added during those implementations.
