"""Shared capture and download workflows for CLI and viewer backends."""

from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any, Callable

from .artifact_workflows import (
    ORDER_MODEL_CLASS,
    summarize_missing_paths,
    write_json_file,
    write_order_model_artifacts,
)
from .browser.manager import BrowserManager
from .config import Settings
from .download import DownloadTask, FileDownloader
from .download_selection import (
    SIZE_POLICIES,
    normalize_file_types,
    prepare_downloads_for_product,
)
from .model_generation import find_missing_order_payload_paths
from .parsing import LibraryData, build_library_json

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CaptureWorkflowResult:
    """Structured output from a capture/parse artifact refresh."""

    library: LibraryData
    output_products: Path


@dataclass(slots=True)
class DownloadWorkflowResult:
    """Structured output from a download execution pass."""

    files_downloaded: int
    files_failed: int


def capture_library_data(
    *,
    settings: Settings,
    artifacts_dir: Path,
    output_products: Path,
    order_model_path: Path,
    order_model_class: str = ORDER_MODEL_CLASS,
    prompt_timeout_seconds: float = 30,
    prompt_for_order_model_rebuild: Callable[[float], bool] | None = None,
    browser_manager_cls: Callable[..., Any] = BrowserManager,
    library_builder: Callable[..., LibraryData] = build_library_json,
    missing_paths_finder: Callable[..., set[str]] = find_missing_order_payload_paths,
    order_model_writer: Callable[..., None] = write_order_model_artifacts,
) -> CaptureWorkflowResult:
    """Capture library responses, refresh artifacts, and return parsed data."""
    logger.info("Starting browser automation...")
    with browser_manager_cls(
        settings.browser,
        settings.auth_cookie,
        api_config=getattr(settings, "api", None),
        artifacts_dir=artifacts_dir,
        save_captured_responses=getattr(
            settings.artifacts, "save_captured_responses", False
        ),
        save_api_batches=getattr(settings.artifacts, "save_api_batches", True),
        save_gamekeys=getattr(settings.artifacts, "save_gamekeys", False),
        save_html_on_failure=getattr(settings.artifacts, "save_html_on_failure", True),
    ) as browser_manager:
        logger.info("Browser session started")
        capture_result = browser_manager.capture_library_page()

    logger.info(
        "✓ Browser capture complete: %s API batches",
        capture_result.api_batches,
    )
    if not capture_result.api_responses:
        raise RuntimeError("No API responses were captured")

    logger.info("Parsing API responses...")
    auto_rebuild_models = getattr(settings.artifacts, "auto_rebuild_order_models", True)

    missing_paths: set[str] = set()
    if order_model_path.exists():
        missing_paths = missing_paths_finder(
            capture_result.api_responses,
            order_model_path,
            class_name=order_model_class,
        )
        if missing_paths:
            logger.warning(
                "Order payload model missing %s field paths: %s",
                len(missing_paths),
                summarize_missing_paths(missing_paths),
            )
    else:
        logger.info("Order payload model not found at %s", order_model_path)

    should_rebuild = False
    if missing_paths or not order_model_path.exists():
        if auto_rebuild_models:
            should_rebuild = True
        elif prompt_for_order_model_rebuild is not None:
            should_rebuild = prompt_for_order_model_rebuild(prompt_timeout_seconds)

    if should_rebuild:
        order_model_writer(
            capture_result.api_responses,
            artifacts_dir,
            model_path=order_model_path,
            class_name=order_model_class,
        )
        if order_model_path.exists():
            post_missing = missing_paths_finder(
                capture_result.api_responses,
                order_model_path,
                class_name=order_model_class,
            )
            if post_missing:
                logger.warning(
                    "Order payload model still missing %s field paths: %s",
                    len(post_missing),
                    summarize_missing_paths(post_missing),
                )
            else:
                logger.info("✓ Order payload model matches API responses")

    if not order_model_path.exists():
        raise RuntimeError("Order payload model required but not found")

    library = library_builder(
        capture_result.api_responses,
        order_model_path=order_model_path,
        order_model_class=order_model_class,
        api_config=getattr(settings, "api", None),
    )
    logger.info("✓ Parsed %s products from API responses", library.total_products)

    write_json_file(output_products, library.model_dump(mode="json"))
    logger.info("✓ Wrote structured library data: %s", output_products)

    if should_rebuild:
        logger.info("✓ Wrote order payload artifacts")

    return CaptureWorkflowResult(library=library, output_products=output_products)


def download_library_products(
    *,
    library: LibraryData,
    download_config: Any,
    platforms: list[str] | None = None,
    file_types: list[str] | None = None,
    size_policy: str = "all",
    downloader_cls: Callable[..., Any] = FileDownloader,
) -> DownloadWorkflowResult:
    """Download files selected from a parsed library artifact."""
    normalized_size_policy = (size_policy or "all").strip().lower()
    if normalized_size_policy not in SIZE_POLICIES:
        raise ValueError("size_policy must be one of: all, smallest, largest")

    normalized_file_types = normalize_file_types(file_types)
    downloader = downloader_cls(download_config)
    files_downloaded = 0
    files_failed = 0

    for product in library.products:
        product_downloads = []
        try:
            product_downloads = prepare_downloads_for_product(
                product.downloads,
                platforms=platforms,
                file_types=normalized_file_types,
                size_policy=normalized_size_policy,
            )
            if not product_downloads:
                continue

            task = DownloadTask(
                gamekey=product.gamekey,
                product_name=product.product_name,
                downloads=product_downloads,
            )
            result = downloader.download_product(task)
            errors = list(getattr(result, "errors", []) or [])
            if result.status in ("success", "partial"):
                files_downloaded += result.files_downloaded
                files_failed += len(errors)
                for error in errors:
                    logger.warning("  %s", error)
            else:
                files_failed += len(product_downloads)
        except Exception:  # pylint: disable=broad-exception-caught
            logger.exception("Unexpected error downloading %s", product.product_name)
            files_failed += len(product_downloads)

    return DownloadWorkflowResult(
        files_downloaded=files_downloaded,
        files_failed=files_failed,
    )
