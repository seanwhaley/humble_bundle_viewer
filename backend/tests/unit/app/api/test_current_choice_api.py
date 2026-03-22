"""Unit tests for current Humble Choice API routes."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

from hb_library_viewer.current_choice import CurrentChoiceGame, CurrentChoiceReport

current_choice_api = importlib.import_module("app.api.current_choice")


@pytest.mark.unit
class TestCurrentChoiceApi:
    """Verify current Humble Choice API HTTP contracts in isolation."""

    def test_get_current_choice_report_returns_saved_report(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            current_choice_api,
            "load_saved_current_choice_report",
            lambda: CurrentChoiceReport(
                generated_at="2026-03-19T00:00:00+00:00",
                month_label="March",
                page_url="https://www.humblebundle.com/membership",
                page_html_path="membership.html",
                snapshot_json_path="choice_snapshot.json",
                library_path="library_products.json",
                price_label="$14.99/month",
                price_value=14.99,
                total_titles=2,
                owned_titles=1,
                new_titles=1,
                owned_percent=50.0,
                new_percent=50.0,
                report_json_path="report.json",
                report_markdown_path="report.md",
                games=[CurrentChoiceGame(title="Tempest Rising", owned=True)],
            ),
        )
        client = api_client_factory(current_choice_api.router)

        response = client.get("/api/current-choice")

        assert response.status_code == 200
        assert response.json()["month_label"] == "March"
        assert response.json()["total_titles"] == 2

    def test_get_current_choice_report_maps_missing_file_to_404(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            current_choice_api,
            "load_saved_current_choice_report",
            lambda: (_ for _ in ()).throw(FileNotFoundError("missing report")),
        )
        client = api_client_factory(current_choice_api.router)

        response = client.get("/api/current-choice")

        assert response.status_code == 404
        assert "Run the current Choice analysis first" in response.json()["detail"]

    def test_get_current_choice_report_maps_validation_error_to_400(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            current_choice_api,
            "load_saved_current_choice_report",
            lambda: (_ for _ in ()).throw(ValueError("invalid report")),
        )
        client = api_client_factory(current_choice_api.router)

        response = client.get("/api/current-choice")

        assert response.status_code == 400
        assert response.json()["detail"] == "invalid report"

    def test_get_current_choice_status_reports_artifact_paths(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        report_path = tmp_path / "choice_overlap_report.json"
        markdown_path = tmp_path / "choice_overlap_report.md"
        report_path.write_text("{}", encoding="utf-8")
        markdown_path.write_text("# report\n", encoding="utf-8")

        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_output_dir",
            lambda: tmp_path,
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_page_html_path",
            lambda: tmp_path / "membership.html",
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_snapshot_path",
            lambda: tmp_path / "choice_snapshot.json",
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_report_path",
            lambda: report_path,
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_markdown_path",
            lambda: markdown_path,
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_library_path",
            lambda: tmp_path / "library_products.json",
        )
        monkeypatch.setattr(
            current_choice_api,
            "load_saved_current_choice_report",
            lambda _path=None: CurrentChoiceReport(
                generated_at="2026-03-19T00:00:00+00:00",
                month_label="March",
                page_url="https://www.humblebundle.com/membership",
                page_html_path=str(tmp_path / "membership.html"),
                snapshot_json_path=str(tmp_path / "choice_snapshot.json"),
                library_path=str(tmp_path / "library_products.json"),
                price_label="$14.99/month",
                price_value=14.99,
                total_titles=8,
                owned_titles=3,
                new_titles=5,
                owned_percent=37.5,
                new_percent=62.5,
                report_json_path=str(report_path),
                report_markdown_path=str(markdown_path),
                games=[],
            ),
        )
        client = api_client_factory(current_choice_api.router)

        response = client.get("/api/current-choice/status")

        assert response.status_code == 200
        payload = response.json()
        assert payload["output_dir"] == str(tmp_path)
        assert payload["report_exists"] is True
        assert payload["markdown_exists"] is True
        assert payload["month_label"] == "March"
        assert payload["game_count"] == 8

    def test_get_current_choice_status_leaves_summary_empty_when_report_invalid(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        report_path = tmp_path / "choice_overlap_report.json"
        report_path.write_text("{}", encoding="utf-8")

        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_output_dir",
            lambda: tmp_path,
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_page_html_path",
            lambda: tmp_path / "membership.html",
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_snapshot_path",
            lambda: tmp_path / "choice_snapshot.json",
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_report_path",
            lambda: report_path,
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_markdown_path",
            lambda: tmp_path / "choice_overlap_report.md",
        )
        monkeypatch.setattr(
            current_choice_api,
            "resolve_current_choice_library_path",
            lambda: tmp_path / "library_products.json",
        )
        monkeypatch.setattr(
            current_choice_api,
            "load_saved_current_choice_report",
            lambda _path=None: (_ for _ in ()).throw(ValueError("invalid report")),
        )
        client = api_client_factory(current_choice_api.router)

        response = client.get("/api/current-choice/status")

        assert response.status_code == 200
        payload = response.json()
        assert payload["report_exists"] is True
        assert payload["generated_at"] is None
        assert payload["month_label"] is None
        assert payload["game_count"] is None
