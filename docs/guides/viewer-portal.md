# Viewer Portal Guide

This guide summarizes the current viewer portal behavior for setup, maintenance, styling, and browser storage.

## Setup route (`/setup`)

The Setup route supports two workflows:

- **Capture new library** — run a fresh capture using the current `_simpleauth_sess` value
- **Use existing library file** — point the viewer at a previously captured `library_products.json`

### Setup behavior

- Setup mode is persisted in `localStorage`
- Download preference inputs (`platforms`, `fileTypes`, `sizePolicy`) are persisted in `localStorage` under the `humble.setup.download.*` namespace
- The session cookie is used only for the active capture request and is not persisted
- After a successful capture or file selection, a post-success panel appears with direct links to:
  - Command Center
  - Schema
  - Overview
- The post-success panel includes a short automatic redirect countdown to Overview that can be canceled

## Command Center route (`/commands`)

The Command Center exposes viewer-safe maintenance workflows.

### Current behavior

- Advanced path and option inputs are persisted in `localStorage` under the `humble.commands.*` namespace
- Each Advanced Options disclosure remembers whether it is open for the current tab session using `humble.session.advancedOptions.*`
- Each advanced-options group provides a **Reset to defaults** action
- Recent command result state is persisted for the current tab session using `sessionStorage`
- The redundant Setup shortcut card has been removed from the Guided Workflows section; use the sidebar or the compact inline Setup link instead
- The distinction between **Rebuild order models** and **Generate order models** is called out directly in the card copy

## Styling and UI conventions

The viewer now uses semantic tokens and shared primitives for the maintenance and setup workflows.

Read:

- [`../development/styling-conventions.md`](../development/styling-conventions.md)
- [`../development/browser-storage-policy.md`](../development/browser-storage-policy.md)

## Operational notes

- Browser storage is used only for UI-layer convenience state, never for credentials or backend-owned artifacts
- `library_products.json`, generated models, schemas, and cached pages remain filesystem/backend artifacts
- If browser storage is unavailable, the UI falls back to in-memory state
