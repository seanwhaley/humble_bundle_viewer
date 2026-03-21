"""Runtime helpers for viewer-facing current Humble Choice workflows."""

from __future__ import annotations

from pathlib import Path
from typing import cast

from app.models.current_choice import (
    CurrentChoiceReport,
    CurrentChoiceWorkflowArtifacts,
)
from hb_library_viewer.config import (
    DEFAULT_ARTIFACTS_DIR,
    CurrentChoiceConfig,
    RuntimeSettings,
    ViewerConfig,
    default_library_products_path,
)
from hb_library_viewer.current_choice import (
    capture_and_report_current_choice,
    load_current_choice_report,
)


def _runtime_artifacts_dir() -> Path:
    """Return the config-driven artifacts directory."""

    return getattr(
        getattr(RuntimeSettings(), "artifacts", None),
        "base_dir",
        DEFAULT_ARTIFACTS_DIR,
    )


def runtime_current_choice_config() -> CurrentChoiceConfig:
    """Return the runtime current-choice config using the shared settings model."""

    runtime_settings = RuntimeSettings()
    config = runtime_settings.current_choice
    if isinstance(config, CurrentChoiceConfig):
        return config

    config_payload = config if isinstance(config, dict) else vars(config)
    return CurrentChoiceConfig.model_validate(config_payload)


def resolve_current_choice_output_dir() -> Path:
    """Return the configured current-choice artifact directory."""

    return runtime_current_choice_config().base_dir


def resolve_current_choice_page_html_path() -> Path:
    """Return the configured current-choice HTML snapshot path."""

    return resolve_current_choice_output_dir() / "membership.html"


def resolve_current_choice_snapshot_path() -> Path:
    """Return the configured current-choice snapshot JSON path."""

    return resolve_current_choice_output_dir() / "choice_snapshot.json"


def resolve_current_choice_report_path() -> Path:
    """Return the configured current-choice JSON report path."""

    return resolve_current_choice_output_dir() / "choice_overlap_report.json"


def resolve_current_choice_markdown_path() -> Path:
    """Return the configured current-choice markdown report path."""

    return resolve_current_choice_output_dir() / "choice_overlap_report.md"


def resolve_current_choice_library_path() -> Path:
    """Return the library artifact used for current-choice overlap analysis."""

    current_choice_config = runtime_current_choice_config()
    if current_choice_config.library_path is not None:
        return current_choice_config.library_path

    viewer_config = cast(ViewerConfig, RuntimeSettings().viewer)
    if viewer_config.library_path is not None:
        return viewer_config.library_path

    return default_library_products_path(_runtime_artifacts_dir())


def load_saved_current_choice_report(
    report_path: Path | None = None,
) -> CurrentChoiceReport:
    """Load the saved current-choice overlap report from disk."""

    return load_current_choice_report(
        report_path or resolve_current_choice_report_path()
    )


def build_current_choice_report(
    *,
    output_dir: Path | None = None,
    library_path: Path | None = None,
    timeout_seconds: int | None = None,
) -> CurrentChoiceWorkflowArtifacts:
    """Run the current-choice capture/report workflow using runtime defaults."""

    current_choice_config = runtime_current_choice_config()
    return capture_and_report_current_choice(
        output_dir=(output_dir or current_choice_config.base_dir),
        library_path=(library_path or resolve_current_choice_library_path()),
        timeout_seconds=timeout_seconds or current_choice_config.timeout_seconds,
    )
