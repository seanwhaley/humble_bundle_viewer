"""Generate Pydantic v2 models from stored orders API responses."""

from __future__ import annotations

import argparse
from pathlib import Path

from hb_library_viewer.artifact_workflows import (
    ORDER_MODEL_CLASS,
    generate_order_models_from_api_dir,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACTS_DIR = REPO_ROOT / "data" / "artifacts"


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for order model generation."""
    parser = argparse.ArgumentParser(
        description=(
            "Generate Pydantic v2 models from stored /api/v1/orders responses."
        )
    )
    parser.add_argument(
        "--api-dir",
        type=Path,
        default=DEFAULT_ARTIFACTS_DIR / "api_responses",
        help="Directory containing orders_batch_*.json files.",
    )
    parser.add_argument(
        "--pattern",
        type=str,
        default="orders_batch_*.json",
        help="Filename glob for API batch files.",
    )
    parser.add_argument(
        "--output-models",
        type=Path,
        default=DEFAULT_ARTIFACTS_DIR / "order_payload_models.py",
        help="Output path for generated Pydantic models.",
    )
    parser.add_argument(
        "--class-name",
        type=str,
        default=ORDER_MODEL_CLASS,
        help="Root class name for generated models.",
    )
    return parser.parse_args()


def main() -> None:
    """Generate order payload models from stored API responses."""
    args = parse_args()
    try:
        result = generate_order_models_from_api_dir(
            api_dir=args.api_dir.expanduser().resolve(),
            pattern=args.pattern,
            output_models=args.output_models.expanduser().resolve(),
            class_name=args.class_name,
        )
    except (FileNotFoundError, ValueError, OSError) as exc:
        raise SystemExit(str(exc)) from exc

    print(f"Generated {result.payload_count} payload models")
    print(f"Output written to {result.output_path}")


if __name__ == "__main__":
    main()
