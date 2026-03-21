"""Extract structured metadata from cached subproduct info pages.

This module keeps external-page enrichment separate from ``library_products.json``
by reading cached HTML from ``subproduct_pages`` and writing a dedicated
``metadata.json`` artifact keyed by the original subproduct info URL.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from ...runtime_status import estimate_eta_seconds, format_hms
from .html import (
    extract_details_from_html as _extract_details_from_html,
)
from .models import (
    SubproductMetadataExtractionSummary,
    SubproductPageMetadataEntry,
    SubproductPageMetadataStore,
)
from .store import (
    fallback_details_for_entry as _fallback_details_for_entry,
    load_subproduct_page_metadata,
    metadata_path,
    now_iso as _now_iso,
    write_subproduct_page_metadata as _write_subproduct_page_metadata,
)
from ..pages.store import load_subproduct_page_manifest

logger = logging.getLogger(__name__)
_PROGRESS_LOG_EVERY = 25


def _log_metadata_progress(
    *,
    processed_entries: int,
    total_entries: int,
    extracted_entries: int,
    fallback_only_entries: int,
    html_read_failures: int,
    current_url: str,
    elapsed_seconds: float,
) -> None:
    percent = (processed_entries / total_entries * 100) if total_entries else 100.0
    eta_seconds = estimate_eta_seconds(
        elapsed_seconds=elapsed_seconds,
        completed_items=processed_entries,
        total_items=total_entries,
    )
    eta_suffix = f" | eta={format_hms(eta_seconds)}" if eta_seconds is not None else ""
    logger.info(
        "Subproduct metadata progress: %s/%s (%.1f%%) | extracted=%s fallback=%s read_failures=%s | current=%s | elapsed=%s%s",
        processed_entries,
        total_entries,
        percent,
        extracted_entries,
        fallback_only_entries,
        html_read_failures,
        current_url,
        format_hms(elapsed_seconds),
        eta_suffix,
    )


def build_subproduct_metadata_analysis_report(
    base_dir: Path,
    *,
    metadata_file: Path | None = None,
    output_path: Path | None = None,
    manifest_file: Path | None = None,
) -> Path:
    """Write a markdown analysis report for extracted subproduct metadata."""

    from .analysis import (
        metadata_analysis_markdown_path,
        write_subproduct_metadata_markdown_report,
    )

    resolved_base_dir = base_dir.expanduser().resolve()
    resolved_metadata_file = (
        metadata_file.expanduser().resolve()
        if metadata_file
        else metadata_path(resolved_base_dir)
    )
    resolved_manifest_file = (
        manifest_file.expanduser().resolve()
        if manifest_file
        else (resolved_base_dir / "index.json").resolve()
    )
    resolved_output_path = (
        output_path.expanduser().resolve()
        if output_path
        else metadata_analysis_markdown_path(resolved_base_dir)
    )

    return write_subproduct_metadata_markdown_report(
        resolved_metadata_file,
        manifest_path=resolved_manifest_file,
        output_markdown=resolved_output_path,
    )


def build_subproduct_page_metadata(
    base_dir: Path,
    *,
    output_path: Path | None = None,
) -> SubproductMetadataExtractionSummary:
    """Extract structured metadata from cached subproduct HTML files."""

    resolved_base_dir = base_dir.expanduser().resolve()
    manifest = load_subproduct_page_manifest(resolved_base_dir)
    items: list[SubproductPageMetadataEntry] = []
    total_entries = len(manifest.items)
    processed_entries = 0
    extracted_entries = 0
    fallback_only_entries = 0
    html_read_failures = 0
    last_progress_logged = 0
    started_at = time.monotonic()

    logger.info(
        "Extracting subproduct metadata from %s (%s manifest entr%s)",
        resolved_base_dir,
        total_entries,
        "y" if total_entries == 1 else "ies",
    )

    for entry in manifest.items:
        processed_entries += 1
        html_path = (
            (resolved_base_dir / entry.html_path).resolve() if entry.html_path else None
        )

        if html_path is not None and html_path.exists():
            try:
                html_text = html_path.read_text(encoding="utf-8")
                details = _extract_details_from_html(html_text, entry)
                extracted_entries += 1
            except OSError as exc:
                logger.warning(
                    "Failed to read cached subproduct page %s (%s)",
                    html_path,
                    exc,
                )
                html_read_failures += 1
                fallback_only_entries += 1
                details = _fallback_details_for_entry(entry)
        else:
            fallback_only_entries += 1
            details = _fallback_details_for_entry(entry)

        items.append(SubproductPageMetadataEntry(url=entry.url, details=details))

        if (
            processed_entries == total_entries
            or processed_entries - last_progress_logged >= _PROGRESS_LOG_EVERY
        ):
            _log_metadata_progress(
                processed_entries=processed_entries,
                total_entries=total_entries,
                extracted_entries=extracted_entries,
                fallback_only_entries=fallback_only_entries,
                html_read_failures=html_read_failures,
                current_url=entry.url,
                elapsed_seconds=time.monotonic() - started_at,
            )
            last_progress_logged = processed_entries

    store = SubproductPageMetadataStore(
        generated_at=_now_iso(),
        total_entries=len(items),
        items=items,
    )
    written_path = _write_subproduct_page_metadata(
        resolved_base_dir,
        store,
        output_path=output_path.expanduser().resolve() if output_path else None,
    )

    elapsed_seconds = time.monotonic() - started_at
    logger.info(
        "Subproduct metadata extraction complete: processed=%s extracted=%s fallback=%s read_failures=%s | elapsed=%s | output=%s",
        processed_entries,
        extracted_entries,
        fallback_only_entries,
        html_read_failures,
        format_hms(elapsed_seconds),
        written_path,
    )

    return SubproductMetadataExtractionSummary(
        processed_entries=processed_entries,
        extracted_entries=extracted_entries,
        fallback_only_entries=fallback_only_entries,
        html_read_failures=html_read_failures,
        output_path=written_path,
        elapsed_seconds=elapsed_seconds,
    )
