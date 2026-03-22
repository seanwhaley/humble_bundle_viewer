"""Run library capture and optional downloads for the viewer API."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import logging
from typing import cast

from hb_library_viewer.artifact_workflows import ORDER_MODEL_CLASS
from hb_library_viewer.capture_workflow import (
    capture_library_data,
    download_library_products,
)
from hb_library_viewer.config import ArtifactsConfig, DownloadConfig, Settings
from hb_library_viewer.parsing import LibraryData

logger = logging.getLogger(__name__)


@dataclass
class RunLibraryResult:
    """Result summary for a library run."""

    library: LibraryData
    files_downloaded: int
    files_failed: int


def run_library_capture(
    *,
    auth_cookie: str,
    output_path: Path,
    download_files: bool = False,
    platforms: list[str] | None = None,
    file_types: list[str] | None = None,
    size_policy: str = "all",
) -> RunLibraryResult:
    """Capture library API responses and write library_products.json.

    The auth_cookie is used only for this run and is never persisted.
    """
    config = Settings(auth_cookie=auth_cookie)
    artifacts_config = cast(ArtifactsConfig, config.artifacts)
    download_config = cast(DownloadConfig, config.download)
    artifacts_dir = artifacts_config.base_dir
    order_model_path = artifacts_dir / "order_payload_models.py"

    capture_result = capture_library_data(
        settings=config,
        artifacts_dir=artifacts_dir,
        output_products=output_path,
        order_model_path=order_model_path,
        order_model_class=ORDER_MODEL_CLASS,
    )
    library = capture_result.library

    files_downloaded = 0
    files_failed = 0

    if download_files:
        active_platforms = platforms or getattr(config, "platforms", None)
        download_result = download_library_products(
            library=library,
            download_config=download_config,
            platforms=active_platforms,
            file_types=file_types,
            size_policy=size_policy,
        )
        files_downloaded = download_result.files_downloaded
        files_failed = download_result.files_failed

    return RunLibraryResult(
        library=library,
        files_downloaded=files_downloaded,
        files_failed=files_failed,
    )
