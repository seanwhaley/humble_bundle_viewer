"""Build schema assets for the Library Products Viewer."""

from __future__ import annotations

import argparse
from pathlib import Path

from hb_library_viewer.artifact_workflows import write_viewer_schema


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCHEMA_OUTPUT = REPO_ROOT / "docs" / "tools" / "library-products-schema.json"


def main() -> None:
    """CLI entry point for generating viewer schema assets."""
    parser = argparse.ArgumentParser(description="Build viewer schema from LibraryData")
    parser.add_argument(
        "--schema-output",
        type=Path,
        default=DEFAULT_SCHEMA_OUTPUT,
        help="Output path for viewer schema",
    )
    args = parser.parse_args()

    written_path = write_viewer_schema(args.schema_output.expanduser().resolve())
    print(f"Viewer schema written to {written_path}")


if __name__ == "__main__":
    main()
