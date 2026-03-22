"""Shared artifact and schema workflows used by the CLI and viewer backend."""

from __future__ import annotations

import json
import logging
import shutil
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from .api_batches import ApiBatchLike
from .artifacts import load_api_response_batches
from .model_generation import (
    extract_order_payloads_from_batches,
    find_missing_order_payload_paths,
    generate_order_models,
    load_order_payloads,
)
from .parsing import LibraryData, build_library_json

logger = logging.getLogger(__name__)

ORDER_MODEL_CLASS = "OrderPayloadList"


class OrderModelWorkflowResult(BaseModel):
    """Result of rebuilding or generating order payload models."""

    output_path: Path
    payload_count: int
    missing_paths: list[str] = Field(default_factory=list)


class LibraryArtifactWorkflowResult(BaseModel):
    """Result of rebuilding the normalized library artifact."""

    output_path: Path
    library: LibraryData

    @property
    def total_products(self) -> int:
        """Return the total number of products in the rebuilt library."""

        return self.library.total_products or len(self.library.products)


class ViewerSchemaWorkflowResult(BaseModel):
    """Result of generating the viewer schema artifact."""

    output_path: Path


def library_products_path(artifacts_dir: Path) -> Path:
    """Return the default `library_products.json` path for an artifacts folder."""
    return artifacts_dir / "library_products.json"


def write_json_file(path: Path, payload: Any) -> None:
    """Write a JSON payload to disk, creating parent directories first."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def summarize_missing_paths(paths: list[str] | set[str], limit: int = 8) -> str:
    """Build a compact preview string for missing order-model field paths."""
    if not paths:
        return ""
    ordered = sorted(paths)
    preview = ", ".join(ordered[:limit])
    remaining = len(ordered) - limit
    if remaining > 0:
        return f"{preview} (+{remaining} more)"
    return preview


def write_order_model_artifacts(
    api_responses: Sequence[ApiBatchLike],
    artifacts_dir: Path,
    *,
    model_path: Path | None = None,
    class_name: str = ORDER_MODEL_CLASS,
) -> None:
    """Generate order payload models from captured API responses."""
    order_payloads = extract_order_payloads_from_batches(api_responses)
    if not order_payloads:
        logger.info("No order payloads available for model generation")
        return

    resolved_model_path = model_path or (artifacts_dir / "order_payload_models.py")
    if resolved_model_path.exists():
        backup_path = resolved_model_path.with_name(
            f"{resolved_model_path.stem}.previous{resolved_model_path.suffix}"
        )
        try:
            shutil.copy2(resolved_model_path, backup_path)
            logger.info("✓ Backed up order payload model: %s", backup_path)
        except OSError as exc:
            logger.warning("Failed to back up order payload model: %s", exc)

    try:
        generate_order_models(
            order_payloads, resolved_model_path, class_name=class_name
        )
    except RuntimeError as exc:
        logger.warning("Skipping order model generation: %s", exc)
    except (ValueError, OSError) as exc:
        logger.warning("Order model generation failed (%s)", type(exc).__name__)


def rebuild_order_models_from_artifacts(
    *,
    artifacts_dir: Path,
    pattern: str = "orders_batch_*.json",
    order_model_path: Path | None = None,
    order_model_class: str = ORDER_MODEL_CLASS,
) -> OrderModelWorkflowResult:
    """Rebuild order payload models from saved API response artifacts."""
    api_dir = artifacts_dir / "api_responses"
    if not api_dir.exists():
        raise FileNotFoundError(f"API response directory not found: {api_dir}")

    batches = load_api_response_batches(api_dir, pattern)
    if not batches:
        raise FileNotFoundError(f"No API response artifacts found in {api_dir}")

    resolved_model_path = order_model_path or (
        artifacts_dir / "order_payload_models.py"
    )
    write_order_model_artifacts(
        batches,
        artifacts_dir,
        model_path=resolved_model_path,
        class_name=order_model_class,
    )

    missing_paths: list[str] = []
    if resolved_model_path.exists():
        missing_paths = sorted(
            find_missing_order_payload_paths(
                batches,
                resolved_model_path,
                class_name=order_model_class,
            )
        )

    payload_count = len(extract_order_payloads_from_batches(batches))
    return OrderModelWorkflowResult(
        output_path=resolved_model_path,
        payload_count=payload_count,
        missing_paths=missing_paths,
    )


def generate_order_models_from_api_dir(
    *,
    api_dir: Path,
    pattern: str = "orders_batch_*.json",
    output_models: Path,
    class_name: str = ORDER_MODEL_CLASS,
) -> OrderModelWorkflowResult:
    """Generate order payload models from stored API batch files."""
    if not api_dir.exists():
        raise FileNotFoundError(f"API response directory not found: {api_dir}")

    api_paths = sorted(api_dir.glob(pattern))
    if not api_paths:
        raise FileNotFoundError(f"No API response files found in {api_dir}")

    payloads = load_order_payloads(api_paths)
    if not payloads:
        raise ValueError("No order payloads found in API responses")

    if output_models.exists():
        backup_path = output_models.with_name(
            f"{output_models.stem}.previous{output_models.suffix}"
        )
        shutil.copy2(output_models, backup_path)

    generate_order_models(
        payloads=payloads,
        output_path=output_models,
        class_name=class_name,
    )
    return OrderModelWorkflowResult(
        output_path=output_models,
        payload_count=len(payloads),
        missing_paths=[],
    )


def rebuild_library_artifacts_from_api_dir(
    *,
    api_dir: Path,
    pattern: str = "orders_batch_*.json",
    output_products: Path,
    order_model_path: Path,
    order_model_class: str = ORDER_MODEL_CLASS,
) -> LibraryArtifactWorkflowResult:
    """Rebuild `library_products.json` from stored API responses."""
    if not api_dir.exists():
        raise FileNotFoundError(f"API response directory not found: {api_dir}")

    batches = load_api_response_batches(api_dir, pattern)
    if not batches:
        raise FileNotFoundError("No API responses found to rebuild artifacts")

    if not order_model_path.exists():
        raise FileNotFoundError(f"Order model not found: {order_model_path}")

    library = build_library_json(
        batches,
        order_model_path=order_model_path,
        order_model_class=order_model_class,
    )
    write_json_file(output_products, library.model_dump(mode="json"))
    return LibraryArtifactWorkflowResult(output_path=output_products, library=library)


def write_viewer_schema(schema_output: Path) -> ViewerSchemaWorkflowResult:
    """Write the viewer schema file generated from `LibraryData`."""
    write_json_file(schema_output, LibraryData.model_json_schema())
    return ViewerSchemaWorkflowResult(output_path=schema_output)
