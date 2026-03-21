"""Integration tests for download coordination.

Tests how FileDownloader interacts with other modules like parsing and utils.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from hb_library_viewer.config import DownloadConfig
from hb_library_viewer.download import FileDownloader, DownloadTask
from hb_library_viewer.parsing import Download


@pytest.mark.integration
class TestDownloadCoordination:
    """Integration tests for download module coordination."""

    def test_download_product_empty_sanitized_name(self, tmp_path: Path, monkeypatch):
        """Test download with a product name that sanitizes to empty."""
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir)
        downloader = FileDownloader(config)

        # A name consisting only of special characters that get stripped
        downloads = [
            Download(platform="pdf", name="!!!", url="https://example.com/file.pdf")
        ]
        task = DownloadTask(gamekey="gk1", product_name="Test", downloads=downloads)

        # Mock download_file
        mock_download = MagicMock(return_value=True)
        monkeypatch.setattr(downloader, "download_file", mock_download)

        downloader.download_product(task)

        # Check the filename it received
        assert mock_download.called
        args, kwargs = mock_download.call_args
        # download_file(url, base_path, filename, op_id)
        assert args[2] == "file.pdf"
