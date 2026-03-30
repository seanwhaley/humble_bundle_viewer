# Styling Centralization -- Current vs To-Be

## Purpose

This document describes the actual state of styling in the viewer portal today, identifies
the structural gaps between the partial design system that exists and a fully realized one,
and defines the target state that all current and future development -- including
`setup-and-command-center-flow` and `viewer-browser-storage` -- must conform to.

---

## Current State

### What exists: the infrastructure is already in place

The viewer portal already has the skeleton of a proper design system. The pieces are
there; they just are not consistently connected.

#### `tailwind.config.js` -- Semantic token layer (complete)

A full semantic color token system is defined, mapping named concepts to CSS variables:

```text
bg-background / text-foreground          -- page surface
bg-card / text-card-foreground           -- card surfaces
bg-primary / text-primary-foreground     -- primary interactive
bg-secondary / text-secondary-foreground -- secondary interactive
bg-muted / text-muted-foreground         -- de-emphasized content
bg-accent / text-accent-foreground       -- accent highlights
bg-destructive / text-destructive-foreground -- danger actions
border-border                            -- standard border
bg-input / ring                          -- form inputs
border-radius: lg/md/sm -> var(--radius) -- unified corner radii
```

Sidebar tokens (`sidebar-background`, `sidebar-foreground`, `sidebar-primary`, etc.) are
also defined, allowing the nav layer to theme independently.

#### `src/styles/main.css` -- Single dark theme defined (complete for current scope)

All CSS variables are set for dark mode in `:root`. The app is dark-only today; the token
infrastructure supports `darkMode: ["class"]` for a potential light mode without
structural changes.

#### `src/lib/utils.ts` -- `cn()` helper (fully used)

`cn()` combines class merging utilities and is imported across all components, where it is
used consistently for conditional class merging. This is correct and must remain the
standard.

#### `src/components/ui/` -- Shared component folder exists

The folder contains `button.tsx`, `input.tsx`, `sheet.tsx`, and `tooltip.tsx`. These
primitives are imported throughout the app. The structure is correct and the folder
represents the right pattern.

#### `src/components/StatTile.tsx` -- The model citizen

`StatTile` correctly uses only semantic tokens with no hardcoded color values:

```tsx
"bg-card text-card-foreground rounded-xl border border-border shadow-sm"
"text-xs font-semibold uppercase tracking-wider text-muted-foreground"
"text-2xl font-bold tracking-tight"
```

This is the pattern all other components should follow.

---

### What is broken: the infrastructure is bypassed by its own primitives

Despite the token system being fully defined, the shared `ui/` components and all major
route components bypass it almost entirely, using hardcoded raw Tailwind palette values
instead.

#### `src/components/ui/button.tsx` -- Variants use hardcoded palette values

The `cva` variant map uses raw slate/indigo values instead of the semantic tokens sitting
right next to it in `tailwind.config.js`:

- `default`: current `bg-indigo-600 hover:bg-indigo-700`; target `bg-primary text-primary-foreground hover:bg-primary/90`
- `destructive`: current `bg-red-500 hover:bg-red-500/90`; target `bg-destructive text-destructive-foreground hover:bg-destructive/90`
- `outline`: current `border-slate-700 bg-transparent hover:bg-slate-800 text-slate-100`; target `border-border bg-transparent hover:bg-accent hover:text-accent-foreground`
- `secondary`: current `bg-slate-800 text-slate-100 hover:bg-slate-700`; target `bg-secondary text-secondary-foreground hover:bg-secondary/80`
- `ghost`: current `hover:bg-slate-800 text-slate-100`; target `hover:bg-accent hover:text-accent-foreground`
- `link`: current `text-indigo-400 hover:underline`; target `text-primary underline-offset-4 hover:underline`

Since `<Button>` is imported across every route, this single file is the highest-leverage
fix in the entire codebase.

#### `src/components/ui/input.tsx` -- Fully hardcoded

```tsx
// Current (wrong):
"border-slate-700 bg-slate-900 px-3 text-slate-100 focus-visible:ring-indigo-500"

// Should be:
"border-input bg-background text-foreground focus-visible:ring-ring"
```

All `<Input>` instances across the app inherit this divergence.

#### `src/components/ui/tooltip.tsx` -- Fully hardcoded

```tsx
// Current (wrong):
"bg-slate-800 border-slate-700 text-slate-100"

// Should be:
"bg-popover border-border text-popover-foreground"
```

#### `src/app/routes/CommandCenter.tsx` -- 38 hardcoded color references, 1 semantic

The most impacted file in the codebase. 38 lines contain raw slate/indigo/emerald/
amber/sky/rose palette values; only 1 line uses a semantic token. Examples:

```tsx
// Card container:
"rounded-xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm"

// Section heading:
"text-xl font-semibold text-slate-50"

// Status tone (fresh):
"border-emerald-500/40 bg-emerald-500/10 text-emerald-200"

// Advanced Options summary:
"text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
```

The `buildToneClasses` and `buildMessageClasses` helper functions are local to the file
and return hardcoded class strings. If the "success" color ever needs to change, every
caller must be updated manually.

#### `src/app/routes/LibrarySetup.tsx` -- Mixed pattern

Info cards use hardcoded indigo/emerald/sky accent colors for section category labels
(`text-indigo-300`, `text-emerald-300`, `text-sky-300`) while the page structure uses
semantic tokens (`text-muted-foreground`). There is no consistent rule governing which to
choose.

#### `src/app/routes/Overview.tsx` -- Repeats the CommandCenter pattern

Badge-like pills use `border-indigo-500/30 bg-indigo-500/10 text-indigo-300` and
`border-slate-700 bg-slate-950/80 text-slate-300`; card containers use
`border-slate-800 bg-slate-900/70`.

#### No shared `<Card>` component

Every route and component defines its own card-like div independently. The recurring
pattern:

```tsx
<div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm">
```

appears in `CommandCenter`, `LibrarySetup`, `Overview`, and several other routes, each with
slight variations in padding, opacity, or border color. There is no single component to
update.

#### No shared `<Badge>` / status pill component

`CommandCenter` defines `ReportStatusPill` locally with `buildToneClasses`. Several other
routes render pill-like labels inline with hardcoded indigo/slate styling. There is no
shared primitive.

#### No status semantic tokens

Status states (success, warning, info, error, neutral/missing) have no named CSS variables.
Changing the success color from emerald to teal would require a grep-and-replace across
the entire codebase.

---

## Gap Summary

- **Tailwind config semantic tokens**: fully defined; no structural gap.
- **CSS variables in `main.css`**: fully defined for the dark theme; status tone variables are still missing.
- **`cn()` utility**: already used everywhere; no gap.
- **`components/ui/button.tsx`**: uses hardcoded raw palette values and must be migrated to semantic tokens.
- **`components/ui/input.tsx`**: uses hardcoded raw palette values and must be migrated to semantic tokens.
- **`components/ui/tooltip.tsx`**: uses hardcoded raw palette values and must be migrated to semantic tokens.
- **`CommandCenter.tsx`**: has 38 hardcoded references and only 1 semantic token reference; full migration is required.
- **`LibrarySetup.tsx`**: mixed pattern; partial migration is required.
- **`Overview.tsx`**: hardcoded slate and indigo styling; partial migration is required.
- **Shared `<Card>` component**: does not exist and must be created.
- **Shared `<Badge>` / status pill**: does not exist and must be created.
- **Status tone token definitions**: do not exist and must be added to `main.css` and `tailwind.config.js`.

---

## Target State

> **Note:** Any new UI elements introduced by
> [setup-and-command-center-flow](../setup-and-command-center-flow/current-vs-to-be.md)
> (success panels, reset buttons, mode preference controls) and
> [viewer-browser-storage](../viewer-browser-storage/current-vs-to-be.md)
> (storage-backed inputs, "Reset to defaults" affordances) must be built exclusively
> using the components and tokens defined below.

### 1. Status semantic tokens added to `main.css` and `tailwind.config.js`

New CSS variables covering the five operational states:

```css
/* main.css :root block additions */
--status-success: 152 60% 28%;
--status-success-foreground: 152 60% 85%;
--status-warning: 38 90% 30%;
--status-warning-foreground: 38 90% 90%;
--status-info: 205 85% 32%;
--status-info-foreground: 205 85% 88%;
--status-error: 0 60% 30%;
--status-error-foreground: 0 60% 88%;
--status-neutral: 217 30% 18%;
--status-neutral-foreground: 215 20% 70%;
```

Mapped in `tailwind.config.js` alongside the existing token definitions. Changing the
app's "success" palette then requires editing exactly one CSS variable.

### 2. `button.tsx` migrated to semantic tokens

All `cva` variant strings replace raw palette references with semantic token names.
See the gap table above for the complete mapping. Size variants (padding/height) do not
use color tokens and require no change.

### 3. `input.tsx` and `tooltip.tsx` migrated to semantic tokens

`<Input>` uses `bg-background border-input text-foreground focus-visible:ring-ring`.
`<Tooltip>` uses `bg-popover border-border text-popover-foreground`.

### 4. New `<Card>` shared component

A thin wrapper in `src/components/ui/card.tsx` that standardizes the recurring pattern:

```tsx
// Replaces: "rounded-xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm"
<Card>          // bg-card text-card-foreground rounded-xl border border-border shadow-sm
<CardHeader>    // section label + title block
<CardContent>   // p-5 content area
```

This is the component that all CommandCenter command cards, LibrarySetup info cards, and
Overview panels migrate to.

### 5. New `<Badge>` component using status tokens

A `cva`-backed component in `src/components/ui/badge.tsx` replacing all local
`buildToneClasses` and inline badge patterns:

```tsx
// Variant values: "success" | "warning" | "info" | "error" | "neutral"
<Badge variant="success">Fresh</Badge>
<Badge variant="warning">Stale</Badge>
<Badge variant="error">Missing</Badge>
```

This replaces `ReportStatusPill` in `CommandCenter` and all inline pill-like patterns
across the codebase.

### 6. `CommandCenter.tsx` and `LibrarySetup.tsx` migrated

All `border-slate-*`, `bg-slate-950/*`, `text-slate-*` values in both files replaced with
semantic token equivalents or the new shared components. The `buildToneClasses` and
`buildMessageClasses` local functions are deleted; their callers use `<Badge>` instead.

This migration is coordinated with `setup-and-command-center-flow`: the new success
confirmation state in Setup and the removed/reworked cards in CommandCenter are
implemented using the centralized components from the start rather than being retrofitted.

### 7. All new `viewer-browser-storage` UI elements use centralized styles

The "Reset to defaults" buttons use `<Button variant="ghost" size="sm">`.
Form labels and hint text use `text-muted-foreground`.
Persistent input fields use `<Input>` (post-migration to semantic tokens).
No new inline hardcoded palette values are added as part of the storage implementation.

---

## Adoption Rule (for future contributors)

Once this effort is complete, the following rule applies to all new code:

> If a color, radius, or shadow value cannot be expressed as a semantic token
> (`bg-card`, `text-muted-foreground`, `bg-status-success`, etc.), a new token must
> be proposed rather than a hardcoded Tailwind palette value (`bg-slate-800`) used inline.

Raw palette values (`slate-*`, `indigo-*`, `emerald-*`) are only acceptable inside
`tailwind.config.js` and `main.css` -- the two files that define the token layer.

---

## Success Criteria

- **`button.tsx` uses only semantic tokens**: no `slate-` or `indigo-` strings remain in `components/ui/button.tsx`.
- **Status color changes in one place**: updating `--status-success` in `main.css` updates all `<Badge variant="success">` instances and command result panels visually.
- **`<Card>` component adopted in CommandCenter**: no standalone `rounded-xl border border-slate-800 bg-slate-950/60` containers remain in `CommandCenter.tsx`.
- **New `setup-and-command-center-flow` states use centralized styles**: success panel and reset buttons in Setup and CommandCenter use `<Card>`, `<Button>`, and `<Badge>` only.
- **New `viewer-browser-storage` inputs use centralized styles**: no new hardcoded styles are introduced during storage persistence implementation.
