"""Helpers for loading saved API response artifacts."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .api_batches import ApiBatchRecord

logger = logging.getLogger(__name__)


def load_api_response_batches(
    api_dir: Path,
    pattern: str = "orders_batch_*.json",
) -> list[ApiBatchRecord]:
    """Load stored API response files and wrap them as batch dictionaries.

    Parameters
    ----------
    api_dir : Path
        Directory containing stored /api/v1/orders responses.
    pattern : str
        Filename glob pattern for batch files.

    Returns
    -------
    list[ApiBatchRecord]
        List of typed batch records with the raw JSON body in ``data``.
    """
    batches: list[ApiBatchRecord] = []
    api_dir = Path(api_dir)

    if not api_dir.exists():
        logger.debug("API artifact directory does not exist: %s", api_dir)
        return batches

    if not api_dir.is_dir():
        logger.warning("API artifact path is not a directory: %s", api_dir)
        return batches

    for path in sorted(
        candidate for candidate in api_dir.glob(pattern) if candidate.is_file()
    ):
        try:
            raw_text = path.read_text(encoding="utf-8")
            payload = json.loads(raw_text)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Failed to read API batch %s: %s", path, exc)
            continue

        if not isinstance(payload, dict):
            logger.debug("Skipping non-dict API batch %s", path)
            continue

        batches.append(ApiBatchRecord(data=raw_text))

    return batches
