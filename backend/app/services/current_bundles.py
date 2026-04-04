"""Runtime helpers for viewer-facing current bundle overlap workflows."""

from __future__ import annotations

from pathlib import Path

from app.models.current_bundles import BundleOverlapReport, BundleWorkflowArtifacts
from app.services.library_loader import resolve_library_path
from hb_library_viewer.config import (
    DEFAULT_ARTIFACTS_DIR,
    CurrentBundlesConfig,
    RuntimeSettings,
)
from hb_library_viewer.current_bundles import (
    capture_and_report_current_bundles,
    load_bundle_overlap_report,
    normalize_bundle_types,
)


def _runtime_artifacts_dir() -> Path:
    """Return the config-driven artifacts directory."""

    return getattr(
        getattr(RuntimeSettings(), "artifacts", None),
        "base_dir",
        DEFAULT_ARTIFACTS_DIR,
    )


def runtime_current_bundles_config() -> CurrentBundlesConfig:
    """Return the runtime current-bundles config using the shared settings model."""

    runtime_settings = RuntimeSettings()
    config = runtime_settings.current_bundles
    if isinstance(config, CurrentBundlesConfig):
        return config

    config_payload = config if isinstance(config, dict) else vars(config)
    return CurrentBundlesConfig.model_validate(config_payload)


def resolve_current_bundles_output_dir() -> Path:
    """Return the configured current-bundle artifact directory."""

    return runtime_current_bundles_config().base_dir


def resolve_current_bundles_report_path() -> Path:
    """Return the configured current-bundle JSON report path."""

    return resolve_current_bundles_output_dir() / "bundle_overlap_report.json"


def resolve_current_bundles_markdown_path() -> Path:
    """Return the configured current-bundle markdown report path."""

    return resolve_current_bundles_output_dir() / "bundle_overlap_report.md"


def resolve_current_bundles_library_path() -> Path:
    """Return the library artifact used for current-bundle overlap analysis."""

    current_bundles_config = runtime_current_bundles_config()
    if current_bundles_config.library_path is not None:
        return current_bundles_config.library_path

    return resolve_library_path()


def resolve_current_bundles_bundle_types() -> list[str]:
    """Return the configured default bundle-type selection."""

    return normalize_bundle_types(runtime_current_bundles_config().bundle_types)


def load_current_bundles_report(report_path: Path | None = None) -> BundleOverlapReport:
    """Load the saved current-bundle overlap report from disk."""

    return load_bundle_overlap_report(
        report_path or resolve_current_bundles_report_path()
    )


def build_current_bundles_report(
    *,
    output_dir: Path | None = None,
    library_path: Path | None = None,
    bundle_types: list[str] | None = None,
    timeout_seconds: int | None = None,
) -> BundleWorkflowArtifacts:
    """Run the current-bundle capture/report workflow using runtime defaults."""

    current_bundles_config = runtime_current_bundles_config()
    selected_bundle_types = normalize_bundle_types(
        bundle_types
        if bundle_types is not None
        else current_bundles_config.bundle_types
    )

    return capture_and_report_current_bundles(
        output_dir=(output_dir or current_bundles_config.base_dir),
        library_path=(library_path or resolve_current_bundles_library_path()),
        bundle_types=selected_bundle_types,
        timeout_seconds=timeout_seconds or current_bundles_config.timeout_seconds,
    )
