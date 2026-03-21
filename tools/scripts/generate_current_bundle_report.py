"""Fetch current Humble bundle pages and write a saved overlap report.

The script saves raw HTML plus parsed JSON/markdown artifacts under a dedicated
subfolder in ``data/artifacts`` so the final analysis can be regenerated from the
saved files instead of requiring a live re-fetch.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_SRC = REPO_ROOT / "backend" / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from hb_library_viewer.current_bundles import (  # noqa: E402
    DEFAULT_TIMEOUT_SECONDS,
    capture_and_report_current_bundles,
)


DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "artifacts" / "current_bundles"
DEFAULT_LIBRARY_PATH = REPO_ROOT / "data" / "artifacts" / "library_products.json"


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the current-bundles reporting workflow."""

    parser = argparse.ArgumentParser(
        description=(
            "Fetch the live Humble bundles index and bundle pages, save the raw HTML, "
            "and generate an owned-vs-new overlap report from the saved artifacts."
        )
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where raw HTML and report artifacts will be written.",
    )
    parser.add_argument(
        "--library-file",
        type=Path,
        default=DEFAULT_LIBRARY_PATH,
        help="Path to library_products.json used for overlap comparison.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="HTTP timeout for the bundles index and bundle page requests.",
    )
    return parser.parse_args()


def main() -> None:
    """Run the saved-artifact current bundle overlap workflow."""

    args = parse_args()
    artifacts = capture_and_report_current_bundles(
        output_dir=args.output_dir.expanduser().resolve(),
        library_path=args.library_file.expanduser().resolve(),
        timeout_seconds=args.timeout_seconds,
    )
    print(f"Analyzed {artifacts.bundle_count} bundle pages")
    print(f"Output directory: {artifacts.output_dir}")
    print(f"Saved index HTML: {artifacts.index_html_path}")
    print(f"Saved bundle link list: {artifacts.bundle_links_path}")
    print(f"Saved parsed catalog: {artifacts.catalog_json_path}")
    print(f"Saved report JSON: {artifacts.report_json_path}")
    print(f"Saved report markdown: {artifacts.report_markdown_path}")


if __name__ == "__main__":
    main()
