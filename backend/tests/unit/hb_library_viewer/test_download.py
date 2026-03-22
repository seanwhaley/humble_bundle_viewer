"""Unit tests for download module."""

from __future__ import annotations

from pathlib import Path
from typing import cast

import pytest
import requests

from hb_library_viewer.config import DownloadConfig
from hb_library_viewer.download import FileDownloader, DownloadTask
from hb_library_viewer.parsing import Download
from hb_library_viewer.utils import DownloadError


class DummyResponse:
    """Minimal response object for requests.get mocking."""

    def __init__(self, status_code: int = 200, body: bytes | None = None, headers=None):
        self.status_code = status_code
        self._body = body or b"test-data"
        self.headers = headers or {"content-length": str(len(self._body))}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(response=cast(requests.Response, self))

    def iter_content(self, chunk_size: int = 8192):
        yield self._body


@pytest.mark.unit
class TestFileDownloader:
    """Unit tests for FileDownloader.download_file."""

    def test_download_file_success(self, tmp_path: Path, monkeypatch):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        monkeypatch.setattr("hb_library_viewer.download.time.sleep", lambda *_: None)
        monkeypatch.setattr(
            "hb_library_viewer.download.requests.get",
            lambda *_, **__: DummyResponse(),
        )

        result = downloader.download_file(
            "https://example.com/file.pdf",
            str(download_dir),
            "file.pdf",
        )

        assert result is True
        assert (download_dir / "file.pdf").exists()

    def test_download_file_creates_missing_destination_directory(
        self, tmp_path: Path, monkeypatch
    ):
        download_dir = tmp_path / "downloads" / "nested"
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        monkeypatch.setattr("hb_library_viewer.download.time.sleep", lambda *_: None)
        monkeypatch.setattr(
            "hb_library_viewer.download.requests.get",
            lambda *_, **__: DummyResponse(),
        )

        result = downloader.download_file(
            "https://example.com/file.pdf",
            str(download_dir),
            "file.pdf",
        )

        assert result is True
        assert download_dir.exists()
        assert (download_dir / "file.pdf").exists()

    def test_download_file_skips_existing(self, tmp_path: Path, monkeypatch):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        existing_file = download_dir / "file.pdf"
        existing_file.write_bytes(b"already")

        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        monkeypatch.setattr(
            "hb_library_viewer.download.requests.get",
            lambda *_, **__: (_ for _ in ()).throw(
                AssertionError("Should not call requests.get")
            ),
        )

        assert (
            downloader.download_file(
                "https://example.com/file.pdf",
                str(download_dir),
                "file.pdf",
            )
            is True
        )

    def test_download_file_invalid_url(self, tmp_path: Path):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        with pytest.raises(DownloadError):
            downloader.download_file(
                "ftp://example.com/file.pdf", str(download_dir), "file.pdf"
            )

    def test_download_file_http_404(self, tmp_path: Path, monkeypatch):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        monkeypatch.setattr("hb_library_viewer.download.time.sleep", lambda *_: None)
        monkeypatch.setattr(
            "hb_library_viewer.download.requests.get",
            lambda *_, **__: DummyResponse(status_code=404),
        )

        with pytest.raises(DownloadError):
            downloader.download_file(
                "https://example.com/missing.pdf",
                str(download_dir),
                "missing.pdf",
            )

    def test_download_file_timeout_retries(self, tmp_path: Path, monkeypatch):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(
            base_folder=download_dir, max_retries=2, retry_delay_seconds=1
        )
        downloader = FileDownloader(config)

        monkeypatch.setattr("hb_library_viewer.download.time.sleep", lambda *_: None)
        monkeypatch.setattr(
            "hb_library_viewer.download.requests.get",
            lambda *_, **__: (_ for _ in ()).throw(requests.exceptions.Timeout()),
        )

        with pytest.raises(DownloadError):
            downloader.download_file(
                "https://example.com/timeout.pdf",
                str(download_dir),
                "timeout.pdf",
            )

    def test_download_file_missing_content_length(self, tmp_path: Path, monkeypatch):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        monkeypatch.setattr(
            "hb_library_viewer.download.requests.get",
            lambda *_, **__: DummyResponse(headers={}),
        )

        result = downloader.download_file(
            "https://example.com/file.pdf",
            str(download_dir),
            "file.pdf",
        )
        assert result is True

    def test_download_file_zero_byte_server_error(self, tmp_path: Path, monkeypatch):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        monkeypatch.setattr(
            "hb_library_viewer.download.requests.get",
            lambda *_, **__: DummyResponse(body=b"", headers={"content-length": "0"}),
        )

        with pytest.raises(DownloadError, match="Server returned empty file"):
            downloader.download_file(
                "https://example.com/file.pdf",
                str(download_dir),
                "file.pdf",
            )

    def test_download_file_invalid_content_length_header(
        self, tmp_path: Path, monkeypatch
    ):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        monkeypatch.setattr(
            "hb_library_viewer.download.requests.get",
            lambda *_, **__: DummyResponse(headers={"content-length": "not-a-number"}),
        )

        result = downloader.download_file(
            "https://example.com/file.pdf",
            str(download_dir),
            "file.pdf",
        )
        assert result is True

    def test_download_file_retry_on_500(self, tmp_path: Path, monkeypatch):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(
            base_folder=download_dir, max_retries=2, retry_delay_seconds=1
        )
        downloader = FileDownloader(config)

        # Mock responses: first one fails with 500, second one succeeds
        responses = [DummyResponse(status_code=500), DummyResponse(status_code=200)]

        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return responses.pop(0)

        monkeypatch.setattr("hb_library_viewer.download.requests.get", side_effect)
        monkeypatch.setattr("hb_library_viewer.download.time.sleep", lambda *_: None)

        result = downloader.download_file(
            "https://example.com/file.pdf",
            str(download_dir),
            "file.pdf",
        )
        assert result is True
        assert call_count == 2


@pytest.mark.unit
class TestDownloadProduct:
    """Unit tests for FileDownloader.download_product."""

    def test_download_product_partial(self, tmp_path: Path, monkeypatch):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        downloads = [
            Download(
                platform="ebook", name="Book.pdf", url="https://example.com/book.pdf"
            ),
            Download(
                platform="audio", name="Book.m4b", url="https://example.com/book.m4b"
            ),
        ]
        task = DownloadTask(
            gamekey="gamekey1", product_name="Book", downloads=downloads
        )

        calls = {"count": 0}

        def fake_download_file(*_args, **_kwargs):
            calls["count"] += 1
            if calls["count"] == 1:
                return True
            raise DownloadError("Failed http://example.com")

        monkeypatch.setattr(FileDownloader, "download_file", fake_download_file)

        result = downloader.download_product(task)

        assert result.status == "partial"
        assert result.files_downloaded == 1
        assert len(result.errors) == 1
        # Check truncation of error message (line 386)
        assert "http" not in result.errors[0]

    def test_download_product_all_failed(self, tmp_path: Path, monkeypatch):
        """Test download_product when all files fail (hits line 400)."""
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        downloads = [
            Download(
                platform="ebook", name="Book.pdf", url="https://example.com/book.pdf"
            )
        ]
        task = DownloadTask(
            gamekey="gamekey1", product_name="Book", downloads=downloads
        )

        def fake_download_file(*_args, **_kwargs):
            raise DownloadError("Failed")

        monkeypatch.setattr(FileDownloader, "download_file", fake_download_file)
        result = downloader.download_product(task)

        assert result.status == "failed"
        assert result.files_downloaded == 0

    def test_download_product_unexpected_error(self, tmp_path: Path, monkeypatch):
        """Test download_product when an unexpected error occurs (hits line 390-392)."""
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        downloads = [
            Download(
                platform="ebook", name="Book.pdf", url="https://example.com/book.pdf"
            )
        ]
        task = DownloadTask(
            gamekey="gamekey1", product_name="Book", downloads=downloads
        )

        def fake_download_file(*_args, **_kwargs):
            raise RuntimeError("Unexpected boom")

        monkeypatch.setattr(FileDownloader, "download_file", fake_download_file)
        result = downloader.download_product(task)

        assert result.status == "failed"
        assert any("Unexpected error" in e for e in result.errors)

    def test_download_file_unexpected_error(self, tmp_path: Path, monkeypatch):
        """Test download_file with generic exception (hits line 301-302)."""
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        monkeypatch.setattr(
            "hb_library_viewer.download.requests.get",
            lambda *_, **__: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        monkeypatch.setattr("hb_library_viewer.download.time.sleep", lambda *_: None)

        with pytest.raises(DownloadError, match="Failed to download file.pdf"):
            downloader.download_file(
                "https://example.com/file.pdf", str(download_dir), "file.pdf"
            )

    def test_download_product_sanitization_fallback(self, tmp_path: Path, monkeypatch):
        """Test sanitization fallback when name results in empty slug (hits line 363)."""
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        # Name with only special characters will be sanitized to empty
        downloads = [
            Download(platform="ebook", name="!!!", url="https://example.com/file.pdf")
        ]
        task = DownloadTask(
            gamekey="gamekey1", product_name="Book", downloads=downloads
        )

        captured_filename = []

        def fake_download_file(_self, _url, _path, filename, _id):
            captured_filename.append(filename)
            return True

        monkeypatch.setattr(FileDownloader, "download_file", fake_download_file)
        downloader.download_product(task)

        assert captured_filename[0].startswith("file.")

    def test_download_product_uses_url_basename_for_generic_ebook_names(
        self, tmp_path: Path, monkeypatch
    ):
        download_dir = tmp_path / "downloads"
        download_dir.mkdir()
        config = DownloadConfig(base_folder=download_dir, max_retries=1)
        downloader = FileDownloader(config)

        downloads = [
            Download(
                platform="ebook",
                name="EPUB",
                url="https://example.com/humblebundle/masteringtypescript.epub?token=abc",
                file_type="epub",
            )
        ]
        task = DownloadTask(
            gamekey="gamekey1", product_name="Mastering TypeScript", downloads=downloads
        )

        captured_filename = []

        def fake_download_file(_self, _url, _path, filename, _id):
            captured_filename.append(filename)
            return True

        monkeypatch.setattr(FileDownloader, "download_file", fake_download_file)
        downloader.download_product(task)

        assert captured_filename == ["masteringtypescript.epub"]
