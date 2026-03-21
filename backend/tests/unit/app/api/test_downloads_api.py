"""Unit tests for download API routes."""

from __future__ import annotations

# pyright: reportPrivateUsage=false
# pylint: disable=protected-access

import importlib
from types import SimpleNamespace
from typing import Any

import pytest
import requests

from hb_library_viewer.sync import SyncPlanEntry, SyncPlanSourceItem

downloads_api = importlib.import_module("app.api.downloads")
LibraryNotFoundError = importlib.import_module(
    "app.services.library_loader"
).LibraryNotFoundError


class _FakeUpstreamResponse:
    """Minimal upstream response stub for streaming tests."""

    def __init__(self, *, chunks: list[bytes], status_code: int = 200):
        self._chunks = chunks
        self.status_code = status_code
        self.headers = {
            "content-type": "application/epub+zip",
            "content-length": str(sum(len(chunk) for chunk in chunks)),
        }
        self.closed = False

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            response = requests.Response()
            response.status_code = self.status_code
            raise requests.exceptions.HTTPError(response=response)

    def iter_content(self, chunk_size: int = 8192):
        del chunk_size
        yield from self._chunks

    def close(self) -> None:
        self.closed = True


@pytest.mark.unit
class TestDownloadsApi:
    """Verify managed download streaming behavior in isolation."""

    def test_plan_managed_downloads_returns_shared_sync_plan(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        captured: dict[str, object] = {}

        def fake_build_sync_plan_from_items(items, **kwargs):
            realized = list(items)
            captured["items"] = realized
            captured["kwargs"] = kwargs
            return [
                SyncPlanEntry(
                    title_id="book-1",
                    title="Sample Book",
                    source_bundle="Programming Bundle",
                    platform="ebook",
                    file_type="epub",
                    filename="sample-book.epub",
                    relative_path="ebook/Sample_Book/sample-book.epub",
                    size_bytes=42,
                    url="https://cdn.example.com/sample-book.epub",
                    checksums={"sha1": "abc123"},
                )
            ]

        monkeypatch.setattr(
            downloads_api,
            "build_sync_plan_from_items",
            fake_build_sync_plan_from_items,
        )
        client = api_client_factory(downloads_api.router)

        response = client.post(
            "/api/downloads/plan",
            json={
                "items": [
                    {
                        "title_id": "book-1",
                        "title": "Sample Book",
                        "source_bundle": "Programming Bundle",
                        "downloads": [
                            {
                                "platform": "ebook",
                                "name": "EPUB",
                                "url": "https://cdn.example.com/sample-book.epub",
                                "size_bytes": 42,
                                "checksums": {"sha1": "abc123"},
                                "file_type": "epub",
                            }
                        ],
                    }
                ]
            },
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload[0]["relative_path"] == "ebook/Sample_Book/sample-book.epub"
        assert payload[0]["checksums"] == {"sha1": "abc123"}
        planned_items = captured["items"]
        assert isinstance(planned_items, list)
        assert isinstance(planned_items[0], SyncPlanSourceItem)
        assert (
            planned_items[0].downloads[0].url
            == "https://cdn.example.com/sample-book.epub"
        )
        assert captured["kwargs"] == {
            "platforms": None,
            "file_types": None,
            "size_policy": "all",
        }

    def test_plan_managed_downloads_forwards_selection_filters(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        captured: dict[str, object] = {}

        def fake_build_sync_plan_from_items(items, **kwargs):
            captured["items"] = list(items)
            captured["kwargs"] = kwargs
            return []

        monkeypatch.setattr(
            downloads_api,
            "build_sync_plan_from_items",
            fake_build_sync_plan_from_items,
        )
        client = api_client_factory(downloads_api.router)

        response = client.post(
            "/api/downloads/plan",
            json={
                "items": [],
                "platforms": ["ebook"],
                "file_types": ["epub"],
                "size_policy": "smallest",
            },
        )

        assert response.status_code == 200
        assert captured["kwargs"] == {
            "platforms": ["ebook"],
            "file_types": ["epub"],
            "size_policy": "smallest",
        }

    def test_wait_for_stream_slot_enforces_remaining_delay(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        sleeps: list[float] = []
        monotonic_values = iter([10.2, 10.5])

        monkeypatch.setattr(
            downloads_api,
            "STREAM_OPEN_STATE",
            {"last_opened_at": 10.0},
        )
        monkeypatch.setattr(
            downloads_api.time,
            "monotonic",
            lambda: next(monotonic_values),
        )
        monkeypatch.setattr(downloads_api.time, "sleep", sleeps.append)

        downloads_api.wait_for_stream_slot(0.5)

        assert sleeps == [pytest.approx(0.3)]
        assert downloads_api.STREAM_OPEN_STATE["last_opened_at"] == pytest.approx(10.5)

    def test_wait_for_stream_slot_skips_sleep_when_gap_already_met(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        sleeps: list[float] = []
        monotonic_values = iter([11.0, 11.0])

        monkeypatch.setattr(
            downloads_api,
            "STREAM_OPEN_STATE",
            {"last_opened_at": 10.0},
        )
        monkeypatch.setattr(
            downloads_api.time,
            "monotonic",
            lambda: next(monotonic_values),
        )
        monkeypatch.setattr(downloads_api.time, "sleep", sleeps.append)

        downloads_api.wait_for_stream_slot(0.5)

        assert sleeps == []
        assert downloads_api.STREAM_OPEN_STATE["last_opened_at"] == pytest.approx(11.0)

    def test_find_library_download_matches_subproduct_entry(
        self,
        sample_viewer_library_data,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            downloads_api, "load_library", lambda: sample_viewer_library_data
        )

        result = downloads_api._find_library_download(
            "https://cdn.example.com/subproduct.epub"
        )

        assert result is not None
        assert result.name == "Sample Book.epub"

    def test_find_library_download_matches_product_level_entry(
        self,
        sample_viewer_library_data,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            downloads_api, "load_library", lambda: sample_viewer_library_data
        )

        result = downloads_api._find_library_download(
            "https://cdn.example.com/bundle.pdf"
        )

        assert result is not None
        assert result.name == "Bundle.pdf"

    def test_stream_download_rejects_invalid_url(
        self,
        api_client_factory,
    ) -> None:
        client = api_client_factory(downloads_api.router)

        response = client.post(
            "/api/downloads/stream",
            json={"url": "not-a-valid-url"},
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid download URL."

    def test_stream_download_returns_404_when_library_missing(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_missing(_url: str):
            raise LibraryNotFoundError("missing library")

        monkeypatch.setattr(downloads_api, "_find_library_download", raise_missing)
        client = api_client_factory(downloads_api.router)

        response = client.post(
            "/api/downloads/stream",
            json={"url": "https://cdn.example.com/book.epub"},
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "missing library"

    def test_stream_download_returns_404_when_url_not_in_library(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(downloads_api, "_find_library_download", lambda _url: None)
        client = api_client_factory(downloads_api.router)

        response = client.post(
            "/api/downloads/stream",
            json={"url": "https://cdn.example.com/book.epub"},
        )

        assert response.status_code == 404
        assert "not found in the current library data" in response.json()["detail"]

    def test_stream_download_streams_bytes_and_uses_suggested_filename(
        self,
        api_client_factory,
        sample_viewer_library_data,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        upstream = _FakeUpstreamResponse(chunks=[b"abc", b"123"])
        captured_request: dict[str, Any] = {}

        monkeypatch.setattr(
            downloads_api,
            "_find_library_download",
            lambda _url: sample_viewer_library_data.products[0]
            .subproducts[0]
            .downloads[0],
        )
        monkeypatch.setattr(
            downloads_api,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                download=SimpleNamespace(
                    rate_limit_delay=0.0,
                    connect_timeout_seconds=11,
                    stream_timeout_seconds=5,
                )
            ),
        )
        monkeypatch.setattr(downloads_api, "wait_for_stream_slot", lambda _delay: None)

        def fake_get(*args, **kwargs):
            captured_request["args"] = args
            captured_request["kwargs"] = kwargs
            return upstream

        monkeypatch.setattr(downloads_api.requests, "get", fake_get)
        client = api_client_factory(downloads_api.router)

        response = client.post(
            "/api/downloads/stream",
            json={
                "url": "https://cdn.example.com/subproduct.epub",
                "suggested_filename": "reader-copy.epub",
            },
        )

        assert response.status_code == 200
        assert response.content == b"abc123"
        assert (
            response.headers["content-disposition"]
            == 'attachment; filename="reader-copy.epub"'
        )
        assert captured_request["kwargs"]["timeout"] == (11, 5)
        assert upstream.closed is True

    def test_stream_download_maps_upstream_http_error(
        self,
        api_client_factory,
        sample_viewer_library_data,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            downloads_api,
            "_find_library_download",
            lambda _url: sample_viewer_library_data.products[0].downloads[0],
        )
        monkeypatch.setattr(
            downloads_api,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                download=SimpleNamespace(
                    rate_limit_delay=0.0,
                    connect_timeout_seconds=10,
                    stream_timeout_seconds=5,
                )
            ),
        )
        monkeypatch.setattr(downloads_api, "wait_for_stream_slot", lambda _delay: None)
        monkeypatch.setattr(
            downloads_api.requests,
            "get",
            lambda *args, **kwargs: _FakeUpstreamResponse(chunks=[], status_code=503),
        )
        client = api_client_factory(downloads_api.router)

        response = client.post(
            "/api/downloads/stream",
            json={"url": "https://cdn.example.com/bundle.pdf"},
        )

        assert response.status_code == 503
        assert "Upstream download failed with HTTP 503" in response.json()["detail"]

    def test_stream_download_maps_request_exception_to_502(
        self,
        api_client_factory,
        sample_viewer_library_data,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            downloads_api,
            "_find_library_download",
            lambda _url: sample_viewer_library_data.products[0].downloads[0],
        )
        monkeypatch.setattr(
            downloads_api,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                download=SimpleNamespace(
                    rate_limit_delay=0.0,
                    connect_timeout_seconds=10,
                    stream_timeout_seconds=5,
                )
            ),
        )
        monkeypatch.setattr(downloads_api, "wait_for_stream_slot", lambda _delay: None)

        def raise_request(*_args, **_kwargs):
            raise requests.RequestException("boom")

        monkeypatch.setattr(downloads_api.requests, "get", raise_request)
        client = api_client_factory(downloads_api.router)

        response = client.post(
            "/api/downloads/stream",
            json={"url": "https://cdn.example.com/bundle.pdf"},
        )

        assert response.status_code == 502
        assert (
            response.json()["detail"] == "Unable to open the upstream download stream."
        )
