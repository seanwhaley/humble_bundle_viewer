"""Unit tests for browser capture helpers and response recording."""

from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Optional

import pytest
from playwright.sync_api import Error as PlaywrightError

from hb_library_viewer.browser.capture import (
    ResponseRecorder,
    detect_auth_failure,
    extract_api_keys,
    extract_gamekeys,
    should_capture_response,
)
from hb_library_viewer.browser.persistence import ArtifactStore


class _AuthResponseStub:
    """Minimal response stub for auth detection."""

    def __init__(self, url: str, body: str):
        self._url = url
        self._body = body

    @property
    def url(self) -> str:
        return self._url

    def text(self) -> str:
        return self._body


class _FakeResponse:
    """Minimal Playwright response stub for recorder tests."""

    def __init__(
        self,
        url: str,
        status: int,
        body: bytes,
        headers: Optional[dict[str, str]] = None,
    ):
        self.url = url
        self.status = status
        self.headers = headers or {"content-type": "application/json"}
        self._body = body

    def body(self) -> bytes:
        return self._body


def _build_recorder(
    tmp_path,
    *,
    save_captured_responses: bool = False,
    save_api_batches: bool = False,
):
    logger = logging.getLogger("test")
    store = ArtifactStore(
        tmp_path,
        save_captured_responses=save_captured_responses,
        save_api_batches=save_api_batches,
        save_gamekeys=False,
        save_html_on_failure=False,
        logger=logger,
    )
    captured: list[dict[str, object]] = []
    api: list[dict[str, object]] = []
    recorder = ResponseRecorder(
        store,
        captured,
        api,
        save_captured_responses=save_captured_responses,
        save_api_batches=save_api_batches,
        logger=logger,
    )
    return recorder, captured, api


@pytest.mark.unit
class TestBrowserCapture:
    """Verify browser capture helpers in a single module-focused test file."""

    def test_should_capture_response(self) -> None:
        assert should_capture_response("https://www.humblebundle.com/home/library")
        assert should_capture_response(
            "https://www.humblebundle.com/api/v1/orders?gamekeys=abc"
        )
        assert not should_capture_response("https://cdn.humblebundle.com/static/asset.css")

    def test_detect_auth_failure_redirect(self) -> None:
        response = _AuthResponseStub(
            "https://www.humblebundle.com/login?goto=%2Fhome%2Flibrary",
            "",
        )
        assert detect_auth_failure(response)

    def test_detect_auth_failure_logged_out_payload(self) -> None:
        response = _AuthResponseStub(
            "https://www.humblebundle.com/home/library",
            '{"is_logged_in": false}',
        )
        assert detect_auth_failure(response)

    def test_detect_auth_failure_logged_in_payload(self) -> None:
        response = _AuthResponseStub(
            "https://www.humblebundle.com/home/library",
            '{"is_logged_in": true}',
        )
        assert detect_auth_failure(response) is None

    def test_detect_auth_failure_text_error(self) -> None:
        class ResponseStubRaises:
            @property
            def url(self) -> str:
                return "https://www.humblebundle.com/home/library"

            def text(self) -> str:
                raise PlaywrightError("boom")

        assert detect_auth_failure(ResponseStubRaises()) is None

    def test_extract_api_keys(self) -> None:
        api_responses = [
            {"data": 123},
            {"data": "not json"},
            {"data": '{"key1": {}, "key2": {}}'},
        ]

        assert extract_api_keys(api_responses) == {"key1", "key2"}

    def test_extract_gamekeys_success(self) -> None:
        logger = logging.getLogger("test")
        page = SimpleNamespace(evaluate=lambda _script: ["key1", "key2"])

        assert extract_gamekeys(page, logger) == ["key1", "key2"]

    def test_extract_gamekeys_error(self) -> None:
        logger = logging.getLogger("test")

        def raise_error(_script: str):
            raise PlaywrightError("boom")

        page = SimpleNamespace(evaluate=raise_error)
        assert extract_gamekeys(page, logger) == []

    def test_extract_gamekeys_none_page(self) -> None:
        logger = logging.getLogger("test")
        assert extract_gamekeys(None, logger) == []

    def test_handle_response_captures_api(self, tmp_path) -> None:
        recorder, captured, api = _build_recorder(
            tmp_path,
            save_api_batches=True,
        )

        response = _FakeResponse(
            url="https://www.humblebundle.com/api/v1/orders?foo=bar",
            status=200,
            body=b'{"ok": true}',
        )

        recorder.handle_response(response)

        assert len(captured) == 1
        assert len(api) == 1
        assert api[0]["is_json"] is True
        assert (tmp_path / "api_responses").exists()

    def test_handle_response_non_humblebundle(self, tmp_path) -> None:
        recorder, captured, api = _build_recorder(tmp_path)

        recorder.handle_response(_FakeResponse("https://example.com/api", 200, b"{}"))

        assert captured == []
        assert api == []

    def test_handle_response_capture_disabled(self, tmp_path) -> None:
        recorder, captured, api = _build_recorder(tmp_path)
        recorder.disable()

        recorder.handle_response(
            _FakeResponse("https://www.humblebundle.com/api/v1/orders", 200, b"{}")
        )

        assert captured == []
        assert api == []

    def test_handle_response_body_error(self, tmp_path) -> None:
        recorder, captured, _api = _build_recorder(tmp_path)

        class ResponseStub(_FakeResponse):
            def body(self) -> bytes:
                raise PlaywrightError("boom")

        recorder.handle_response(
            ResponseStub("https://www.humblebundle.com/api/v1/orders", 200, b"{}")
        )

        assert captured == []

    def test_handle_response_non_json_orders(self, tmp_path) -> None:
        recorder, captured, api = _build_recorder(tmp_path)

        recorder.handle_response(
            _FakeResponse("https://www.humblebundle.com/api/v1/orders", 200, b"not-json")
        )

        assert len(captured) == 1
        assert api == []

    def test_record_api_response_without_save(self, tmp_path) -> None:
        recorder, captured, api = _build_recorder(tmp_path)

        recorder.record_api_response(
            "https://www.humblebundle.com/api/v1/orders",
            200,
            "application/json",
            "{}",
        )

        assert len(captured) == 1
        assert len(api) == 1
        assert captured[0]["saved_path"] is None

    def test_record_api_response_with_save(self, tmp_path) -> None:
        recorder, _captured, api = _build_recorder(
            tmp_path,
            save_captured_responses=True,
            save_api_batches=True,
        )

        recorder.record_api_response(
            "https://www.humblebundle.com/api/v1/orders",
            200,
            "application/json",
            "{}",
        )

        assert len(api) == 1
        assert api[0]["saved_path"]
        assert (tmp_path / "captured_responses").exists()
        assert (tmp_path / "api_responses").exists()