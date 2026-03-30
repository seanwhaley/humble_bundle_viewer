# Browser Storage Policy

This document defines what viewer state may be stored in the browser and what must stay out of browser storage.

## Core rule

Browser storage is only for UI-layer state that affects convenience, presentation, or local workflow continuity.

Browser storage must **not** be used for:

- session cookies
- passwords or tokens
- backend-owned artifact files
- data that the CLI depends on as a shared source of truth

## Storage boundaries

| State type | Storage location | Why |
|-----------|------------------|-----|
| Setup mode and download preferences | `localStorage` | User preference that should survive page reloads |
| Command Center path overrides | `localStorage` | Local UI customization for repeat maintenance tasks |
| Recent command result banners/details | `sessionStorage` | Useful within a tab session, but should not linger long-term |
| `library_products.json`, generated schemas, API batches, cached pages | Disk / backend artifacts | Shared with backend and CLI; not browser-owned |
| `_simpleauth_sess` or any auth secret | Nowhere persistent in browser app code | Security-sensitive; must stay transient only |

## Key namespaces

### Setup keys (`localStorage`)

| Key | Purpose |
|-----|---------|
| `humble.setup.mode` | Last selected setup mode (`capture` or `existing`) |
| `humble.setup.platforms` | Preferred download platform filter |
| `humble.setup.fileTypes` | Preferred download file type filter |
| `humble.setup.sizePolicy` | Preferred download size policy |
| `humble.libraryPath` | Last successful library path used by the viewer |

### Command Center keys (`localStorage`)

The `humble.commands.*` namespace stores advanced-option path and value overrides such as:

- rebuild model paths
- library artifact input/output paths
- schema output path
- cache scope inputs
- metadata output paths

These values are user convenience settings and must have sensible defaults when storage is empty or unavailable.

### Session command keys (`sessionStorage`)

The `humble.session.commands.*` namespace stores recent command-result state for the current tab session, including:

- last status (`idle`, `running`, `success`, `error`)
- last message
- detail lines
- follow-up actions

## Implementation rules

- All browser persistence must go through `usePersistentState` unless there is a compelling, documented reason not to.
- The UI must still work when storage is unavailable, blocked, or cleared.
- Every persisted form area with non-trivial overrides should provide a reset action that restores default values and clears the stored key(s).
- Session storage is preferred over local storage when the value is useful only for the current tab lifetime.
- Do not persist volatile secrets, including `_simpleauth_sess`.

## Fallback behavior

If `localStorage` or `sessionStorage` is unavailable:

- the UI should silently fall back to in-memory React state
- forms should still render and submit normally
- reset actions should still restore default values in memory

## Current reference implementations

- `frontend/src/hooks/usePersistentState.ts`
- `frontend/src/app/routes/LibrarySetup.tsx`
- `frontend/src/app/routes/CommandCenter.tsx`
