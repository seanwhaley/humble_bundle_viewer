# HB Library Viewer

Local-first tooling for capturing, normalizing, and exploring a Humble Bundle library.

The project combines a Python CLI, a FastAPI backend, and a React viewer so you can capture your library, build a normalized `library_products.json`, inspect it locally, and optionally run downloads or managed sync workflows.

> This project is not affiliated with or endorsed by Humble Bundle.

Whether you want to inventory years of Humble Bundle purchases, browse everything you own in one place, rescue your eBooks and audiobooks into a cleaner local folder structure, or audit keys and downloads before links expire, `HB Library Viewer` is built around those local-first workflows.

## Stewardship

**Project owner and maintainer:** Sean Whaley (`crazyandol@gmail.com`)

Use this contact for project direction, stewardship questions, or maintainer-level coordination.

## Common user journeys

- refresh and normalize your library data with the CLI or setup flow
- browse purchases, software, videos, downloads, Steam keys, non-Steam keys, eBooks, audiobooks, and expiring items in the viewer
- use browser downloads or managed local sync for software, reading, and listening collections
- inspect artifacts, rebuild derived data, cache subproduct pages, and extract metadata during debugging or maintenance

## Start here

- [Quick Start](getting-started/quickstart.md) — fastest path to a working local setup
- [Installation](getting-started/installation.md) — environment and dependency setup
- [Authentication](guides/authentication.md) — how to supply `_simpleauth_sess` safely
- [Viewer App](guides/viewer-portal.md) — local web UI, setup flow, and advanced sync
- [CLI Reference](guides/cli-reference.md) — command surface and workflows

## Current scope

`HB Library Viewer` currently supports:

- Playwright-based capture of Humble Bundle library API responses
- normalization into `data/artifacts/library_products.json`
- a local viewer for purchases, downloads, software, videos, Steam keys, non-Steam keys, eBooks, audiobooks, and setup flows
- browser-managed downloads from viewer routes
- advanced managed local sync for eBooks and audiobooks via the CLI or viewer
- maintenance workflows for schema export, artifact rebuilds, subproduct page caching, and metadata extraction through the CLI or Command Center

The project does **not** currently aim to provide:

- hosted cloud accounts or multi-user infrastructure
- purchase/account management
- background queue scheduling or the legacy scheduled download model

## Project guides

### Use the tool

- [Configuration](guides/configuration.md)
- [Authentication](guides/authentication.md)
- [Querying Products](guides/querying-products.md)
- [Viewer App](guides/viewer-portal.md)
- [Troubleshooting](help/troubleshooting.md)
- [FAQ](help/faq.md)

### Understand the design

- [Architecture Overview](architecture/overview.md)
- [Data Flow](architecture/data-flow.md)
- [Component Design](architecture/components.md)
- [Configuration Management](architecture/configuration.md)

### Maintain or contribute

- [Contributing](maintainers/contributing.md)
- [Documentation screenshots](maintainers/documentation-screenshots.md)
- [Testing](maintainers/testing.md)
- [Repository Customizations](maintainers/github-customizations.md)

### Planning and active efforts

- [Roadmap](development/roadmap.md)
- [Changelog](development/changelog.md)

Active work efforts live under `docs/development/work-efforts/` while they are in progress and are intentionally excluded from the published docs navigation.

## Security and privacy

- keep `_simpleauth_sess` in local environment files only
- never share `data/artifacts/` publicly because it can contain signed download links
- use the viewer setup flow or local CLI commands instead of embedding credentials in code or docs

See [Security](help/security.md) for reporting guidance.

## Next step

If you want the shortest route to a working local install, head to the [Quick Start](getting-started/quickstart.md).
