# Styling Conventions

This document defines the styling rules for the viewer frontend.

## Adoption rule

Raw Tailwind palette utilities such as `slate-*`, `indigo-*`, `emerald-*`, `amber-*`, `sky-*`, and `rose-*` are only allowed inside the token-definition layer:

- `frontend/tailwind.config.js`
- `frontend/src/styles/main.css`

All other frontend files must use:

- semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`, `bg-status-success`, etc.)
- shared UI primitives (`Button`, `Input`, `Card`, `Badge`, `Tooltip`)
- shared role definitions from `frontend/src/styles/roles.ts` when the pattern is larger than a single primitive

If a needed visual state cannot be expressed with the current token set, add a new token instead of hardcoding a palette value inline.

## Token reference

### Surface and text tokens

| Token                            | Usage                               |
| -------------------------------- | ----------------------------------- |
| `background` / `foreground`      | Page background and default text    |
| `card` / `card-foreground`       | Card and panel surfaces             |
| `popover` / `popover-foreground` | Tooltips and floating surfaces      |
| `muted` / `muted-foreground`     | Secondary surfaces and subdued text |
| `accent` / `accent-foreground`   | Hover/selected supporting emphasis  |
| `border`                         | Default border color                |
| `input`                          | Input border color                  |
| `ring`                           | Focus ring color                    |

### Interaction tokens

| Token                                    | Usage                                    |
| ---------------------------------------- | ---------------------------------------- |
| `primary` / `primary-foreground`         | Primary action buttons and primary links |
| `secondary` / `secondary-foreground`     | Secondary actions                        |
| `destructive` / `destructive-foreground` | Dangerous actions                        |

### Status tokens

| Token                                          | Usage                               |
| ---------------------------------------------- | ----------------------------------- |
| `status-success` / `status-success-foreground` | Successful results and fresh status |
| `status-warning` / `status-warning-foreground` | Stale or cautionary state           |
| `status-info` / `status-info-foreground`       | Loading and informational state     |
| `status-error` / `status-error-foreground`     | Error or unavailable state          |
| `status-neutral` / `status-neutral-foreground` | Missing/neutral state               |

### Sidebar tokens

| Token                                            | Usage                   |
| ------------------------------------------------ | ----------------------- |
| `sidebar-background` / `sidebar-foreground`      | Sidebar base            |
| `sidebar-primary` / `sidebar-primary-foreground` | Sidebar primary actions |
| `sidebar-accent` / `sidebar-accent-foreground`   | Sidebar hover/selection |
| `sidebar-border`                                 | Sidebar border          |
| `sidebar-ring`                                   | Sidebar focus ring      |

## Shared component APIs

## Theme runtime and role ownership

The viewer now uses a named root theme contract.

- The active theme is applied at the document root with `data-theme`.
- `hb-dark` is the first supported theme and should be treated as the reference implementation.
- Theme values belong in `frontend/src/styles/main.css` and `frontend/src/app/theme/themes.ts`.
- Cross-page surface roles belong in `frontend/src/styles/roles.ts`.
- The current public theme selector lives on `frontend/src/app/routes/Setup.tsx`, not in the shared global route header.

When adding or changing styling, use this ownership order:

1. theme tokens in `main.css`
2. semantic Tailwind mappings in `tailwind.config.js`
3. shared primitive variants (`Card`, `Badge`, table helpers, etc.)
4. shared role classes in `frontend/src/styles/roles.ts`
5. route-local layout only

If a route needs the same shell, disclosure, stat panel, chart frame, or table wrapper seen elsewhere, add or reuse a shared role instead of inventing a new inline class string.

### `Button`

Use `Button` for all primary and secondary actions.

Supported variants:

- `default`
- `secondary`
- `outline`
- `ghost`
- `destructive`
- `link`

Supported sizes:

- `default`
- `sm`
- `lg`
- `icon`

Prefer `asChild` when styling links as buttons.

### `Input`

Use `Input` for standard single-line text entry. It already carries semantic background, border, text, placeholder, and focus styles.

### `Card`

Use `Card` for panel shells instead of repeating rounded border/background classes inline.

Available primitives:

- `Card`
- `CardHeader`
- `CardContent`

`Card` accepts shared variants for common surface decisions:

- `surface`: `default`, `panel`, `strong`, `inset`, `overlay`
- `radius`: `default`, `compact`, `section`
- `shadow`: `default`, `none`, `inner`
- `interactive`: `true` / `false`

Use `className` only for spacing/layout overrides when needed.

### `Badge`

Use `Badge` for pill-style labels and status markers.

Supported variants:

- `success`
- `warning`
- `info`
- `error`
- `neutral`
- `surface`
- `muted`

Supported sizes:

- `default`
- `compact`
- `tiny`

Supported casing:

- `label`
- `ui`

`Badge` is presentational only. Use `Button` instead of making a badge interactive.

### `Tooltip`

Use `Tooltip` for lightweight hover detail. It already reads semantic popover tokens.

## Migration pattern

### Before

- Repeated inline surface classes such as `rounded-xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm`
- Repeated inline pills such as `border-emerald-500/40 bg-emerald-500/10 text-emerald-200`
- Button overrides using raw palette values

### After

- Replace repeated panel shells with `Card`, `CardHeader`, and `CardContent`
- Replace inline status pills with `Badge`
- Replace raw color overrides with semantic token classes

Example pattern:

```tsx
<Card className="bg-card/60">
  <CardHeader>
    <Badge variant="info">Reports</Badge>
    <h3 className="text-lg font-semibold text-card-foreground">
      Current sales bundle analysis
    </h3>
    <p className="text-sm text-muted-foreground">
      Refresh the saved report with safe defaults.
    </p>
  </CardHeader>
  <CardContent>
    <Button size="sm">Analyze current bundles</Button>
  </CardContent>
</Card>
```

## Viewer route-shell pattern

Major viewer routes should read as one product family instead of one-off pages.

Default route order:

1. layout header
2. compact route intro card
3. scope, filter, or quick-focus controls
4. primary table, cards, or chart surface
5. optional help or interpretation content

Use these routes as the main reference implementations:

- `frontend/src/app/routes/Home.tsx` — homepage section rhythm and top-fold prioritization
- `frontend/src/app/routes/Setup.tsx` — compact workflow framing and status panels
- `frontend/src/app/routes/CommandCenter.tsx` — maintenance-oriented cards, badges, and disclosures

Route-family guidance:

- media and download routes should keep the data table primary and place heavier controls behind explicit toggles such as **Filters**, bulk-action drawers, or managed-sync panels
- current-sales routes should use compact intro/context framing, quick-focus rows, and semantic status treatments instead of bespoke dark dashboard strips
- purchases should keep the hierarchy-first table as the default mode and reserve included-item analysis for the secondary deep-inspection mode
- schema and maintenance-style views should use the same semantic shells and badges as the rest of the viewer rather than standalone visual systems

## Status vocabulary

Use the shared status tokens consistently across routes:

- `success` — fresh, owned, available, completed
- `warning` — expiring, partial overlap, stale soon, needs attention
- `error` — expired, failed, unavailable
- `info` — active scope, current snapshot, contextual metadata
- `neutral` — empty, missing, or not applicable

## Route-level rules

- `Overview.tsx`, `CommandCenter.tsx`, and `LibrarySetup.tsx` should be treated as reference implementations for semantic cards, badges, tokenized status panels, and route-shell hierarchy.
- New setup or maintenance UI states must use the shared primitives first, not one-off class strings.
- New viewer routes should prefer compact intro cards, summary-first layout, quick-focus or filter disclosures, and semantic status treatments before introducing route-local chrome.
- Status panels may use token classes directly when a full-width message block is more appropriate than a badge.
- Do not reintroduce `bg-card/60`, `bg-muted/30`, `bg-background/70`, or similar opacity-tuned route shells for common roles; use shared `Card` variants or `frontend/src/styles/roles.ts` instead.
