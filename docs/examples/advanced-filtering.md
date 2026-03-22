# Advanced Filtering

Use advanced filtering when you want to answer focused library questions from `library_products.json` without recapturing data.

## Common patterns

- Select products where `category` equals `audio` or `ebook`.
- Keep downloads where `platform` equals `ebook`, `audio`, `video`, or `download`.
- Filter out files above a size threshold using `size_bytes`.
- Narrow to products with keys only, downloads only, or mixed ownership data.
- Search bundle-item names through normalized `subproducts` instead of relying only on top-level product names.

## Good surfaces for filtering

- Use the **Viewer App** for route-aware filters, charts, and quick scopes on purchases, downloads, and key routes.
- Use the standalone **Library Products Viewer** for ad hoc JSON inspection and column-level filtering.
- Use custom scripts or notebooks when you need repeatable export, reporting, or cross-field transformations.

## Tip

Save a filtered copy of `library_products.json` before a new run if you are experimenting with one-off derived datasets.
