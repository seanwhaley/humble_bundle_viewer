---
name: "Download Link Labeling"
description: "Use when changing how viewer download links are labeled, filtered, or displayed. Keep label derivation backend-owned, load the packaged JSON policy, and avoid duplicating route-specific heuristics in the frontend."
applyTo: "{backend/src/hb_library_viewer/download_labels.py,backend/src/hb_library_viewer/data/download_label_policy.json,backend/app/services/library_loader.py,frontend/src/utils/downloads.ts,frontend/src/components/AdvancedManagedSyncPanel.tsx,frontend/src/app/routes/Ebooks.tsx,frontend/src/app/routes/Audiobooks.tsx,frontend/src/app/routes/Videos.tsx,frontend/src/app/routes/Software.tsx,docs/guides/download-labeling-policy.md}"
---

# Download link labeling

- Treat `backend/src/hb_library_viewer/download_labels.py` plus `backend/src/hb_library_viewer/data/download_label_policy.json` as the canonical source for viewer-facing download labels.
- When handling download link labeling, filtering, or display, load and follow the policy in `docs/guides/download-labeling-policy.md`.
- Keep derived label fields load-time only; do not turn `library_products.json` into the source of truth for display labels.
- The backend should derive `display_label`, `content_label`, `package_label`, and `display_category`; the frontend should consume them.
- Do not add new route-specific label guessing in React pages when the policy JSON or backend derivation layer can be updated instead.
- Media routes should prefer `content_label`; software routes should prefer `display_label`.
- Keep package/install details available for software and as secondary detail for media, but do not surface ZIP-like packaging as the primary label for media unless needed for disambiguation.
- Update docs and tests whenever the label policy or derived fields change.