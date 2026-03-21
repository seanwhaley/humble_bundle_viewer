"""Storage and fallback helpers for extracted subproduct metadata."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from urllib.parse import urlparse

from .models import (
    SubproductPageDetails,
    SubproductPageMetadataStore,
)
from ..pages.models import SubproductPageManifestEntry

logger = logging.getLogger(__name__)


def now_iso() -> str:
    """Return the current local timestamp in ISO format."""
    from datetime import datetime

    return datetime.now().isoformat()


def metadata_path(base_dir: Path) -> Path:
    """Return the extracted metadata JSON path for a subproduct page cache."""

    return base_dir / "metadata.json"


def fallback_details_for_entry(
    entry: SubproductPageManifestEntry,
) -> SubproductPageDetails:
    """Build fallback metadata from manifest details without reading HTML."""
    return SubproductPageDetails(
        url=entry.url,
        final_url=entry.final_url,
        replacement_url=entry.replacement_url,
        page_title=entry.page_title,
        title=(
            next(
                (
                    reference.subproduct_name
                    for reference in entry.references
                    if reference.subproduct_name
                ),
                None,
            )
            or entry.page_title
        ),
        publisher=next(
            (
                reference.payee_name
                for reference in entry.references
                if reference.payee_name
            ),
            None,
        ),
        source_host=(urlparse(entry.final_url or entry.url).netloc or None),
        status_code=entry.status_code,
        content_type=entry.content_type,
        html_path=entry.html_path,
        recovery_method=entry.recovery_method,
        extracted_at=now_iso(),
    )


def load_subproduct_page_metadata(base_dir: Path) -> SubproductPageMetadataStore:
    """Load extracted subproduct metadata if present, else return an empty store."""
    path = metadata_path(base_dir)
    if not path.exists():
        return SubproductPageMetadataStore(generated_at=now_iso(), total_entries=0)

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return SubproductPageMetadataStore.model_validate(payload)
    except (OSError, ValueError) as exc:
        logger.warning(
            "Failed to read subproduct metadata %s (%s); returning empty store.",
            path,
            exc,
        )
        return SubproductPageMetadataStore(generated_at=now_iso(), total_entries=0)


def write_subproduct_page_metadata(
    base_dir: Path,
    store: SubproductPageMetadataStore,
    *,
    output_path: Path | None = None,
) -> Path:
    """Persist extracted metadata as JSON and return the written path."""
    path = output_path or metadata_path(base_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(store.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    return path
