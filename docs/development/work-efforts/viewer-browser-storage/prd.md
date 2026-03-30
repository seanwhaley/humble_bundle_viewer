# PRD — Browser Storage for Viewer UI State

## Summary

This effort defines where and how the viewer portal should use browser storage
(`localStorage` and `sessionStorage`) for UI-layer state that is currently either
discarded on navigation or never persisted. The effort draws a deliberate boundary between
**server-side artifacts** (files the CLI and backend own) and **viewer-local UI state**
(preferences and overrides that only affect rendering decisions in the browser).

## Problem Statement

The viewer portal and the CLI share a backend that writes its outputs to disk. This is
correct and must remain so: `library_products.json`, API batch files, subproduct HTML
caches, generated Python models, and report outputs all need to be on disk because both
the CLI and the viewer backend read from and write to those paths.

However, the viewer frontend has a second category of state — **UI preferences and path
customizations** — that currently behaves inconsistently:

- `LibrarySetup` already persists one value (`humble.libraryPath`) in `localStorage`, but
  this is the only instance of intentional browser storage use in the app.
- The `~15` path override inputs in Command Center Advanced Options reset to hardcoded
  defaults on every page load.
- Setup's mode preference (`capture` vs `existing`) and download sub-options reset on
  every visit.
- The viewer has no clear policy distinguishing which state belongs in the browser vs on
  the server.

Without a defined storage layer for UI state, users must repeatedly re-enter customizations
that have no business being round-tripped to the server.

## Cross-Effort Integration

**Setup and Command Center Flow** (`setup-and-command-center-flow`): The mechanisms defined in this document (especially the `humble.setup.*` and `humble.commands.*` key namespaces) act as the technical storage foundation supporting the UX improvements outlined in the Setup and Command Center workflow PRD.

**Styling Centralization** (`styling-centralization`): Any new UI fields, buttons (such as the "Reset to defaults" buttons), or notifications added to expose browser storage controls must adhere to the shared centralized styling components and tokens.

## Goals

1. Define a clear **storage tier decision matrix** for the viewer: server file / localStorage
   / sessionStorage / in-memory only.
2. Apply `localStorage` to all Command Center path override inputs using a consistent
   `humble.commands.*` key namespace.
3. Apply `localStorage` to Setup user preferences (mode, download platforms, file types,
   size policy).
4. Apply `sessionStorage` to per-session ephemeral state: most-recent command results per
   card, Advanced Options open/closed state.
5. Document the policy so future route authors know which tier to use.

## Non-Goals

- Replacing server-side file persistence for any data artifact (library JSON, API batches,
  reports, generated models — all remain on disk)
- Adding user accounts, cloud sync, or cross-device state sharing
- Implementing IndexedDB or the File System Access API in this pass
- Changing any backend endpoint or file-writing behavior

## Security and privacy context

The viewer runs on `localhost` — the user is the server. This changes the threat model
compared to a public web app:

- `localStorage` and `sessionStorage` are same-origin (`localhost`), so they cannot be read
  by external web pages.
- The realistic exposure risks are: (a) browser extensions with broad host permissions that
  include `localhost`, and (b) someone with physical access to the user's browser profile
  directory. Both are lower-risk than a public site, but neither is zero.
- **Library data files** (`library_products.json`, API batch responses, order data) contain
  the user's full Humble Bundle **purchase history and order records** — private personal
  data. These must stay in OS-protected files on disk. The size and CLI-pipeline arguments
  are secondary reasons; the privacy argument is primary.
- **Filesystem path values** stored in `localStorage` (including the existing
  `humble.libraryPath`) commonly contain the OS username (e.g.,
  `C:\Users\username\Downloads`). This is accepted in the localhost context and already
  established by the existing key, but every new path key added extends this exposure.
  Path values must not include any purchase or library data content — only filesystem
  locations.
- **Session cookie** (`_simpleauth_sess`) is a full account-access credential. It must
  never be passed to `usePersistentState` or any storage API, even transiently.

## Storage tier decision matrix

- **Private user data** such as `library_products.json`, API batch responses, and order history belong on the **server file** tier because they contain purchase history, which is private personal data, and are consumed by the CLI.
- **Generated outputs** such as report JSON or Markdown, order models, and schema JSON belong on the **server file** tier because they are CLI output contracts derived from private data.
- **Config and credentials** such as `config.yaml` and `.env` belong on the **server file** tier because the backend reads them and they must never live in browser storage.
- **Active library path** stored as `humble.libraryPath` belongs in **`localStorage`** because it is already implemented and only reveals an OS username inside a path value, which is acceptable in the localhost context.
- **UI path overrides** for Command Center artifact directories and output paths belong in **`localStorage`** because they are user-configured defaults with no data content, though they may reveal an OS username in a filesystem path.
- **Mode preferences** for setup capture or existing mode and download options belong in **`localStorage`** because they are presentational defaults with no personal data content.
- **Recent command results** for the last status and detail lines per command card belong in **`sessionStorage`** because they contain paths and counts only and are useful within a single browser session.
- **Advanced Options open state** belongs in **`sessionStorage`** because it is per-session convenience state that is safe to reset on browser close.
- **Auth credentials** such as the session cookie or access tokens must remain **in memory only** because they are full account-access credentials and must never touch any browser storage API.
- **In-flight form values** such as running state and error objects must remain **in memory only** because they are ephemeral and provide no value when persisted.

## Requirements

### Policy documentation

- **P-1**: Add a brief "Browser storage policy" section to `docs/guides/viewer-portal.md` or a new `docs/development/browser-storage.md` that codifies the matrix above.

### Command Center localStorage

- **CC-1**: Persist all path override inputs in the "Rebuilds and exports" and "Enrichment pipeline" sections under `humble.commands.*` keys in `localStorage`.
- **CC-2**: Restore persisted values on component mount and fall back to the current hardcoded defaults when no stored value exists.
- **CC-3**: Each Advanced Options group provides a "Reset to defaults" button that clears the stored key or keys for that group and restores the hardcoded defaults in the input.
- **CC-4**: Do not persist the session cookie field, running status, or auth-related inputs.

### Setup localStorage

- **SU-1**: Persist the selected `mode` (`"capture"` or `"existing"`) under `humble.setup.mode`.
- **SU-2**: Persist `platforms`, `fileTypes`, and `sizePolicy` under `humble.setup.download.*` keys.
- **SU-3**: Do not persist the session cookie value; it is already cleared on success and must never be stored.

### Command Center sessionStorage

- **CS-1**: Persist the most recent `CommandState` with status, message, and `detailLines` per command card under `humble.session.commands.*` keys in `sessionStorage`.
- **CS-2**: Restore the most recent result on component mount so users returning to Command Center within the same browser session can see the last outcome.
- **CS-3**: Do not restore results from a previous browser session because `sessionStorage` is cleared on close.
- **CS-4**: Verify that `detailLines` stored in `sessionStorage` contain only output paths and operational counts, never purchase records, product names, or other library data excerpts. If a future command result would include such content, it must be fetched from the backend on demand instead of being stored.

## Key namespace convention

```text
humble.libraryPath                      # existing
humble.setup.mode                       # new
humble.setup.download.platforms         # new
humble.setup.download.fileTypes         # new
humble.setup.download.sizePolicy        # new
humble.commands.rebuildArtifactsDir     # new
humble.commands.rebuildPattern          # new
humble.commands.rebuildOrderModelPath   # new
humble.commands.rebuildOrderClass       # new
humble.commands.generateApiDir          # new
humble.commands.generatePattern         # new
humble.commands.generateOutputModels    # new
humble.commands.generateClassName       # new
humble.commands.libraryApiDir           # new
humble.commands.libraryPattern          # new
humble.commands.libraryOutputProducts   # new
humble.commands.libraryOrderModelPath   # new
humble.commands.libraryOrderModelClass  # new
humble.commands.cacheLibraryFile        # new
humble.commands.cacheDir                # new
humble.commands.cacheQuery              # new
humble.commands.cacheUrl                # new
humble.commands.cacheLimit              # new
humble.commands.cacheMaxFailures        # new
humble.commands.cacheDomainWorkers      # new
humble.commands.metadataCacheDir        # new
humble.commands.metadataOutputFile      # new
humble.commands.metadataReportFile      # new
humble.commands.schemaOutput            # new
```

*sessionStorage keys follow the same naming under `humble.session.*`.*

## CLI vs viewer divergence note

The CLI (`hb_library_viewer`) must always write its outputs to disk because:

- Artifact files are inputs for subsequent CLI runs
- Other tooling reads from fixed paths
- The CLI has no browser context

The viewer browser storage layer is **additive and non-conflicting**: it stores only
rendering preferences and path overrides that the CLI does not know or care about.
Changing a path override in the viewer does not change `config.yaml` and does not affect
what the CLI writes. The viewer and CLI share the same backend artifact layer; the viewer
browser storage layer sits entirely above it.

## Success criteria

- A maintainer customizes Command Center artifact paths, navigates to Viewer Home, then
  returns to Command Center and sees all custom paths pre-filled.
- A user's Setup mode ("use existing library") is remembered across browser sessions.
- Within the same browser session, returning to Command Center shows the last command
  result for each card that was run.
- The browser storage policy is documented and discoverable by future contributors.
- No credentials or session cookies are ever written to any form of browser storage.
- No purchase data, product names, or library content is persisted in browser storage; only
  operational metadata (paths, counts, status labels) reaches `localStorage` or `sessionStorage`.
