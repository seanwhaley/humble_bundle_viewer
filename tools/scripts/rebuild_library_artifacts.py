"""Rebuild library artifacts from stored /api/v1/orders responses."""

from __future__ import annotations

import argparse
from pathlib import Path

from hb_library_viewer.artifact_workflows import (
    ORDER_MODEL_CLASS,
    rebuild_library_artifacts_from_api_dir,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACTS_DIR = REPO_ROOT / "data" / "artifacts"


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for rebuilding library artifacts."""
    parser = argparse.ArgumentParser(
        description="Rebuild library artifacts from stored API responses."
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
        "--output-products",
        type=Path,
        default=DEFAULT_ARTIFACTS_DIR / "library_products.json",
        help="Output path for library_products.json.",
    )
    parser.add_argument(
        "--order-model",
        type=Path,
        default=DEFAULT_ARTIFACTS_DIR / "order_payload_models.py",
        help="Generated order model file for validation.",
    )
    parser.add_argument(
        "--order-model-class",
        type=str,
        default=ORDER_MODEL_CLASS,
        help="Class name to load from the order model file.",
    )
    return parser.parse_args()


def main() -> None:
    """Rebuild library_products.json from stored order responses."""
    args = parse_args()
    try:
        result = rebuild_library_artifacts_from_api_dir(
            api_dir=args.api_dir.expanduser().resolve(),
            pattern=args.pattern,
            output_products=args.output_products.expanduser().resolve(),
            order_model_path=args.order_model.expanduser().resolve(),
            order_model_class=args.order_model_class,
        )
    except (FileNotFoundError, ValueError, OSError) as exc:
        raise SystemExit(str(exc)) from exc

    print(
        "Rebuilt library artifacts with "
        f"{result.library.total_products or len(result.library.products)} products"
    )
    print(f"Output written to {result.output_path}")


if __name__ == "__main__":
    main()
