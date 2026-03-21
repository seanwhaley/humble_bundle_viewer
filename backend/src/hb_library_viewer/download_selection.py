"""Shared download selection helpers for CLI and viewer workflows."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .download import _resolve_download_filename
from .parsing import Download, Product

SIZE_POLICIES = {"all", "smallest", "largest"}


def normalize_file_types(file_types: list[str] | None) -> list[str] | None:
    """Normalize requested file-type filters to lowercase extensions."""
    if not file_types:
        return None
    normalized = [
        value.strip().lower() for value in file_types if value and value.strip()
    ]
    return normalized or None


def download_file_type(download: Download) -> str:
    """Infer the effective file type for a parsed download entry."""
    if download.file_type:
        return download.file_type.lower()
    filename = _resolve_download_filename(download)
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext:
        return ext
    return "file"


def filter_downloads_by_platforms(
    downloads: Iterable[Download],
    platforms: list[str] | None,
) -> list[Download]:
    """Filter downloads by platform list, if provided."""
    if not platforms:
        return list(downloads)
    allowed = {value.lower() for value in platforms if value}
    if not allowed:
        return list(downloads)
    return [
        download
        for download in downloads
        if (download.platform or "").lower() in allowed
    ]


def filter_downloads_by_file_types(
    downloads: Iterable[Download],
    file_types: list[str] | None,
) -> list[Download]:
    """Filter downloads by normalized file-type values when requested."""
    if not file_types:
        return list(downloads)
    allowed = {value.lower() for value in file_types if value}
    if not allowed:
        return list(downloads)
    return [
        download for download in downloads if download_file_type(download) in allowed
    ]


def select_downloads_by_size(
    downloads: list[Download],
    size_policy: str,
) -> list[Download]:
    """Choose all, the smallest, or the largest download from a product."""
    if size_policy == "all":
        return downloads
    if not downloads:
        return []
    sorted_downloads = sorted(
        downloads,
        key=lambda download: (
            download.size_bytes or 0,
            _resolve_download_filename(download),
        ),
    )
    if size_policy == "smallest":
        return [sorted_downloads[0]]
    if size_policy == "largest":
        return [sorted_downloads[-1]]
    return downloads


def prepare_downloads_for_product(
    downloads: list[Download],
    *,
    platforms: list[str] | None = None,
    file_types: list[str] | None = None,
    size_policy: str = "all",
) -> list[Download]:
    """Apply platform, file-type, and size filters for one product."""
    filtered = filter_downloads_by_platforms(downloads, platforms)
    filtered = filter_downloads_by_file_types(filtered, file_types)
    return select_downloads_by_size(filtered, size_policy)


def collect_downloads(
    products: list[Product],
    platforms: list[str] | None = None,
    file_types: list[str] | None = None,
    size_policy: str = "all",
) -> list[Download]:
    """Collect selected downloads across the provided library products."""
    downloads: list[Download] = []
    for product in products:
        downloads.extend(
            prepare_downloads_for_product(
                product.downloads,
                platforms=platforms,
                file_types=file_types,
                size_policy=size_policy,
            )
        )
    return downloads
