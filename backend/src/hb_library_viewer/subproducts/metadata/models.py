"""Typed models for extracted subproduct metadata artifacts."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field


class SubproductPageDetails(BaseModel):
    """Structured metadata extracted from a cached external subproduct page."""

    url: str
    final_url: str | None = None
    replacement_url: str | None = None
    page_title: str | None = None
    title: str | None = None
    subtitle: str | None = None
    description: str | None = None
    authors: list[str] = Field(default_factory=list)
    publisher: str | None = None
    series: str | None = None
    language: str | None = None
    image_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    isbns: list[str] = Field(default_factory=list)
    source_host: str | None = None
    status_code: int | None = None
    content_type: str | None = None
    html_path: str | None = None
    recovery_method: str | None = None
    extracted_at: str | None = None


class SubproductPageMetadataEntry(BaseModel):
    """Metadata entry keyed by the original Humble subproduct info URL."""

    url: str
    details: SubproductPageDetails


class SubproductPageMetadataStore(BaseModel):
    """Collection of extracted metadata entries."""

    generated_at: str
    total_entries: int = 0
    items: list[SubproductPageMetadataEntry] = Field(default_factory=list)


class SubproductMetadataExtractionSummary(BaseModel):
    """Summary of a metadata extraction run."""

    processed_entries: int
    extracted_entries: int
    fallback_only_entries: int
    html_read_failures: int
    output_path: Path
    elapsed_seconds: float = 0.0

    @property
    def failed_entries(self) -> int:
        """Backward-compatible alias for fallback-only entries."""

        return self.fallback_only_entries
