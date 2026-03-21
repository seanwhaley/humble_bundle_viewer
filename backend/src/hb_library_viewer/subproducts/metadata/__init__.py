"""Public API for subproduct metadata extraction and reporting workflows."""

from .models import (
    SubproductMetadataExtractionSummary,
    SubproductPageDetails,
    SubproductPageMetadataEntry,
    SubproductPageMetadataStore,
)
from .service import (
    build_subproduct_metadata_analysis_report,
    build_subproduct_page_metadata,
)
from .store import (
    load_subproduct_page_metadata,
    metadata_path,
    write_subproduct_page_metadata,
)

__all__ = [
    "SubproductMetadataExtractionSummary",
    "SubproductPageDetails",
    "SubproductPageMetadataEntry",
    "SubproductPageMetadataStore",
    "build_subproduct_metadata_analysis_report",
    "build_subproduct_page_metadata",
    "load_subproduct_page_metadata",
    "metadata_path",
    "write_subproduct_page_metadata",
]
