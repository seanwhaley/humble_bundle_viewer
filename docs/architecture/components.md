# Component Design

## Modules

- `config.py`: settings models and source priority.
- `browser/`: `BrowserManager` orchestration, capture utilities, and persistence helpers.
- `parsing.py`: `Download`, `Product`, `LibraryData`, and parsing.
- `download.py`: `FileDownloader` and download process.
- `utils.py`: shared helpers and exceptions.
- `cli.py`: entry point orchestration.

## Responsibilities

Each module keeps a focused role and exposes public functions with docs and type hints.
