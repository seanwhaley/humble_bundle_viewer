---
name: "Secrets and Artifacts Safety"
description: "Use when changing backend, frontend, tools, docs, or generated reports that might touch auth cookies, signed URLs, local artifacts, logs, or screenshots. Covers secret-safe handling and sanitized reporting."
applyTo: "{backend/**,frontend/**,tools/**,docs/**,README.md}"
---

# Secrets and artifacts safety

## Never expose or commit

- `_simpleauth_sess`, `HUMBLE_AUTH_COOKIE`, or any live auth/session values
- contents of `backend/.env`
- signed or time-limited download URLs
- authenticated HTML or JSON payloads copied from local artifacts
- screenshots, logs, or reports that include sensitive local data

## Treat artifact stores as sensitive local data

- Treat `data/artifacts/**` and `backend/data/artifacts/**` as local-first working data, not public source content.
- Prefer derived markdown/JSON summaries over embedding raw authenticated payloads in docs or issues.
- When you must reference artifact content, summarize it and point to the local path rather than pasting sensitive bodies.

## Safe output patterns

- Use placeholders or synthetic tokens in tests, docs, examples, and screenshots.
- Keep frontend-visible responses, logs, and telemetry free of cookies, signed URLs, and backend-only secrets.
- For long-running scripts or CLI workflows, report output paths and aggregate status instead of dumping raw payloads.
- Sanitize examples before adding them to README files, issue templates, prompts, or generated reports.

## Testing and review reminders

- Keep real auth/download tests opt-in through the documented environment flags.
- Review diffs for credentials, signed URLs, or copied artifact payloads before finishing `.github`, docs, tooling, or product changes.