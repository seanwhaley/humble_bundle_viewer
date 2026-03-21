"""Unit tests for viewer library capture service orchestration."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.services import library_runner
from hb_library_viewer.parsing import Download, LibraryData, Product


@pytest.mark.unit
class TestLibraryRunner:
    """Verify service-level capture and optional download orchestration."""

    @staticmethod
    def _settings(tmp_path: Path):
        return SimpleNamespace(
            artifacts=SimpleNamespace(base_dir=tmp_path / "artifacts"),
            download=SimpleNamespace(base_folder=tmp_path / "downloads"),
            platforms=["ebook"],
        )

    @staticmethod
    def _library() -> LibraryData:
        return LibraryData(
            products=[
                Product(
                    gamekey="g1",
                    product_name="Sample Book",
                    machine_name="sample_book",
                    category="ebook",
                    downloads=[
                        Download(
                            platform="ebook",
                            name="Sample Book.pdf",
                            url="https://example.com/sample-book.pdf",
                            size_bytes=10,
                            checksums={},
                        )
                    ],
                    amount_spent=1.0,
                )
            ],
            total_products=1,
            captured_at="2026-03-12T00:00:00",
        )

    def test_run_library_capture_without_downloads(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ):
        settings = self._settings(tmp_path)
        library = self._library()
        recorded: dict[str, Any] = {}

        monkeypatch.setattr(library_runner, "Settings", lambda auth_cookie: settings)

        def capture_stub(**kwargs: Any):
            recorded.update(kwargs)
            return SimpleNamespace(library=library)

        monkeypatch.setattr(library_runner, "capture_library_data", capture_stub)

        result = library_runner.run_library_capture(
            auth_cookie="cookie",
            output_path=tmp_path / "library_products.json",
            download_files=False,
        )

        assert result.library == library
        assert result.files_downloaded == 0
        assert result.files_failed == 0
        assert recorded["artifacts_dir"] == settings.artifacts.base_dir
        assert recorded["order_model_path"] == settings.artifacts.base_dir / "order_payload_models.py"

    def test_run_library_capture_with_downloads_uses_config_platforms_when_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ):
        settings = self._settings(tmp_path)
        library = self._library()
        recorded: dict[str, Any] = {}

        monkeypatch.setattr(library_runner, "Settings", lambda auth_cookie: settings)
        monkeypatch.setattr(
            library_runner,
            "capture_library_data",
            lambda **_kwargs: SimpleNamespace(library=library),
        )

        def download_stub(**kwargs: Any):
            recorded.update(kwargs)
            return SimpleNamespace(files_downloaded=2, files_failed=1)

        monkeypatch.setattr(library_runner, "download_library_products", download_stub)

        result = library_runner.run_library_capture(
            auth_cookie="cookie",
            output_path=tmp_path / "library_products.json",
            download_files=True,
            file_types=["pdf"],
            size_policy="largest",
        )

        assert result.files_downloaded == 2
        assert result.files_failed == 1
        assert recorded["library"] == library
        assert recorded["download_config"] == settings.download
        assert recorded["platforms"] == ["ebook"]
        assert recorded["file_types"] == ["pdf"]
        assert recorded["size_policy"] == "largest"

    def test_run_library_capture_with_explicit_platforms_overrides_config(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ):
        settings = self._settings(tmp_path)
        library = self._library()
        captured_platforms: list[str] | None = None

        monkeypatch.setattr(library_runner, "Settings", lambda auth_cookie: settings)
        monkeypatch.setattr(
            library_runner,
            "capture_library_data",
            lambda **_kwargs: SimpleNamespace(library=library),
        )

        def download_stub(**kwargs: Any):
            nonlocal captured_platforms
            captured_platforms = cast(list[str] | None, kwargs["platforms"])
            return SimpleNamespace(files_downloaded=0, files_failed=0)

        monkeypatch.setattr(library_runner, "download_library_products", download_stub)

        library_runner.run_library_capture(
            auth_cookie="cookie",
            output_path=tmp_path / "library_products.json",
            download_files=True,
            platforms=["audio"],
        )

        assert captured_platforms == ["audio"]
