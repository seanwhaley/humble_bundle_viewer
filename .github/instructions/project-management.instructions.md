---
name: "Project Management Documentation"
description: "Use when creating or updating active work-effort planning files under docs/development/work-efforts. Covers the required three-file structure, temporary nature of active effort folders, and status-tracking expectations."
applyTo: "docs/development/work-efforts/**"
---

# Project Management Documentation

- Keep project management documentation under `docs/development/work-efforts/{effort-name}/`.
- Each effort folder must contain:
  - `current-vs-to-be.md` (current vs target analysis)
  - `prd.md` (product requirements, spec-driven design)
  - `status.md` (single living status doc)
- Avoid file spamming. Do not add separate interim, final, or summary reports.
- Keep all work-effort updates in `status.md`.
- Treat work-effort folders as temporary active-planning artifacts; once the resulting repository state is implemented and reflected in the appropriate canonical docs/changelog, the effort folder should not linger indefinitely.
