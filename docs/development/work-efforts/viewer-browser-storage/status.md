# Status — Viewer Browser Storage for UI State

## Status summary

- **State**: Implemented
- **Created**: 2026-03-28
- **Last updated**: 2026-03-29
- **Owner**: TBD

## Scope

Establish a consistent browser storage policy for the viewer and apply it to all currently
ephemeral UI state in the Setup and Command Center routes. This effort does not move any
server-side file to the browser; it only persists presentational preferences that have no
meaning to the CLI or backend.

## Deliverables

- [x] Create `prd.md`
- [x] Create `current-vs-to-be.md`
- [x] Create `status.md`
- [x] Implement `usePersistentState` hook (or inline equivalent) in `frontend/src/`
- [x] Apply `humble.setup.*` localStorage keys to LibrarySetup (mode, download sub-options)
- [x] Apply `humble.commands.*` localStorage keys to all Command Center path override inputs
- [x] Add "Reset to defaults" to each Command Center Advanced Options group
- [x] Apply `humble.session.commands.*` sessionStorage to Command Center recent results
- [x] Write browser storage policy documentation
- [ ] Validate: no credentials in any browser storage after a capture run
- [ ] Validate: all inputs fall back to defaults when storage is unavailable
- [x] Update `docs/guides/viewer-portal.md` to reference the storage policy doc

## Implementation order

1. **`usePersistentState` hook** — foundational, used by all subsequent items
2. **Setup preferences** (mode, download options) — isolated to LibrarySetup, low risk
3. **Command Center path persistence** — high volume (~27 keys), apply uniformly
4. **Command Center "Reset to defaults"** — one button per Advanced Options group
5. **Command Center session results** — requires `sessionStorage` rather than `localStorage`
6. **Documentation** — add browser-storage policy after implementation is validated

## Dependency

The `setup-and-command-center-flow` work effort (removing the Setup card from Command
Center, adding post-success next-tools block) shares the same components. Coordinate or
sequence these efforts to avoid conflicting changes to `LibrarySetup.tsx` and
`CommandCenter.tsx`.

## Notes

- The `usePersistentState` hook should gracefully degrade when `localStorage` is
  unavailable (private browsing, storage quota exceeded). Never throw; fall back to
  in-memory state.
- Session cookie must never be passed to `usePersistentState` — always use plain `useState`
  for `authCookie`.
- The `humble.*` key namespace already has precedent in the existing `humble.libraryPath`
  key; all new keys should follow that convention for discoverability.
