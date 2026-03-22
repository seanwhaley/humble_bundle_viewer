"""Manifest and reference helpers for subproduct page caching."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from hashlib import blake2s
from pathlib import Path
from typing import TYPE_CHECKING, Iterable
from urllib.parse import urlparse

from .models import (
    SubproductPageManifest,
    SubproductPageManifestEntry,
    SubproductPageReference,
)

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from ...parsing import LibraryData

_SLUG_RE = re.compile(r"[^a-z0-9]+")
_VALID_SCHEMES = {"http", "https"}


def now_iso() -> str:
    """Return the current local timestamp in ISO format."""
    return datetime.now().isoformat()


def slugify(value: str | None, fallback: str = "page") -> str:
    """Create a short filesystem-friendly slug."""
    if not value:
        return fallback
    lowered = value.lower()
    slug = _SLUG_RE.sub("-", lowered).strip("-")
    return slug[:80] or fallback


def manifest_path(base_dir: Path) -> Path:
    """Return the cache manifest path for a subproduct page directory."""
    return base_dir / "index.json"


def pages_dir(base_dir: Path) -> Path:
    """Return the directory that stores cached HTML pages."""
    return base_dir / "pages"


def normalize_references(
    references: Iterable[SubproductPageReference],
) -> list[SubproductPageReference]:
    """De-duplicate references while preserving stable order."""
    seen: set[tuple[str | None, str | None, str | None]] = set()
    normalized: list[SubproductPageReference] = []
    for reference in references:
        key = (
            reference.product_gamekey,
            reference.subproduct_machine_name,
            reference.subproduct_name,
        )
        if key in seen:
            continue
        seen.add(key)
        normalized.append(reference)
    return normalized


def collect_subproduct_page_references(
    library: LibraryData,
) -> dict[str, list[SubproductPageReference]]:
    """Collect unique external info URLs referenced by subproducts."""
    references_by_url: dict[str, list[SubproductPageReference]] = {}
    for product in library.products:
        for subproduct in product.subproducts or []:
            url = (subproduct.url or "").strip()
            if not url:
                continue
            if urlparse(url).scheme.lower() not in _VALID_SCHEMES:
                logger.warning("Skipping unsupported subproduct page URL: %s", url)
                continue
            references_by_url.setdefault(url, []).append(
                SubproductPageReference(
                    product_gamekey=product.gamekey,
                    product_name=product.product_name,
                    product_machine_name=product.machine_name,
                    subproduct_name=subproduct.human_name,
                    subproduct_machine_name=subproduct.machine_name,
                    payee_name=(
                        subproduct.payee.human_name if subproduct.payee else None
                    ),
                )
            )
    return {
        url: normalize_references(references)
        for url, references in references_by_url.items()
    }


def filter_subproduct_page_references(
    references_by_url: dict[str, list[SubproductPageReference]],
    *,
    subproduct_query: str | None = None,
    target_url: str | None = None,
    limit: int | None = None,
) -> dict[str, list[SubproductPageReference]]:
    """Filter collected references for targeted cache runs."""
    normalized_query = subproduct_query.strip().lower() if subproduct_query else None
    normalized_url = target_url.strip() if target_url else None

    filtered: dict[str, list[SubproductPageReference]] = {}
    for url in sorted(references_by_url):
        references = references_by_url[url]
        if normalized_url and url != normalized_url:
            continue

        if normalized_query:
            matched = False
            for reference in references:
                fields = (
                    reference.product_name,
                    reference.product_machine_name,
                    reference.subproduct_name,
                    reference.subproduct_machine_name,
                    reference.payee_name,
                    url,
                )
                if any(normalized_query in (field or "").lower() for field in fields):
                    matched = True
                    break
            if not matched:
                continue

        filtered[url] = references
        if limit is not None and len(filtered) >= limit:
            break

    return filtered


def load_subproduct_page_manifest(base_dir: Path) -> SubproductPageManifest:
    """Load the cache manifest if it exists, otherwise return an empty one."""
    index_path = manifest_path(base_dir)
    if not index_path.exists():
        return SubproductPageManifest(generated_at=now_iso(), total_entries=0, items=[])

    try:
        payload = json.loads(index_path.read_text(encoding="utf-8"))
        return SubproductPageManifest.model_validate(payload)
    except (OSError, ValueError) as exc:
        logger.warning(
            "Failed to read subproduct page manifest %s (%s); starting fresh.",
            index_path,
            exc,
        )
        return SubproductPageManifest(generated_at=now_iso(), total_entries=0, items=[])


def build_html_relative_path(
    url: str,
    references: list[SubproductPageReference],
    existing_entry: SubproductPageManifestEntry | None,
) -> Path:
    """Return a stable relative HTML path for a cached URL."""
    if existing_entry and existing_entry.html_path:
        return Path(existing_entry.html_path)

    parsed = urlparse(url)
    reference = references[0] if references else None
    name_hint = None
    if reference is not None:
        name_hint = (
            reference.subproduct_machine_name
            or reference.subproduct_name
            or reference.product_machine_name
            or reference.product_name
        )
    host_slug = slugify(parsed.netloc or "external")
    item_slug = slugify(name_hint, fallback="page")
    digest = blake2s(url.encode("utf-8"), digest_size=6).hexdigest()
    return Path("pages") / f"{host_slug}-{item_slug}-{digest}.html"


def replacement_url(original_url: str, final_url: str | None) -> str | None:
    """Return a replacement URL only when the final URL differs."""
    if not final_url or final_url == original_url:
        return None
    return final_url


def write_manifest(base_dir: Path, manifest: SubproductPageManifest) -> Path:
    """Persist a subproduct page manifest and return its path."""
    index_path = manifest_path(base_dir)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(
        json.dumps(manifest.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    return index_path
