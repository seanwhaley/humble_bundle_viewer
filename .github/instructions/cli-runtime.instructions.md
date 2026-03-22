---
name: "CLI Runtime UX"
description: "Use when changing HB Library Viewer CLI commands, long-running command output, runtime status helpers, or CLI docs. Covers start/progress/completion output, HH:MM:SS elapsed/ETA formatting, artifact path reporting, and required docs/test updates."
applyTo: "{backend/src/hb_library_viewer/cli.py,backend/src/hb_library_viewer/runtime_status.py,docs/guides/cli-reference.md}"
---

# CLI runtime UX

- Keep `python -m hb_library_viewer` stable; do not break the top-level CLI entry point.
- Long-running commands should emit clear start, progress, and completion status.
- When showing elapsed time, retry delays, or ETA-style estimates, use `HH:MM:SS` formatting.
- Important artifact, cache, log, and report outputs must print or log their final path.
- When CLI behavior changes, update both tests and `docs/guides/cli-reference.md` in the same change.
- Favor concise operational logging: counts, current item/domain when useful, elapsed, ETA, and notable recovery/failure details.
- Keep user-facing CLI messaging safe: never print `_simpleauth_sess`, live secrets, or signed URLs.