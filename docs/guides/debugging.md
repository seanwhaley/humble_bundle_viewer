# Debugging

Use this guide when captures or downloads fail.

## Enable debug logs

Set `logging.level` to `debug` in `backend/config.yaml` or use `HUMBLE_LOGGING__LEVEL` in `backend/.env`.

## Show the browser

Set `browser.headless` to `false` to see the page load and confirm sign-in.

## Increase timeouts

If the page takes longer to load, raise `browser.timeout_ms` and retry.

## No API responses captured

- Confirm the cookie is valid (see `guides/authentication.md`).
- Wait longer by increasing `browser.timeout_ms`.
- Retry with `browser.headless` set to `false`.

When debug logging is enabled, the capture logs the inferred login state from
the library HTML response (for example `logged_in`, `logged_out`, or
`login_page`). This helps confirm whether the session cookie is accepted.

If the page never reaches a network-idle state, the tool logs a warning and continues.

If the session fails, the capture stops and reports an authentication
error. The tool clears response folders so login-page artifacts are not kept.

When using the viewer setup page, authentication failures return HTTP 401 with
`Authentication failed` in the response body. Replace the `_simpleauth_sess`
cookie and retry.

## Response capture output

- Set `artifacts.save_api_batches: true` to save API batches to
  `data/artifacts/api_responses/`.
- Set `artifacts.save_captured_responses: true` to save raw captured responses (library
  HTML + `/api/v1/orders`) to `data/artifacts/captured_responses/`.
- Set `artifacts.save_html_on_failure: true` to save the library HTML when capture fails
  (no API responses or missing batches).
- Set `artifacts.save_gamekeys: true` to write `data/artifacts/gamekeys.json`.
- The tool clears capture folders it writes before each library page request.
  Saved response files are written as raw bytes to preserve the exact server payload.

When the `/api/v1/orders` response is not valid JSON, the tool logs a warning and writes
diagnostic files named `orders_batch_{n}_non_json.*` or
`orders_batch_{n}_malformed_json.*` in `data/artifacts/api_responses/`.
Use those files to confirm whether the response is HTML, JavaScript, or truncated payload.

## Download failures

- Check that `download.base_folder` exists and is writable.
- Keep `download.rate_limit_delay` at 0.5 or higher.

## Viewer missing bundle items

If the viewer does not show bundle items or download links, rebuild
`library_products.json` from stored API responses:

- Ensure `data/artifacts/api_responses/` contains `orders_batch_*.json` files.
- Run `python -m hb_library_viewer rebuild-library-artifacts` to regenerate library artifacts.
- Refresh the viewer page to load the updated artifacts.

## Order model warnings

If the CLI warns about missing order payload fields, rebuild the order model
from captured API batches:

- `python -m hb_library_viewer rebuild-order-models`
