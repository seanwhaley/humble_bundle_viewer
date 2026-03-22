"""Unit tests for BrowserManager orchestration."""

from __future__ import annotations

import json
from typing import Any, Callable, cast
from unittest.mock import Mock

import pytest
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from hb_library_viewer.browser.manager import BrowserManager
from hb_library_viewer.config import APIConfig, BrowserConfig
from hb_library_viewer.utils import BrowserError


class FakeNavResponse:
    """Minimal navigation response stub."""

    def __init__(
        self,
        status: int,
        url: str = "https://www.humblebundle.com/home/library",
        body_text: str = "",
    ):
        self.status = status
        self.url = url
        self._body_text = body_text

    def text(self) -> str:
        return self._body_text


class DummyPage:
    """Minimal page stub for __enter__ tests."""

    def __init__(self):
        self.headers = {}

    def set_extra_http_headers(self, _headers: dict[str, str]) -> None:
        return None

    def on(self, _event: str, _handler: Callable[..., Any]) -> None:
        return None


class DummyContext:
    """Minimal browser context stub."""

    def __init__(self, page: DummyPage):
        self.page = page
        self.closed = False
        self.cookies = []

    def add_cookies(self, cookies: list[dict[str, Any]]) -> None:
        self.cookies = cookies

    def new_page(self) -> DummyPage:
        return self.page

    def close(self) -> None:
        self.closed = True


class DummyBrowser:
    """Minimal browser stub."""

    def __init__(self, context: DummyContext):
        self.context = context
        self.closed = False

    def new_context(self) -> DummyContext:
        return self.context

    def close(self) -> None:
        self.closed = True


class DummyChromium:
    """Chromium launcher stub."""

    def __init__(self, browser: DummyBrowser):
        self._browser = browser

    def launch(self, headless: bool = True) -> DummyBrowser:
        del headless
        return self._browser


class DummyPlaywright:
    """Playwright stub with start/stop."""

    def __init__(self, chromium: Any):
        self.chromium = chromium
        self.stopped = False

    def start(self) -> "DummyPlaywright":
        return self

    def stop(self) -> None:
        self.stopped = True


class DummyAPIResponse:
    """Minimal API response stub for request retries."""

    def __init__(self, status: int, body_text: str):
        self.status = status
        self._body_text = body_text
        self.headers = {"content-type": "application/json"}

    def text(self) -> str:
        return self._body_text


class DummyAPIResponseRaisesText(DummyAPIResponse):
    """API response stub that raises when reading text."""

    def text(self) -> str:
        raise RuntimeError("boom")


class DummyRequest:
    """Minimal request stub for BrowserContext.request.get."""

    def __init__(self, response: DummyAPIResponse):
        self._response = response

    def get(self, _url: str, timeout: int):
        del timeout
        return self._response


class DummyRequestRaises:
    """Request stub that raises on get."""

    def get(self, _url: str, timeout: int):
        raise RuntimeError("boom")


class DummyContextWithRequest:
    """Context stub that provides request.get."""

    def __init__(self, response: DummyAPIResponse):
        self.request = DummyRequest(response)


class DummyContextWithRequestRaises:
    """Context stub that raises on request.get."""

    def __init__(self):
        self.request = DummyRequestRaises()


def test_init_requires_cookie():
    with pytest.raises(ValueError):
        BrowserManager(BrowserConfig(), auth_cookie="")


def test_enter_and_exit_manage_resources(monkeypatch, tmp_path):
    page = DummyPage()
    context = DummyContext(page)
    browser = DummyBrowser(context)
    playwright = DummyPlaywright(DummyChromium(browser))

    monkeypatch.setattr(
        "hb_library_viewer.browser.manager.sync_playwright",
        lambda: playwright,
    )

    manager = BrowserManager(
        BrowserConfig(),
        auth_cookie="cookie",
        api_config=APIConfig(endpoint="https://example.com/"),
        artifacts_dir=tmp_path,
    )
    with manager as active:
        assert active.page is page
        assert context.cookies
        assert context.cookies[0]["url"] == "https://example.com"

    assert context.closed is True
    assert browser.closed is True
    assert playwright.stopped is True


def test_enter_failure_raises_browser_error(monkeypatch, tmp_path):
    class FailingChromium:
        def launch(self, headless: bool = True):
            raise RuntimeError("boom")

    playwright = DummyPlaywright(FailingChromium())

    monkeypatch.setattr(
        "hb_library_viewer.browser.manager.sync_playwright",
        lambda: playwright,
    )

    manager = BrowserManager(
        BrowserConfig(),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )

    with pytest.raises(BrowserError):
        manager.__enter__()


def test_exit_with_none_objects():
    manager = BrowserManager(BrowserConfig(), "cookie", APIConfig())
    manager.playwright = None
    manager.browser = None
    manager.context = None

    manager.__exit__(None, None, None)


def test_cleanup_errors_suppressed(caplog):
    manager = BrowserManager(BrowserConfig(), "cookie", APIConfig())

    mock_context = Mock()
    mock_context.close.side_effect = Exception("Context close failed")
    manager.context = mock_context

    mock_browser = Mock()
    mock_browser.close.side_effect = Exception("Browser close failed")
    manager.browser = mock_browser

    mock_pw = Mock()
    mock_pw.stop.side_effect = Exception("Playwright stop failed")
    manager.playwright = mock_pw

    with caplog.at_level("DEBUG"):
        manager.__exit__(None, None, None)

    assert "Error closing context: Context close failed" in caplog.text
    assert "Error closing browser: Browser close failed" in caplog.text
    assert "Error stopping Playwright: Playwright stop failed" in caplog.text


def test_capture_library_page_returns_result(monkeypatch, tmp_path):
    manager = BrowserManager(
        BrowserConfig(timeout_ms=1000),
        auth_cookie="cookie",
        api_config=APIConfig(endpoint="https://example.com/"),
        artifacts_dir=tmp_path,
    )

    page = Mock()
    page.goto.return_value = FakeNavResponse(status=200)

    def wait_for_load_state(state: str, timeout: int = 0) -> None:
        del timeout
        if state == "domcontentloaded":
            manager.api_responses.clear()
            manager.api_responses.append({"data": json.dumps({"key1": {}})})
            manager.captured_responses.clear()
            manager.captured_responses.append({"data": "{}"})

    page.wait_for_load_state.side_effect = wait_for_load_state

    def evaluate(script: str):
        if "user-home-json-data" in script:
            return ["key1"]
        return None

    page.evaluate.side_effect = evaluate
    manager.page = page

    monkeypatch.setattr(
        "hb_library_viewer.browser.manager.time.sleep",
        lambda *_args, **_kwargs: None,
    )

    result = manager.capture_library_page()

    page.goto.assert_called_once_with(
        "https://example.com/home/library",
        wait_until="domcontentloaded",
        timeout=1000,
    )
    assert result.api_batches == 1
    assert result.captured_responses == 1
    assert result.gamekeys == ["key1"]


def test_capture_library_page_no_response(tmp_path):
    manager = BrowserManager(
        BrowserConfig(timeout_ms=1000),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )
    page = Mock()
    page.goto.return_value = None
    manager.page = page

    with pytest.raises(BrowserError):
        manager.capture_library_page()


def test_capture_library_page_auth_failure(tmp_path):
    manager = BrowserManager(
        BrowserConfig(timeout_ms=1000),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )
    page = Mock()
    page.goto.return_value = FakeNavResponse(status=401)
    manager.page = page

    with pytest.raises(BrowserError):
        manager.capture_library_page()


def test_capture_library_page_detects_auth_failure(monkeypatch, tmp_path):
    manager = BrowserManager(
        BrowserConfig(timeout_ms=1000),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )
    page = Mock()
    page.goto.return_value = FakeNavResponse(status=200)
    manager.page = page

    monkeypatch.setattr(
        "hb_library_viewer.browser.manager.detect_auth_failure",
        lambda _response: "Authentication failed",
    )

    with pytest.raises(BrowserError, match="Authentication failed"):
        manager.capture_library_page()

    assert manager.recorder.capture_enabled is False
    assert manager.captured_responses == []


def test_capture_library_page_forbidden(tmp_path):
    manager = BrowserManager(
        BrowserConfig(timeout_ms=1000),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )
    page = Mock()
    page.goto.return_value = FakeNavResponse(status=403)
    manager.page = page

    with pytest.raises(BrowserError):
        manager.capture_library_page()


def test_capture_library_page_unexpected_status(tmp_path):
    manager = BrowserManager(
        BrowserConfig(timeout_ms=1000),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )
    page = Mock()
    page.goto.return_value = FakeNavResponse(status=500)
    manager.page = page

    with pytest.raises(BrowserError):
        manager.capture_library_page()


def test_capture_library_page_timeouts_and_scroll_error(monkeypatch, tmp_path):
    manager = BrowserManager(
        BrowserConfig(timeout_ms=1000),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )

    page = Mock()
    page.goto.return_value = FakeNavResponse(status=200)

    def wait_for_load_state(state: str, timeout: int = 0) -> None:
        del timeout
        if state in {"load", "networkidle"}:
            raise PlaywrightTimeoutError("timeout")

    page.wait_for_load_state.side_effect = wait_for_load_state

    def evaluate(script: str):
        if "window.scrollTo" in script:
            raise PlaywrightError("scroll")
        if "user-home-json-data" in script:
            return []
        return None

    page.evaluate.side_effect = evaluate
    manager.page = page

    monkeypatch.setattr(
        "hb_library_viewer.browser.manager.time.sleep",
        lambda *_args, **_kwargs: None,
    )

    recorded: dict[str, str] = {}

    def record_html(_responses, *, reason: str, fallback_url: str = "") -> None:
        del fallback_url
        recorded["reason"] = reason

    monkeypatch.setattr(manager.store, "maybe_persist_library_html", record_html)

    result = manager.capture_library_page()

    assert result.api_batches == 0
    assert result.captured_responses == 0
    assert result.gamekeys == []
    assert recorded["reason"] == "no_api_responses"


def test_capture_library_page_missing_keys_error(monkeypatch, tmp_path):
    manager = BrowserManager(
        BrowserConfig(timeout_ms=1000),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )

    page = Mock()
    page.goto.return_value = FakeNavResponse(status=200)

    def wait_for_load_state(state: str, timeout: int = 0) -> None:
        if state == "domcontentloaded":
            manager.api_responses.clear()
            manager.api_responses.append({"data": json.dumps({"key1": {}})})

    page.wait_for_load_state.side_effect = wait_for_load_state
    page.evaluate.return_value = ["key1", "key2"]
    manager.page = page

    monkeypatch.setattr(
        "hb_library_viewer.browser.manager.time.sleep",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(manager, "_fetch_missing_keys", lambda keys: ["key2"])

    with pytest.raises(BrowserError, match="Missing API responses"):
        manager.capture_library_page()


def test_fetch_missing_keys_without_context(tmp_path):
    manager = BrowserManager(
        BrowserConfig(),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )

    missing = manager._fetch_missing_keys(["key1"])
    assert missing == ["key1"]


def test_fetch_missing_keys_with_context_success(tmp_path):
    manager = BrowserManager(
        BrowserConfig(),
        auth_cookie="cookie",
        api_config=APIConfig(
            endpoint="https://example.com",
            timeout=1,
            max_response_batches=7,
            per_key_max_retries=2,
        ),
        artifacts_dir=tmp_path,
    )
    manager.context = cast(Any, DummyContextWithRequest(DummyAPIResponse(200, '{"key1": {}}')))

    missing = manager._fetch_missing_keys(["key1"])

    assert missing == []
    assert manager.api_responses


def test_fetch_missing_keys_with_context_non_200(tmp_path):
    manager = BrowserManager(
        BrowserConfig(),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )
    manager.context = cast(Any, DummyContextWithRequest(DummyAPIResponse(500, "")))

    missing = manager._fetch_missing_keys(["key1"])

    assert missing == ["key1"]
    assert manager.api_responses == []


def test_fetch_missing_keys_with_context_invalid_json(tmp_path):
    manager = BrowserManager(
        BrowserConfig(),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )
    manager.context = cast(Any, DummyContextWithRequest(DummyAPIResponse(200, "not-json")))

    missing = manager._fetch_missing_keys(["key1"])

    assert missing == ["key1"]
    assert manager.api_responses


def test_fetch_missing_keys_with_context_text_error(tmp_path):
    manager = BrowserManager(
        BrowserConfig(),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )
    manager.context = cast(Any, DummyContextWithRequest(DummyAPIResponseRaisesText(200, "")))

    missing = manager._fetch_missing_keys(["key1"])

    assert missing == ["key1"]
    assert manager.api_responses == []


def test_fetch_missing_keys_with_request_exception(tmp_path):
    manager = BrowserManager(
        BrowserConfig(),
        auth_cookie="cookie",
        artifacts_dir=tmp_path,
    )
    manager.context = cast(Any, DummyContextWithRequestRaises())

    missing = manager._fetch_missing_keys(["key1"])

    assert missing == ["key1"]
