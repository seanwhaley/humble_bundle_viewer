"""Unit tests for current bundle overlap API routes."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

from hb_library_viewer.current_bundles import BundleOverlapBundle, BundleOverlapReport

current_bundles_api = importlib.import_module("app.api.current_bundles")


@pytest.mark.unit
class TestCurrentBundlesApi:
    """Verify current bundle overlap API HTTP contracts in isolation."""

    def test_get_current_bundles_report_returns_saved_report(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            current_bundles_api,
            "load_current_bundles_report",
            lambda: BundleOverlapReport(
                generated_at="2026-03-19T00:00:00+00:00",
                library_path="library_products.json",
                bundle_types=["games", "books"],
                bundle_count=1,
                report_json_path="report.json",
                report_markdown_path="report.md",
                bundles=[
                    BundleOverlapBundle(
                        title="Bundle",
                        bundle_type="Game Bundle",
                        category="games",
                        url="https://example.test/games/bundle",
                        tiers=[],
                        top_tier_status="only_new",
                    )
                ],
            ),
        )
        client = api_client_factory(current_bundles_api.router)

        response = client.get("/api/current-bundles")

        assert response.status_code == 200
        assert response.json()["bundle_types"] == ["games", "books"]
        assert response.json()["bundle_count"] == 1

    def test_get_current_bundles_report_maps_missing_file_to_404(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            current_bundles_api,
            "load_current_bundles_report",
            lambda: (_ for _ in ()).throw(FileNotFoundError("missing report")),
        )
        client = api_client_factory(current_bundles_api.router)

        response = client.get("/api/current-bundles")

        assert response.status_code == 404
        assert "Run the current bundle analysis first" in response.json()["detail"]

    def test_get_current_bundles_report_maps_validation_error_to_400(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            current_bundles_api,
            "load_current_bundles_report",
            lambda: (_ for _ in ()).throw(ValueError("invalid report")),
        )
        client = api_client_factory(current_bundles_api.router)

        response = client.get("/api/current-bundles")

        assert response.status_code == 400
        assert response.json()["detail"] == "invalid report"

    def test_get_current_bundles_status_reports_artifact_paths(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        report_path = tmp_path / "bundle_overlap_report.json"
        markdown_path = tmp_path / "bundle_overlap_report.md"
        report_path.write_text("{}", encoding="utf-8")
        markdown_path.write_text("# report\n", encoding="utf-8")

        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_output_dir",
            lambda: tmp_path,
        )
        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_report_path",
            lambda: report_path,
        )
        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_markdown_path",
            lambda: markdown_path,
        )
        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_library_path",
            lambda: tmp_path / "library_products.json",
        )
        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_bundle_types",
            lambda: ["books", "software"],
        )
        monkeypatch.setattr(
            current_bundles_api,
            "load_current_bundles_report",
            lambda _path=None: BundleOverlapReport(
                generated_at="2026-03-19T00:00:00+00:00",
                library_path=str(tmp_path / "library_products.json"),
                bundle_types=["books"],
                bundle_count=4,
                report_json_path=str(report_path),
                report_markdown_path=str(markdown_path),
                bundles=[],
            ),
        )
        client = api_client_factory(current_bundles_api.router)

        response = client.get("/api/current-bundles/status")

        assert response.status_code == 200
        payload = response.json()
        assert payload["output_dir"] == str(tmp_path)
        assert payload["report_exists"] is True
        assert payload["markdown_exists"] is True
        assert payload["bundle_types"] == ["books"]
        assert payload["bundle_count"] == 4

    def test_get_current_bundles_status_keeps_configured_bundle_types_when_report_invalid(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        report_path = tmp_path / "bundle_overlap_report.json"
        report_path.write_text("{}", encoding="utf-8")

        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_output_dir",
            lambda: tmp_path,
        )
        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_report_path",
            lambda: report_path,
        )
        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_markdown_path",
            lambda: tmp_path / "bundle_overlap_report.md",
        )
        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_library_path",
            lambda: tmp_path / "library_products.json",
        )
        monkeypatch.setattr(
            current_bundles_api,
            "resolve_current_bundles_bundle_types",
            lambda: ["books", "software"],
        )
        monkeypatch.setattr(
            current_bundles_api,
            "load_current_bundles_report",
            lambda _path=None: (_ for _ in ()).throw(ValueError("invalid report")),
        )
        client = api_client_factory(current_bundles_api.router)

        response = client.get("/api/current-bundles/status")

        assert response.status_code == 200
        payload = response.json()
        assert payload["report_exists"] is True
        assert payload["bundle_types"] == ["books", "software"]
        assert payload["generated_at"] is None
        assert payload["bundle_count"] is None
