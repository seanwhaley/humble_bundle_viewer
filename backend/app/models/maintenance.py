"""Typed response models for viewer maintenance workflow endpoints.

The canonical workflow result models live under ``backend/src/hb_library_viewer``.
This module provides the API-facing response envelopes and any viewer-specific
detail projections needed by the FastAPI maintenance routes.
"""

from __future__ import annotations

from pathlib import Path
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

from hb_library_viewer.artifact_workflows import (
    OrderModelWorkflowResult,
    ViewerSchemaWorkflowResult,
)
from hb_library_viewer.current_bundles import BundleWorkflowArtifacts
from hb_library_viewer.current_choice import CurrentChoiceWorkflowArtifacts
from hb_library_viewer.subproducts.metadata.models import (
    SubproductMetadataExtractionSummary,
)
from hb_library_viewer.subproducts.pages.models import SubproductPageCacheSummary


DetailsT = TypeVar("DetailsT", bound=BaseModel)


class MaintenanceCommandResponse(BaseModel, Generic[DetailsT]):
    """Standard typed response envelope for maintenance workflow execution."""

    command: str
    status: Literal["success", "error"]
    message: str
    details: DetailsT


class OrderModelCommandDetails(OrderModelWorkflowResult):
    """API-facing details for order-model maintenance workflows."""


class LibraryArtifactCommandDetails(BaseModel):
    """API-facing summary for rebuilding ``library_products.json``."""

    output_path: Path
    total_products: int


class ViewerSchemaCommandDetails(ViewerSchemaWorkflowResult):
    """API-facing details for viewer schema generation."""


class SubproductPageCacheCommandDetails(SubproductPageCacheSummary):
    """API-facing details for subproduct page caching."""


class SubproductMetadataCommandDetails(SubproductMetadataExtractionSummary):
    """API-facing details for subproduct metadata extraction."""

    report_path: Path | None = None


class CurrentBundlesCommandDetails(BundleWorkflowArtifacts):
    """API-facing details for current bundle overlap analysis."""

    library_path: str
    generated_at: str


class CurrentChoiceCommandDetails(CurrentChoiceWorkflowArtifacts):
    """API-facing details for current Humble Choice overlap analysis."""

    library_path: str
    generated_at: str


class OrderModelCommandResponse(MaintenanceCommandResponse[OrderModelCommandDetails]):
    """Typed order-model maintenance response."""


class LibraryArtifactCommandResponse(
    MaintenanceCommandResponse[LibraryArtifactCommandDetails]
):
    """Typed library-artifact maintenance response."""


class ViewerSchemaCommandResponse(
    MaintenanceCommandResponse[ViewerSchemaCommandDetails]
):
    """Typed viewer-schema maintenance response."""


class SubproductPageCacheCommandResponse(
    MaintenanceCommandResponse[SubproductPageCacheCommandDetails]
):
    """Typed subproduct-page-cache maintenance response."""


class SubproductMetadataCommandResponse(
    MaintenanceCommandResponse[SubproductMetadataCommandDetails]
):
    """Typed subproduct-metadata maintenance response."""


class CurrentBundlesCommandResponse(
    MaintenanceCommandResponse[CurrentBundlesCommandDetails]
):
    """Typed current-bundle-analysis maintenance response."""


class CurrentChoiceCommandResponse(
    MaintenanceCommandResponse[CurrentChoiceCommandDetails]
):
    """Typed current-choice-analysis maintenance response."""


__all__ = [
    "LibraryArtifactCommandDetails",
    "LibraryArtifactCommandResponse",
    "MaintenanceCommandResponse",
    "CurrentBundlesCommandDetails",
    "CurrentBundlesCommandResponse",
    "CurrentChoiceCommandDetails",
    "CurrentChoiceCommandResponse",
    "OrderModelCommandDetails",
    "OrderModelCommandResponse",
    "SubproductMetadataCommandDetails",
    "SubproductMetadataCommandResponse",
    "SubproductPageCacheCommandDetails",
    "SubproductPageCacheCommandResponse",
    "ViewerSchemaCommandDetails",
    "ViewerSchemaCommandResponse",
]
