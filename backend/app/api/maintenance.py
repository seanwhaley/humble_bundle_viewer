"""Maintenance workflow endpoints for the viewer portal."""

from __future__ import annotations

from pathlib import Path
from typing import cast

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.maintenance import (
    CurrentBundlesCommandDetails,
    CurrentBundlesCommandResponse,
    CurrentChoiceCommandDetails,
    CurrentChoiceCommandResponse,
    LibraryArtifactCommandDetails,
    LibraryArtifactCommandResponse,
    OrderModelCommandDetails,
    OrderModelCommandResponse,
    SubproductMetadataCommandDetails,
    SubproductMetadataCommandResponse,
    SubproductPageCacheCommandDetails,
    SubproductPageCacheCommandResponse,
    ViewerSchemaCommandDetails,
    ViewerSchemaCommandResponse,
)
from app.services.current_bundles import (
    build_current_bundles_report,
    load_current_bundles_report,
    resolve_current_bundles_library_path,
)
from app.services.current_choice import (
    build_current_choice_report,
    load_saved_current_choice_report,
    resolve_current_choice_library_path,
)
from app.services.library_loader import set_library_path
from hb_library_viewer.artifact_workflows import (
    LibraryArtifactWorkflowResult,
    OrderModelWorkflowResult,
    ViewerSchemaWorkflowResult,
    generate_order_models_from_api_dir,
    rebuild_library_artifacts_from_api_dir,
    rebuild_order_models_from_artifacts,
    write_viewer_schema,
)
from hb_library_viewer.config import (
    DEFAULT_ARTIFACTS_DIR,
    DEFAULT_VIEWER_SCHEMA_OUTPUT,
    RuntimeSettings,
    default_api_responses_dir,
    default_library_products_path,
    default_order_model_path,
    load_browser_config,
    load_subproduct_page_cache_config,
)
from hb_library_viewer.subproducts.metadata.models import (
    SubproductMetadataExtractionSummary,
)
from hb_library_viewer.subproducts.metadata.service import (
    build_subproduct_metadata_analysis_report,
    build_subproduct_page_metadata,
)
from hb_library_viewer.subproducts.pages.models import SubproductPageCacheSummary
from hb_library_viewer.subproducts.pages.service import cache_subproduct_pages
from hb_library_viewer.sync import load_library_data

DEFAULT_SCHEMA_OUTPUT = DEFAULT_VIEWER_SCHEMA_OUTPUT

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


def _resolve_path(path: Path) -> Path:
    """Expand user markers and return an absolute path."""

    return path.expanduser().resolve()


def _resolve_optional_path(path: Path | None) -> Path | None:
    """Resolve an optional path only when provided."""

    return _resolve_path(path) if path is not None else None


def _runtime_artifacts_dir() -> Path:
    """Return the config-driven artifacts directory used by maintenance routes."""

    return getattr(
        getattr(RuntimeSettings(), "artifacts", None),
        "base_dir",
        DEFAULT_ARTIFACTS_DIR,
    )


def _runtime_library_file() -> Path:
    """Return the config-driven default library file used by maintenance routes."""

    runtime_settings = RuntimeSettings()
    viewer_config = getattr(runtime_settings, "viewer", None)
    configured_library_path = getattr(viewer_config, "library_path", None)
    if configured_library_path is not None:
        return cast(Path, configured_library_path)
    return default_library_products_path(_runtime_artifacts_dir())


def _as_http_exception(exc: Exception) -> HTTPException:
    """Convert shared workflow exceptions into API-safe HTTP errors."""

    if isinstance(exc, FileNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


def _build_order_model_details(
    result: OrderModelWorkflowResult,
) -> OrderModelCommandDetails:
    """Project shared order-model workflow output into the API detail shape."""

    return OrderModelCommandDetails(
        output_path=result.output_path,
        payload_count=result.payload_count,
        missing_paths=sorted(result.missing_paths),
    )


def _build_library_artifact_details(
    result: LibraryArtifactWorkflowResult,
) -> LibraryArtifactCommandDetails:
    """Project shared library-artifact workflow output into the API detail shape."""

    return LibraryArtifactCommandDetails(
        output_path=result.output_path,
        total_products=result.total_products,
    )


def _build_viewer_schema_details(
    result: ViewerSchemaWorkflowResult | Path,
) -> ViewerSchemaCommandDetails:
    """Project viewer-schema workflow output into the API detail shape."""

    output_path = (
        result.output_path if isinstance(result, ViewerSchemaWorkflowResult) else result
    )
    return ViewerSchemaCommandDetails(output_path=output_path)


def _build_subproduct_page_cache_details(
    summary: SubproductPageCacheSummary,
) -> SubproductPageCacheCommandDetails:
    """Project cache workflow output into the API detail shape."""

    return SubproductPageCacheCommandDetails(
        requested_urls=summary.requested_urls,
        processed_urls=summary.processed_urls,
        fetched_pages=summary.fetched_pages,
        reused_pages=summary.reused_pages,
        failed_pages=summary.failed_pages,
        skipped_pages=summary.skipped_pages,
        failure_limit=summary.failure_limit,
        aborted=summary.aborted,
        manifest_path=summary.manifest_path,
        elapsed_seconds=summary.elapsed_seconds,
        failure_breakdown=dict(summary.failure_breakdown),
        domain_summaries=list(summary.domain_summaries),
    )


def _build_subproduct_metadata_details(
    summary: SubproductMetadataExtractionSummary,
    *,
    report_path: Path | None,
) -> SubproductMetadataCommandDetails:
    """Project metadata extraction output into the API detail shape."""

    return SubproductMetadataCommandDetails(
        processed_entries=summary.processed_entries,
        extracted_entries=summary.extracted_entries,
        fallback_only_entries=summary.fallback_only_entries,
        html_read_failures=summary.html_read_failures,
        output_path=summary.output_path,
        elapsed_seconds=summary.elapsed_seconds,
        report_path=report_path,
    )


def _build_current_choice_details(
    details: CurrentChoiceCommandDetails,
) -> CurrentChoiceCommandDetails:
    """Return the current-choice detail payload unchanged for response typing."""

    return details


def _build_current_bundles_details(
    *,
    details: CurrentBundlesCommandDetails,
) -> CurrentBundlesCommandDetails:
    """Return the current-bundle command details unchanged for symmetry."""

    return details


class RebuildOrderModelsRequest(BaseModel):
    """Request to rebuild order models from stored API batches."""

    artifacts_dir: Path | None = Field(
        default=None,
        description="Artifacts root directory (defaults to artifacts.base_dir)",
    )
    pattern: str = Field(
        default="orders_batch_*.json",
        description="Filename glob for API batches",
    )
    order_model_path: Path | None = Field(
        default=None,
        description="Output path for generated order model",
    )
    order_model_class: str = Field(
        default="OrderPayloadList",
        description="Root class name for generated models",
    )


@router.post("/rebuild-order-models", response_model=OrderModelCommandResponse)
def rebuild_order_models(
    request: RebuildOrderModelsRequest,
) -> OrderModelCommandResponse:
    """Rebuild order payload models from stored API response batches."""

    try:
        artifacts_dir = _resolve_path(request.artifacts_dir or _runtime_artifacts_dir())
        result = rebuild_order_models_from_artifacts(
            artifacts_dir=artifacts_dir,
            pattern=request.pattern,
            order_model_path=_resolve_optional_path(request.order_model_path),
            order_model_class=request.order_model_class,
        )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise _as_http_exception(exc) from exc

    return OrderModelCommandResponse(
        command="rebuild-order-models",
        status="success",
        message=f"Order payload model written to {result.output_path}",
        details=_build_order_model_details(result),
    )


class GenerateOrderModelsRequest(BaseModel):
    """Request to generate order payload models from API batches."""

    api_dir: Path | None = Field(
        default=None,
        description=(
            "Directory containing orders_batch_*.json files "
            "(defaults to artifacts.base_dir/api_responses)"
        ),
    )
    pattern: str = Field(
        default="orders_batch_*.json",
        description="Filename glob for API batches",
    )
    output_models: Path | None = Field(
        default=None,
        description=(
            "Output path for generated order models "
            "(defaults to artifacts.base_dir/order_payload_models.py)"
        ),
    )
    class_name: str = Field(
        default="OrderPayloadList",
        description="Root class name for generated models",
    )


@router.post("/generate-order-models", response_model=OrderModelCommandResponse)
def generate_order_models_command(
    request: GenerateOrderModelsRequest,
) -> OrderModelCommandResponse:
    """Generate order payload models from stored API responses."""

    try:
        artifacts_dir = _runtime_artifacts_dir()
        result = generate_order_models_from_api_dir(
            api_dir=_resolve_path(
                request.api_dir or default_api_responses_dir(artifacts_dir)
            ),
            pattern=request.pattern,
            output_models=_resolve_path(
                request.output_models or default_order_model_path(artifacts_dir)
            ),
            class_name=request.class_name,
        )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise _as_http_exception(exc) from exc

    return OrderModelCommandResponse(
        command="generate-order-models",
        status="success",
        message=f"Order payload model generated at {result.output_path}",
        details=_build_order_model_details(result),
    )


class RebuildLibraryArtifactsRequest(BaseModel):
    """Request to rebuild library_products.json from stored API batches."""

    api_dir: Path | None = Field(
        default=None,
        description=(
            "Directory containing orders_batch_*.json files "
            "(defaults to artifacts.base_dir/api_responses)"
        ),
    )
    pattern: str = Field(
        default="orders_batch_*.json",
        description="Filename glob for API batches",
    )
    output_products: Path | None = Field(
        default=None,
        description=(
            "Output path for library_products.json "
            "(defaults to artifacts.base_dir/library_products.json)"
        ),
    )
    order_model_path: Path | None = Field(
        default=None,
        description=(
            "Generated order model file for validation "
            "(defaults to artifacts.base_dir/order_payload_models.py)"
        ),
    )
    order_model_class: str = Field(
        default="OrderPayloadList",
        description="Class name to load from the model file",
    )


@router.post(
    "/rebuild-library-artifacts",
    response_model=LibraryArtifactCommandResponse,
)
def rebuild_library_artifacts_command(
    request: RebuildLibraryArtifactsRequest,
) -> LibraryArtifactCommandResponse:
    """Rebuild library_products.json from stored API responses."""

    try:
        artifacts_dir = _runtime_artifacts_dir()
        result = rebuild_library_artifacts_from_api_dir(
            api_dir=_resolve_path(
                request.api_dir or default_api_responses_dir(artifacts_dir)
            ),
            pattern=request.pattern,
            output_products=_resolve_path(
                request.output_products or default_library_products_path(artifacts_dir)
            ),
            order_model_path=_resolve_path(
                request.order_model_path or default_order_model_path(artifacts_dir)
            ),
            order_model_class=request.order_model_class,
        )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise _as_http_exception(exc) from exc

    set_library_path(result.output_path)

    return LibraryArtifactCommandResponse(
        command="rebuild-library-artifacts",
        status="success",
        message=f"library_products.json written to {result.output_path}",
        details=_build_library_artifact_details(result),
    )


class BuildViewerAssetsRequest(BaseModel):
    """Request to generate the viewer schema file."""

    schema_output: Path = Field(
        default=DEFAULT_SCHEMA_OUTPUT,
        description="Output path for viewer schema",
    )


@router.post("/build-viewer-assets", response_model=ViewerSchemaCommandResponse)
def build_viewer_assets_command(
    request: BuildViewerAssetsRequest,
) -> ViewerSchemaCommandResponse:
    """Generate the viewer schema file from LibraryData."""

    try:
        schema_output = write_viewer_schema(_resolve_path(request.schema_output))
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise _as_http_exception(exc) from exc

    details = _build_viewer_schema_details(schema_output)

    return ViewerSchemaCommandResponse(
        command="build-viewer-assets",
        status="success",
        message=f"Viewer schema written to {details.output_path}",
        details=details,
    )


class CacheSubproductPagesRequest(BaseModel):
    """Request to cache external subproduct pages for metadata extraction."""

    library_file: Path | None = Field(
        default=None,
        description=(
            "Path to library_products.json "
            "(defaults to viewer.library_path or artifacts.base_dir/library_products.json)"
        ),
    )
    config_path: Path | None = Field(
        default=None,
        description="Optional config.yaml override",
    )
    cache_dir: Path | None = Field(
        default=None,
        description="Override the subproduct page cache directory",
    )
    redownload_existing: bool | None = Field(
        default=None,
        description="Override subproduct_pages.redownload_existing",
    )
    subproduct_query: str | None = Field(
        default=None,
        description="Filter matching subproducts by title, publisher, or URL",
    )
    url: str | None = Field(
        default=None,
        description="Fetch only this exact external subproduct info URL",
    )
    limit: int | None = Field(default=None, ge=1)
    max_failures: int | None = Field(default=None, ge=1)
    domain_workers: int | None = Field(default=None, ge=1)


@router.post(
    "/cache-subproduct-pages",
    response_model=SubproductPageCacheCommandResponse,
)
def cache_subproduct_pages_command(
    request: CacheSubproductPagesRequest,
) -> SubproductPageCacheCommandResponse:
    """Cache external subproduct pages using the shared enrichment workflow."""

    try:
        resolved_config_path = _resolve_optional_path(request.config_path)
        page_cache_config = load_subproduct_page_cache_config(resolved_config_path)
        if request.cache_dir is not None:
            page_cache_config.base_dir = _resolve_path(request.cache_dir)
        if request.domain_workers is not None:
            page_cache_config.domain_workers = request.domain_workers

        browser_config = load_browser_config(resolved_config_path)
        library = load_library_data(
            _resolve_path(request.library_file or _runtime_library_file())
        )
        summary = cache_subproduct_pages(
            library,
            page_cache_config,
            browser_config=browser_config,
            redownload_existing=request.redownload_existing,
            subproduct_query=request.subproduct_query,
            target_url=request.url,
            limit=request.limit,
            max_failures=request.max_failures,
        )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise _as_http_exception(exc) from exc

    if summary.aborted:
        raise HTTPException(
            status_code=502,
            detail="Subproduct page cache aborted after reaching the failure limit.",
        )

    return SubproductPageCacheCommandResponse(
        command="cache-subproduct-pages",
        status="success",
        message=f"Subproduct page manifest written to {summary.manifest_path}",
        details=_build_subproduct_page_cache_details(summary),
    )


class ExtractSubproductMetadataRequest(BaseModel):
    """Request to extract structured metadata from cached subproduct pages."""

    config_path: Path | None = Field(
        default=None,
        description="Optional config.yaml override",
    )
    cache_dir: Path | None = Field(
        default=None,
        description="Override the subproduct page cache directory",
    )
    output_file: Path | None = Field(
        default=None,
        description="Write extracted metadata to a specific metadata.json path",
    )
    report_file: Path | None = Field(
        default=None,
        description="Also write a markdown analysis report to this path",
    )


@router.post(
    "/extract-subproduct-metadata",
    response_model=SubproductMetadataCommandResponse,
)
def extract_subproduct_metadata_command(
    request: ExtractSubproductMetadataRequest,
) -> SubproductMetadataCommandResponse:
    """Extract structured metadata from cached external subproduct pages."""

    try:
        resolved_config_path = _resolve_optional_path(request.config_path)
        page_cache_config = load_subproduct_page_cache_config(resolved_config_path)
        if request.cache_dir is not None:
            page_cache_config.base_dir = _resolve_path(request.cache_dir)

        summary = build_subproduct_page_metadata(
            page_cache_config.base_dir,
            output_path=_resolve_optional_path(request.output_file),
        )
        report_path = None
        if request.report_file is not None:
            report_path = build_subproduct_metadata_analysis_report(
                page_cache_config.base_dir,
                metadata_file=summary.output_path,
                output_path=_resolve_path(request.report_file),
            )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise _as_http_exception(exc) from exc

    return SubproductMetadataCommandResponse(
        command="extract-subproduct-metadata",
        status="success",
        message=f"Subproduct metadata written to {summary.output_path}",
        details=_build_subproduct_metadata_details(
            summary,
            report_path=report_path,
        ),
    )


class AnalyzeCurrentBundlesRequest(BaseModel):
    """Request to refresh current bundle overlap analysis artifacts."""

    output_dir: Path | None = Field(
        default=None,
        description="Override the current bundle artifact output directory",
    )
    library_path: Path | None = Field(
        default=None,
        description="Override the library_products.json path used for overlap analysis",
    )
    bundle_types: list[str] | None = Field(
        default=None,
        description="Current bundle categories to analyze (games, books, software)",
    )
    timeout_seconds: int | None = Field(default=None, ge=1)


@router.post(
    "/analyze-current-bundles",
    response_model=CurrentBundlesCommandResponse,
)
def analyze_current_bundles_command(
    request: AnalyzeCurrentBundlesRequest,
) -> CurrentBundlesCommandResponse:
    """Refresh the saved current bundle overlap analysis artifacts."""

    try:
        artifacts = build_current_bundles_report(
            output_dir=_resolve_optional_path(request.output_dir),
            library_path=_resolve_optional_path(request.library_path),
            bundle_types=request.bundle_types,
            timeout_seconds=request.timeout_seconds,
        )
        report = load_current_bundles_report(Path(artifacts.report_json_path))
        details = CurrentBundlesCommandDetails(
            output_dir=artifacts.output_dir,
            index_html_path=artifacts.index_html_path,
            bundle_links_path=artifacts.bundle_links_path,
            catalog_json_path=artifacts.catalog_json_path,
            report_json_path=artifacts.report_json_path,
            report_markdown_path=artifacts.report_markdown_path,
            bundle_types=artifacts.bundle_types,
            bundle_count=artifacts.bundle_count,
            library_path=str(
                _resolve_optional_path(request.library_path)
                or resolve_current_bundles_library_path()
            ),
            generated_at=report.generated_at,
        )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise _as_http_exception(exc) from exc

    return CurrentBundlesCommandResponse(
        command="analyze-current-bundles",
        status="success",
        message=f"Current bundle report written to {artifacts.report_markdown_path}",
        details=_build_current_bundles_details(details=details),
    )


class AnalyzeCurrentChoiceRequest(BaseModel):
    """Request to refresh current Humble Choice overlap analysis artifacts."""

    output_dir: Path | None = Field(
        default=None,
        description="Override the current Choice artifact output directory",
    )
    library_path: Path | None = Field(
        default=None,
        description="Override the library_products.json path used for Choice overlap analysis",
    )
    timeout_seconds: int | None = Field(default=None, ge=1)


@router.post(
    "/analyze-current-choice",
    response_model=CurrentChoiceCommandResponse,
)
def analyze_current_choice_command(
    request: AnalyzeCurrentChoiceRequest,
) -> CurrentChoiceCommandResponse:
    """Refresh the saved current Humble Choice overlap analysis artifacts."""

    try:
        artifacts = build_current_choice_report(
            output_dir=_resolve_optional_path(request.output_dir),
            library_path=_resolve_optional_path(request.library_path),
            timeout_seconds=request.timeout_seconds,
        )
        report = load_saved_current_choice_report(Path(artifacts.report_json_path))
        details = CurrentChoiceCommandDetails(
            output_dir=artifacts.output_dir,
            page_html_path=artifacts.page_html_path,
            snapshot_json_path=artifacts.snapshot_json_path,
            report_json_path=artifacts.report_json_path,
            report_markdown_path=artifacts.report_markdown_path,
            month_label=artifacts.month_label,
            game_count=artifacts.game_count,
            library_path=str(
                _resolve_optional_path(request.library_path)
                or resolve_current_choice_library_path()
            ),
            generated_at=report.generated_at,
        )
    except Exception as exc:  # pylint: disable=broad-exception-caught
        raise _as_http_exception(exc) from exc

    return CurrentChoiceCommandResponse(
        command="analyze-current-choice",
        status="success",
        message=f"Current Choice report written to {artifacts.report_markdown_path}",
        details=_build_current_choice_details(details=details),
    )
