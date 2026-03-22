"""Unit tests for ArtifactStore persistence helpers."""

from __future__ import annotations

import json
import logging

from hb_library_viewer.browser.persistence import ArtifactStore


def test_write_gamekeys_persists_file(tmp_path):
    logger = logging.getLogger("test")
    store = ArtifactStore(
        tmp_path,
        save_captured_responses=False,
        save_api_batches=False,
        save_gamekeys=True,
        save_html_on_failure=False,
        logger=logger,
    )

    store.write_gamekeys(["key1", "key2"])

    payload = json.loads((tmp_path / "gamekeys.json").read_text())
    assert payload["total"] == 2
    assert payload["gamekeys"] == ["key1", "key2"]


def test_write_gamekeys_skipped_when_disabled(tmp_path):
    logger = logging.getLogger("test")
    store = ArtifactStore(
        tmp_path,
        save_captured_responses=False,
        save_api_batches=False,
        save_gamekeys=False,
        save_html_on_failure=False,
        logger=logger,
    )

    store.write_gamekeys(["key1"])

    assert not (tmp_path / "gamekeys.json").exists()


def test_write_response_file_text_and_binary(tmp_path):
    logger = logging.getLogger("test")
    store = ArtifactStore(
        tmp_path,
        save_captured_responses=True,
        save_api_batches=False,
        save_gamekeys=False,
        save_html_on_failure=False,
        logger=logger,
    )

    text_path = store.write_response_file(
        "https://example.com/readme.txt",
        "text/plain; charset=utf-8",
        b"hello",
        "hello",
    )
    assert text_path.exists()
    assert text_path.read_text(encoding="utf-8") == "hello"

    binary_path = store.write_response_file(
        "https://example.com/blob.bin",
        "application/octet-stream",
        b"\x00\x01",
        "\x00\x01",
    )
    assert binary_path.exists()
    assert binary_path.read_bytes() == b"\x00\x01"


def test_write_api_batch_persists(tmp_path):
    logger = logging.getLogger("test")
    store = ArtifactStore(
        tmp_path,
        save_captured_responses=False,
        save_api_batches=True,
        save_gamekeys=False,
        save_html_on_failure=False,
        logger=logger,
    )

    batch_path = store.write_api_batch('{"ok": true}')

    assert batch_path.exists()
    assert batch_path.read_text(encoding="utf-8") == '{"ok": true}'


def test_maybe_persist_library_html(tmp_path):
    logger = logging.getLogger("test")
    store = ArtifactStore(
        tmp_path,
        save_captured_responses=False,
        save_api_batches=False,
        save_gamekeys=False,
        save_html_on_failure=True,
        logger=logger,
    )

    captured = [
        {
            "url": "https://www.humblebundle.com/home/library",
            "content_type": "text/html",
            "data": "<html></html>",
        }
    ]

    store.maybe_persist_library_html(captured, reason="test")

    capture_dir = tmp_path / "captured_responses"
    assert capture_dir.exists()
    assert any(path.suffix == ".html" for path in capture_dir.iterdir())


def test_find_library_html_response_no_match(tmp_path):
    logger = logging.getLogger("test")
    store = ArtifactStore(
        tmp_path,
        save_captured_responses=False,
        save_api_batches=False,
        save_gamekeys=False,
        save_html_on_failure=False,
        logger=logger,
    )

    assert store.find_library_html_response([]) is None


def test_guess_extension_fallbacks():
    assert (
        ArtifactStore.guess_extension(
            "application/octet-stream",
            "https://example.com/file.bin",
        )
        == ".bin"
    )
    assert (
        ArtifactStore.guess_extension(
            "application/octet-stream",
            "https://example.com/no-extension",
        )
        == ".txt"
    )


def test_clear_skips_when_disabled(tmp_path):
    logger = logging.getLogger("test")
    store = ArtifactStore(
        tmp_path,
        save_captured_responses=False,
        save_api_batches=False,
        save_gamekeys=False,
        save_html_on_failure=False,
        logger=logger,
    )

    capture_dir = tmp_path / "captured_responses"
    api_dir = tmp_path / "api_responses"
    capture_dir.mkdir(parents=True)
    api_dir.mkdir(parents=True)
    (capture_dir / "old.txt").write_text("x")
    (api_dir / "old.json").write_text("{}")

    store.clear()

    assert (capture_dir / "old.txt").exists()
    assert (api_dir / "old.json").exists()


def test_clear_removes_when_enabled(tmp_path):
    logger = logging.getLogger("test")
    store = ArtifactStore(
        tmp_path,
        save_captured_responses=True,
        save_api_batches=True,
        save_gamekeys=True,
        save_html_on_failure=False,
        logger=logger,
    )

    capture_dir = tmp_path / "captured_responses"
    api_dir = tmp_path / "api_responses"
    capture_dir.mkdir(parents=True)
    api_dir.mkdir(parents=True)
    (capture_dir / "old.txt").write_text("x")
    (api_dir / "old.json").write_text("{}")
    (tmp_path / "gamekeys.json").write_text("{}")

    store.clear()

    assert not capture_dir.exists()
    assert not api_dir.exists()
    assert not (tmp_path / "gamekeys.json").exists()
