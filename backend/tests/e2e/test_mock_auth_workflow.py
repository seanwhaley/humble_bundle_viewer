"""End-to-end tests with simulated authentication and browser.

These tests replace the need for real credentials by mocking the browser
and API responses to test the full coordination of the workflow.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from hb_library_viewer.api_batches import ApiBatchRecord
from hb_library_viewer.browser.models import BrowserCaptureResult
from hb_library_viewer.cli import main


@pytest.mark.e2e
class TestSimulatedAuthWorkflow:
    """Tests the full workflow using simulated/mocked authentication."""

    @staticmethod
    def _prepare_isolated_artifacts(tmp_path: Path, monkeypatch) -> Path:
        """Force CLI artifact writes into a test-only temporary directory."""
        artifacts_dir = tmp_path / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setenv("HUMBLE_ARTIFACTS__BASE_DIR", str(artifacts_dir))
        (artifacts_dir / "order_payload_models.py").write_text(
            "from pydantic import BaseModel, RootModel, ConfigDict\n"
            "class OrderPayloadItem(BaseModel):\n"
            "    model_config = ConfigDict(extra='allow')\n"
            "class OrderPayloadList(RootModel[list[OrderPayloadItem]]):\n"
            "    root: list[OrderPayloadItem]\n",
            encoding="utf-8",
        )
        monkeypatch.setattr(
            "hb_library_viewer.cli.ARTIFACTS_DIR",
            artifacts_dir,
        )
        return artifacts_dir

    def test_workflow_with_simulated_browser_capture(self, tmp_path, monkeypatch):
        """Test full flow: Start -> Mock Browser -> Mock API -> Parse -> Success."""
        # 1. Setup environment
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "fake_session_cookie")
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(download_dir))
        artifacts_dir = self._prepare_isolated_artifacts(tmp_path, monkeypatch)

        # 2. Mock Playwright browser manager
        mock_browser = MagicMock()
        mock_browser.__enter__.return_value = mock_browser

        # Simulate that the browser captured some API batches
        mock_batches = [
            ApiBatchRecord(
                data=json.dumps(
                    {
                        "gamekey_sim": {
                            "product": {
                                "human_name": "Simulated Book",
                                "machine_name": "sim_book",
                                "category": "ebook",
                            },
                            "subproducts": [
                                {
                                    "downloads": [
                                        {
                                            "platform": "ebook",
                                            "download_struct": [
                                                {
                                                    "name": "book.pdf",
                                                    "url": {
                                                        "web": "https://example.com/book.pdf"
                                                    },
                                                }
                                            ],
                                        }
                                    ]
                                }
                            ],
                        }
                    }
                )
            )
        ]
        mock_browser.capture_library_page.return_value = BrowserCaptureResult(
            captured_responses=1,
            api_batches=len(mock_batches),
            gamekeys=["gamekey_sim"],
            api_responses=mock_batches,
        )
        mock_browser.api_responses = [{"data": "{}"}]

        # Mock BrowserManager to return our mock_browser
        monkeypatch.setattr(
            "hb_library_viewer.cli.BrowserManager",
            MagicMock(return_value=mock_browser),
        )

        # 3. Mock Downloader to avoid network calls
        mock_downloader = MagicMock()
        mock_downloader.download_product.return_value = MagicMock(
            status="success", files_downloaded=1
        )
        monkeypatch.setattr(
            "hb_library_viewer.cli.FileDownloader",
            MagicMock(return_value=mock_downloader),
        )

        # 4. Mock input to simulate user saying 'y' to download
        monkeypatch.setattr(
            "hb_library_viewer.cli._read_input_with_timeout",
            MagicMock(return_value="y"),
        )

        # 5. Run main with download=True
        with patch("sys.stdout"), patch("sys.stdin.isatty", return_value=True):
            exit_code = main(
                download=True,
                artifacts_dir=artifacts_dir,
                output_products=artifacts_dir / "library_products.json",
                order_model_path=artifacts_dir / "order_payload_models.py",
            )

        assert exit_code == 0
        assert mock_downloader.download_product.called
        task = mock_downloader.download_product.call_args[0][0]
        assert task.product_name == "Simulated Book"
        assert (artifacts_dir / "library_products.json").exists()

    def test_workflow_keyboard_interrupt_graceful_exit(self, tmp_path, monkeypatch):
        """Test that a KeyboardInterrupt during the workflow is handled gracefully."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "fake_cookie")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path))
        self._prepare_isolated_artifacts(tmp_path, monkeypatch)

        # Mock BrowserManager to raise KeyboardInterrupt
        # Side effect on __enter__ for BrowserManager in cli.py
        monkeypatch.setattr(
            "hb_library_viewer.cli.BrowserManager",
            MagicMock(side_effect=KeyboardInterrupt()),
        )

        # Running main should catch KeyboardInterrupt and return 1
        with patch("sys.stdout"):
            exit_code = main(download=True)

        assert exit_code == 1
