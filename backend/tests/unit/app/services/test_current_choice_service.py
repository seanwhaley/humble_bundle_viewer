"""Unit tests for current Choice runtime service helpers."""

from __future__ import annotations

import importlib
from pathlib import Path
from types import SimpleNamespace
from typing import Callable

import pytest

current_choice_service = importlib.import_module("app.services.current_choice")


@pytest.mark.unit
class TestCurrentChoiceService:
    """Verify runtime current Choice service defaults and overrides."""

    @pytest.mark.parametrize(
        "payload_factory",
        [
            lambda base_dir: {
                "base_dir": str(base_dir),
                "timeout_seconds": 45,
            },
            lambda base_dir: SimpleNamespace(
                base_dir=str(base_dir),
                timeout_seconds=45,
            ),
        ],
    )
    def test_runtime_current_choice_config_normalizes_non_model_payloads(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        payload_factory: Callable[[Path], object],
    ) -> None:
        base_dir = tmp_path / "choice"
        monkeypatch.setattr(
            current_choice_service,
            "RuntimeSettings",
            lambda: SimpleNamespace(current_choice=payload_factory(base_dir)),
        )

        config = current_choice_service.runtime_current_choice_config()

        assert isinstance(config, current_choice_service.CurrentChoiceConfig)
        assert config.base_dir == base_dir
        assert config.timeout_seconds == 45

    def test_resolve_current_choice_library_path_prefers_choice_library(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        choice_library = tmp_path / "choice-library.json"
        monkeypatch.setattr(
            current_choice_service,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                current_choice=current_choice_service.CurrentChoiceConfig(
                    base_dir=tmp_path / "choice",
                    library_path=choice_library,
                ),
                artifacts=SimpleNamespace(base_dir=tmp_path / "artifacts"),
            ),
        )

        assert (
            current_choice_service.resolve_current_choice_library_path()
            == choice_library
        )

    def test_resolve_current_choice_paths_are_derived_from_output_dir(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        output_dir = tmp_path / "choice"
        monkeypatch.setattr(
            current_choice_service,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                current_choice=current_choice_service.CurrentChoiceConfig(
                    base_dir=output_dir,
                ),
            ),
        )

        assert current_choice_service.resolve_current_choice_output_dir() == output_dir
        assert current_choice_service.resolve_current_choice_page_html_path() == (
            output_dir / "membership.html"
        )
        assert current_choice_service.resolve_current_choice_snapshot_path() == (
            output_dir / "choice_snapshot.json"
        )
        assert current_choice_service.resolve_current_choice_report_path() == (
            output_dir / "choice_overlap_report.json"
        )
        assert current_choice_service.resolve_current_choice_markdown_path() == (
            output_dir / "choice_overlap_report.md"
        )

    def test_resolve_current_choice_library_path_falls_back_to_active_library(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        active_library = tmp_path / "active-library.json"
        monkeypatch.setattr(
            current_choice_service,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                current_choice=current_choice_service.CurrentChoiceConfig(
                    base_dir=tmp_path / "choice",
                ),
            ),
        )
        monkeypatch.setattr(
            current_choice_service,
            "resolve_library_path",
            lambda: active_library,
        )

        assert (
            current_choice_service.resolve_current_choice_library_path()
            == active_library
        )

    def test_resolve_current_choice_library_path_ignores_runtime_artifact_default_when_active_library_exists(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        active_library = tmp_path / "selected-library.json"
        monkeypatch.setattr(
            current_choice_service,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                current_choice=current_choice_service.CurrentChoiceConfig(
                    base_dir=tmp_path / "choice",
                ),
            ),
        )
        monkeypatch.setattr(
            current_choice_service,
            "resolve_library_path",
            lambda: active_library,
        )

        assert (
            current_choice_service.resolve_current_choice_library_path()
            == active_library
        )

    def test_load_saved_current_choice_report_uses_resolved_path_when_omitted(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        report_path = tmp_path / "choice_overlap_report.json"
        captured: dict[str, Path] = {}

        monkeypatch.setattr(
            current_choice_service,
            "resolve_current_choice_report_path",
            lambda: report_path,
        )
        monkeypatch.setattr(
            current_choice_service,
            "load_current_choice_report",
            lambda path: captured.setdefault("path", path),
        )

        result = current_choice_service.load_saved_current_choice_report()

        assert result == report_path
        assert captured["path"] == report_path

    def test_build_current_choice_report_uses_runtime_defaults(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        output_dir = tmp_path / "choice"
        library_path = tmp_path / "library_products.json"
        captured: dict[str, object] = {}
        workflow_result = SimpleNamespace(
            report_json_path=output_dir / "choice_overlap_report.json"
        )

        monkeypatch.setattr(
            current_choice_service,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                current_choice={
                    "base_dir": str(output_dir),
                    "library_path": str(library_path),
                    "timeout_seconds": 45,
                },
                artifacts=SimpleNamespace(base_dir=tmp_path / "artifacts"),
            ),
        )

        def capture_stub(**kwargs):
            captured.update(kwargs)
            return workflow_result

        monkeypatch.setattr(
            current_choice_service,
            "capture_and_report_current_choice",
            capture_stub,
        )

        result = current_choice_service.build_current_choice_report()

        assert result is workflow_result
        assert captured == {
            "output_dir": output_dir,
            "library_path": library_path,
            "timeout_seconds": 45,
        }

    def test_build_current_choice_report_honors_explicit_overrides(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        captured: dict[str, object] = {}
        workflow_result = SimpleNamespace(
            report_json_path=tmp_path / "explicit-report.json"
        )

        monkeypatch.setattr(
            current_choice_service,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                current_choice=current_choice_service.CurrentChoiceConfig(
                    base_dir=tmp_path / "choice",
                    timeout_seconds=30,
                ),
                artifacts=SimpleNamespace(base_dir=tmp_path / "artifacts"),
            ),
        )
        monkeypatch.setattr(
            current_choice_service,
            "capture_and_report_current_choice",
            lambda **kwargs: captured.update(kwargs) or workflow_result,
        )

        result = current_choice_service.build_current_choice_report(
            output_dir=tmp_path / "explicit-output",
            library_path=tmp_path / "explicit-library.json",
            timeout_seconds=90,
        )

        assert result is workflow_result
        assert captured == {
            "output_dir": tmp_path / "explicit-output",
            "library_path": tmp_path / "explicit-library.json",
            "timeout_seconds": 90,
        }
