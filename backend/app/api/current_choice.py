"""API routes for serving current Humble Choice analysis artifacts."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.current_choice import CurrentChoiceReport
from app.services.current_choice import (
    load_saved_current_choice_report,
    resolve_current_choice_library_path,
    resolve_current_choice_markdown_path,
    resolve_current_choice_output_dir,
    resolve_current_choice_page_html_path,
    resolve_current_choice_report_path,
    resolve_current_choice_snapshot_path,
)

router = APIRouter(prefix="/api/current-choice", tags=["current-choice"])
logger = logging.getLogger(__name__)


class CurrentChoiceStatusResponse(BaseModel):
    """Status information for the current Humble Choice artifacts."""

    output_dir: str
    page_html_path: str
    snapshot_json_path: str
    report_json_path: str
    report_markdown_path: str
    library_path: str
    report_exists: bool
    markdown_exists: bool
    generated_at: str | None = None
    month_label: str | None = None
    game_count: int | None = None


@router.get("", response_model=CurrentChoiceReport)
def get_current_choice_report() -> CurrentChoiceReport:
    """Return the saved current Humble Choice overlap analysis report."""

    try:
        return load_saved_current_choice_report()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=(
                "Current Humble Choice overlap report not found. Run the current "
                "Choice analysis first."
            ),
        ) from exc
    except ValueError as exc:
        logger.warning("Current Choice report validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/status", response_model=CurrentChoiceStatusResponse)
def get_current_choice_status() -> CurrentChoiceStatusResponse:
    """Return configured paths and report availability for current Choice."""

    output_dir = resolve_current_choice_output_dir()
    page_html_path = resolve_current_choice_page_html_path()
    snapshot_json_path = resolve_current_choice_snapshot_path()
    report_json_path = resolve_current_choice_report_path()
    report_markdown_path = resolve_current_choice_markdown_path()
    library_path = resolve_current_choice_library_path()

    generated_at: str | None = None
    month_label: str | None = None
    game_count: int | None = None
    if report_json_path.exists():
        try:
            report = load_saved_current_choice_report(report_json_path)
        except (FileNotFoundError, ValueError):
            report = None
        if report is not None:
            generated_at = report.generated_at
            month_label = report.month_label
            game_count = report.total_titles

    return CurrentChoiceStatusResponse(
        output_dir=str(output_dir),
        page_html_path=str(page_html_path),
        snapshot_json_path=str(snapshot_json_path),
        report_json_path=str(report_json_path),
        report_markdown_path=str(report_markdown_path),
        library_path=str(library_path),
        report_exists=report_json_path.exists(),
        markdown_exists=report_markdown_path.exists(),
        generated_at=generated_at,
        month_label=month_label,
        game_count=game_count,
    )
