# Batch Operations

Use batch operations when you want to regenerate artifacts, analyze saved captures, or prepare grouped outputs from the normalized library data.

## Common batch tasks

- Group products by `category` and count totals.
- Build a list of all `gamekey` values for auditing.
- Export download links for a specific platform.
- Rebuild `library_products.json` from saved API batches.
- Export the viewer schema for validation and debugging.
- Refresh saved current sales bundle or current Choice reports before reviewing them in the viewer.

## Best tools for batch work

- Use `python -m hb_library_viewer` for capture and rebuild workflows.
- Use **Command Center** in the viewer for guided maintenance tasks that mirror the main CLI actions.
- Use the normalized JSON file as the input for external analysis scripts when you need custom reports.

## Related guides

- `guides/cli-reference.md`
- `guides/viewer-portal.md`
- `guides/querying-products.md`
