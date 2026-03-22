# Troubleshooting

## Browser capture returns no API data

- Check your cookie in `backend/.env`.
- Raise `browser.timeout_ms` and retry.
- Set `browser.headless` to `false` to watch the page load.

## `Playwright` errors

- Run `python -m playwright install` to install browser binaries.

## Download failures

- Check write access to `download.base_folder`.
- Keep `download.rate_limit_delay` at 0.5 or higher.

## HTTP 401 or 403

- Your session cookie expired. Grab a fresh `_simpleauth_sess`.
