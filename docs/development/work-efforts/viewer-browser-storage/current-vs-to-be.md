# Viewer Browser Storage — Current vs To-Be

## Purpose

This document describes the current state of browser storage use in the viewer portal,
identifies the gap between today's ad-hoc pattern and a consistent policy, and defines the
target state for deliberate, safe browser storage use.

---

## Current State

### What the viewer persists today

- **`humble.libraryPath`** lives in **`localStorage`**, is managed from `LibrarySetup.tsx`, and stores the last successful library file path. It is restored as the default for both `outputPath` and `existingPath` on mount.

That is the entirety of intentional browser storage use in the viewer frontend. One key,
in one component.

### What is thrown away on every navigation

- **`mode`** in `LibrarySetup` always resets to `"capture"`.
- **`platformsInput`, `fileTypesInput`, and `sizePolicy`** in `LibrarySetup` always reset to `"ebook, audio"`, `""`, and `"all"`.
- **All ~15 path override inputs** in `CommandCenter` always reset to hardcoded defaults relative to `data/artifacts/…`.
- **Most recent command result per card** in `CommandCenter` always reinitializes to `createIdleState()` on mount.

### Localhost security context

The viewer runs on `localhost` — the user's own machine is both the client and the server.
Browser storage at `localhost` is same-origin isolated from external web pages. The
realistic risks are: browser extensions with broad host permissions that include
`localhost`, and someone with access to the user's browser profile directory. Both are
lower-risk than a public web app, but neither is zero.

**Filesystem paths in `localStorage`** (including the existing `humble.libraryPath`) often
contain the OS username (e.g., `C:\Users\username\Downloads`). This is accepted in the
localhost context but is noted: every new path key added extends the exposure footprint.
Path values must contain only filesystem locations, never purchase or library data content.

### What is correctly and intentionally on disk (server)

- **`library_products.json`** is owned by the CLI and viewer backend and stays on disk because it contains purchase history and order records, which are private personal data, and because both systems consume it.
- **`data/artifacts/api_responses/*.json`** is owned by the CLI and stays on disk because it contains raw order API responses, which are private personal data, and because rebuild workflows depend on it.
- **`data/artifacts/order_payload_models.py`** is shared by the CLI and viewer backend and stays on disk as a pipeline artifact derived from private data.
- **`data/artifacts/subproduct_pages/`** is owned by the CLI and stays on disk because it is an HTML cache derived from purchase data and is too large for browser storage.
- **`data/artifacts/subproduct_pages/metadata.json`** is shared by the CLI and viewer backend and stays on disk because it contains extracted purchase metadata used by the viewer library loader.
- **`data/artifacts/current_bundles/`** is shared by the CLI and viewer backend and stays on disk because it contains report output with sales and purchase overlap data.
- **`data/artifacts/current_choice/`** is shared by the CLI and viewer backend and stays on disk because it contains report output with monthly choice purchase data.
- **`docs/assets/tools/library-products-schema.json`** is owned by the CLI and stays on disk because it is a schema artifact read by standalone tooling.
- **`backend/config.yaml` and `backend/.env`** are owned by the backend and stay on disk because they are configuration files that may contain sensitive defaults.

---

## Target State

> **Note:** The keys and persistence rules defined here directly satisfy the persistence requirements established in [Setup and Command Center Flow](../setup-and-command-center-flow/current-vs-to-be.md) and those shared form controls must use the new styles from [Styling Centralization](../styling-centralization/current-vs-to-be.md).

### Defined storage tier policy

```text
Server file      — data artifacts, generated outputs, backend config
localStorage     — long-lived UI preferences (survive browser close)
sessionStorage   — session-scoped ephemeral UI state (cleared on close)
In-memory only   — credentials, running state, one-shot form values
```

### What moves to localStorage

- `humble.setup.mode`: type `"capture" | "existing"`, default `"capture"`
- `humble.setup.download.platforms`: type `string`, default `"ebook, audio"`
- `humble.setup.download.fileTypes`: type `string`, default `""`
- `humble.setup.download.sizePolicy`: type `"all" | "smallest" | "largest"`, default `"all"`
- `humble.commands.rebuildArtifactsDir`: type `string`, default `"data/artifacts"`
- `humble.commands.rebuildPattern`: type `string`, default `"orders_batch_*.json"`
- `humble.commands.rebuildOrderModelPath`: type `string`, default `"data/artifacts/order_payload_models.py"`
- `humble.commands.rebuildOrderClass`: type `string`, default `"OrderPayloadList"`
- `humble.commands.generateApiDir`: type `string`, default `"data/artifacts/api_responses"`
- `humble.commands.generatePattern`: type `string`, default `"orders_batch_*.json"`
- `humble.commands.generateOutputModels`: type `string`, default `"data/artifacts/order_payload_models.py"`
- `humble.commands.generateClassName`: type `string`, default `"OrderPayloadList"`
- `humble.commands.libraryApiDir`: type `string`, default `"data/artifacts/api_responses"`
- `humble.commands.libraryPattern`: type `string`, default `"orders_batch_*.json"`
- `humble.commands.libraryOutputProducts`: type `string`, default `"data/artifacts/library_products.json"`
- `humble.commands.libraryOrderModelPath`: type `string`, default `"data/artifacts/order_payload_models.py"`
- `humble.commands.libraryOrderModelClass`: type `string`, default `"OrderPayloadList"`
- `humble.commands.cacheLibraryFile`: type `string`, default `"data/artifacts/library_products.json"`
- `humble.commands.cacheDir`: type `string`, default `"data/artifacts/subproduct_pages"`
- `humble.commands.cacheQuery`: type `string`, default `""`
- `humble.commands.cacheUrl`: type `string`, default `""`
- `humble.commands.cacheLimit`: type `string`, default `""`
- `humble.commands.cacheMaxFailures`: type `string`, default `"1"`
- `humble.commands.cacheDomainWorkers`: type `string`, default `""`
- `humble.commands.metadataCacheDir`: type `string`, default `"data/artifacts/subproduct_pages"`
- `humble.commands.metadataOutputFile`: type `string`, default `""`
- `humble.commands.metadataReportFile`: type `string`, default `"data/artifacts/temp/subproduct_metadata_coverage_summary.md"`
- `humble.commands.schemaOutput`: type `string`, default `"docs/assets/tools/library-products-schema.json"`

### What moves to sessionStorage

- `humble.session.commands.<commandId>` stores serialized `CommandState` data including status, message, and `detailLines`, and it is cleared when the browser tab or session closes.

Note: `detailLines` in command results contain output paths and operational counts
(e.g., `"Output folder: data/artifacts"`, `"Bundles captured: 12"`). They must not include
purchase records, product names, or library data excerpts. The current command set meets
this requirement; any future command that would include library content in its
`detailLines` must fetch that data from the backend on demand instead.

### What stays in-memory only (never persisted)

- `authCookie` in LibrarySetup — a full Humble Bundle account-access credential; must
  never be passed to any storage API, including `sessionStorage`, even transiently
- `status` and `message` during a running command — ephemeral in-flight state
- Any error objects or async race conditions

---

## Implementation approach

### Shared hook (recommended)

A small `usePersistentState<T>` hook wraps `useState` with `localStorage` reads/writes:

```typescript
function usePersistentState<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersisted = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // storage full or unavailable — degrade gracefully
    }
  };

  return [value, setPersisted];
}
```

This is consistent with the existing ad-hoc `localStorage.getItem(STORAGE_KEY)` pattern
in `LibrarySetup` but makes the read/write contract explicit and reusable.

### Reset to defaults

Each Advanced Options group in Command Center should include:

```typescript
<button
  type="button"
  onClick={() => {
    setMyPath(DEFAULT_MY_PATH);
    localStorage.removeItem("humble.commands.myPath");
  }}>
  Reset to defaults
</button>
```

---

## Success criteria

- **Command Center path inputs survive navigation**: set custom paths, navigate to Overview, return to Command Center, and confirm the inputs still show the custom values.
- **Session results shown on return**: run a command, navigate away, return in the same session, and confirm the last result is still visible.
- **Setup mode remembered**: select "Use existing", navigate away, return, and confirm the radio still shows "Use existing".
- **Auth cookie never persisted**: inspect `localStorage` and `sessionStorage` after a capture run and confirm no cookie value is present.
- **Soft degradation on storage failure**: simulate unavailable `localStorage` in a private-mode style edge case and confirm form inputs still work with defaults.

---

## Notes on CLI divergence

The CLI writes all outputs to disk. The viewer browser storage layer is **additive**:

- It does not replace or shadow any file the CLI writes
- It does not attempt to write to disk (no File System Access API in this effort)
- Changing a path override in the viewer browser UI does not change `config.yaml` or any
  environment variable the CLI reads
- The CLI and viewer share the server artifact layer; browser storage sits above and beside
  it, invisible to the CLI
