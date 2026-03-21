# Library Products Viewer

Use the **Library Products Viewer** to explore `data/artifacts/library_products.json` in a search and filter UI.

## What it does

- Search by product name, game key, machine name, or category.
- Filter by category and download platform.
- Use per-column drop-down filters (multi-select) including a **Blank** option; key columns show **Reviewed** or **Blank** instead of key values.
- Adjust rows per page and jump to a specific page from the pagination controls.
- Expand/collapse products and show/hide meta details or downloads.
- Show bundle items from normalized `subproducts` when present.
- Switch to a bundle-item view when bundles contain 2+ items.
- Use the dashboard charts to filter results interactively.
- Click download links (with a confirmation prompt) to open files in a new tab.
- View products with keys in the **Keys** section (key values require reveal).
- Use the **e-books** and **audiobooks** pages to select titles and trigger
  browser-managed downloads to the machine running the browser.
- Use the row selection controls to select all or none of the visible titles,
  then start multi-file browser downloads (your browser may ask for permission
  before downloading several files).
- Download buttons change color when links are expiring (amber) or expired (red),
  and expired selections prompt you to capture a fresh library file. The warning
  window is configurable via `viewer.link_expiry_warning_hours`.

## How to use it

1. Open `docs/tools/library-products-viewer.html` in a browser.
2. Load your `library_products.json` file when prompted.

If you are running the viewer app, use the **Setup** page to either capture
fresh data with your session cookie or load an existing
`library_products.json` file. The viewer uses the cookie only for the capture
run and does not save it. See `guides/viewer-portal.md` for setup details.

The **Command Center** page exposes the main maintenance workflows in the web
UI, including rebuilding models/artifacts, exporting the viewer schema,
caching subproduct pages, and extracting structured metadata.

If you want schema validation in the viewer, generate the schema with
`python -m hb_library_viewer build-viewer-assets`. The command uses the
`LibraryData` model from the project to export a schema for validation.

If bundle items are missing, rebuild `data/artifacts/library_products.json` from
stored API responses with
`python -m hb_library_viewer rebuild-library-artifacts`, then refresh the
viewer.

The viewer will attempt to load `data/artifacts/library_products.json` by default
when the file exists at the standard location. Refresh the page after a new
CLI run to see updated data.
If your browser blocks local file access, run a local server (for example,
`mkdocs serve`) or use the file picker instead.

The file contains signed download links, so keep it private.

## Notes

- The viewer runs entirely in your browser and does not upload data.
- Bundle items use normalized `subproducts`; when missing, the viewer falls
  back to top-level downloads and inferred titles based on filenames.
- If you see a blank page, ensure you selected a valid data file with a `products` array.
