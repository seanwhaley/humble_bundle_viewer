"""API routes for serving and rebuilding library data."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.models.library import LibraryData
from app.services.library_loader import (
    LibraryNotFoundError,
    default_library_dir,
    load_library,
    resolve_library_path,
    resolve_subproduct_metadata_path,
    set_library_path,
)
from app.services.library_runner import run_library_capture
from hb_library_viewer.utils import BrowserError, ConfigError, HumbleBundleError

router = APIRouter(prefix="/api", tags=["library"])
logger = logging.getLogger(__name__)


def _resolve_subproduct_page_path(raw_path: str) -> Path:
    """Resolve a cached subproduct HTML path beneath the active metadata folder."""

    cleaned = raw_path.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Subproduct page path is required.")

    relative_path = Path(cleaned)
    if relative_path.is_absolute():
        raise HTTPException(
            status_code=400,
            detail="Subproduct page path must be relative to the cache directory.",
        )

    cache_root = resolve_subproduct_metadata_path().parent.resolve()
    candidate = (cache_root / relative_path).resolve()

    try:
        candidate.relative_to(cache_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Subproduct page path must stay inside the cache directory.",
        ) from exc

    if candidate.suffix.lower() != ".html":
        raise HTTPException(
            status_code=400,
            detail="Only cached HTML subproduct pages are supported.",
        )

    return candidate


@router.get("/library", response_model=LibraryData)
def get_library() -> LibraryData:
    """Return the parsed library_products.json content."""
    try:
        return load_library()
    except LibraryNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/library/subproduct-page")
def get_subproduct_page(
    path: str = Query(
        ...,
        min_length=1,
        description="Relative cached HTML path within the active subproduct_pages directory.",
    )
) -> FileResponse:
    """Return a cached subproduct HTML page for viewer-local inspection."""

    page_path = _resolve_subproduct_page_path(path)
    if not page_path.exists() or not page_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Cached subproduct page not found at {path}.",
        )

    return FileResponse(page_path, media_type="text/html")


class LibraryStatusResponse(BaseModel):
    """Status information about the active library JSON file."""

    current_path: str
    exists: bool
    default_save_dir: str
    default_library_path: str


@router.get("/library/status", response_model=LibraryStatusResponse)
def get_library_status() -> LibraryStatusResponse:
    """Return the current library path and whether it exists."""
    current_path = resolve_library_path()
    default_dir = default_library_dir()
    default_path = (default_dir / "library_products.json").resolve()
    return LibraryStatusResponse(
        current_path=str(current_path),
        exists=current_path.exists(),
        default_save_dir=str(default_dir),
        default_library_path=str(default_path),
    )


class RunLibraryRequest(BaseModel):
    """Request to capture library data via the viewer API."""

    auth_cookie: str = Field(..., min_length=10)
    output_path: str = Field(
        ..., description="Path to library_products.json or its folder"
    )
    download_files: bool = Field(
        default=False, description="Download files after capture"
    )
    platforms: list[str] | None = Field(
        default=None,
        description="Optional download platforms override (ebook, audio, etc.)",
    )
    file_types: list[str] | None = Field(
        default=None,
        description="Optional download file types (pdf, epub, mp3, etc.)",
    )
    size_policy: str = Field(
        default="all",
        description="Download all files or only the smallest/largest per product",
    )


class RunLibraryResponse(BaseModel):
    """Summary of a library capture run."""

    output_path: str
    total_products: int
    files_downloaded: int
    files_failed: int


def _normalize_output_path(raw_path: str) -> Path:
    """Resolve a viewer-provided file or directory into a JSON output path."""
    path = Path(raw_path).expanduser()
    if path.suffix.lower() != ".json":
        return (path / "library_products.json").resolve()
    return path.resolve()


@router.post("/library/run", response_model=RunLibraryResponse)
def run_library(request: RunLibraryRequest) -> RunLibraryResponse:
    """Capture library data using a provided session cookie."""
    try:
        output_path = _normalize_output_path(request.output_path)
        result = run_library_capture(
            auth_cookie=request.auth_cookie,
            output_path=output_path,
            download_files=request.download_files,
            platforms=request.platforms,
            file_types=request.file_types,
            size_policy=request.size_policy,
        )
        set_library_path(output_path)
        return RunLibraryResponse(
            output_path=str(output_path),
            total_products=result.library.total_products
            or len(result.library.products),
            files_downloaded=result.files_downloaded,
            files_failed=result.files_failed,
        )
    except ConfigError as exc:
        logger.warning("Library run config error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        logger.warning("Library run validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except BrowserError as exc:
        message = str(exc)
        logger.warning("Library run browser error: %s", message)
        lowered = message.lower()
        if (
            "too_many_redirects" in lowered
            or "redirect" in lowered
            or "login" in lowered
        ):
            raise HTTPException(
                status_code=401,
                detail="Authentication failed. Provide a valid _simpleauth_sess cookie.",
            ) from exc
        raise HTTPException(
            status_code=502,
            detail="Browser capture failed. Check server logs.",
        ) from exc
    except HumbleBundleError as exc:
        logger.warning("Library run failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Library run failed")
        raise HTTPException(
            status_code=500, detail="Library capture failed. Check server logs."
        ) from exc


class SelectLibraryRequest(BaseModel):
    """Request to point the viewer at an existing library file."""

    library_path: str = Field(..., description="Path to library_products.json")


class SelectLibraryResponse(BaseModel):
    """Summary of selecting an existing library file."""

    output_path: str
    total_products: int


@router.post("/library/select", response_model=SelectLibraryResponse)
def select_library(request: SelectLibraryRequest) -> SelectLibraryResponse:
    """Set the active library JSON file without running a capture."""
    output_path = _normalize_output_path(request.library_path)
    if not output_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"library_products.json not found at {output_path}.",
        )
    try:
        data = json.loads(output_path.read_text(encoding="utf-8"))
        library = LibraryData.model_validate(data)
        set_library_path(output_path)
    except Exception as exc:
        logger.warning("Library select failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SelectLibraryResponse(
        output_path=str(output_path),
        total_products=library.total_products or len(library.products),
    )
