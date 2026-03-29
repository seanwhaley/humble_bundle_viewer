# Status — Setup and Command Center Flow Refinement

## Status summary

- **State**: Implemented
- **Created**: 2026-03-28
- **Last updated**: 2026-03-29
- **Owner**: TBD

## Scope

Targeted flow and content-organization improvements for the `/setup` and `/commands` routes:

- Remove the redundant Setup shortcut card from Command Center Guided Workflows
- Persist Command Center path override inputs in `localStorage`
- Move Setup's "Next tools" orientation block to the post-success state
- Persist Setup mode and download sub-options across page loads
- Clarify the Rebuild vs Generate order model distinction

## Deliverables

- [x] Create `prd.md`
- [x] Create `current-vs-to-be.md`
- [x] Create `status.md`
- [x] Implement Setup localStorage persistence (mode, platforms, fileTypes, sizePolicy)
- [x] Implement post-success "Next tools" block in Setup
- [x] Remove "Capture + Download" card from Command Center Guided Workflows
- [x] Implement `humble.commands.*` localStorage persistence for all path override inputs
- [x] Add "Reset to defaults" affordance to each Advanced Options group
- [x] Resolve "Rebuild order models" vs "Generate order models" clarity (merge or annotate)
- [x] Update `docs/guides/viewer-portal.md` to reflect the changed Setup and Command Center behavior
- [ ] Validate with browser review and frontend build

## Implementation order

1. **Setup persistence** (S-2, S-3) — small, safe, isolated localStorage reads/writes
2. **Setup post-success block** (S-1) — replace auto-redirect with intentional navigation + next-tools
3. **Remove Setup card from Command Center** (C-1) — pure deletion, one card removed
4. **Command Center path persistence** (C-2, C-4) — shared pattern, apply across ~4 cards
5. **Order model card clarity** (C-3) — decide merge vs annotate first, then implement

## Notes

- The `STORAGE_KEY = "humble.libraryPath"` pattern in `LibrarySetup.tsx` is the precedent
  for all new localStorage usage in this effort
- All `localStorage` writes should be guarded against SSR environments even though the app
  does not currently SSR
- The Setup post-success state should still support a "Redirect in Ns" countdown for users
  who prefer automatic navigation
