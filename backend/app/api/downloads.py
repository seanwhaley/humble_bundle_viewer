"""Download endpoints for the viewer API."""

from __future__ import annotations

import time
from threading import Lock
from typing import cast

import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models.library import Download as LibraryDownload
from app.models.downloads import (
    ManagedDownloadPlanRequest,
    ManagedDownloadStreamRequest,
)
from app.services.library_loader import LibraryNotFoundError, load_library
from hb_library_viewer.config import DownloadConfig, RuntimeSettings
from hb_library_viewer.download import _resolve_download_filename
from hb_library_viewer.parsing import Download as ParsedDownload
from hb_library_viewer.sync import (
    SyncPlanEntry,
    SyncPlanSourceItem,
    build_sync_plan_from_items,
)
from hb_library_viewer.utils import sanitize_filename, validate_url

router = APIRouter(prefix="/api/downloads", tags=["downloads"])

_STREAM_OPEN_LOCK = Lock()
STREAM_OPEN_STATE = {"last_opened_at": 0.0}


def wait_for_stream_slot(rate_limit_delay: float) -> None:
    """Pace upstream stream openings across concurrent managed-sync requests."""

    minimum_delay = max(rate_limit_delay, 0.5)
    with _STREAM_OPEN_LOCK:
        now = time.monotonic()
        last_opened_at = float(STREAM_OPEN_STATE["last_opened_at"])
        remaining_delay = minimum_delay - (now - last_opened_at)
        if remaining_delay > 0:
            time.sleep(remaining_delay)
        STREAM_OPEN_STATE["last_opened_at"] = time.monotonic()


def _find_library_download(url: str) -> LibraryDownload | None:
    """Return the active-library download entry that matches the requested URL."""
    library = load_library()
    for product in library.products:
        for subproduct in product.subproducts or []:
            for download in subproduct.downloads or []:
                if download.url == url:
                    return download
        for download in product.downloads or []:
            if download.url == url:
                return download
    return None


@router.post("/plan", response_model=list[SyncPlanEntry])
def plan_managed_downloads(
    request: ManagedDownloadPlanRequest,
) -> list[SyncPlanEntry]:
    """Build a managed-sync plan using the shared Python sync planner."""

    try:
        items = [
            SyncPlanSourceItem(
                title_id=item.title_id,
                title=item.title,
                source_bundle=item.source_bundle,
                downloads=[
                    ParsedDownload(
                        platform=download.platform or "unknown",
                        name=download.name or "file",
                        url=download.url,
                        size_bytes=download.size_bytes or 0,
                        checksums=download.checksums or {},
                        file_type=download.file_type,
                    )
                    for download in item.downloads
                ],
            )
            for item in request.items
        ]
        return build_sync_plan_from_items(
            items,
            platforms=request.platforms,
            file_types=request.file_types,
            size_policy=request.size_policy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/stream")
def stream_download(  # pylint: disable=no-member
    request: ManagedDownloadStreamRequest,
) -> StreamingResponse:
    """Stream one library-backed file to the browser without saving it on the server."""

    if not validate_url(request.url):
        raise HTTPException(status_code=400, detail="Invalid download URL.")

    try:
        library_download = _find_library_download(request.url)
    except LibraryNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if library_download is None:
        raise HTTPException(
            status_code=404,
            detail="Download URL not found in the current library data.",
        )

    parsed_download = ParsedDownload(
        platform=library_download.platform or "unknown",
        name=library_download.name or "file",
        url=library_download.url or request.url,
        size_bytes=library_download.size_bytes or 0,
        checksums=library_download.checksums or {},
        file_type=library_download.file_type,
    )

    suggested_filename = sanitize_filename(request.suggested_filename or "")
    if suggested_filename and "." in suggested_filename:
        filename = suggested_filename
    else:
        filename = _resolve_download_filename(parsed_download)

    download_config = cast(DownloadConfig, RuntimeSettings().download)
    wait_for_stream_slot(download_config.rate_limit_delay)
    stream_timeout_seconds = (
        download_config.stream_timeout_seconds
    )  # pylint: disable=no-member

    try:
        upstream = requests.get(
            request.url,
            stream=True,
            timeout=(download_config.connect_timeout_seconds, stream_timeout_seconds),
        )
        upstream.raise_for_status()
    except requests.exceptions.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else 502
        raise HTTPException(
            status_code=status_code,
            detail=f"Upstream download failed with HTTP {status_code}.",
        ) from exc
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to open the upstream download stream.",
        ) from exc

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
    }
    content_length = upstream.headers.get("content-length")
    if content_length:
        headers["Content-Length"] = content_length

    media_type = upstream.headers.get("content-type", "application/octet-stream")

    def iter_stream():
        try:
            for chunk in upstream.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return StreamingResponse(iter_stream(), media_type=media_type, headers=headers)
