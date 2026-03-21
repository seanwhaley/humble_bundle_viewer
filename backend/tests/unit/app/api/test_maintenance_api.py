"""Unit tests for maintenance API routes."""

from __future__ import annotations

# pyright: reportPrivateUsage=false
# pylint: disable=protected-access

import importlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from hb_library_viewer.current_bundles import BundleOverlapReport, BundleOverlapBundle
from hb_library_viewer.current_choice import CurrentChoiceGame, CurrentChoiceReport
from hb_library_viewer.artifact_workflows import (
    LibraryArtifactWorkflowResult,
    ViewerSchemaWorkflowResult,
)
from hb_library_viewer.subproducts.metadata.models import (
    SubproductMetadataExtractionSummary,
)
from hb_library_viewer.subproducts.pages.models import SubproductPageCacheSummary

maintenance_api = importlib.import_module("app.api.maintenance")


@pytest.mark.unit
class TestMaintenanceApi:
    """Verify maintenance-command HTTP wrappers."""

    def test_as_http_exception_maps_known_error_types(self) -> None:
        assert (
            maintenance_api._as_http_exception(FileNotFoundError("missing")).status_code
            == 404
        )
        assert (
            maintenance_api._as_http_exception(ValueError("bad request")).status_code
            == 400
        )
        assert (
            maintenance_api._as_http_exception(RuntimeError("boom")).status_code == 500
        )

    def test_rebuild_order_models_returns_command_summary(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            maintenance_api,
            "rebuild_order_models_from_artifacts",
            lambda **_kwargs: SimpleNamespace(
                output_path=tmp_path / "order_payload_models.py",
                payload_count=3,
                missing_paths={"orders[0].foo"},
            ),
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/rebuild-order-models", json={})

        assert response.status_code == 200
        assert response.json()["details"]["payload_count"] == 3
        assert response.json()["details"]["missing_paths"] == ["orders[0].foo"]

    def test_generate_order_models_maps_value_error_to_400(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_value_error(**_kwargs):
            raise ValueError("invalid api dir")

        monkeypatch.setattr(
            maintenance_api,
            "generate_order_models_from_api_dir",
            raise_value_error,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/generate-order-models", json={})

        assert response.status_code == 400
        assert response.json()["detail"] == "invalid api dir"

    def test_generate_order_models_uses_runtime_artifacts_defaults(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        artifacts_dir = tmp_path / "configured-artifacts"
        recorded: dict[str, Path] = {}

        monkeypatch.setattr(
            maintenance_api,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                artifacts=SimpleNamespace(base_dir=artifacts_dir),
                viewer=SimpleNamespace(library_path=None),
            ),
        )

        def generate_stub(**kwargs):
            recorded["api_dir"] = kwargs["api_dir"]
            recorded["output_models"] = kwargs["output_models"]
            return SimpleNamespace(
                output_path=kwargs["output_models"],
                payload_count=1,
                missing_paths=set(),
            )

        monkeypatch.setattr(
            maintenance_api,
            "generate_order_models_from_api_dir",
            generate_stub,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/generate-order-models", json={})

        assert response.status_code == 200
        assert recorded["api_dir"] == artifacts_dir / "api_responses"
        assert recorded["output_models"] == artifacts_dir / "order_payload_models.py"

    def test_rebuild_order_models_maps_missing_file_error_to_404(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_missing_file(**_kwargs):
            raise FileNotFoundError("missing api batches")

        monkeypatch.setattr(
            maintenance_api,
            "rebuild_order_models_from_artifacts",
            raise_missing_file,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/rebuild-order-models", json={})

        assert response.status_code == 404
        assert response.json()["detail"] == "missing api batches"

    def test_rebuild_library_artifacts_sets_active_library(
        self,
        api_client_factory,
        sample_viewer_library_data,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        recorded: dict[str, Path] = {}
        monkeypatch.setattr(
            maintenance_api,
            "rebuild_library_artifacts_from_api_dir",
            lambda **_kwargs: LibraryArtifactWorkflowResult(
                output_path=tmp_path / "library_products.json",
                library=sample_viewer_library_data,
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "set_library_path",
            lambda path: recorded.setdefault("path", path),
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/rebuild-library-artifacts", json={})

        assert response.status_code == 200
        assert response.json()["details"]["total_products"] == 1
        assert recorded["path"] == tmp_path / "library_products.json"

    def test_rebuild_library_artifacts_maps_missing_file_error_to_404(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_missing_file(**_kwargs):
            raise FileNotFoundError("missing order model")

        monkeypatch.setattr(
            maintenance_api,
            "rebuild_library_artifacts_from_api_dir",
            raise_missing_file,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/rebuild-library-artifacts", json={})

        assert response.status_code == 404
        assert response.json()["detail"] == "missing order model"

    def test_build_viewer_assets_returns_schema_location(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        schema_path = tmp_path / "library-products-schema.json"
        monkeypatch.setattr(
            maintenance_api,
            "write_viewer_schema",
            lambda _path: schema_path,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/build-viewer-assets", json={})

        assert response.status_code == 200
        assert response.json()["details"]["output_path"] == str(schema_path)

    def test_build_viewer_assets_accepts_workflow_result_object(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        schema_path = tmp_path / "library-products-schema.json"
        monkeypatch.setattr(
            maintenance_api,
            "write_viewer_schema",
            lambda _path: ViewerSchemaWorkflowResult(output_path=schema_path),
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/build-viewer-assets", json={})

        assert response.status_code == 200
        assert response.json()["details"]["output_path"] == str(schema_path)

    def test_build_viewer_assets_maps_runtime_error_to_500(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_runtime_error(_path: Path):
            raise RuntimeError("schema generation failed")

        monkeypatch.setattr(maintenance_api, "write_viewer_schema", raise_runtime_error)
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/build-viewer-assets", json={})

        assert response.status_code == 500
        assert response.json()["detail"] == "schema generation failed"

    def test_cache_subproduct_pages_returns_summary(
        self,
        api_client_factory,
        sample_viewer_library_data,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        monkeypatch.setattr(
            maintenance_api,
            "load_subproduct_page_cache_config",
            lambda _config_path=None: SimpleNamespace(
                base_dir=cache_dir,
                domain_workers=1,
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_browser_config",
            lambda _config_path=None: SimpleNamespace(headless=True),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_library_data",
            lambda _library_file: sample_viewer_library_data,
        )
        monkeypatch.setattr(
            maintenance_api,
            "cache_subproduct_pages",
            lambda *_args, **_kwargs: SubproductPageCacheSummary(
                requested_urls=2,
                processed_urls=2,
                fetched_pages=1,
                reused_pages=1,
                failed_pages=0,
                skipped_pages=0,
                failure_limit=None,
                aborted=False,
                manifest_path=cache_dir / "index.json",
                elapsed_seconds=4.5,
                failure_breakdown={},
                domain_summaries=[],
            ),
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/cache-subproduct-pages", json={})

        assert response.status_code == 200
        payload = response.json()
        assert payload["details"]["manifest_path"] == str(cache_dir / "index.json")
        assert payload["details"]["requested_urls"] == 2
        assert payload["details"]["failure_breakdown"] == {}

    def test_cache_subproduct_pages_uses_runtime_library_default(
        self,
        api_client_factory,
        sample_viewer_library_data,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        configured_library_path = tmp_path / "configured-library.json"
        recorded: dict[str, Path] = {}

        monkeypatch.setattr(
            maintenance_api,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                artifacts=SimpleNamespace(base_dir=tmp_path / "artifacts"),
                viewer=SimpleNamespace(library_path=configured_library_path),
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_subproduct_page_cache_config",
            lambda _config_path=None: SimpleNamespace(
                base_dir=cache_dir,
                domain_workers=1,
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_browser_config",
            lambda _config_path=None: SimpleNamespace(headless=True),
        )

        def load_library_stub(path: Path):
            recorded["library_file"] = path
            return sample_viewer_library_data

        monkeypatch.setattr(maintenance_api, "load_library_data", load_library_stub)
        monkeypatch.setattr(
            maintenance_api,
            "cache_subproduct_pages",
            lambda *_args, **_kwargs: SubproductPageCacheSummary(
                requested_urls=1,
                processed_urls=1,
                fetched_pages=1,
                reused_pages=0,
                failed_pages=0,
                skipped_pages=0,
                failure_limit=None,
                aborted=False,
                manifest_path=cache_dir / "index.json",
                elapsed_seconds=1.0,
                failure_breakdown={},
                domain_summaries=[],
            ),
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/cache-subproduct-pages", json={})

        assert response.status_code == 200
        assert recorded["library_file"] == configured_library_path

    def test_cache_subproduct_pages_applies_request_overrides(
        self,
        api_client_factory,
        sample_viewer_library_data,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        config_path = tmp_path / "config.yaml"
        cache_dir = tmp_path / "custom-cache"
        library_file = tmp_path / "library_products.json"
        recorded: dict[str, object] = {}
        page_cache_config = SimpleNamespace(
            base_dir=tmp_path / "default-cache",
            domain_workers=1,
        )
        browser_config = SimpleNamespace(headless=True)

        def load_cache_config_stub(path: Path | None = None):
            recorded["config_path"] = path
            return page_cache_config

        def load_browser_config_stub(path: Path | None = None):
            recorded["browser_config_path"] = path
            return browser_config

        def load_library_stub(path: Path):
            recorded["library_file"] = path
            return sample_viewer_library_data

        def cache_pages_stub(library, config, **kwargs):
            recorded["cache_base_dir"] = config.base_dir
            recorded["domain_workers"] = config.domain_workers
            recorded["cache_kwargs"] = kwargs
            return SubproductPageCacheSummary(
                requested_urls=1,
                processed_urls=1,
                fetched_pages=1,
                reused_pages=0,
                failed_pages=0,
                skipped_pages=0,
                failure_limit=kwargs["max_failures"],
                aborted=False,
                manifest_path=config.base_dir / "index.json",
                elapsed_seconds=2.5,
                failure_breakdown={},
                domain_summaries=[],
            )

        monkeypatch.setattr(
            maintenance_api,
            "load_subproduct_page_cache_config",
            load_cache_config_stub,
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_browser_config",
            load_browser_config_stub,
        )
        monkeypatch.setattr(maintenance_api, "load_library_data", load_library_stub)
        monkeypatch.setattr(
            maintenance_api,
            "cache_subproduct_pages",
            cache_pages_stub,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post(
            "/api/maintenance/cache-subproduct-pages",
            json={
                "library_file": str(library_file),
                "config_path": str(config_path),
                "cache_dir": str(cache_dir),
                "redownload_existing": True,
                "subproduct_query": "sample book",
                "url": "https://example.test/subproduct",
                "limit": 4,
                "max_failures": 2,
                "domain_workers": 3,
            },
        )

        assert response.status_code == 200
        assert recorded["config_path"] == config_path.resolve()
        assert recorded["browser_config_path"] == config_path.resolve()
        assert recorded["library_file"] == library_file.resolve()
        assert recorded["cache_base_dir"] == cache_dir.resolve()
        assert recorded["domain_workers"] == 3
        assert recorded["cache_kwargs"] == {
            "browser_config": browser_config,
            "redownload_existing": True,
            "subproduct_query": "sample book",
            "target_url": "https://example.test/subproduct",
            "limit": 4,
            "max_failures": 2,
        }
        assert response.json()["details"]["manifest_path"] == str(
            cache_dir.resolve() / "index.json"
        )

    def test_cache_subproduct_pages_returns_502_when_workflow_aborts(
        self,
        api_client_factory,
        sample_viewer_library_data,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        monkeypatch.setattr(
            maintenance_api,
            "load_subproduct_page_cache_config",
            lambda _config_path=None: SimpleNamespace(
                base_dir=cache_dir,
                domain_workers=1,
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_browser_config",
            lambda _config_path=None: SimpleNamespace(headless=True),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_library_data",
            lambda _library_file: sample_viewer_library_data,
        )
        monkeypatch.setattr(
            maintenance_api,
            "cache_subproduct_pages",
            lambda *_args, **_kwargs: SubproductPageCacheSummary(
                requested_urls=3,
                processed_urls=2,
                fetched_pages=1,
                reused_pages=0,
                failed_pages=1,
                skipped_pages=0,
                failure_limit=1,
                aborted=True,
                manifest_path=cache_dir / "index.json",
                elapsed_seconds=3.0,
                failure_breakdown={"example.test": 1},
                domain_summaries=[],
            ),
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/cache-subproduct-pages", json={})

        assert response.status_code == 502
        assert response.json()["detail"] == (
            "Subproduct page cache aborted after reaching the failure limit."
        )

    def test_cache_subproduct_pages_maps_value_error_to_400(
        self,
        api_client_factory,
        sample_viewer_library_data,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        monkeypatch.setattr(
            maintenance_api,
            "load_subproduct_page_cache_config",
            lambda _config_path=None: SimpleNamespace(
                base_dir=cache_dir,
                domain_workers=1,
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_browser_config",
            lambda _config_path=None: SimpleNamespace(headless=True),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_library_data",
            lambda _library_file: sample_viewer_library_data,
        )

        def raise_value_error(*_args, **_kwargs):
            raise ValueError("cache workflow failed")

        monkeypatch.setattr(
            maintenance_api,
            "cache_subproduct_pages",
            raise_value_error,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/cache-subproduct-pages", json={})

        assert response.status_code == 400
        assert response.json()["detail"] == "cache workflow failed"

    def test_extract_subproduct_metadata_returns_summary(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        metadata_path = cache_dir / "metadata.json"
        report_path = cache_dir / "summary.md"
        monkeypatch.setattr(
            maintenance_api,
            "load_subproduct_page_cache_config",
            lambda _config_path=None: SimpleNamespace(base_dir=cache_dir),
        )
        monkeypatch.setattr(
            maintenance_api,
            "build_subproduct_page_metadata",
            lambda *_args, **_kwargs: SubproductMetadataExtractionSummary(
                processed_entries=3,
                extracted_entries=2,
                fallback_only_entries=1,
                html_read_failures=0,
                output_path=metadata_path,
                elapsed_seconds=90.0,
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "build_subproduct_metadata_analysis_report",
            lambda *_args, **_kwargs: report_path,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post(
            "/api/maintenance/extract-subproduct-metadata",
            json={"report_file": str(report_path)},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["details"]["output_path"] == str(metadata_path)
        assert payload["details"]["report_path"] == str(report_path)

    def test_extract_subproduct_metadata_without_report_skips_report_generation(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "custom-cache"
        metadata_path = cache_dir / "metadata.json"
        output_file = cache_dir / "custom-metadata.json"
        recorded: dict[str, Path] = {}

        monkeypatch.setattr(
            maintenance_api,
            "load_subproduct_page_cache_config",
            lambda _config_path=None: SimpleNamespace(
                base_dir=tmp_path / "default-cache"
            ),
        )

        def build_metadata_stub(base_dir: Path, *, output_path: Path | None):
            recorded["base_dir"] = base_dir
            recorded["output_path"] = output_path
            return SubproductMetadataExtractionSummary(
                processed_entries=1,
                extracted_entries=1,
                fallback_only_entries=0,
                html_read_failures=0,
                output_path=metadata_path,
                elapsed_seconds=2.0,
            )

        monkeypatch.setattr(
            maintenance_api,
            "build_subproduct_page_metadata",
            build_metadata_stub,
        )
        monkeypatch.setattr(
            maintenance_api,
            "build_subproduct_metadata_analysis_report",
            lambda *_args, **_kwargs: pytest.fail("report builder should not run"),
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post(
            "/api/maintenance/extract-subproduct-metadata",
            json={
                "cache_dir": str(cache_dir),
                "output_file": str(output_file),
            },
        )

        assert response.status_code == 200
        assert recorded["base_dir"] == cache_dir.resolve()
        assert recorded["output_path"] == output_file.resolve()
        assert response.json()["details"]["report_path"] is None

    def test_extract_subproduct_metadata_maps_value_error_to_400(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            maintenance_api,
            "load_subproduct_page_cache_config",
            lambda _config_path=None: SimpleNamespace(base_dir=Path("cache")),
        )

        def raise_value_error(*_args, **_kwargs):
            raise ValueError("invalid cached metadata")

        monkeypatch.setattr(
            maintenance_api,
            "build_subproduct_page_metadata",
            raise_value_error,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/extract-subproduct-metadata", json={})

        assert response.status_code == 400
        assert response.json()["detail"] == "invalid cached metadata"

    def test_analyze_current_bundles_returns_summary(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        output_dir = tmp_path / "current_bundles"
        report_path = output_dir / "bundle_overlap_report.json"

        monkeypatch.setattr(
            maintenance_api,
            "build_current_bundles_report",
            lambda **_kwargs: SimpleNamespace(
                output_dir=str(output_dir),
                index_html_path=str(output_dir / "bundles_index.html"),
                bundle_links_path=str(output_dir / "bundle_links.json"),
                catalog_json_path=str(output_dir / "bundle_catalog.json"),
                report_json_path=str(report_path),
                report_markdown_path=str(output_dir / "bundle_overlap_report.md"),
                bundle_types=["books"],
                bundle_count=2,
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_current_bundles_report",
            lambda _path: BundleOverlapReport(
                generated_at="2026-03-19T00:00:00+00:00",
                library_path=str(tmp_path / "library_products.json"),
                bundle_types=["books"],
                bundle_count=2,
                report_json_path=str(report_path),
                report_markdown_path=str(output_dir / "bundle_overlap_report.md"),
                bundles=[
                    BundleOverlapBundle(
                        title="Book Bundle",
                        bundle_type="Book Bundle",
                        category="books",
                        url="https://example.test/books/sample",
                        tiers=[],
                        top_tier_status="only_new",
                    )
                ],
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "resolve_current_bundles_library_path",
            lambda: tmp_path / "library_products.json",
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post(
            "/api/maintenance/analyze-current-bundles",
            json={"bundle_types": ["books"]},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["details"]["bundle_types"] == ["books"]
        assert payload["details"]["bundle_count"] == 2
        assert payload["details"]["generated_at"] == "2026-03-19T00:00:00+00:00"

    def test_analyze_current_bundles_prefers_explicit_library_override(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        output_dir = tmp_path / "current_bundles"
        report_path = output_dir / "bundle_overlap_report.json"
        explicit_library_path = tmp_path / "custom-library.json"
        recorded: dict[str, Path | None] = {}

        def build_report_stub(**kwargs):
            recorded["output_dir"] = kwargs["output_dir"]
            recorded["library_path"] = kwargs["library_path"]
            return SimpleNamespace(
                output_dir=str(output_dir),
                index_html_path=str(output_dir / "bundles_index.html"),
                bundle_links_path=str(output_dir / "bundle_links.json"),
                catalog_json_path=str(output_dir / "bundle_catalog.json"),
                report_json_path=str(report_path),
                report_markdown_path=str(output_dir / "bundle_overlap_report.md"),
                bundle_types=["books"],
                bundle_count=1,
            )

        monkeypatch.setattr(
            maintenance_api,
            "build_current_bundles_report",
            build_report_stub,
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_current_bundles_report",
            lambda _path: BundleOverlapReport(
                generated_at="2026-03-19T00:00:00+00:00",
                library_path=str(explicit_library_path),
                bundle_types=["books"],
                bundle_count=1,
                report_json_path=str(report_path),
                report_markdown_path=str(output_dir / "bundle_overlap_report.md"),
                bundles=[],
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "resolve_current_bundles_library_path",
            lambda: pytest.fail("resolver fallback should not run"),
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post(
            "/api/maintenance/analyze-current-bundles",
            json={
                "output_dir": str(output_dir),
                "library_path": str(explicit_library_path),
                "bundle_types": ["books"],
            },
        )

        assert response.status_code == 200
        assert recorded["output_dir"] == output_dir.resolve()
        assert recorded["library_path"] == explicit_library_path.resolve()
        assert response.json()["details"]["library_path"] == str(
            explicit_library_path.resolve()
        )

    def test_analyze_current_bundles_maps_runtime_error_to_500(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_runtime_error(**_kwargs):
            raise RuntimeError("bundle analysis failed")

        monkeypatch.setattr(
            maintenance_api,
            "build_current_bundles_report",
            raise_runtime_error,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/analyze-current-bundles", json={})

        assert response.status_code == 500
        assert response.json()["detail"] == "bundle analysis failed"

    def test_analyze_current_choice_returns_saved_report_details(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        output_dir = tmp_path / "current_choice"
        report_path = output_dir / "choice_overlap_report.json"

        monkeypatch.setattr(
            maintenance_api,
            "build_current_choice_report",
            lambda **_kwargs: SimpleNamespace(
                output_dir=str(output_dir),
                page_html_path=str(output_dir / "membership.html"),
                snapshot_json_path=str(output_dir / "choice_snapshot.json"),
                report_json_path=str(report_path),
                report_markdown_path=str(output_dir / "choice_overlap_report.md"),
                month_label="March",
                game_count=8,
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_saved_current_choice_report",
            lambda _path: CurrentChoiceReport(
                generated_at="2026-03-19T00:00:00+00:00",
                month_label="March",
                page_url="https://www.humblebundle.com/membership",
                page_html_path=str(output_dir / "membership.html"),
                snapshot_json_path=str(output_dir / "choice_snapshot.json"),
                library_path=str(tmp_path / "library_products.json"),
                price_label="$14.99/month",
                price_value=14.99,
                total_titles=8,
                owned_titles=3,
                new_titles=5,
                owned_percent=37.5,
                new_percent=62.5,
                report_json_path=str(report_path),
                report_markdown_path=str(output_dir / "choice_overlap_report.md"),
                games=[CurrentChoiceGame(title="Tempest Rising", owned=True)],
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "resolve_current_choice_library_path",
            lambda: tmp_path / "library_products.json",
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/analyze-current-choice", json={})

        assert response.status_code == 200
        payload = response.json()
        assert payload["details"]["month_label"] == "March"
        assert payload["details"]["game_count"] == 8
        assert payload["details"]["generated_at"] == "2026-03-19T00:00:00+00:00"

    def test_analyze_current_choice_prefers_explicit_library_override(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        output_dir = tmp_path / "current_choice"
        report_path = output_dir / "choice_overlap_report.json"
        explicit_library_path = tmp_path / "custom-library.json"
        recorded: dict[str, Path | None] = {}

        def build_report_stub(**kwargs):
            recorded["output_dir"] = kwargs["output_dir"]
            recorded["library_path"] = kwargs["library_path"]
            return SimpleNamespace(
                output_dir=str(output_dir),
                page_html_path=str(output_dir / "membership.html"),
                snapshot_json_path=str(output_dir / "choice_snapshot.json"),
                report_json_path=str(report_path),
                report_markdown_path=str(output_dir / "choice_overlap_report.md"),
                month_label="March",
                game_count=8,
            )

        monkeypatch.setattr(
            maintenance_api,
            "build_current_choice_report",
            build_report_stub,
        )
        monkeypatch.setattr(
            maintenance_api,
            "load_saved_current_choice_report",
            lambda _path: CurrentChoiceReport(
                generated_at="2026-03-19T00:00:00+00:00",
                month_label="March",
                page_url="https://www.humblebundle.com/membership",
                page_html_path=str(output_dir / "membership.html"),
                snapshot_json_path=str(output_dir / "choice_snapshot.json"),
                library_path=str(explicit_library_path),
                price_label="$14.99/month",
                price_value=14.99,
                total_titles=8,
                owned_titles=3,
                new_titles=5,
                owned_percent=37.5,
                new_percent=62.5,
                report_json_path=str(report_path),
                report_markdown_path=str(output_dir / "choice_overlap_report.md"),
                games=[],
            ),
        )
        monkeypatch.setattr(
            maintenance_api,
            "resolve_current_choice_library_path",
            lambda: pytest.fail("resolver fallback should not run"),
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post(
            "/api/maintenance/analyze-current-choice",
            json={
                "output_dir": str(output_dir),
                "library_path": str(explicit_library_path),
            },
        )

        assert response.status_code == 200
        assert recorded["output_dir"] == output_dir.resolve()
        assert recorded["library_path"] == explicit_library_path.resolve()
        assert response.json()["details"]["library_path"] == str(
            explicit_library_path.resolve()
        )

    def test_analyze_current_choice_maps_runtime_error_to_500(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_runtime_error(**_kwargs):
            raise RuntimeError("choice analysis failed")

        monkeypatch.setattr(
            maintenance_api,
            "build_current_choice_report",
            raise_runtime_error,
        )
        client = api_client_factory(maintenance_api.router)

        response = client.post("/api/maintenance/analyze-current-choice", json={})

        assert response.status_code == 500
        assert response.json()["detail"] == "choice analysis failed"
