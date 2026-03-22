"""API routes for serving current bundle overlap analysis artifacts."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.current_bundles import BundleOverlapReport
from app.services.current_bundles import (
    load_current_bundles_report,
    resolve_current_bundles_bundle_types,
    resolve_current_bundles_library_path,
    resolve_current_bundles_markdown_path,
    resolve_current_bundles_output_dir,
    resolve_current_bundles_report_path,
)

router = APIRouter(prefix="/api/current-bundles", tags=["current-bundles"])
logger = logging.getLogger(__name__)


class CurrentBundlesStatusResponse(BaseModel):
    """Status information for the current-bundle overlap artifacts."""

    output_dir: str
    report_json_path: str
    report_markdown_path: str
    library_path: str
    bundle_types: list[str]
    report_exists: bool
    markdown_exists: bool
    generated_at: str | None = None
    bundle_count: int | None = None


@router.get("", response_model=BundleOverlapReport)
def get_current_bundles_report() -> BundleOverlapReport:
    """Return the saved current-bundle overlap analysis report."""

    try:
        return load_current_bundles_report()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=(
                "Current bundle overlap report not found. Run the current bundle "
                "analysis first."
            ),
        ) from exc
    except ValueError as exc:
        logger.warning("Current bundle report validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/status", response_model=CurrentBundlesStatusResponse)
def get_current_bundles_status() -> CurrentBundlesStatusResponse:
    """Return configured paths and report availability for current bundles."""

    output_dir = resolve_current_bundles_output_dir()
    report_json_path = resolve_current_bundles_report_path()
    report_markdown_path = resolve_current_bundles_markdown_path()
    library_path = resolve_current_bundles_library_path()
    bundle_types = resolve_current_bundles_bundle_types()

    generated_at: str | None = None
    bundle_count: int | None = None
    if report_json_path.exists():
        try:
            report = load_current_bundles_report(report_json_path)
        except (FileNotFoundError, ValueError):
            report = None
        if report is not None:
            generated_at = report.generated_at
            bundle_count = report.bundle_count
            if report.bundle_types:
                bundle_types = report.bundle_types

    return CurrentBundlesStatusResponse(
        output_dir=str(output_dir),
        report_json_path=str(report_json_path),
        report_markdown_path=str(report_markdown_path),
        library_path=str(library_path),
        bundle_types=bundle_types,
        report_exists=report_json_path.exists(),
        markdown_exists=report_markdown_path.exists(),
        generated_at=generated_at,
        bundle_count=bundle_count,
    )
