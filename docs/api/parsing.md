# Parsing API

This module turns API batches into structured data.

## Models

- `Download`
- `KeyEntry`
- `Product`
- `LibraryData`

## Parser

Function: `build_library_json`

Inputs:

- List of API batch dictionaries that include a `data` field.

Output:

- A `LibraryData` instance with normalized products, sub-products (`subproducts`), downloads, and keys.

`LibraryData` now includes:

- `products`: normalized products with `created_at`, `downloads`, `keys`, and sub-products (`subproducts`)
- `downloads` include `size_bytes`, `checksums`, and inferred `file_type` when available
- `Product.keys` contains `tpkd_dict.all_tpks` entries when present (key types like Steam, Epic, GOG, etc.)
  and keeps key details such as `redeemed_key_val`, `steam_app_id`, and expiry fields when provided
- Debug metadata (not serialized): `LibraryData.api_responses`, `LibraryData.raw_orders`, and `Product.raw_order`

Raw API batches remain available under `data/artifacts/api_responses/`. Extra
key fields from the API payload remain available when present.

## Model generation from stored API responses

Use `python -m hb_library_viewer generate-order-models` to build a `pydantic`
v2 model from the stored `/api/v1/orders` batch responses. The command parses
every game key and generates a model file with `datamodel-code-generator`.

By default it writes:

- `data/artifacts/order_payload_models.py` (generated `pydantic` v2 models)

Install the dependency from `requirements-dev.txt` before running the command.
Review the derived model artifacts before committing.

The CLI requires `data/artifacts/order_payload_models.py` to parse API payloads.
If the API payloads contain fields missing from the model, the CLI logs a
warning with field paths and continues parsing raw data so the output still
includes the new fields.

Set `artifacts.auto_rebuild_order_models` to automatically rebuild the
model when it detects new fields. If you disable the setting, the CLI
prompts before rebuilding.

You can also rebuild the model directly from stored API batch files with:

- `python -m hb_library_viewer rebuild-order-models`
