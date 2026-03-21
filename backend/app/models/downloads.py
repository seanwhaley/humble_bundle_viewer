"""Pydantic models for download-related API requests."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ManagedDownloadStreamRequest(BaseModel):
    """Request payload for advanced browser-managed download streaming."""

    url: str = Field(..., min_length=1)
    suggested_filename: str | None = None


class ManagedDownloadPlanDownload(BaseModel):
    """Download entry sent by the viewer for managed sync planning."""

    platform: str | None = None
    name: str | None = None
    url: str = Field(..., min_length=1)
    size_bytes: int = Field(default=0, ge=0)
    checksums: dict[str, str] | None = None
    file_type: str | None = None


class ManagedDownloadPlanItemRequest(BaseModel):
    """Viewer-selected title plus downloads to plan for managed sync."""

    title_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    source_bundle: str = Field(..., min_length=1)
    downloads: list[ManagedDownloadPlanDownload] = Field(default_factory=list)


class ManagedDownloadPlanRequest(BaseModel):
    """Batch request for managed sync plan generation."""

    items: list[ManagedDownloadPlanItemRequest] = Field(default_factory=list)
    platforms: list[str] | None = None
    file_types: list[str] | None = None
    size_policy: Literal["all", "smallest", "largest"] = "all"
