# Setup and Command Center Flow — Current vs To-Be

## Purpose

This document captures the current UX state of the **Setup** and **Command Center** routes
and describes the target state for the focused flow and content-organization improvement
defined in this work effort.

---

## Current State

### Setup today (`/setup`)

#### What is working today

- Two-mode design (Capture new library / Use existing library file) correctly models the
  actual user choices.
- `localStorage` already persists `humble.libraryPath` — the last successful library path
  is restored on next visit.
- Download sub-options (platforms, file types, size policy) are progressively disclosed
  behind a checkbox, keeping the default form clean.
- Session cookie is type=password, never stored, and cleared on success.

#### What is not working today

- Three orientation info cards appear at the top of every visit, including returns, so returning users must visually skip past orientation content they already know.
- The "Next tools" card with links to Command Center and Schema appears before any action is taken, which is premature because the user has not yet established any context to use those tools.
- `mode` selection resets to `"capture"` on every page load, so returning users who prefer "use existing" must switch the radio on every visit.
- Download sub-options reset to defaults on every page load, so repeat users lose target platform and file-type preferences.
- After a successful capture or selection, the page auto-navigates to `/` in 800 milliseconds with only a brief in-form toast, which gives users no chance to review what succeeded or navigate to follow-up tools intentionally.

### Command Center today (`/commands`)

#### What is working for Command Center today

- Section grouping (Guided Workflows / Rebuilds and Exports / Enrichment Pipeline) maps
  correctly to distinct user intents.
- Advanced Options pattern hides path overrides without removing them.
- Current-sales status summaries (Fresh / Stale / Missing / Loading / Unavailable) give
  clear operational context before running a command.
- The three top info cards accurately describe each section's purpose and tone.

#### What is not working for Command Center today

- The "Capture + Download" card in Guided Workflows only links to `/setup`, so a full `CommandCard` is used for a link to a page already in the sidebar. That wastes layout space and creates a misleading expectation that clicking does something locally.
- Roughly 15 path override inputs initialize to hardcoded defaults on every render, so users who customized artifact paths lose all changes on navigation. This is the single highest-friction point for repeat maintainers.
- The "Rebuild order models" and "Generate order models" cards are nearly identical, so users must read both descriptions fully to understand the distinction because the difference between artifact directories and API batch directories is buried in label text.
- Command results including status, message, and detail lines are lost on page reload, so users cannot review the outcome of a recently completed command after navigating away and returning.

---

## Target State

> **Note:** The UI interactions and modifications described here must implement the storage policies set in [Viewer Browser Storage](../viewer-browser-storage/current-vs-to-be.md) and consume the unified components established in [Styling Centralization](../styling-centralization/current-vs-to-be.md).

### Setup target behavior (`/setup`)

- On first visit (no prior `humble.libraryPath` in localStorage): show all three orientation
  cards as today — the user genuinely needs the context.
- On return visit (prior path exists): collapse or hide the orientation cards; surface a
  compact status note ("Last used: [path]") instead.
- Restore `mode`, `platforms`, `fileTypes`, and `sizePolicy` from `localStorage` on every
  load.
- On success: instead of an immediate auto-redirect, show an expanded success state with:
  - confirmation of what was loaded (path + product count)
  - the "Next tools" block (links to Command Center and Schema)
  - a "Go to Viewer Home" button the user clicks intentionally
- Auto-redirect may still be offered as a countdown with a cancel option.

### Command Center target behavior (`/commands`)

- Remove the "Capture + Download" / Setup shortcut card from Guided Workflows entirely.
  If a compact pointer to Setup is desired, add one line below the section heading:
  *"To run a full capture workflow, use the [Setup](/setup) page."*
- All path override inputs in Advanced Options are persisted to `localStorage` under
  `humble.commands.*` keys on change.
- Each Advanced Options group has a "Reset to defaults" button that clears the persisted
  values and restores hardcoded defaults.
- "Rebuild order models" and "Generate order models" either:
  - become a single card with a "Source type" radio (Artifact directory / API batch
    directory) that adjusts the visible inputs and endpoint, or
  - keep separate cards but each gains a one-line callout: *"Use this when you have
    saved artifact files"* / *"Use this when you have raw API batch files"*
- Most recent command result per card is persisted in `sessionStorage` and restored on
  page reload (cleared on browser close).

---

## Success Criteria

- **Returning Setup users see their last mode pre-selected**: open Setup after a successful capture and confirm the radio matches the last used mode.
- **Command Center path inputs survive navigation**: set a custom path, navigate to Viewer Home, return to Command Center, and confirm the input still shows the custom value.
- **"Capture + Download" card no longer appears in Command Center**: visually review the Guided Workflows section.
- **"Rebuild" versus "Generate" order model distinction is clear at a glance**: review the page copy or test with users and confirm the distinction is readable without expanding Advanced Options.
- **Success confirmation in Setup offers follow-up navigation before redirecting**: trigger a capture and confirm the "Next tools" block appears in the success state.

---

## Implementation Notes

- `localStorage` key namespace: `humble.setup.*` and `humble.commands.*`
- All browser storage writes should be gated on the window object existing (SSR safety,
  even though this app does not currently SSR)
- The "Capture + Download" card removal is a pure deletion; no backend changes needed
- Path input persistence can be implemented with a small shared `usePersistentState` hook
  or inline `useEffect` + `localStorage` calls, consistent with the existing `STORAGE_KEY`
  pattern already in LibrarySetup
