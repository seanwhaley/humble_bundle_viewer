"""API-facing compatibility exports for viewer library payloads.

The canonical data models live under ``backend/src/hb_library_viewer`` and are
shared by the CLI, synchronization helpers, and the FastAPI app. This module
re-exports those models using the API-layer names expected by the viewer code.
"""

from __future__ import annotations

from hb_library_viewer.parsing import (
    Download,
    KeyEntry,
    LibraryData,
    Payee,
    Product,
    Subproduct,
)
from hb_library_viewer.subproducts.metadata.models import SubproductPageDetails


Key = KeyEntry

__all__ = [
    "Download",
    "Key",
    "KeyEntry",
    "LibraryData",
    "Payee",
    "Product",
    "Subproduct",
    "SubproductPageDetails",
]
