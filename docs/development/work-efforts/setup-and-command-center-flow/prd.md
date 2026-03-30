# PRD — Setup and Command Center Flow Refinement

## Summary

This effort defines targeted process-flow and content-organization improvements for the
**Setup** (`/setup`) and **Command Center** (`/commands`) routes. Both pages are functionally
correct today but have structural issues that create unnecessary friction: premature
orientation content, redundant cross-links, lost user customizations, and a Guided Workflows
card that only links away without doing anything locally.

## Problem Statement

Setup and Command Center are the two highest-effort workflow pages in the portal. Despite
recent UX improvements, several interaction patterns still work against users:

1. **Setup** surfaces next-step orientation cards *before* the user has completed any action,
   front-loading context that would be more useful as a confirmation and follow-up step.
2. **Setup** mode preference and download sub-options reset on every page load, forcing
   re-entry for repeat users.
3. **Command Center** includes a dedicated card whose only purpose is linking to the Setup
   page — a page already represented in the sidebar navigation — creating a dead section at
   the top of a complex route.
4. **Command Center** path override inputs (~15 inputs across four cards) initialize to
   hardcoded defaults on every navigation, discarding any path customizations the user
   entered in a previous session.
5. **The "Rebuild order models" and "Generate order models" cards** present nearly identical
   workflows (both produce `order_payload_models.py`) with an unclear distinction, causing
   users to read both to understand the difference.

## Cross-Effort Integration

**Viewer Browser Storage** (`viewer-browser-storage`): This UX flow document defines *what* behaviors should occur (e.g. keeping paths on navigation), while the browser storage PRD dictates the exact technical implementation rules (such as using `localStorage` over disk files and specifying exact key names like `humble.commands.rebuildArtifactsDir`).

**Styling Centralization** (`styling-centralization`): Any newly crafted states in the Setup and Command Center workflows (e.g., success message panels, reset buttons) must be built using the shared components and variables defined in the styling centralization effort rather than raw Tailwind utility strings.

## Goals

1. Move the "Next tools" orientation block in Setup to a **post-success state** so it
   appears only after a capture or file selection succeeds.
2. Persist Setup's `mode` selection and download sub-options (platforms, file types, size
   policy) in `localStorage` so returning users keep their last configuration.
3. Remove the **"Setup" shortcut card** from Command Center Guided Workflows. If a brief
   entry point to Setup is still desired, replace it with a compact inline footer link
   rather than a full card section.
4. Persist all Command Center **path override inputs** in `localStorage` so customized
   paths survive page navigation.
5. Clarify the **"Rebuild order models" vs "Generate order models"** distinction: either
   merge the two cards into a single card with a workflow selector, or add an explicit
   dependency note that makes the difference actionable at a glance.

## Non-Goals

- Changing the route structure (Setup and Command Center remain separate routes)
- Removing any existing workflow capability from Command Center
- Adding new backend endpoints
- Changing the sidebar navigation structure

## Users and jobs-to-be-done

### Primary users

- A **first-time user** setting up their library for the first time: needs clear steps and
  reassurance after the capture succeeds.
- A **returning user** re-running Setup to switch library files: loses patience if
  mode/options have reset.
- A **maintainer** running periodic Command Center workflows: does not want to re-enter
  custom artifact paths every session.

### Core jobs

- "Help me finish setup and know what to do next."
- "Don't make me re-enter paths I configured last week."
- "Help me understand which order-model card I need without reading both."

## UX principles

- **Progressive disclosure in time**: orientation and follow-up content should appear when
  it is relevant (after success), not on every page load.
- **Persist user choices at the UI layer**: path overrides and mode preferences are
  UI-local state; they should survive navigation like any form input in a native application.
- **Every card should do something here**: a card whose only action is navigating away does
  not belong as a top-level section on the page. Use a link or footer note instead.

## Requirements

### Setup page

- **S-1**: Move the "Next tools" info card out of the page header and into a success state shown after a successful capture or file selection.
- **S-2**: Persist the active `mode` (`"capture"` or `"existing"`) in `localStorage` and restore it on the next visit.
- **S-3**: Persist download sub-options `platforms`, `fileTypes`, and `sizePolicy` in `localStorage` and restore them on the next visit.
- **S-4**: Keep the three explanatory info cards, but consider collapsing them behind a "Learn about these options" disclosure for returning users once `localStorage` shows a prior successful path.

### Command Center page

- **C-1**: Remove the "Capture + Download" / Setup shortcut card from the Guided Workflows section. If an entry to Setup is still needed, add it as a compact link in the section description or as a footer note.
- **C-2**: Persist all path override inputs in `localStorage` using per-input storage keys scoped to `humble.commands.*`, and restore them on the next page load.
- **C-3**: For "Rebuild order models" and "Generate order models", add a clear one-line dependency note such as "Requires saved API batches" versus "Requires saved artifact directory" directly below each card title, or collapse them into a single card with a workflow-mode radio selector and a shared Advanced Options block.
- **C-4**: Provide a "Reset to defaults" affordance for each Advanced Options group so users can easily clear any persisted custom paths.

## Success criteria

- A returning user who customized Command Center paths in a previous session lands on the
  page and sees their saved paths pre-filled without any manual re-entry.
- A first-time user completes a Setup capture and immediately sees the "Next tools" block
  with links to Command Center and Schema as part of the success confirmation.
- Command Center Guided Workflows no longer contains any card whose primary action is just
  linking to another page already in the sidebar navigation.
- The distinction between "Rebuild order models" and "Generate order models" is
  understandable without reading both card descriptions in full.

## Out of scope for this effort

- Persisting command result history across page reloads (tracked in the browser-storage
  work effort for UI state)
- Changes to the backend library runner or maintenance API surface
- Redesigning the overall Command Center section structure beyond removing the Setup card
