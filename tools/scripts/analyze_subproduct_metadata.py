"""Analyze extracted subproduct metadata with pandas and write markdown output.

This script reads ``metadata.json`` generated from cached external subproduct
pages, computes field coverage and content statistics with pandas, and writes a
condensed markdown summary for review.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
BACKEND_SRC = BACKEND_ROOT / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from hb_library_viewer.subproduct_metadata_analysis import (  # noqa: E402
    write_subproduct_metadata_markdown_report,
)


DEFAULT_METADATA_PATH = (
    REPO_ROOT / "data" / "artifacts" / "subproduct_pages" / "metadata.json"
)
DEFAULT_MANIFEST_PATH = (
    REPO_ROOT / "data" / "artifacts" / "subproduct_pages" / "index.json"
)
DEFAULT_MARKDOWN_PATH = (
    REPO_ROOT
    / "data"
    / "artifacts"
    / "temp"
    / "subproduct_metadata_coverage_summary.md"
)


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for metadata analysis."""

    parser = argparse.ArgumentParser(
        description="Analyze extracted subproduct metadata with pandas."
    )
    parser.add_argument(
        "--metadata-file",
        type=Path,
        default=DEFAULT_METADATA_PATH,
        help="Path to metadata.json generated from cached subproduct pages.",
    )
    parser.add_argument(
        "--output-markdown",
        type=Path,
        default=DEFAULT_MARKDOWN_PATH,
        help="Path to the markdown report to write.",
    )
    parser.add_argument(
        "--manifest-file",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="Path to the subproduct page cache manifest index.json.",
    )
    return parser.parse_args()


def main() -> None:
    """Run the pandas-based metadata analysis and write markdown output."""

    args = parse_args()
    metadata_file = args.metadata_file.expanduser().resolve()
    manifest_file = args.manifest_file.expanduser().resolve()
    output_markdown = args.output_markdown.expanduser().resolve()

    if not metadata_file.exists():
        raise SystemExit(f"Metadata file not found: {metadata_file}")
    if not manifest_file.exists():
        raise SystemExit(f"Manifest file not found: {manifest_file}")

    written_path = write_subproduct_metadata_markdown_report(
        metadata_file,
        manifest_path=manifest_file,
        output_markdown=output_markdown,
    )
    print(f"Wrote markdown analysis to {written_path}")


if __name__ == "__main__":
    main()
