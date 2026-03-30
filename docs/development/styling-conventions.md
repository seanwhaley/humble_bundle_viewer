# Styling Conventions

This document defines the styling rules for the viewer frontend.

## Adoption rule

Raw Tailwind palette utilities such as `slate-*`, `indigo-*`, `emerald-*`, `amber-*`, `sky-*`, and `rose-*` are only allowed inside the token-definition layer:

- `frontend/tailwind.config.js`
- `frontend/src/styles/main.css`

All other frontend files must use:

- semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`, `bg-status-success`, etc.)
- shared UI primitives (`Button`, `Input`, `Card`, `Badge`, `Tooltip`)

If a needed visual state cannot be expressed with the current token set, add a new token instead of hardcoding a palette value inline.

## Token reference

### Surface and text tokens

| Token | Usage |
|------|-------|
| `background` / `foreground` | Page background and default text |
| `card` / `card-foreground` | Card and panel surfaces |
| `popover` / `popover-foreground` | Tooltips and floating surfaces |
| `muted` / `muted-foreground` | Secondary surfaces and subdued text |
| `accent` / `accent-foreground` | Hover/selected supporting emphasis |
| `border` | Default border color |
| `input` | Input border color |
| `ring` | Focus ring color |

### Interaction tokens

| Token | Usage |
|------|-------|
| `primary` / `primary-foreground` | Primary action buttons and primary links |
| `secondary` / `secondary-foreground` | Secondary actions |
| `destructive` / `destructive-foreground` | Dangerous actions |

### Status tokens

| Token | Usage |
|------|-------|
| `status-success` / `status-success-foreground` | Successful results and fresh status |
| `status-warning` / `status-warning-foreground` | Stale or cautionary state |
| `status-info` / `status-info-foreground` | Loading and informational state |
| `status-error` / `status-error-foreground` | Error or unavailable state |
| `status-neutral` / `status-neutral-foreground` | Missing/neutral state |

### Sidebar tokens

| Token | Usage |
|------|-------|
| `sidebar-background` / `sidebar-foreground` | Sidebar base |
| `sidebar-primary` / `sidebar-primary-foreground` | Sidebar primary actions |
| `sidebar-accent` / `sidebar-accent-foreground` | Sidebar hover/selection |
| `sidebar-border` | Sidebar border |
| `sidebar-ring` | Sidebar focus ring |

## Shared component APIs

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

`Card` accepts `className` for spacing/layout overrides when needed.

### `Badge`

Use `Badge` for pill-style labels and status markers.

Supported variants:

- `success`
- `warning`
- `info`
- `error`
- `neutral`

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
    <h3 className="text-lg font-semibold text-card-foreground">Current sales bundle analysis</h3>
    <p className="text-sm text-muted-foreground">Refresh the saved report with safe defaults.</p>
  </CardHeader>
  <CardContent>
    <Button size="sm">Analyze current bundles</Button>
  </CardContent>
</Card>
```

## Route-level rules

- `CommandCenter.tsx` and `LibrarySetup.tsx` should be treated as reference implementations for semantic cards, badges, and tokenized status panels.
- New setup or maintenance UI states must use the shared primitives first, not one-off class strings.
- Status panels may use token classes directly when a full-width message block is more appropriate than a badge.
