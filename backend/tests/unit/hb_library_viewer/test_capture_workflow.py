"""Unit tests for shared capture and download workflows."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from hb_library_viewer import capture_workflow
from hb_library_viewer.parsing import Download, LibraryData, Product


class SuccessfulBrowserManager:
    """Stub browser manager that returns captured API batches."""

    def __init__(self, *_args: Any, **_kwargs: Any):
        self.capture_result = SimpleNamespace(
            api_batches=1,
            api_responses=[{"payload": 1}],
        )

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def capture_library_page(self):
        return self.capture_result


class EmptyBrowserManager(SuccessfulBrowserManager):
    """Stub browser manager that captures nothing."""

    def __init__(self, *_args: Any, **_kwargs: Any):
        self.capture_result = SimpleNamespace(api_batches=0, api_responses=[])


class RecordingDownloader:
    """Downloader stub with configurable per-product outcomes."""

    def __init__(self, _config: Any):
        self.calls: list[str] = []

    def download_product(self, task: Any):
        self.calls.append(task.product_name)
        if task.product_name == "First":
            return SimpleNamespace(status="success", files_downloaded=1, errors=[])
        if task.product_name == "Second":
            return SimpleNamespace(
                status="partial",
                files_downloaded=1,
                errors=["checksum mismatch"],
            )
        return SimpleNamespace(status="failed", files_downloaded=0, errors=[])


class ExplodingDownloader:
    """Downloader stub that raises for every product."""

    def __init__(self, _config: Any):
        pass

    def download_product(self, _task: Any):
        raise RuntimeError("boom")


@pytest.mark.unit
class TestCaptureWorkflow:
    """Behavior tests for capture and download workflows."""

    @staticmethod
    def _settings(tmp_path: Path):
        return SimpleNamespace(
            auth_cookie="cookie",
            browser=SimpleNamespace(),
            artifacts=SimpleNamespace(
                save_captured_responses=False,
                save_api_batches=True,
                save_gamekeys=False,
                save_html_on_failure=True,
                auto_rebuild_order_models=False,
            ),
        )

    def test_capture_library_data_writes_products(
        self,
        tmp_path: Path,
        sample_library_data: LibraryData,
    ):
        artifacts_dir = tmp_path / "artifacts"
        output_products = artifacts_dir / "library_products.json"
        order_model_path = artifacts_dir / "order_payload_models.py"
        order_model_path.parent.mkdir(parents=True, exist_ok=True)
        order_model_path.write_text("class OrderPayloadList: ...\n", encoding="utf-8")

        result = capture_workflow.capture_library_data(
            settings=cast(Any, self._settings(tmp_path)),
            artifacts_dir=artifacts_dir,
            output_products=output_products,
            order_model_path=order_model_path,
            browser_manager_cls=SuccessfulBrowserManager,
            library_builder=lambda *_args, **_kwargs: sample_library_data,
            missing_paths_finder=lambda *_args, **_kwargs: set(),
        )

        assert result.library == sample_library_data
        assert result.output_products == output_products
        payload = json.loads(output_products.read_text(encoding="utf-8"))
        assert payload["total_products"] == sample_library_data.total_products

    def test_capture_library_data_rebuilds_missing_order_model(
        self,
        tmp_path: Path,
        sample_library_data: LibraryData,
    ):
        artifacts_dir = tmp_path / "artifacts"
        output_products = artifacts_dir / "library_products.json"
        order_model_path = artifacts_dir / "order_payload_models.py"
        settings = self._settings(tmp_path)
        settings.artifacts.auto_rebuild_order_models = True
        rebuild_calls: list[str] = []

        def write_model(*_args, model_path: Path | None = None, **_kwargs):
            rebuild_calls.append("called")
            assert model_path is not None
            model_path.parent.mkdir(parents=True, exist_ok=True)
            model_path.write_text("class OrderPayloadList: ...\n", encoding="utf-8")

        missing_path_responses = iter([{"product.name"}, set()])

        result = capture_workflow.capture_library_data(
            settings=cast(Any, settings),
            artifacts_dir=artifacts_dir,
            output_products=output_products,
            order_model_path=order_model_path,
            browser_manager_cls=SuccessfulBrowserManager,
            library_builder=lambda *_args, **_kwargs: sample_library_data,
            missing_paths_finder=lambda *_args, **_kwargs: next(missing_path_responses),
            order_model_writer=write_model,
        )

        assert rebuild_calls == ["called"]
        assert order_model_path.exists()
        assert result.output_products == output_products

    @pytest.mark.parametrize(
        ("prompt_result", "expect_success"),
        [
            (True, True),
            (False, False),
        ],
    )
    def test_capture_library_data_prompt_controls_missing_model_rebuild(
        self,
        tmp_path: Path,
        sample_library_data: LibraryData,
        prompt_result: bool,
        expect_success: bool,
    ):
        artifacts_dir = tmp_path / "artifacts"
        output_products = artifacts_dir / "library_products.json"
        order_model_path = artifacts_dir / "order_payload_models.py"
        settings = self._settings(tmp_path)
        settings.artifacts.auto_rebuild_order_models = False
        rebuild_calls: list[str] = []

        def write_model(*_args, model_path: Path | None = None, **_kwargs):
            rebuild_calls.append("called")
            assert model_path is not None
            model_path.parent.mkdir(parents=True, exist_ok=True)
            model_path.write_text("class OrderPayloadList: ...\n", encoding="utf-8")

        if expect_success:
            result = capture_workflow.capture_library_data(
                settings=cast(Any, settings),
                artifacts_dir=artifacts_dir,
                output_products=output_products,
                order_model_path=order_model_path,
                browser_manager_cls=SuccessfulBrowserManager,
                library_builder=lambda *_args, **_kwargs: sample_library_data,
                missing_paths_finder=lambda *_args, **_kwargs: set(),
                prompt_for_order_model_rebuild=lambda *_args: prompt_result,
                order_model_writer=write_model,
            )

            assert rebuild_calls == ["called"]
            assert result.library == sample_library_data
            assert order_model_path.exists()
            return

        with pytest.raises(RuntimeError, match="Order payload model required"):
            capture_workflow.capture_library_data(
                settings=cast(Any, settings),
                artifacts_dir=artifacts_dir,
                output_products=output_products,
                order_model_path=order_model_path,
                browser_manager_cls=SuccessfulBrowserManager,
                library_builder=lambda *_args, **_kwargs: sample_library_data,
                missing_paths_finder=lambda *_args, **_kwargs: set(),
                prompt_for_order_model_rebuild=lambda *_args: prompt_result,
                order_model_writer=write_model,
            )

        assert rebuild_calls == []

    def test_capture_library_data_requires_api_responses(self, tmp_path: Path):
        artifacts_dir = tmp_path / "artifacts"
        order_model_path = artifacts_dir / "order_payload_models.py"
        order_model_path.parent.mkdir(parents=True, exist_ok=True)
        order_model_path.write_text("class OrderPayloadList: ...\n", encoding="utf-8")
        dummy_library = LibraryData(products=[], total_products=0, captured_at="2026-01-31T00:00:00")

        with pytest.raises(RuntimeError, match="No API responses were captured"):
            capture_workflow.capture_library_data(
                settings=cast(Any, self._settings(tmp_path)),
                artifacts_dir=artifacts_dir,
                output_products=artifacts_dir / "library_products.json",
                order_model_path=order_model_path,
                browser_manager_cls=EmptyBrowserManager,
                library_builder=lambda *_args, **_kwargs: dummy_library,
                missing_paths_finder=lambda *_args, **_kwargs: set(),
            )

    def test_download_library_products_validates_size_policy(
        self,
        sample_library_data: LibraryData,
    ):
        with pytest.raises(ValueError, match="size_policy"):
            capture_workflow.download_library_products(
                library=sample_library_data,
                download_config=SimpleNamespace(),
                size_policy="tiny",
            )

    def test_download_library_products_counts_success_partial_and_failures(self):
        pdf = Download(
            platform="ebook",
            name="Book.pdf",
            url="https://example.com/book.pdf",
            size_bytes=100,
            checksums={},
        )
        epub = Download(
            platform="ebook",
            name="Book.epub",
            url="https://example.com/book.epub",
            size_bytes=50,
            checksums={},
        )
        library = LibraryData(
            products=[
                Product(
                    gamekey="g1",
                    product_name="First",
                    machine_name="first",
                    category="ebook",
                    downloads=[pdf],
                    amount_spent=1.0,
                ),
                Product(
                    gamekey="g2",
                    product_name="Second",
                    machine_name="second",
                    category="ebook",
                    downloads=[epub],
                    amount_spent=1.0,
                ),
                Product(
                    gamekey="g3",
                    product_name="Third",
                    machine_name="third",
                    category="ebook",
                    downloads=[pdf],
                    amount_spent=1.0,
                ),
            ],
            total_products=3,
            captured_at="2026-01-31T00:00:00",
        )

        result = capture_workflow.download_library_products(
            library=library,
            download_config=SimpleNamespace(),
            downloader_cls=RecordingDownloader,
        )

        assert result.files_downloaded == 2
        assert result.files_failed == 2

    def test_download_library_products_handles_downloader_exceptions(self):
        pdf = Download(
            platform="ebook",
            name="Book.pdf",
            url="https://example.com/book.pdf",
            size_bytes=100,
            checksums={},
        )
        library = LibraryData(
            products=[
                Product(
                    gamekey="g1",
                    product_name="Explodes",
                    machine_name="explodes",
                    category="ebook",
                    downloads=[pdf],
                    amount_spent=1.0,
                )
            ],
            total_products=1,
            captured_at="2026-01-31T00:00:00",
        )

        result = capture_workflow.download_library_products(
            library=library,
            download_config=SimpleNamespace(),
            downloader_cls=ExplodingDownloader,
        )

        assert result.files_downloaded == 0
        assert result.files_failed == 1
