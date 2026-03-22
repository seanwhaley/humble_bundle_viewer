---
name: project-tools-and-reporting
description: "Use when creating or updating repository tools, maintenance scripts, artifact analyzers, metadata reports, markdown summaries, or JSON reporting workflows. Triggers for `tools/` scripts, report generators, cache analysis, artifact inspection, temp markdown output, and maintenance utilities."
---

# Project Tools and Reporting

Use this skill when the task centers on repository tooling or operational reporting rather than the main product surfaces alone.

## Apply this skill when

- editing files under `tools/`
- adding artifact analysis or reporting scripts
- generating markdown or JSON summaries from repository artifacts
- extending maintenance workflows around caches, metadata, logs, or diagnostics
- deciding whether logic belongs in a reusable backend module versus a standalone script

## Repository-specific focus

This repository has a growing set of operational workflows around:

- cache manifests
- extracted metadata
- artifact validation
- markdown analysis reports
- temporary operator-facing outputs
- helper scripts for local development and maintenance

Those workflows should stay maintainable, explicit, and safe.

## Key files and areas

- Tool scripts: `tools/**`
- Artifact-producing backend modules: `backend/src/hb_library_viewer/**`
- Artifact outputs: `data/artifacts/**`
- Temporary artifacts: `data/artifacts/temp/**`
- Related docs: `docs/guides/**`, `docs/development/**`

## Working principles

### 1. Prefer reusable logic for reusable workflows

- if the logic may be used by both CLI commands and scripts, put the core implementation in `backend/src/hb_library_viewer/**`
- keep thin script wrappers in `tools/` for operator convenience
- avoid duplicating analysis logic across one-off scripts and package modules

### 2. Be explicit about output artifacts

- define where outputs are written
- use structured filenames
- print or log output paths clearly
- separate machine-readable artifacts from human-readable reports when both are useful

### 3. Keep reporting safe and local-first

- never write secrets into reports
- avoid including live credentials, signed URLs, or sensitive raw payloads in generated markdown
- treat artifacts as potentially sensitive local data

### 4. Make scripts operationally friendly

- give scripts clear arguments and defaults
- surface progress for long-running work
- use `HH:MM:SS` for elapsed or ETA-style status output
- document the intended workflow in code comments or related docs when the script becomes part of regular maintenance

## Recommended workflow

1. Decide whether the task belongs in a reusable module, a script wrapper, or both
2. If the task spans many artifacts or maintenance scripts, use a read-only exploration subagent first to inventory inputs, outputs, and affected files
3. Define clear input files and output artifacts
4. Implement the smallest reusable core first
5. Add script or CLI integration second
6. Update tests and docs for stable workflows
7. Run the script or command against representative local artifacts

## Checklist

- [ ] Reusable logic lives in the package when it should be shared
- [ ] Script arguments and outputs are explicit
- [ ] Artifact paths are printed or logged clearly
- [ ] Any subagent-produced inventory or analysis was verified by the main agent before implementation or reporting conclusions
- [ ] Reports avoid leaking secrets or sensitive raw data
- [ ] Long-running scripts include progress output when appropriate
- [ ] Related docs/tests were updated for stable maintenance workflows

## Use alongside

- `doc-standards` for report/document quality
- `python-testing-patterns` for script and reporting validation
- `config-best-practices` when tool behavior introduces new configuration