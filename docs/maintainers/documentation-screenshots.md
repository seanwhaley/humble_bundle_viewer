# Documentation screenshots

The repository keeps public-facing viewer screenshots under `docs/assets/screenshots/`.

These screenshots are generated from the running frontend with:

- committed fixture responses for `/api/*`
- static-value overrides for any text that would otherwise reveal local library details
- deterministic viewport sizes per page

This keeps README and guide images reproducible, checkable, and safe to publish.

## Generated assets

The screenshot manifest lives at:

`docs/assets/screenshots/library.json`

Current committed pages:

- `viewer-home-readme.png` — sanitized homepage image for `README.md`
- `viewer-setup.png` — setup workflow image for `docs/guides/viewer-portal.md`
- `viewer-command-center.png` — command center image for `docs/guides/viewer-portal.md`

## Refresh the screenshots

1. Start the local frontend.

   Preferred repo command:

   `python tools/start_dev.py`

2. Generate the committed screenshots.

   `python tools/scripts/capture_documentation_screenshots.py`

3. Review the updated PNGs under `docs/assets/screenshots/`.

## Check that screenshots are current

Use the check mode to render screenshots into a temporary directory and compare them to the committed PNGs.

`python tools/scripts/capture_documentation_screenshots.py --check`

The command exits non-zero when the committed images are stale.

## Add another page

1. Add a new page entry to `docs/assets/screenshots/library.json`
2. Add any required fixture JSON files under `docs/assets/screenshots/fixtures/`
3. If the page needs deterministic text replacement, add a stable `data-doc-id` target in the relevant React component
4. Regenerate screenshots with `capture_documentation_screenshots.py`
5. Reference the committed PNG from `README.md` or the appropriate docs page

## Recommended future additions

If more documentation screenshots are needed later, the next best candidates are:

- `Sales Overview` (`/sales`) for the current-sales dashboard
- `eBooks` (`/library/ebooks`) for a representative download-management route

Those were left out of the first batch to keep the fixture surface small while covering the most README- and guide-relevant pages first.
