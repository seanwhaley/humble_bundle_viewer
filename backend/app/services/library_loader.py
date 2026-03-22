"""Load library_products.json for the viewer API."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import cast

from app.models.library import (
    LibraryData,
    SubproductPageDetails as ViewerSubproductPageDetails,
)
from hb_library_viewer.config import (
    DEFAULT_ARTIFACTS_DIR,
    DEFAULT_SUBPRODUCT_PAGES_DIR,
    RuntimeSettings,
    ViewerConfig,
    default_library_products_path,
    default_subproduct_metadata_path,
)
from hb_library_viewer.download_labels import enrich_downloads_with_labels
from hb_library_viewer.download_selection import download_file_type
from hb_library_viewer.subproducts.metadata.store import load_subproduct_page_metadata


DEFAULT_LIBRARY_PATH = default_library_products_path(DEFAULT_ARTIFACTS_DIR)


@dataclass(slots=True)
class _LibraryPathState:  # pylint: disable=too-few-public-methods
    """Process-local override for the active library JSON path."""

    override: Path | None = None


_library_state = _LibraryPathState()


class LibraryNotFoundError(RuntimeError):
    """Raised when the library_products.json file cannot be located."""


def _runtime_library_path_defaults() -> tuple[Path, Path]:
    """Return config-driven fallback paths for library and metadata artifacts."""

    runtime_settings = RuntimeSettings()
    artifacts_dir = getattr(
        getattr(runtime_settings, "artifacts", None),
        "base_dir",
        DEFAULT_ARTIFACTS_DIR,
    )
    subproduct_cache_dir = getattr(
        getattr(runtime_settings, "subproduct_pages", None),
        "base_dir",
        DEFAULT_SUBPRODUCT_PAGES_DIR,
    )
    return (
        default_library_products_path(artifacts_dir),
        default_subproduct_metadata_path(subproduct_cache_dir),
    )


def default_library_dir() -> Path:
    """Return the preferred default folder for viewer library file selection."""
    viewer_config = cast(ViewerConfig, RuntimeSettings().viewer)
    configured_dir = viewer_config.default_library_dir
    if configured_dir is not None:
        return configured_dir
    return (Path.home() / "Downloads").resolve()


def default_download_dir() -> Path:
    """Return the viewer's default library directory (backward-compatible alias)."""
    return default_library_dir()


def set_library_path(path: Path) -> None:
    """Override the library JSON path for subsequent API requests."""
    _library_state.override = path


def clear_library_path_override() -> None:
    """Clear any process-local override for the active library JSON path."""
    _library_state.override = None


def _find_repo_library_path() -> Path | None:
    """Search parent directories for data/artifacts/library_products.json."""
    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / "data" / "artifacts" / "library_products.json"
        if candidate.exists():
            return candidate
    return None


def resolve_library_path() -> Path:
    """Resolve the library JSON path from runtime override, config, or defaults."""
    if _library_state.override is not None:
        return _library_state.override

    runtime_settings = RuntimeSettings()
    viewer_config = cast(ViewerConfig, runtime_settings.viewer)
    configured_path = viewer_config.library_path
    if configured_path is not None:
        return configured_path

    configured_default_path, _ = _runtime_library_path_defaults()
    if configured_default_path.exists():
        return configured_default_path

    discovered = _find_repo_library_path()
    if discovered:
        return discovered

    return configured_default_path


def resolve_subproduct_metadata_path() -> Path:
    """Resolve the extracted subproduct metadata path near the active library file."""

    library_path = resolve_library_path()
    candidate = library_path.parent / "subproduct_pages" / "metadata.json"
    if candidate.exists():
        return candidate

    _, configured_fallback = _runtime_library_path_defaults()
    if configured_fallback.exists():
        return configured_fallback

    return configured_fallback


def _attach_subproduct_page_details(library: LibraryData) -> LibraryData:
    """Join extracted subproduct page metadata onto matching library subproducts."""
    metadata_file = resolve_subproduct_metadata_path()
    if not metadata_file.exists():
        return library

    metadata_store = load_subproduct_page_metadata(metadata_file.parent)
    details_by_url = {item.url: item.details for item in metadata_store.items}
    if not details_by_url:
        return library

    for product in library.products:
        for subproduct in product.subproducts or []:
            url = (subproduct.url or "").strip()
            if not url:
                continue
            details = details_by_url.get(url)
            if details is not None:
                subproduct.page_details = ViewerSubproductPageDetails.model_validate(
                    details.model_dump(mode="json")
                )

    return library


def _normalize_download_file_types(library: LibraryData) -> LibraryData:
    """Ensure loaded library downloads always expose a normalized file type."""

    for product in library.products:
        for download in product.downloads or []:
            download.file_type = download_file_type(download)
        for subproduct in product.subproducts or []:
            for download in subproduct.downloads or []:
                download.file_type = download_file_type(download)

    return library


def _enrich_download_labels(library: LibraryData) -> LibraryData:
    """Attach canonical viewer-facing labels to every loaded download."""

    for product in library.products:
        enrich_downloads_with_labels(product.downloads or [])
        for subproduct in product.subproducts or []:
            enrich_downloads_with_labels(subproduct.downloads or [])

    return library


def load_library() -> LibraryData:
    """Load the library JSON from disk and validate it with Pydantic."""
    path = resolve_library_path()
    if not path.exists():
        raise LibraryNotFoundError(
            "library_products.json not found at "
            f"{path}. Set viewer.library_path or artifacts.base_dir in "
            "backend/config.yaml, or use HUMBLE_VIEWER__LIBRARY_PATH."
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    library = LibraryData.model_validate(data)
    library = _normalize_download_file_types(library)
    library = _enrich_download_labels(library)
    return _attach_subproduct_page_details(library)
