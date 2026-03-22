"""Unit tests for CLI module."""

from __future__ import annotations

# pyright: reportPrivateUsage=false
# pylint: disable=protected-access,unused-argument,unused-variable

import json
import os
from types import SimpleNamespace
from pathlib import Path
from typing import Any, Optional, Type, cast

import pytest
import typer
from _pytest.monkeypatch import MonkeyPatch

from hb_library_viewer import cli
from hb_library_viewer.api_batches import ApiBatchRecord
from hb_library_viewer.browser.models import BrowserCaptureResult
from hb_library_viewer.parsing import Download, Product, LibraryData
from hb_library_viewer.runtime_status import format_hms
from hb_library_viewer.sync import SyncProgress
from hb_library_viewer.utils import (
    BrowserError,
    ConfigError,
    HumbleBundleError,
)


class DummyBrowser:
    """Context manager stub for BrowserManager."""

    def __init__(self, *_args: Any, **_kwargs: Any):
        self.result = BrowserCaptureResult(
            captured_responses=1,
            api_batches=1,
            gamekeys=["key1"],
            api_responses=[ApiBatchRecord(data="{}")],
        )

    def __enter__(self) -> "DummyBrowser":
        return self

    def __exit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc: Optional[BaseException],
        tb: Optional[Any],
    ) -> bool:
        return False

    def capture_library_page(self):
        return self.result


class DummyDownloader:
    """Downloader stub for CLI tests."""

    def __init__(self, *_args: Any, **_kwargs: Any):
        pass

    def download_product(self, task: Any):
        return SimpleNamespace(
            gamekey=task.gamekey,
            status="success",
            files_downloaded=len(task.downloads),
            errors=[],
        )


def write_order_model(artifacts_dir: Path) -> Path:
    model_path = artifacts_dir / "order_payload_models.py"
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_text(
        "from pydantic import BaseModel, RootModel, ConfigDict\n"
        "class OrderPayloadItem(BaseModel):\n"
        "    model_config = ConfigDict(extra='allow')\n"
        "class OrderPayloadList(RootModel[list[OrderPayloadItem]]):\n"
        "    root: list[OrderPayloadItem]\n",
        encoding="utf-8",
    )
    return model_path


@pytest.mark.unit
class TestCliMain:
    """Unit tests for cli.main."""

    def _build_config(self, tmp_path: Path):
        return SimpleNamespace(
            auth_cookie="cookie",
            browser=SimpleNamespace(),
            download=SimpleNamespace(
                base_folder=tmp_path / "downloads",
                prompt_before_download=False,
                force_individual_file_downloads=None,
                prompt_timeout_seconds=1,
            ),
            artifacts=SimpleNamespace(
                save_api_batches=True,
                save_captured_responses=False,
                save_gamekeys=False,
                save_html_on_failure=True,
                auto_rebuild_order_models=False,
            ),
            logging=SimpleNamespace(level="info", format="%(message)s"),
        )

    def _build_library_data(self):
        download = Download(
            platform="ebook",
            name="Book.pdf",
            url="https://example.com/book.pdf",
            size_bytes=1,
            checksums={},
        )
        product = Product(
            gamekey="key1",
            product_name="Book",
            machine_name="book",
            category="ebook",
            downloads=[download],
            amount_spent=0.0,
        )
        return LibraryData(
            products=[product],
            total_products=1,
            captured_at="2026-01-31T00:00:00",
        )

    def test_main_success(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        monkeypatch.setattr(cli, "_prompt_for_download", lambda *_: True)
        monkeypatch.setattr(cli, "FileDownloader", DummyDownloader)
        monkeypatch.setattr(cli, "_prompt_for_download", lambda *_: True)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        assert cli.main() == 0
        products_path = tmp_path / "artifacts" / "library_products.json"
        assert products_path.exists()
        products_payload = json.loads(products_path.read_text(encoding="utf-8"))

        assert "api_responses" not in products_payload
        assert "raw_orders" not in products_payload

    def test_main_config_error(self, monkeypatch: MonkeyPatch):
        def raise_error():
            raise ConfigError("bad config")

        monkeypatch.setattr(cli, "Settings", raise_error)

        assert cli.main(download=True) == 1


@pytest.mark.unit
class TestCliHelpers:
    """Unit tests for CLI helper utilities."""

    def _build_config(self, tmp_path: Path):
        return SimpleNamespace(
            auth_cookie="cookie",
            browser=SimpleNamespace(),
            download=SimpleNamespace(
                base_folder=tmp_path / "downloads",
                prompt_before_download=False,
                force_individual_file_downloads=None,
                prompt_timeout_seconds=1,
            ),
            artifacts=SimpleNamespace(
                save_api_batches=True,
                save_captured_responses=False,
                save_gamekeys=False,
                save_html_on_failure=True,
                auto_rebuild_order_models=False,
            ),
            logging=SimpleNamespace(level="info", format="%(message)s"),
        )

    def _build_library_data(self):
        download = Download(
            platform="ebook",
            name="Book.pdf",
            url="https://example.com/book.pdf",
            size_bytes=1,
            checksums={},
        )
        product = Product(
            gamekey="key1",
            product_name="Book",
            machine_name="book",
            category="ebook",
            downloads=[download],
            amount_spent=0.0,
        )
        return LibraryData(
            products=[product],
            total_products=1,
            captured_at="2026-01-31T00:00:00",
        )

    def test_download_record_extension_from_url(self):
        record = SimpleNamespace(
            url="https://example.com/file.pdf",
            download_name="ignored.bin",
            platform="ebook",
        )
        assert cli._download_record_extension(record) == "pdf"

    def test_download_record_extension_from_name(self):
        record = SimpleNamespace(
            url="https://example.com/download",
            download_name="file.epub",
            platform="ebook",
        )
        assert cli._download_record_extension(record) == "epub"

    def test_prompt_for_auth_cookie_non_tty(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: False))
        assert cli._prompt_for_auth_cookie() is None

    def test_prompt_for_auth_cookie_reads_input(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))
        monkeypatch.setattr(cli.console, "input", lambda *_args, **_kwargs: "cookie")
        assert cli._prompt_for_auth_cookie() == "cookie"

    def test_prompt_for_auth_cookie_eof(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))

        def raise_eof(*_args, **_kwargs):
            raise EOFError()

        monkeypatch.setattr(cli.console, "input", raise_eof)
        assert cli._prompt_for_auth_cookie() is None

    def test_write_env_value_updates_and_appends(self, tmp_path: Path):
        env_path = tmp_path / ".env"
        env_path.write_text(
            "# comment\nHUMBLE_AUTH_COOKIE=old\nOTHER=1\n",
            encoding="utf-8",
        )

        cli._write_env_value(env_path, "HUMBLE_AUTH_COOKIE", "new")
        content = env_path.read_text(encoding="utf-8").splitlines()
        assert "HUMBLE_AUTH_COOKIE=new" in content

        cli._write_env_value(env_path, "NEW_KEY", "value")
        final_lines = env_path.read_text(encoding="utf-8").splitlines()
        assert final_lines[-1] == "NEW_KEY=value"

    def test_maybe_persist_auth_cookie_skips_when_disabled(self, tmp_path: Path):
        env_path = tmp_path / ".env"
        cli._maybe_persist_auth_cookie(
            "cookie",
            env_path=env_path,
            save_auth_cookie=False,
        )
        assert not env_path.exists()

    def test_maybe_persist_auth_cookie_saves_when_forced(self, tmp_path: Path):
        env_path = tmp_path / ".env"
        cli._maybe_persist_auth_cookie(
            "cookie",
            env_path=env_path,
            save_auth_cookie=True,
        )
        assert "HUMBLE_AUTH_COOKIE=cookie" in env_path.read_text(encoding="utf-8")

    def test_maybe_persist_auth_cookie_prompts_and_saves(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))
        monkeypatch.setattr(cli.console, "input", lambda *_args, **_kwargs: "y")
        env_path = tmp_path / ".env"

        cli._maybe_persist_auth_cookie(
            "cookie",
            env_path=env_path,
            save_auth_cookie=None,
        )

        assert "HUMBLE_AUTH_COOKIE=cookie" in env_path.read_text(encoding="utf-8")

    def test_maybe_persist_auth_cookie_non_tty(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: False))
        env_path = tmp_path / ".env"

        cli._maybe_persist_auth_cookie(
            "cookie",
            env_path=env_path,
            save_auth_cookie=None,
        )

        assert not env_path.exists()

    def test_maybe_persist_auth_cookie_prompt_declined(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))
        monkeypatch.setattr(cli.console, "input", lambda *_args, **_kwargs: "n")
        env_path = tmp_path / ".env"

        cli._maybe_persist_auth_cookie(
            "cookie",
            env_path=env_path,
            save_auth_cookie=None,
        )

        assert not env_path.exists()

    def test_prompt_for_order_model_rebuild_branches(self, monkeypatch: MonkeyPatch):
        assert cli._prompt_for_order_model_rebuild(0) is False

        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: False))
        assert cli._prompt_for_order_model_rebuild(1) is False

        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))
        monkeypatch.setattr(cli, "_read_input_with_timeout", lambda *_args: None)
        assert cli._prompt_for_order_model_rebuild(1) is False

        monkeypatch.setattr(cli, "_read_input_with_timeout", lambda *_args: "y")
        assert cli._prompt_for_order_model_rebuild(1) is True

    def test_summarize_missing_paths_limits_output(self):
        assert cli._summarize_missing_paths(set()) == ""

        summary = cli._summarize_missing_paths({"b", "a"}, limit=5)
        assert summary == "a, b"

        summary = cli._summarize_missing_paths({"a", "b", "c"}, limit=2)
        assert summary == "a, b (+1 more)"

    def test_load_settings_with_overrides_auth_cookie_sets_env(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        config_path = tmp_path / "config.yaml"
        sentinel = SimpleNamespace(auth_cookie="cookie")

        def settings_stub(*, auth_cookie: Optional[str] = None):
            assert auth_cookie == "cookie"
            assert os.getenv("HUMBLE_CONFIG_YAML") == str(config_path)
            return sentinel

        recorded: dict[str, object] = {}

        def persist_stub(
            cookie: str,
            *,
            env_path: Path = Path(".env"),
            save_auth_cookie: Optional[bool] = None,
        ) -> None:
            del env_path
            recorded["cookie"] = cookie
            recorded["save_auth_cookie"] = save_auth_cookie

        monkeypatch.setattr(cli, "Settings", settings_stub)
        monkeypatch.setattr(cli, "_maybe_persist_auth_cookie", persist_stub)
        monkeypatch.setenv("HUMBLE_CONFIG_YAML", "previous")

        result = cli._load_settings_with_overrides(
            config_path=config_path,
            auth_cookie="cookie",
            prompt_auth=False,
            save_auth_cookie=True,
        )

        assert result is sentinel
        assert recorded["cookie"] == "cookie"
        assert os.getenv("HUMBLE_CONFIG_YAML") == "previous"

    def test_load_settings_with_overrides_prompts_for_cookie(
        self, monkeypatch: MonkeyPatch
    ):
        sentinel = SimpleNamespace(auth_cookie="cookie")

        def settings_stub(*, auth_cookie: Optional[str] = None):
            if auth_cookie is None:
                raise ConfigError("auth_cookie missing")
            return sentinel

        monkeypatch.setattr(cli, "Settings", settings_stub)
        monkeypatch.setattr(cli, "_prompt_for_auth_cookie", lambda: "cookie")
        monkeypatch.setattr(
            cli, "_maybe_persist_auth_cookie", lambda *_args, **_kwargs: None
        )

        result = cli._load_settings_with_overrides(
            config_path=None,
            auth_cookie=None,
            prompt_auth=True,
            save_auth_cookie=None,
        )

        assert result is sentinel

    def test_summarize_download_records(self):
        records = [
            SimpleNamespace(
                url="https://example.com/a.pdf",
                download_name="a.pdf",
                platform="ebook",
            ),
            SimpleNamespace(
                url="https://example.com/b.epub",
                download_name="b.epub",
                platform="ebook",
            ),
            SimpleNamespace(
                url="https://example.com/c.zip",
                download_name="c.zip",
                platform="windows",
            ),
        ]

        summary = cli._summarize_download_records(records)
        assert summary["ebook"]["pdf"] == 1
        assert summary["ebook"]["epub"] == 1
        assert summary["windows"]["zip"] == 1

    def test_filter_downloads_by_file_types(self):
        downloads = [
            Download(
                platform="ebook",
                name="Book.pdf",
                url="https://example.com/book.pdf",
                size_bytes=1,
                checksums={},
                file_type="pdf",
            ),
            Download(
                platform="audio",
                name="Track.m4b",
                url="https://example.com/track.m4b",
                size_bytes=2,
                checksums={},
                file_type=None,
            ),
            Download(
                platform="ebook",
                name="Book.epub",
                url="https://example.com/book.epub",
                size_bytes=3,
                checksums={},
                file_type="epub",
            ),
        ]

        filtered = cli._filter_downloads_by_file_types(downloads, ["PDF", "m4b"])
        types = {cli._download_file_type(download) for download in filtered}
        assert types == {"pdf", "m4b"}

    def test_select_downloads_by_size(self):
        downloads = [
            Download(
                platform="ebook",
                name="Small.pdf",
                url="https://example.com/small.pdf",
                size_bytes=10,
                checksums={},
            ),
            Download(
                platform="ebook",
                name="Large.pdf",
                url="https://example.com/large.pdf",
                size_bytes=20,
                checksums={},
            ),
        ]

        smallest = cli._select_downloads_by_size(downloads, "smallest")
        largest = cli._select_downloads_by_size(downloads, "largest")

        assert smallest[0].size_bytes == 10
        assert largest[0].size_bytes == 20

    def test_prompt_for_download_yes(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))
        monkeypatch.setattr(cli, "_read_input_with_timeout", lambda *_: "y")
        assert cli._prompt_for_download(2, 4, 5) is True

    def test_prompt_for_download_no(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))
        monkeypatch.setattr(cli, "_read_input_with_timeout", lambda *_: "no")
        assert cli._prompt_for_download(1, 1, 5) is False

    def test_prompt_for_download_timeout(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))
        monkeypatch.setattr(cli, "_read_input_with_timeout", lambda *_: None)
        assert cli._prompt_for_download(1, 1, 1) is False

    def test_prompt_for_download_non_tty(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: False))
        assert cli._prompt_for_download(1, 1, 5) is False

    def test_read_input_with_timeout_success(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))
        monkeypatch.setattr(cli.console, "input", lambda _: "test input")
        assert cli._read_input_with_timeout("prompt", 1) == "test input"

    def test_read_input_with_timeout_timeout(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))

        import time

        def slow_input(_):
            time.sleep(0.2)
            return "too late"

        monkeypatch.setattr(cli.console, "input", slow_input)
        # Use a very short timeout
        assert cli._read_input_with_timeout("prompt", 0.01) is None

    def test_read_input_with_timeout_eof(self, monkeypatch: MonkeyPatch):
        monkeypatch.setattr(cli.sys, "stdin", SimpleNamespace(isatty=lambda: True))

        def eof_input(_):
            raise EOFError()

        monkeypatch.setattr(cli.console, "input", eof_input)
        assert cli._read_input_with_timeout("prompt", 1) is None

    def test_read_input_with_timeout_invalid_timeout(self):
        assert cli._read_input_with_timeout("prompt", 0) is None
        assert cli._read_input_with_timeout("prompt", -1) is None

    def test_prompt_for_download_invalid_timeout(self):
        assert cli._prompt_for_download(1, 1, 0) is False
        assert cli._prompt_for_download(1, 1, -1) is False

    def test_format_hms_uses_padded_clock_format(self):
        assert format_hms(5) == "00:00:05"
        assert format_hms(65) == "00:01:05"
        assert format_hms(3661) == "01:01:01"

    def test_main_value_error(self, monkeypatch: MonkeyPatch):
        def raise_error():
            raise ValueError("bad config")

        monkeypatch.setattr(cli, "Settings", raise_error)

        assert cli.main(download=True) == 1

    def test_main_settings_exception(self, monkeypatch: MonkeyPatch):
        def raise_error():
            raise RuntimeError("unexpected")

        monkeypatch.setattr(cli, "Settings", raise_error)

        assert cli.main(download=True) == 1

    def test_main_no_api_responses(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", tmp_path / "artifacts")

        class EmptyBrowser:
            def __init__(self, *_args: Any, **_kwargs: Any):
                self.result = BrowserCaptureResult(
                    captured_responses=0,
                    api_batches=0,
                    gamekeys=[],
                    api_responses=[],
                )

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def capture_library_page(self):
                return self.result

        monkeypatch.setattr(cli, "BrowserManager", EmptyBrowser)

        assert cli.main(download=True) == 1

    def test_main_no_products(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def empty_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return LibraryData(
                products=[], total_products=0, captured_at="2026-01-31T00:00:00"
            )

        monkeypatch.setattr(cli, "build_library_json", empty_library)

        assert cli.main() == 0

    def test_main_prompt_declined(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        config.download.prompt_before_download = True
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)
        monkeypatch.setattr(cli, "_prompt_for_download", lambda *_args: False)

        class ShouldNotRunDownloader(DummyDownloader):
            def download_product(self, task: Any):
                raise AssertionError("Download should be skipped")

        monkeypatch.setattr(cli, "FileDownloader", ShouldNotRunDownloader)

        assert cli.main() == 0

    def test_main_skip_downloads_flag(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        class ShouldNotRunDownloader(DummyDownloader):
            def download_product(self, task: Any):
                raise AssertionError("Download should be skipped")

        monkeypatch.setattr(cli, "FileDownloader", ShouldNotRunDownloader)

        assert cli.main(skip_downloads=True) == 0

    def test_main_parse_error(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def raise_parse_error(*_args: Any, **_kwargs: Any) -> LibraryData:
            raise ValueError("bad json")

        monkeypatch.setattr(cli, "build_library_json", raise_parse_error)

        assert cli.main(download=True) == 1

    def test_main_browser_error(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", tmp_path / "artifacts")

        class ErrorBrowser(DummyBrowser):
            def __enter__(self):
                raise BrowserError("browser failed")

        monkeypatch.setattr(cli, "BrowserManager", ErrorBrowser)

        assert cli.main(download=True) == 1

    def test_main_no_files_downloaded(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        class FailingDownloader(DummyDownloader):
            def download_product(self, task: Any):
                return SimpleNamespace(
                    gamekey=task.gamekey,
                    status="failed",
                    files_downloaded=0,
                    errors=["fail"],
                )

        monkeypatch.setattr(cli, "FileDownloader", FailingDownloader)

        assert cli.main(download=True) == 1

    def test_main_partial_downloads(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        monkeypatch.setattr(cli, "_prompt_for_download", lambda *_: True)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        class PartialDownloader(DummyDownloader):
            def download_product(self, task: Any):
                return SimpleNamespace(
                    gamekey=task.gamekey,
                    status="partial",
                    files_downloaded=1,
                    errors=["partial"],
                )

        monkeypatch.setattr(cli, "FileDownloader", PartialDownloader)

        assert cli.main(download=True) == 0

    def test_main_download_exception(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        monkeypatch.setattr(cli, "_prompt_for_download", lambda *_: True)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        class ExplodingDownloader(DummyDownloader):
            def download_product(self, task: Any):
                raise RuntimeError("boom")

        monkeypatch.setattr(cli, "FileDownloader", ExplodingDownloader)

        assert cli.main(download=True) == 1

    def test_main_setup_logging_humble_error(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)

        def raise_humble(_level: str, _format: str) -> None:
            raise HumbleBundleError("boom")

        monkeypatch.setattr(cli, "setup_logging", raise_humble)

        assert cli.main(download=True) == 1

    def test_main_setup_logging_exception(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)

        def raise_exception(_level: str, _format: str) -> None:
            raise RuntimeError("boom")

        monkeypatch.setattr(cli, "setup_logging", raise_exception)

        assert cli.main(download=True) == 1

    def test_log_download_summary_empty(self, caplog):
        with caplog.at_level("INFO"):
            cli._log_download_summary([])
        assert "No download records available for summary" in caplog.text

    def test_read_input_with_timeout_zero_seconds(self):
        assert cli._read_input_with_timeout("prompt", 0) is None

    def test_read_input_with_timeout_queue_empty(self):
        # Mocking queue.get to raise Empty
        import queue
        from unittest.mock import MagicMock

        mock_queue = MagicMock()
        mock_queue.get.side_effect = queue.Empty

        with pytest.MonkeyPatch.context() as monkeypatch:
            monkeypatch.setattr("queue.Queue", MagicMock(return_value=mock_queue))

            result = cli._read_input_with_timeout("prompt", 1)
        assert result is None

    def test_main_conflicting_options(self):
        assert cli.main(download=True, skip_downloads=True) == 1

    def test_prompt_for_download_zero_timeout(self, caplog):
        with caplog.at_level("WARNING"):
            assert cli._prompt_for_download(1, 1, 0) is False
        assert "confirmation timeout must be positive" in caplog.text

    def test_write_order_model_artifacts_skips_when_empty(
        self, monkeypatch: MonkeyPatch, tmp_path: Path, caplog
    ):
        monkeypatch.setattr(
            "hb_library_viewer.artifact_workflows.extract_order_payloads_from_batches",
            lambda *_: [],
        )
        monkeypatch.setattr(
            "hb_library_viewer.artifact_workflows.generate_order_models",
            lambda *_args, **_kwargs: None,
        )

        with caplog.at_level("INFO"):
            cli._write_order_model_artifacts([], tmp_path)

        assert "No order payloads available" in caplog.text

    def test_write_order_model_artifacts_backup_failure(
        self, monkeypatch: MonkeyPatch, tmp_path: Path, caplog
    ):
        model_path = tmp_path / "order_payload_models.py"
        model_path.write_text("existing", encoding="utf-8")

        monkeypatch.setattr(
            "hb_library_viewer.artifact_workflows.extract_order_payloads_from_batches",
            lambda *_: [{"key": {}}],
        )
        monkeypatch.setattr(
            "hb_library_viewer.artifact_workflows.generate_order_models",
            lambda *_args, **_kwargs: None,
        )

        def raise_copy(*_args, **_kwargs):
            raise OSError("boom")

        monkeypatch.setattr(
            "hb_library_viewer.artifact_workflows.shutil.copy2", raise_copy
        )

        with caplog.at_level("WARNING"):
            cli._write_order_model_artifacts(
                [{"data": "{}"}],
                tmp_path,
                model_path=model_path,
            )

        assert "Failed to back up order payload model" in caplog.text

    def test_write_order_model_artifacts_generate_runtime_error(
        self, monkeypatch: MonkeyPatch, tmp_path: Path, caplog
    ):
        monkeypatch.setattr(
            "hb_library_viewer.artifact_workflows.extract_order_payloads_from_batches",
            lambda *_: [{"key": {}}],
        )

        def raise_runtime(*_args, **_kwargs):
            raise RuntimeError("boom")

        monkeypatch.setattr(
            "hb_library_viewer.artifact_workflows.generate_order_models",
            raise_runtime,
        )

        with caplog.at_level("WARNING"):
            cli._write_order_model_artifacts([{"data": "{}"}], tmp_path)

        assert "Skipping order model generation" in caplog.text

    def test_rebuild_order_models_from_artifacts_missing_dir(
        self, tmp_path: Path, caplog
    ):
        with caplog.at_level("ERROR"):
            result = cli.rebuild_order_models_from_artifacts(artifacts_dir=tmp_path)

        assert result == 1
        assert "API response directory not found" in caplog.text

    def test_rebuild_order_models_from_artifacts_success(
        self, monkeypatch: MonkeyPatch, tmp_path: Path, caplog
    ):
        output_path = tmp_path / "order_payload_models.py"
        output_path.write_text("model", encoding="utf-8")

        monkeypatch.setattr(
            cli,
            "_rebuild_order_models_from_artifacts",
            lambda **_kwargs: SimpleNamespace(
                output_path=output_path,
                payload_count=1,
                missing_paths=set(),
            ),
        )

        with caplog.at_level("INFO"):
            result = cli.rebuild_order_models_from_artifacts(artifacts_dir=tmp_path)

        assert result == 0
        assert "matches API responses" in caplog.text

    def test_rebuild_order_models_from_artifacts_no_batches(
        self, tmp_path: Path, caplog
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()

        with caplog.at_level("ERROR"):
            result = cli.rebuild_order_models_from_artifacts(artifacts_dir=tmp_path)

        assert result == 1
        assert "No API response artifacts" in caplog.text

    def test_main_optioninfo_defaults(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda **_kwargs: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        monkeypatch.setattr(cli, "FileDownloader", DummyDownloader)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        option_none = typer.Option(None)
        option_false = typer.Option(False)
        option_true = typer.Option(True)

        assert (
            cli.main(
                download=option_none,
                skip_downloads=option_none,
                config_path=option_none,
                auth_cookie=option_none,
                save_auth_cookie=option_none,
                prompt_auth_save=option_false,
                prompt_auth=option_true,
                platforms=option_none,
                file_types=option_none,
                size_policy=option_none,
                artifacts_dir=option_none,
                output_products=option_none,
                order_model_path=option_none,
                order_model_class=option_none,
                save_api_batches=option_none,
                save_captured_responses=option_none,
                save_gamekeys=option_none,
                save_html_on_failure=option_none,
            )
            == 0
        )

    def test_main_order_model_missing_no_rebuild(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        config = self._build_config(tmp_path)
        config.artifacts.auto_rebuild_order_models = False
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        monkeypatch.setattr(cli, "_prompt_for_order_model_rebuild", lambda *_: False)

        assert cli.main() == 1

    def test_main_rebuild_with_missing_paths_warns(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        config = self._build_config(tmp_path)
        config.artifacts.auto_rebuild_order_models = True
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        monkeypatch.setattr(cli, "FileDownloader", DummyDownloader)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        model_path = write_order_model(artifacts_dir)

        missing_iter = iter([{"missing.path"}, {"still.missing"}])

        monkeypatch.setattr(
            cli,
            "find_missing_order_payload_paths",
            lambda *_args, **_kwargs: next(missing_iter),
        )
        monkeypatch.setattr(
            cli, "_write_order_model_artifacts", lambda *_args, **_kwargs: None
        )

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        assert cli.main() == 0
        assert model_path.exists()

    def test_main_rebuild_matches_after(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        config.artifacts.auto_rebuild_order_models = True
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        monkeypatch.setattr(cli, "FileDownloader", DummyDownloader)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        missing_iter = iter([{"missing.path"}, set()])

        monkeypatch.setattr(
            cli,
            "find_missing_order_payload_paths",
            lambda *_args, **_kwargs: next(missing_iter),
        )
        monkeypatch.setattr(
            cli, "_write_order_model_artifacts", lambda *_args, **_kwargs: None
        )

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        assert cli.main() == 0

    def test_main_browser_exception(self, monkeypatch: MonkeyPatch, tmp_path: Path):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", tmp_path / "artifacts")

        class ExplodingBrowser(DummyBrowser):
            def __enter__(self):
                raise RuntimeError("boom")

        monkeypatch.setattr(cli, "BrowserManager", ExplodingBrowser)

        assert cli.main() == 1

    def test_main_forced_downloads_disabled_by_config(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        config = self._build_config(tmp_path)
        config.download.force_individual_file_downloads = False
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        class ShouldNotRunDownloader(DummyDownloader):
            def download_product(self, task: Any):
                raise AssertionError("Download should be skipped")

        monkeypatch.setattr(cli, "FileDownloader", ShouldNotRunDownloader)

        assert cli.main() == 0

    def test_main_skips_product_without_downloads(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        monkeypatch.setattr(cli, "FileDownloader", DummyDownloader)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            product = Product(
                gamekey="key1",
                product_name="Empty",
                machine_name="empty",
                category="ebook",
                downloads=[],
            )
            return LibraryData(
                products=[product],
                total_products=1,
                captured_at="2026-01-31T00:00:00",
            )

        monkeypatch.setattr(cli, "build_library_json", build_library)

        assert cli.main() == 1

    def test_main_overrides_artifact_flags(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        config = self._build_config(tmp_path)
        monkeypatch.setattr(cli, "Settings", lambda: config)
        monkeypatch.setattr(cli, "BrowserManager", DummyBrowser)
        monkeypatch.setattr(cli, "FileDownloader", DummyDownloader)
        artifacts_dir = tmp_path / "artifacts"
        monkeypatch.setattr(cli, "ARTIFACTS_DIR", artifacts_dir)
        write_order_model(artifacts_dir)

        def build_library(*_args: Any, **_kwargs: Any) -> LibraryData:
            return self._build_library_data()

        monkeypatch.setattr(cli, "build_library_json", build_library)

        assert (
            cli.main(
                save_api_batches=False,
                save_captured_responses=True,
                save_gamekeys=True,
                save_html_on_failure=False,
            )
            == 0
        )

        assert config.artifacts.save_api_batches is False
        assert config.artifacts.save_captured_responses is True
        assert config.artifacts.save_gamekeys is True
        assert config.artifacts.save_html_on_failure is False

    def test_run_invoked_subcommand_returns(self):
        ctx = cast(typer.Context, SimpleNamespace(invoked_subcommand=True))
        assert cli.run(ctx) is None

    def test_run_calls_main(self, monkeypatch: MonkeyPatch):
        ctx = cast(typer.Context, SimpleNamespace(invoked_subcommand=False))
        monkeypatch.setattr(cli, "main", lambda **_kwargs: 0)

        with pytest.raises(typer.Exit) as excinfo:
            cli.run(ctx)

        assert excinfo.value.exit_code == 0

    def test_rebuild_order_models_command_exits(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        monkeypatch.setattr(
            cli, "rebuild_order_models_from_artifacts", lambda **_kwargs: 0
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.rebuild_order_models_command(artifacts_dir=tmp_path)

        assert excinfo.value.exit_code == 0

    def test_generate_order_models_command_missing_dir(self, tmp_path: Path):
        with pytest.raises(typer.Exit) as excinfo:
            cli.generate_order_models_command(
                api_dir=tmp_path / "missing",
                pattern="orders_batch_*.json",
            )

        assert excinfo.value.exit_code == 1

    def test_generate_order_models_command_no_files(self, tmp_path: Path):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()

        with pytest.raises(typer.Exit) as excinfo:
            cli.generate_order_models_command(
                api_dir=api_dir,
                pattern="orders_batch_*.json",
            )

        assert excinfo.value.exit_code == 1

    def test_generate_order_models_command_no_payloads(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()

        def raise_no_payloads(**_kwargs):
            raise ValueError("No order payloads found in API responses")

        monkeypatch.setattr(
            cli,
            "generate_order_models_from_api_dir",
            raise_no_payloads,
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.generate_order_models_command(
                api_dir=api_dir,
                pattern="orders_batch_*.json",
            )

        assert excinfo.value.exit_code == 1

    def test_generate_order_models_command_backup_failure(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()

        monkeypatch.setattr(
            cli,
            "generate_order_models_from_api_dir",
            lambda **_kwargs: (_ for _ in ()).throw(OSError("boom")),
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.generate_order_models_command(
                api_dir=api_dir,
                output_models=tmp_path / "order_payload_models.py",
                pattern="orders_batch_*.json",
            )

        assert excinfo.value.exit_code == 1

    def test_generate_order_models_command_success(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()

        called: dict[str, Any] = {}

        def generate_stub(**_kwargs):
            called["yes"] = True

        monkeypatch.setattr(cli, "generate_order_models_from_api_dir", generate_stub)

        cli.generate_order_models_command(
            api_dir=api_dir,
            output_models=tmp_path / "model.py",
            pattern="orders_batch_*.json",
        )

        assert called.get("yes") is True

    def test_rebuild_library_artifacts_command_missing_dir(self, tmp_path: Path):
        with pytest.raises(typer.Exit) as excinfo:
            cli.rebuild_library_artifacts_command(
                api_dir=tmp_path / "missing",
                pattern="orders_batch_*.json",
            )

        assert excinfo.value.exit_code == 1

    def test_rebuild_library_artifacts_command_no_batches(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()

        monkeypatch.setattr(
            cli,
            "rebuild_library_artifacts_from_api_dir",
            lambda **_kwargs: (_ for _ in ()).throw(
                FileNotFoundError("No API responses found to rebuild artifacts")
            ),
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.rebuild_library_artifacts_command(
                api_dir=api_dir,
                pattern="orders_batch_*.json",
            )

        assert excinfo.value.exit_code == 1

    def test_rebuild_library_artifacts_command_missing_model(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()
        monkeypatch.setattr(
            cli,
            "rebuild_library_artifacts_from_api_dir",
            lambda **_kwargs: (_ for _ in ()).throw(
                FileNotFoundError(f"Order model not found: {tmp_path / 'missing.py'}")
            ),
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.rebuild_library_artifacts_command(
                api_dir=api_dir,
                order_model_path=tmp_path / "missing.py",
                pattern="orders_batch_*.json",
            )

        assert excinfo.value.exit_code == 1

    def test_rebuild_library_artifacts_command_success(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()

        output_products = tmp_path / "library_products.json"
        monkeypatch.setattr(
            cli,
            "rebuild_library_artifacts_from_api_dir",
            lambda **_kwargs: SimpleNamespace(
                output_path=output_products,
                library=self._build_library_data(),
            ),
        )

        cli.rebuild_library_artifacts_command(
            api_dir=api_dir,
            order_model_path=tmp_path / "order_payload_models.py",
            output_products=output_products,
            pattern="orders_batch_*.json",
        )

        assert output_products == tmp_path / "library_products.json"

    def test_sync_downloads_command_validates_size_policy(self, tmp_path: Path):
        with pytest.raises(typer.BadParameter, match="--size-policy"):
            cli.sync_downloads_command(
                library_file=tmp_path / "library_products.json",
                target_folder=tmp_path / "downloads",
                size_policy="tiny",
            )

    def test_sync_downloads_command_missing_library_exits(self, tmp_path: Path):
        with pytest.raises(typer.Exit) as excinfo:
            cli.sync_downloads_command(
                library_file=tmp_path / "missing.json",
                target_folder=tmp_path / "downloads",
                size_policy="all",
                dry_run=False,
            )

        assert excinfo.value.exit_code == 1

    def test_sync_downloads_command_dry_run_exits_after_plan(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")
        printed: list[str] = []

        monkeypatch.setattr(cli, "load_library_data", lambda *_args: "library")
        monkeypatch.setattr(
            cli,
            "build_sync_plan",
            lambda *_args, **_kwargs: [
                SimpleNamespace(relative_path=Path("ebooks/sample.pdf"))
            ],
        )
        monkeypatch.setattr(
            cli.console, "print", lambda message: printed.append(str(message))
        )
        monkeypatch.setattr(
            cli,
            "sync_library_downloads",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(
                AssertionError("dry run should not start sync")
            ),
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.sync_downloads_command(
                library_file=library_file,
                target_folder=tmp_path / "downloads",
                size_policy="all",
                dry_run=True,
            )

        assert excinfo.value.exit_code == 0
        assert any("Managed sync plan: 1 file(s)" in line for line in printed)
        assert any("sample.pdf" in line for line in printed)

    def test_sync_downloads_command_exits_when_plan_is_empty(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")
        printed: list[str] = []

        monkeypatch.setattr(cli, "load_library_data", lambda *_args: "library")
        monkeypatch.setattr(cli, "build_sync_plan", lambda *_args, **_kwargs: [])
        monkeypatch.setattr(
            cli.console, "print", lambda message: printed.append(str(message))
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.sync_downloads_command(
                library_file=library_file,
                target_folder=tmp_path / "downloads",
                size_policy="all",
                dry_run=False,
            )

        assert excinfo.value.exit_code == 0
        assert any(
            "No downloads matched the selected filters." in line for line in printed
        )

    def test_sync_downloads_command_runs_sync_and_prints_summary(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")
        printed: list[str] = []
        sync_calls: dict[str, Any] = {}
        runtime_settings = SimpleNamespace(
            download=SimpleNamespace(
                base_folder=tmp_path / "configured-downloads",
                managed_sync_max_parallel_downloads=3,
                managed_sync_manifest_history_entries=5000,
                model_copy=lambda update=None: SimpleNamespace(
                    base_folder=(update or {}).get(
                        "base_folder", tmp_path / "configured-downloads"
                    ),
                    managed_sync_max_parallel_downloads=3,
                    managed_sync_manifest_history_entries=5000,
                ),
            )
        )

        monkeypatch.setattr(cli, "load_library_data", lambda *_args: "library")
        monkeypatch.setattr(
            cli,
            "build_sync_plan",
            lambda *_args, **_kwargs: [
                SimpleNamespace(relative_path=Path("ebooks/sample.pdf")),
                SimpleNamespace(relative_path=Path("ebooks/sample.epub")),
            ],
        )
        monkeypatch.setattr(
            cli.console, "print", lambda message: printed.append(str(message))
        )
        monkeypatch.setattr(
            cli, "_load_managed_sync_download_config", lambda: runtime_settings
        )

        def sync_stub(library, **kwargs):
            sync_calls["library"] = library
            sync_calls.update(kwargs)
            return SimpleNamespace(
                planned_files=2,
                downloaded_files=2,
                skipped_existing_files=1,
                renamed_files=0,
                failed_files=0,
                manifest_path=tmp_path / "downloads" / "managed_sync_manifest.json",
            )

        monkeypatch.setattr(cli, "sync_library_downloads", sync_stub)

        cli.sync_downloads_command(
            library_file=library_file,
            target_folder=tmp_path / "downloads",
            platforms=["audio"],
            file_types=["m4b"],
            size_policy="largest",
            dry_run=False,
        )

        assert sync_calls["library"] == "library"
        assert sync_calls["target_root"] == tmp_path / "downloads"
        assert sync_calls["download_config"].base_folder == tmp_path / "downloads"
        assert sync_calls["platforms"] == ["audio"]
        assert sync_calls["file_types"] == ["m4b"]
        assert sync_calls["size_policy"] == "largest"
        assert callable(sync_calls["on_progress"])
        assert any("Managed sync runtime settings:" in line for line in printed)
        assert any("Managed sync complete:" in line for line in printed)
        assert any("Planned files:" in line for line in printed)
        assert any("Downloaded: 2" in line for line in printed)
        assert any("Elapsed:" in line for line in printed)
        assert any("Manifest:" in line for line in printed)

    def test_sync_downloads_command_reports_live_progress_updates(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")
        printed: list[str] = []
        live_updates: list[tuple[str, str]] = []
        runtime_settings = SimpleNamespace(
            download=SimpleNamespace(
                base_folder=tmp_path / "configured-downloads",
                managed_sync_max_parallel_downloads=3,
                managed_sync_manifest_history_entries=5000,
                model_copy=lambda update=None: SimpleNamespace(
                    base_folder=(update or {}).get(
                        "base_folder", tmp_path / "configured-downloads"
                    ),
                    managed_sync_max_parallel_downloads=3,
                    managed_sync_manifest_history_entries=5000,
                ),
            )
        )

        class FakeLive:
            def __init__(self, renderable, **_kwargs):
                self.renderable = renderable

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def update(self, renderable, refresh=False):
                del refresh
                self.renderable = renderable
                live_updates.append(renderable)

        monkeypatch.setattr(cli, "load_library_data", lambda *_args: "library")
        monkeypatch.setattr(
            cli,
            "build_sync_plan",
            lambda *_args, **_kwargs: [
                SimpleNamespace(relative_path=Path("ebook/sample.epub")),
                SimpleNamespace(relative_path=Path("ebook/sample.pdf")),
            ],
        )
        monkeypatch.setattr(
            cli.console, "print", lambda message: printed.append(str(message))
        )
        monkeypatch.setattr(cli.sys, "stderr", SimpleNamespace(isatty=lambda: True))
        monkeypatch.setattr(
            cli, "_load_managed_sync_download_config", lambda: runtime_settings
        )
        monkeypatch.setattr(cli, "Live", FakeLive)
        monkeypatch.setattr(
            cli,
            "_build_managed_sync_live_renderable",
            lambda progress, **_kwargs: (
                progress.reviewed_files,
                progress.current_file_state,
                progress.current_file_bytes_downloaded,
                progress.current_file_total_bytes,
                progress.current_file_elapsed_seconds,
                progress.current_file_message,
            ),
        )

        def sync_stub(_library, **kwargs):
            on_progress = kwargs["on_progress"]
            on_progress(
                SimpleNamespace(
                    total_titles=1,
                    reviewed_titles=0,
                    total_files=2,
                    reviewed_files=0,
                    downloaded_files=0,
                    skipped_existing_files=0,
                    renamed_files=0,
                    failed_files=0,
                    active_downloads=1,
                    current_bundle="Programming Bundle",
                    current_title="Mastering TypeScript",
                    current_file="masteringtypescript.epub",
                    current_file_state="downloading",
                    current_file_bytes_downloaded=6,
                    current_file_total_bytes=12,
                    current_file_attempt=1,
                    current_file_max_attempts=3,
                    current_file_elapsed_seconds=0.5,
                    current_file_message=None,
                )
            )
            on_progress(
                SimpleNamespace(
                    total_titles=1,
                    reviewed_titles=0,
                    total_files=2,
                    reviewed_files=1,
                    downloaded_files=1,
                    skipped_existing_files=0,
                    renamed_files=0,
                    failed_files=0,
                    active_downloads=1,
                    current_bundle="Programming Bundle",
                    current_title="Mastering TypeScript",
                    current_file="masteringtypescript.epub",
                    current_file_state="completed",
                    current_file_bytes_downloaded=12,
                    current_file_total_bytes=12,
                    current_file_attempt=1,
                    current_file_max_attempts=3,
                    current_file_elapsed_seconds=1.0,
                    current_file_message=None,
                )
            )
            return SimpleNamespace(
                planned_files=2,
                downloaded_files=1,
                skipped_existing_files=0,
                renamed_files=0,
                failed_files=0,
                manifest_path=tmp_path / "downloads" / "managed_sync_manifest.json",
            )

        monkeypatch.setattr(cli, "sync_library_downloads", sync_stub)

        cli.sync_downloads_command(
            library_file=library_file,
            target_folder=tmp_path / "downloads",
            size_policy="all",
            dry_run=False,
        )

        assert live_updates
        assert (0, "downloading", 6, 12, 0.5, None) in live_updates
        assert (1, "completed", 12, 12, 1.0, None) in live_updates
        assert not any("[downloaded]" in line for line in printed)

    def test_build_managed_sync_live_lines_formats_byte_progress(self):
        overall_line, current_line = cli._build_managed_sync_live_lines(
            SyncProgress(
                reviewed_files=12,
                total_files=100,
                reviewed_titles=4,
                total_titles=20,
                downloaded_files=3,
                skipped_existing_files=8,
                renamed_files=1,
                failed_files=0,
                active_downloads=2,
                current_bundle="Programming Bundle",
                current_title="Mastering TypeScript",
                current_file="masteringtypescript.epub",
                current_file_state="downloading",
                current_file_bytes_downloaded=1024,
                current_file_total_bytes=4096,
                current_file_attempt=1,
                current_file_max_attempts=3,
                current_file_elapsed_seconds=2.0,
                current_file_message=None,
            ),
            elapsed_seconds=65,
            eta_seconds=130,
        )

        assert "files 12/100" in overall_line
        assert "active=2" in overall_line
        assert "elapsed=00:01:05" in overall_line
        assert "eta=00:02:10" in overall_line
        assert "Current (latest of 2 active):" in current_line
        assert "Mastering TypeScript [masteringtypescript.epub]" in current_line
        assert (
            "downloading | attempt 1/3 | 1.0 KB/4.0 KB (25%) | 512 B/s" in current_line
        )

    def test_build_managed_sync_live_lines_formats_retry_reason(self):
        _overall_line, current_line = cli._build_managed_sync_live_lines(
            SyncProgress(
                reviewed_files=12,
                total_files=100,
                reviewed_titles=4,
                total_titles=20,
                downloaded_files=3,
                skipped_existing_files=8,
                renamed_files=1,
                failed_files=0,
                active_downloads=1,
                current_bundle="Programming Bundle",
                current_title="Mastering TypeScript",
                current_file="masteringtypescript.epub",
                current_file_state="retrying",
                current_file_bytes_downloaded=2048,
                current_file_total_bytes=4096,
                current_file_attempt=2,
                current_file_max_attempts=3,
                current_file_elapsed_seconds=3.0,
                current_file_message="ConnectionError",
            ),
            elapsed_seconds=65,
            eta_seconds=130,
        )

        assert "retrying | attempt 2/3 | ConnectionError" in current_line

    def test_sync_downloads_command_reports_noninteractive_progress_periodically(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")
        printed: list[str] = []
        runtime_settings = SimpleNamespace(
            download=SimpleNamespace(
                base_folder=tmp_path / "configured-downloads",
                managed_sync_max_parallel_downloads=3,
                managed_sync_manifest_history_entries=5000,
                model_copy=lambda update=None: SimpleNamespace(
                    base_folder=(update or {}).get(
                        "base_folder", tmp_path / "configured-downloads"
                    ),
                    managed_sync_max_parallel_downloads=3,
                    managed_sync_manifest_history_entries=5000,
                ),
            )
        )

        class FakeTqdm:
            def __init__(self, *_args, **kwargs):
                del _args
                self.total = kwargs.get("total", 0)
                self.n = 0
                self.disable = kwargs.get("disable", False)

            def set_description_str(self, _value: str):
                return None

            def set_postfix_str(self, _value: str):
                return None

            def refresh(self):
                return None

            def write(self, message: str):
                printed.append(str(message))

            def close(self):
                return None

        monkeypatch.setattr(cli, "load_library_data", lambda *_args: "library")
        monkeypatch.setattr(
            cli,
            "build_sync_plan",
            lambda *_args, **_kwargs: [
                SimpleNamespace(relative_path=Path("ebook/sample.epub"))
                for _ in range(50)
            ],
        )

        def capture_print(message):
            printed.append(str(message))

        def build_fake_tqdm(*args, **kwargs):
            return FakeTqdm(*args, **kwargs)

        monkeypatch.setattr(cli.console, "print", capture_print)
        monkeypatch.setattr(cli, "tqdm", build_fake_tqdm)
        monkeypatch.setattr(cli.sys, "stderr", SimpleNamespace(isatty=lambda: False))
        monkeypatch.setattr(
            cli, "_load_managed_sync_download_config", lambda: runtime_settings
        )

        def sync_stub(_library, **kwargs):
            on_progress = kwargs["on_progress"]
            for reviewed in (25, 50):
                on_progress(
                    SimpleNamespace(
                        total_titles=10,
                        reviewed_titles=reviewed // 5,
                        total_files=50,
                        reviewed_files=reviewed,
                        downloaded_files=reviewed,
                        skipped_existing_files=0,
                        renamed_files=0,
                        failed_files=0,
                        active_downloads=0,
                        current_bundle="Bundle",
                        current_title="Title",
                        current_file="file.epub",
                    )
                )
            return SimpleNamespace(
                planned_files=50,
                downloaded_files=50,
                skipped_existing_files=0,
                renamed_files=0,
                failed_files=0,
                manifest_path=tmp_path / "downloads" / "managed_sync_manifest.json",
            )

        monkeypatch.setattr(cli, "sync_library_downloads", sync_stub)

        cli.sync_downloads_command(
            library_file=library_file,
            target_folder=tmp_path / "downloads",
            size_policy="all",
            dry_run=False,
        )

        assert any("[downloaded] | files 25/50" in line for line in printed)
        assert any("[downloaded] | files 50/50" in line for line in printed)

    def test_build_viewer_assets_command(self, tmp_path: Path):
        output_path = tmp_path / "schema.json"
        cli.build_viewer_assets_command(schema_output=output_path)

        assert output_path.exists()

    def test_cache_subproduct_pages_command_missing_library(self, tmp_path: Path):
        with pytest.raises(typer.Exit) as excinfo:
            cli.cache_subproduct_pages_command(
                library_file=tmp_path / "missing.json",
            )

        assert excinfo.value.exit_code == 1

    def test_cache_subproduct_pages_command_uses_config_and_overrides(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")

        cache_config = SimpleNamespace(
            base_dir=tmp_path / "from-config",
            domain_workers=4,
        )
        recorded: dict[str, Any] = {}

        def load_cache_config_stub(config_path=None):
            recorded["config_path"] = config_path
            return cache_config

        monkeypatch.setattr(
            cli,
            "load_logging_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                level="info", format="%(message)s"
            ),
        )
        monkeypatch.setattr(
            cli,
            "load_browser_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                headless=True,
                timeout_ms=60000,
                user_agent="agent",
            ),
        )
        monkeypatch.setattr(
            cli,
            "setup_logging",
            lambda level, fmt: recorded.update(
                logging_level=level,
                logging_format=fmt,
            ),
        )
        monkeypatch.setattr(
            cli,
            "load_subproduct_page_cache_config",
            load_cache_config_stub,
        )
        monkeypatch.setattr(
            cli, "load_library_data", lambda *_args, **_kwargs: "library"
        )

        def cache_stub(
            library,
            config,
            *,
            browser_config=None,
            redownload_existing=None,
            subproduct_query=None,
            target_url=None,
            limit=None,
            max_failures=None,
        ):
            recorded["library"] = library
            recorded["base_dir"] = config.base_dir
            recorded["browser_config"] = browser_config
            recorded["redownload_existing"] = redownload_existing
            recorded["subproduct_query"] = subproduct_query
            recorded["target_url"] = target_url
            recorded["limit"] = limit
            recorded["max_failures"] = max_failures
            return SimpleNamespace(
                requested_urls=3,
                processed_urls=3,
                fetched_pages=1,
                reused_pages=2,
                failed_pages=0,
                failure_limit=5,
                aborted=False,
                manifest_path=tmp_path / "from-config" / "index.json",
                elapsed_seconds=12.5,
                failure_breakdown={"http_404": 1},
            )

        monkeypatch.setattr(cli, "cache_subproduct_pages", cache_stub)

        cli.cache_subproduct_pages_command(
            library_file=library_file,
            config_path=tmp_path / "config.yaml",
            cache_dir=tmp_path / "override-cache",
            redownload_existing=True,
            subproduct_query="clean code",
            url="https://example.com/info",
            limit=1,
            max_failures=1,
            domain_workers=3,
        )

        assert recorded["config_path"] == tmp_path / "config.yaml"
        assert recorded["logging_level"] == "info"
        assert recorded["logging_format"] == "%(message)s"
        assert recorded["library"] == "library"
        assert recorded["browser_config"].timeout_ms == 60000
        assert recorded["base_dir"] == (tmp_path / "override-cache").resolve()
        assert cache_config.domain_workers == 3
        assert recorded["redownload_existing"] is True
        assert recorded["subproduct_query"] == "clean code"
        assert recorded["target_url"] == "https://example.com/info"
        assert recorded["limit"] == 1
        assert recorded["max_failures"] == 1

    def test_cache_subproduct_pages_command_no_matches(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")

        monkeypatch.setattr(
            cli,
            "load_logging_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                level="info", format="%(message)s"
            ),
        )
        monkeypatch.setattr(
            cli,
            "load_browser_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                headless=True,
                timeout_ms=60000,
                user_agent="agent",
            ),
        )
        monkeypatch.setattr(cli, "setup_logging", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(
            cli,
            "load_subproduct_page_cache_config",
            lambda *_args, **_kwargs: SimpleNamespace(base_dir=tmp_path / "cache"),
        )
        monkeypatch.setattr(
            cli, "load_library_data", lambda *_args, **_kwargs: "library"
        )
        monkeypatch.setattr(
            cli,
            "cache_subproduct_pages",
            lambda *_args, **_kwargs: SimpleNamespace(
                requested_urls=0,
                processed_urls=0,
                fetched_pages=0,
                reused_pages=0,
                failed_pages=0,
                failure_limit=5,
                aborted=False,
                manifest_path=tmp_path / "cache" / "index.json",
                elapsed_seconds=0.0,
                failure_breakdown={},
            ),
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.cache_subproduct_pages_command(
                library_file=library_file,
                subproduct_query="does-not-exist",
            )

        assert excinfo.value.exit_code == 0

    def test_cache_subproduct_pages_command_aborts_on_failure_limit(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")

        monkeypatch.setattr(
            cli,
            "load_logging_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                level="info", format="%(message)s"
            ),
        )
        monkeypatch.setattr(
            cli,
            "load_browser_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                headless=True,
                timeout_ms=60000,
                user_agent="agent",
            ),
        )
        monkeypatch.setattr(cli, "setup_logging", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(
            cli,
            "load_subproduct_page_cache_config",
            lambda *_args, **_kwargs: SimpleNamespace(base_dir=tmp_path / "cache"),
        )
        monkeypatch.setattr(
            cli, "load_library_data", lambda *_args, **_kwargs: "library"
        )
        monkeypatch.setattr(
            cli,
            "cache_subproduct_pages",
            lambda *_args, **_kwargs: SimpleNamespace(
                requested_urls=3,
                processed_urls=2,
                fetched_pages=0,
                reused_pages=1,
                failed_pages=1,
                failure_limit=1,
                aborted=True,
                manifest_path=tmp_path / "cache" / "index.json",
                elapsed_seconds=5.0,
                failure_breakdown={"dns_resolution": 1},
            ),
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.cache_subproduct_pages_command(
                library_file=library_file,
                max_failures=1,
            )

        assert excinfo.value.exit_code == 1

    def test_analyze_current_bundles_command_uses_config_defaults(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")
        printed: list[str] = []
        recorded: dict[str, Any] = {}

        monkeypatch.setattr(
            cli,
            "load_logging_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                level="info", format="%(message)s"
            ),
        )
        monkeypatch.setattr(cli, "setup_logging", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(
            cli,
            "load_current_bundles_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                base_dir=tmp_path / "current_bundles",
                library_path=None,
                bundle_types=["books", "software"],
                timeout_seconds=45,
            ),
        )
        monkeypatch.setattr(
            cli,
            "load_viewer_config",
            lambda *_args, **_kwargs: SimpleNamespace(library_path=library_file),
        )
        monkeypatch.setattr(
            cli,
            "load_artifacts_config",
            lambda *_args, **_kwargs: SimpleNamespace(base_dir=tmp_path / "artifacts"),
        )

        def capture_stub(**kwargs):
            recorded.update(kwargs)
            return SimpleNamespace(
                output_dir=str(tmp_path / "current_bundles"),
                index_html_path=str(
                    tmp_path / "current_bundles" / "bundles_index.html"
                ),
                bundle_links_path=str(
                    tmp_path / "current_bundles" / "bundle_links.json"
                ),
                catalog_json_path=str(
                    tmp_path / "current_bundles" / "bundle_catalog.json"
                ),
                report_json_path=str(
                    tmp_path / "current_bundles" / "bundle_overlap_report.json"
                ),
                report_markdown_path=str(
                    tmp_path / "current_bundles" / "bundle_overlap_report.md"
                ),
                bundle_types=["books", "software"],
                bundle_count=6,
            )

        monkeypatch.setattr(cli, "capture_and_report_current_bundles", capture_stub)
        monkeypatch.setattr(
            cli.console, "print", lambda message: printed.append(str(message))
        )

        cli.analyze_current_bundles_command()

        assert recorded["library_path"] == library_file
        assert recorded["bundle_types"] == ["books", "software"]
        assert recorded["timeout_seconds"] == 45
        assert any("Current bundle analysis complete:" in line for line in printed)
        assert any("Bundles analyzed: 6" in line for line in printed)

    def test_analyze_current_bundles_command_missing_library_exits(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        missing_library = tmp_path / "missing-library.json"

        monkeypatch.setattr(
            cli,
            "load_logging_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                level="info", format="%(message)s"
            ),
        )
        monkeypatch.setattr(cli, "setup_logging", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(
            cli,
            "load_current_bundles_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                base_dir=tmp_path / "current_bundles",
                library_path=missing_library,
                bundle_types=["games", "books", "software"],
                timeout_seconds=30,
            ),
        )
        monkeypatch.setattr(
            cli,
            "load_viewer_config",
            lambda *_args, **_kwargs: SimpleNamespace(library_path=None),
        )
        monkeypatch.setattr(
            cli,
            "load_artifacts_config",
            lambda *_args, **_kwargs: SimpleNamespace(base_dir=tmp_path / "artifacts"),
        )

        with pytest.raises(typer.Exit) as excinfo:
            cli.analyze_current_bundles_command()

        assert excinfo.value.exit_code == 1

    def test_analyze_current_choice_command_uses_config_defaults(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")
        printed: list[str] = []
        recorded: dict[str, Any] = {}

        monkeypatch.setattr(
            cli,
            "load_logging_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                level="info", format="%(message)s"
            ),
        )
        monkeypatch.setattr(cli, "setup_logging", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(
            cli,
            "load_current_choice_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                base_dir=tmp_path / "current_choice",
                library_path=None,
                timeout_seconds=45,
            ),
        )
        monkeypatch.setattr(
            cli,
            "load_viewer_config",
            lambda *_args, **_kwargs: SimpleNamespace(library_path=library_file),
        )
        monkeypatch.setattr(
            cli,
            "load_artifacts_config",
            lambda *_args, **_kwargs: SimpleNamespace(base_dir=tmp_path / "artifacts"),
        )

        def capture_stub(**kwargs):
            recorded.update(kwargs)
            return SimpleNamespace(
                output_dir=str(tmp_path / "current_choice"),
                page_html_path=str(tmp_path / "current_choice" / "membership.html"),
                snapshot_json_path=str(
                    tmp_path / "current_choice" / "choice_snapshot.json"
                ),
                report_json_path=str(
                    tmp_path / "current_choice" / "choice_overlap_report.json"
                ),
                report_markdown_path=str(
                    tmp_path / "current_choice" / "choice_overlap_report.md"
                ),
                month_label="March",
                game_count=8,
            )

        monkeypatch.setattr(cli, "capture_and_report_current_choice", capture_stub)
        monkeypatch.setattr(
            cli.console, "print", lambda message: printed.append(str(message))
        )

        cli.analyze_current_choice_command()

        assert recorded["library_path"] == library_file
        assert recorded["timeout_seconds"] == 45
        assert any("Current Choice analysis complete:" in line for line in printed)
        assert any("Games analyzed: 8" in line for line in printed)

    @pytest.mark.parametrize(
        ("limit", "max_failures", "domain_workers", "expected"),
        [
            (0, None, None, "--limit must be at least 1."),
            (None, 0, None, "--max-failures must be at least 1."),
            (None, None, 0, "--domain-workers must be at least 1."),
        ],
    )
    def test_cache_subproduct_pages_command_validates_numeric_options(
        self,
        tmp_path: Path,
        limit: int | None,
        max_failures: int | None,
        domain_workers: int | None,
        expected: str,
    ):
        library_file = tmp_path / "library_products.json"
        library_file.write_text("{}", encoding="utf-8")

        with pytest.raises(typer.BadParameter, match=expected):
            cli.cache_subproduct_pages_command(
                library_file=library_file,
                limit=limit,
                max_failures=max_failures,
                domain_workers=domain_workers,
            )

    def test_extract_subproduct_metadata_command_can_write_report(
        self, monkeypatch: MonkeyPatch, tmp_path: Path
    ):
        cache_dir = tmp_path / "subproduct_pages"
        metadata_path = cache_dir / "metadata.json"
        report_path = cache_dir / "summary.md"
        printed: list[str] = []

        monkeypatch.setattr(
            cli,
            "load_logging_config",
            lambda *_args, **_kwargs: SimpleNamespace(
                level="info", format="%(message)s"
            ),
        )
        monkeypatch.setattr(cli, "setup_logging", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(
            cli,
            "load_subproduct_page_cache_config",
            lambda *_args, **_kwargs: SimpleNamespace(base_dir=cache_dir),
        )
        monkeypatch.setattr(
            cli,
            "build_subproduct_page_metadata",
            lambda *_args, **_kwargs: SimpleNamespace(
                processed_entries=3,
                extracted_entries=2,
                fallback_only_entries=1,
                html_read_failures=0,
                elapsed_seconds=90,
                output_path=metadata_path,
            ),
        )
        monkeypatch.setattr(
            cli,
            "build_subproduct_metadata_analysis_report",
            lambda *_args, **_kwargs: report_path,
        )
        monkeypatch.setattr(
            cli.console, "print", lambda message: printed.append(str(message))
        )

        cli.extract_subproduct_metadata_command(
            cache_dir=cache_dir,
            report_file=report_path,
        )

        assert any("Processed entries: 3" in line for line in printed)
        assert any("Elapsed: 00:01:30" in line for line in printed)
        assert any(f"Markdown report: {report_path}" in line for line in printed)
