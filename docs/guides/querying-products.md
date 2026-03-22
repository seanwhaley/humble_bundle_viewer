# Querying Products

Use the generated `data/artifacts/library_products.json` file to explore your library without re-running the capture.

## File layout

The data file root contains:

- `products`: list of product objects
- `total_products`: count of products
- `captured_at`: capture time

Each product includes:

- `gamekey`
- `product_name`
- `category`
- `created_at` (ISO date)
- `downloads` (files with `platform`, `name`, `url`, `size_bytes`, `checksums`, and inferred `file_type`)
- `keys` (redeemable keys with `key_type`, `human_name`, `redeemed_key_val`, `steam_app_id`, and expiry fields when present)
- `subproducts` (normalized bundle items with `downloads`, optional `keys`, and `payee`)

Raw API batches remain available under `data/artifacts/api_responses/`.

## Common queries

- **Find all e-book products**: filter `products` where `category` equals `ebook`.
- **List all download links**: collect `url` from each item in `downloads`.
- **List all keys**: collect entries in `products[].keys` by `key_type`.
- **Count file types**: group product downloads by URL extension or `name`.
- **Find large files**: filter `downloads` where `size_bytes` is above your threshold.

## Tips

- Keep a backup of `library_products.json` before running again.
- Use the `platforms` setting to limit downloads in the next run.
- For lightweight interactive exploration without starting the full web app, open the standalone Library Products Viewer in
  `docs/assets/tools/library-products-viewer.html`.
- To generate a viewer schema for validation, run `python -m hb_library_viewer build-viewer-assets`.

## Choose the right exploration surface

- Use the standalone **Library Products Viewer** for raw JSON inspection, quick filtering, and schema-aware troubleshooting.
- Use the main **Viewer App** when you want route-specific dashboards, guided setup, current-sales analysis, or managed download workflows.
- Use CLI rebuild/export commands when you need to refresh artifacts or generate derived reports before inspecting the results.
