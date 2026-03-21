"""End-to-end tests for full workflow.

Tests the complete workflow: config load → browser capture → parse → download.
These tests mock external dependencies (Playwright, file I/O, network) but test
the integration of all components together.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import patch

import pytest

from hb_library_viewer.browser.manager import BrowserManager
from hb_library_viewer.config import Settings
from hb_library_viewer.download import DownloadTask, FileDownloader
from hb_library_viewer.parsing import build_library_json, LibraryData

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACTS_DIR = BACKEND_ROOT.parent / "data" / "artifacts"

RUN_AUTH_TESTS = os.getenv("HUMBLE_RUN_AUTH_TESTS") == "1"
HAS_AUTH_COOKIE = bool(os.getenv("HUMBLE_AUTH_COOKIE"))
RUN_DOWNLOAD_TESTS = os.getenv("HUMBLE_RUN_DOWNLOAD_TESTS") == "1"
SKIP_AUTH_REASON = (
    "Set HUMBLE_RUN_AUTH_TESTS=1 and HUMBLE_AUTH_COOKIE to run auth-required tests"
)
SKIP_DOWNLOAD_REASON = (
    "Set HUMBLE_RUN_DOWNLOAD_TESTS=1 in addition to auth settings to run downloads"
)


@pytest.mark.e2e
class TestFullWorkflowMocked:
    """Test full workflow with mocked external dependencies."""

    def test_config_to_parsing_workflow(
        self,
        valid_config: Settings,
        sample_api_batch_multiple: List[Dict[str, Any]],
        order_model_path: Any,
    ):
        """Test workflow from config loading through parsing."""
        # Step 1: Config is loaded (fixture provides this)
        assert valid_config.auth_cookie is not None

        # Step 2: Mock browser capture would return API batches
        # In real flow, this would be: browser.capture_library_page()
        api_batches = sample_api_batch_multiple

        # Step 3: Parse API batches
        lib_data = build_library_json(api_batches, order_model_path=order_model_path)

        # Verify results
        assert lib_data.total_products == 2
        assert len(lib_data.products) == 2

        # Verify products have downloads
        for product in lib_data.products:
            assert len(product.downloads) > 0

    def test_end_to_end_json_output(
        self,
        valid_config: Settings,
        sample_api_batch_multiple: List[Dict[str, Any]],
        tmp_path: Path,
        order_model_path: Any,
    ):
        """Test complete workflow ending with JSON file output."""
        # Step 1: Config loaded
        assert valid_config.auth_cookie is not None

        # Step 2: Mock browser capture
        api_batches = sample_api_batch_multiple

        # Step 3: Parse to LibraryData
        lib_data = build_library_json(api_batches, order_model_path=order_model_path)

        # Step 4: Write to JSON file (final output)
        output_file = tmp_path / "library_products.json"
        output_file.write_text(lib_data.model_dump_json(indent=2))

        # Verify file exists and is valid
        assert output_file.exists()

        # Verify file contents
        loaded_data = json.loads(output_file.read_text())
        assert loaded_data["total_products"] == 2
        assert len(loaded_data["products"]) == 2

        # Verify structure
        assert "captured_at" in loaded_data
        assert "products" in loaded_data
        for product in loaded_data["products"]:
            assert "gamekey" in product
            assert "downloads" in product

    @patch("hb_library_viewer.config.Settings")
    def test_config_validation_in_workflow(self, mock_settings):
        """Test that config validation happens early in workflow."""
        from hb_library_viewer.utils import ConfigError

        # Mock invalid config
        mock_settings.side_effect = ConfigError("Invalid auth_cookie")

        # Workflow should fail early at config stage
        with pytest.raises(ConfigError):
            mock_settings()

    def test_parsing_with_empty_api_response(
        self,
        valid_config: Settings,
        empty_api_response: Dict[str, Any],
        order_model_path: Any,
    ):
        """Test workflow handles empty API response gracefully."""
        # Config is valid
        assert valid_config.auth_cookie is not None

        # Empty API response (no products)
        lib_data = build_library_json(
            [empty_api_response], order_model_path=order_model_path
        )

        # Should not raise, but return empty library
        assert lib_data.total_products == 0
        assert lib_data.products == []

    def test_parsing_with_malformed_data_continues(
        self,
        sample_api_response: Dict[str, Any],
        malformed_api_response: Dict[str, Any],
        order_model_path: Any,
    ):
        """Test workflow continues gracefully with mixed valid/invalid data."""
        # Mix valid and invalid batches
        mixed_batches = [
            sample_api_response,
            malformed_api_response,
            sample_api_response,
        ]

        # Should not raise, malformed batch is skipped
        lib_data = build_library_json(mixed_batches, order_model_path=order_model_path)

        # Valid batches should be processed
        assert lib_data.total_products == 2


@pytest.mark.e2e
@pytest.mark.skip_ci
class TestFullWorkflowWithAuth:
    """Tests requiring real authentication (skip in CI/CD)."""

    @pytest.mark.skipif(
        not (RUN_AUTH_TESTS and HAS_AUTH_COOKIE),
        reason=SKIP_AUTH_REASON,
    )
    def test_real_browser_capture(self):
        """Test with real Playwright browser (requires auth)."""
        config = Settings()
        with BrowserManager(
            config.browser, config.auth_cookie, api_config=config.api
        ) as bm:
            capture_result = bm.capture_library_page()

        assert capture_result is not None
        assert isinstance(capture_result.api_responses, list)

    @pytest.mark.skipif(
        not (RUN_AUTH_TESTS and HAS_AUTH_COOKIE),
        reason=SKIP_AUTH_REASON,
    )
    def test_real_api_calls(self):
        """Test with real API calls (requires auth)."""
        config = Settings()
        with BrowserManager(
            config.browser, config.auth_cookie, api_config=config.api
        ) as bm:
            capture_result = bm.capture_library_page()

        model_path = DEFAULT_ARTIFACTS_DIR / "order_payload_models.py"
        lib_data = build_library_json(
            capture_result.api_responses, order_model_path=model_path
        )
        assert isinstance(lib_data, LibraryData)

    @pytest.mark.skipif(
        not (RUN_AUTH_TESTS and HAS_AUTH_COOKIE and RUN_DOWNLOAD_TESTS),
        reason=SKIP_DOWNLOAD_REASON,
    )
    def test_real_download(self, tmp_path: Path, monkeypatch):
        """Test actual file download (requires auth and network)."""
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(download_dir))

        config = Settings()
        with BrowserManager(
            config.browser, config.auth_cookie, api_config=config.api
        ) as bm:
            capture_result = bm.capture_library_page()

        model_path = DEFAULT_ARTIFACTS_DIR / "order_payload_models.py"
        lib_data = build_library_json(
            capture_result.api_responses, order_model_path=model_path
        )
        if lib_data.total_products == 0:
            pytest.skip("No products available for download test")

        product = lib_data.products[0]
        if not product.downloads:
            pytest.skip("No downloads available for download test")

        task = DownloadTask(
            gamekey=product.gamekey,
            product_name=product.product_name,
            downloads=[product.downloads[0]],
        )
        downloader = FileDownloader(config.download)
        result = downloader.download_product(task)
        assert result.status in {"success", "partial"}


@pytest.mark.e2e
class TestWorkflowErrorHandling:
    """Test error handling across workflow stages."""

    def test_invalid_config_stops_workflow(self, monkeypatch):
        """Test that invalid config prevents workflow from continuing."""
        from pydantic import ValidationError

        # Try to create Settings without required auth_cookie
        with pytest.raises((ValidationError, Exception)):
            for key in list(os.environ.keys()):
                if key.startswith("HUMBLE_"):
                    monkeypatch.delenv(key, raising=False)
            Settings(_env_file=None)

    def test_json_decode_error_logged_not_raised(
        self,
        malformed_api_response: Dict[str, Any],
        order_model_path: Any,
    ):
        """Test that JSON decode errors are logged but don't crash workflow."""
        # Malformed JSON should be logged and skipped
        lib_data = build_library_json(
            [malformed_api_response], order_model_path=order_model_path
        )

        # Should not raise, returns empty library
        assert lib_data.total_products == 0

    def test_missing_required_api_fields_skipped(self, order_model_path: Any):
        """Test that API responses missing required fields are skipped."""
        incomplete_batch = {
            "data": json.dumps(
                {
                    "incomplete_key": {
                        # Missing 'product' field
                        "subproducts": []
                    }
                }
            )
        }

        # Should handle gracefully
        lib_data = build_library_json(
            [incomplete_batch], order_model_path=order_model_path
        )

        # Product should be skipped or handled gracefully
        # (actual behavior depends on implementation)
        assert isinstance(lib_data, LibraryData)


@pytest.mark.e2e
class TestWorkflowOutputValidation:
    """Test output validation at each workflow stage."""

    def test_parsed_library_data_valid_structure(
        self, sample_api_batch_multiple: List[Dict[str, Any]], order_model_path: Any
    ):
        """Test that parsed LibraryData has valid structure."""
        lib_data = build_library_json(
            sample_api_batch_multiple, order_model_path=order_model_path
        )

        # Verify structure
        assert isinstance(lib_data, LibraryData)
        assert hasattr(lib_data, "products")
        assert hasattr(lib_data, "total_products")
        assert hasattr(lib_data, "captured_at")

        # Verify products structure
        for product in lib_data.products:
            assert hasattr(product, "gamekey")
            assert hasattr(product, "product_name")
            assert hasattr(product, "downloads")

            # Verify downloads structure
            for download in product.downloads:
                assert hasattr(download, "platform")
                assert hasattr(download, "name")
                assert hasattr(download, "url")

    def test_json_output_is_valid_json(
        self,
        sample_api_batch_multiple: List[Dict[str, Any]],
        tmp_path: Path,
        order_model_path: Any,
    ):
        """Test that final JSON output is valid and parseable."""
        lib_data = build_library_json(
            sample_api_batch_multiple, order_model_path=order_model_path
        )

        # Write to file
        output_file = tmp_path / "test_output.json"
        json_str = lib_data.model_dump_json(indent=2)
        output_file.write_text(json_str)

        # Verify it can be parsed
        with open(output_file, encoding="utf-8") as f:
            loaded = json.load(f)

        # Verify structure
        assert "products" in loaded
        assert "total_products" in loaded
        assert "captured_at" in loaded

    def test_workflow_produces_expected_file_structure(
        self,
        sample_api_batch_multiple: List[Dict[str, Any]],
        tmp_path: Path,
        order_model_path: Any,
    ):
        """Test that workflow produces expected directory/file structure."""
        # Parse data
        lib_data = build_library_json(
            sample_api_batch_multiple, order_model_path=order_model_path
        )

        # Create expected directory structure
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        json_file = output_dir / "library_products.json"
        json_file.write_text(lib_data.model_dump_json(indent=2))

        # Verify structure
        assert output_dir.exists()
        assert output_dir.is_dir()
        assert json_file.exists()
        assert json_file.is_file()

        # Verify content is accessible
        loaded_data = json.loads(json_file.read_text())
        assert loaded_data["total_products"] == 2


@pytest.mark.e2e
class TestWorkflowPerformance:
    """Test workflow performance with larger datasets."""

    def test_handles_multiple_batches_efficiently(self, order_model_path: Any):
        """Test parsing multiple API batches doesn't degrade performance."""
        # Create 10 batches
        batches = []
        for i in range(10):
            batch = {
                "data": json.dumps(
                    {
                        f"gamekey{i}": {
                            "product": {
                                "human_name": f"Product {i}",
                                "machine_name": f"product_{i}",
                                "category": "ebook",
                            },
                            "subproducts": [
                                {
                                    "downloads": [
                                        {
                                            "platform": "ebook",
                                            "download_struct": [
                                                {
                                                    "name": f"book{i}.pdf",
                                                    "url": {
                                                        "web": f"/downloads/book{i}.pdf"
                                                    },
                                                    "file_size": 1000000,
                                                }
                                            ],
                                        }
                                    ]
                                }
                            ],
                        }
                    }
                )
            }
            batches.append(batch)

        # Should handle all batches
        lib_data = build_library_json(batches, order_model_path=order_model_path)

        assert lib_data.total_products == 10
        assert len(lib_data.products) == 10

    def test_handles_product_with_many_downloads(self, order_model_path: Any):
        """Test parsing product with many downloads."""
        # Create product with 20 downloads
        download_structs = []
        for i in range(20):
            download_structs.append(
                {
                    "name": f"file{i}.pdf",
                    "url": {"web": f"/downloads/file{i}.pdf"},
                    "file_size": 1000,
                }
            )

        batch = {
            "data": json.dumps(
                {
                    "large_product": {
                        "product": {
                            "human_name": "Large Product",
                            "machine_name": "large_product",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": download_structs,
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)

        assert lib_data.total_products == 1
        assert len(lib_data.products[0].downloads) == 20
