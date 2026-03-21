---
name: "Subproduct Enrichment Workflows"
description: "Use when working on subproduct page caching, metadata extraction, provenance, and structured analysis/report generation. Covers manifests, extracted metadata, markdown reports, and related tests/docs discipline."
applyTo: "backend/src/hb_library_viewer/subproduct*.py"
---

# Subproduct enrichment workflows

- Keep cache manifests, extracted metadata, and markdown analysis artifacts as separate outputs with explicit purposes.
- Preserve provenance in cache/manifests when transport or domain-level failures affect downstream extraction.
- Treat `index.json`, `metadata.json`, cached HTML pages, and analysis reports as related but distinct artifacts.
- When extraction or cache schema changes, update the relevant backend tests and CLI docs in the same change.
- Human-readable analysis belongs in markdown artifacts; reusable analysis logic belongs in package modules when scripts and CLI both need it.
- Keep reports safe for local use: do not include cookies, raw secrets, or unnecessary signed URL exposure.