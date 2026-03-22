# Data Flow

This flow shows how data moves from the library page to downloaded files.

## Steps

1. The browser loads the library page.
2. `BrowserManager` (from `browser.manager`) extracts game keys and captures `/api/v1/orders` responses.
3. The parser builds normalized structured data with `build_library_json`.
4. The download module writes files to `download.base_folder`.
5. The tool stores library HTML and API responses in `data/artifacts/captured_responses/`, API batches in `data/artifacts/api_responses/`, and game keys in `data/artifacts/gamekeys.json`.

## Outputs

- `data/artifacts/library_products.json` contains normalized products, downloads, keys, and sub-products.
- Raw API batches remain available under `data/artifacts/api_responses/`.
- Downloaded files go to `download.base_folder`.
