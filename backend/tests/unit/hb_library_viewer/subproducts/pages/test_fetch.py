"""Unit tests for subproduct page fetch and diagnostic helpers."""

from __future__ import annotations

# pylint: disable=too-few-public-methods

from email.utils import format_datetime
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import socket
from typing import Any, cast

import pytest
import requests

from hb_library_viewer.config import (
    BrowserConfig,
    SubproductPageCacheConfig,
    SubproductPageHostPolicy,
)
from hb_library_viewer.subproducts.pages import fetch as page_fetch
from hb_library_viewer.subproducts.pages.fetch import (
    apply_domain_metadata,
    build_http_session,
    classify_request_failure,
    diagnose_domain_connectivity,
    fetch_page_via_browser,
    http_retry_delay_seconds,
    parse_retry_after_seconds,
    request_failure_retry_delay_seconds,
    request_timeout_seconds,
    resolve_request_policy,
    should_diagnose_domain,
    skipped_domain_entry,
)
from hb_library_viewer.subproducts.pages.models import (
    DomainDiagnosticResult,
    SubproductPageManifestEntry,
    SubproductPageRequestPolicy,
)


class DummyResponse:
    """Small response stub for retry-delay tests."""

    def __init__(self, status_code: int, retry_after: str | None = None):
        self.status_code = status_code
        self.headers = {}
        if retry_after is not None:
            self.headers["Retry-After"] = retry_after


class _SocketContext:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _TlsContext(_SocketContext):
    def do_handshake(self):
        return None


class _SslContext:
    def wrap_socket(self, _sock, server_hostname=None):
        del _sock
        del server_hostname
        return _TlsContext()


@pytest.mark.unit
class TestSubproductPageFetch:
    """Behavior tests for request policy and diagnostic helpers."""

    def test_parse_retry_after_seconds_supports_delta_and_http_date(self):
        assert parse_retry_after_seconds("5") == 5.0
        assert parse_retry_after_seconds("") is None
        assert parse_retry_after_seconds("not-a-date") is None

        future = datetime.now(timezone.utc) + timedelta(seconds=30)
        parsed = parse_retry_after_seconds(format_datetime(future))
        assert parsed is not None
        assert 0 <= parsed <= 30

    def test_build_http_session_and_request_timeout_seconds(self):
        session = build_http_session()
        try:
            assert "https://" in session.adapters
            assert request_timeout_seconds(SubproductPageCacheConfig()) == (10.0, 30.0)
        finally:
            session.close()

    def test_http_retry_delay_seconds_honors_retry_after_cap(self):
        request_policy = SubproductPageRequestPolicy(
            host="example.com",
            rate_limit_delay=0.5,
            retry_statuses=[429],
            retry_backoff_seconds=[5.0],
            respect_retry_after=True,
            max_retry_after_seconds=12,
            retry_transport_failures=True,
            min_match_confidence=0.9,
        )

        delay = http_retry_delay_seconds(
            cast(Any, DummyResponse(429, retry_after="20")),
            request_policy,
            0,
        )
        assert delay == 12

    def test_request_failure_retry_delay_seconds_and_classification(self):
        request_policy = SubproductPageRequestPolicy(
            host="example.com",
            rate_limit_delay=0.5,
            retry_statuses=[],
            retry_backoff_seconds=[1.0, 2.0],
            respect_retry_after=True,
            max_retry_after_seconds=10,
            retry_transport_failures=True,
            min_match_confidence=0.9,
        )

        assert (
            classify_request_failure(requests.RequestException("timed out"))
            == "timeout"
        )
        assert (
            classify_request_failure(
                requests.RequestException("certificate verify failed")
            )
            == "ssl_error"
        )
        assert (
            classify_request_failure(
                requests.RequestException("Failed to resolve host")
            )
            == "dns_resolution"
        )
        assert request_failure_retry_delay_seconds("timeout", request_policy, 1) == 2.0
        assert request_failure_retry_delay_seconds("timeout", request_policy, 5) is None
        assert should_diagnose_domain("timeout") is True
        assert should_diagnose_domain("http_404") is False

    def test_resolve_request_policy_applies_host_overrides(self):
        cache_config = SubproductPageCacheConfig(
            host_policies={
                "example.com": SubproductPageHostPolicy(
                    rate_limit_delay=2.0,
                    browser_fallback=True,
                    search_on_404=True,
                    min_match_confidence=0.95,
                )
            }
        )

        policy = resolve_request_policy("https://example.com/book", cache_config)

        assert policy.rate_limit_delay == 2.0
        assert policy.browser_fallback is True
        assert policy.search_on_404 is True
        assert policy.min_match_confidence == 0.95
        assert policy.host_policy_applied == "example.com"

    def test_apply_domain_metadata_and_skipped_domain_entry(self):
        diagnostic = DomainDiagnosticResult(
            host="example.com",
            status="dns_unresolved",
            reason="gaierror",
            checked_at="2026-01-31T00:00:00",
            should_skip=True,
        )
        entry = apply_domain_metadata(
            SubproductPageManifestEntry(url="https://example.com/book"),
            host="example.com",
            diagnostic=diagnostic,
        )
        request_policy = SubproductPageRequestPolicy(
            host="example.com",
            rate_limit_delay=0.5,
            retry_statuses=[],
            retry_backoff_seconds=[],
            respect_retry_after=True,
            max_retry_after_seconds=10,
            retry_transport_failures=True,
            min_match_confidence=0.9,
            host_policy_applied="example.com",
        )

        skipped = skipped_domain_entry(
            url="https://example.com/book",
            references=[],
            host="example.com",
            diagnostic=diagnostic,
            request_policy=request_policy,
        )

        assert entry.domain_status == "dns_unresolved"
        assert skipped.host_policy_applied == "example.com"
        assert skipped.error == "gaierror"

    def test_apply_domain_metadata_defaults_to_unchecked(self):
        entry = apply_domain_metadata(
            SubproductPageManifestEntry(url="https://example.com/book"),
            host="example.com",
        )

        assert entry.domain == "example.com"
        assert entry.domain_status == "domain_unchecked"

    def test_diagnose_domain_connectivity_handles_invalid_host(self):
        diagnostic = diagnose_domain_connectivity(
            "https:///missing-host", SubproductPageCacheConfig()
        )
        assert diagnostic.status == "invalid_host"
        assert diagnostic.should_skip is True

    def test_diagnose_domain_connectivity_handles_dns_and_reachable_hosts(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(
            page_fetch.socket,
            "getaddrinfo",
            lambda *_args, **_kwargs: [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))
            ],
        )
        monkeypatch.setattr(
            page_fetch.socket,
            "create_connection",
            lambda *_args, **_kwargs: _SocketContext(),
        )
        monkeypatch.setattr(
            page_fetch.ssl,
            "create_default_context",
            _SslContext,
        )

        reachable = diagnose_domain_connectivity(
            "https://example.com/book",
            SubproductPageCacheConfig(),
        )

        assert reachable.status == "domain_reachable"
        assert reachable.should_skip is False

        def raise_dns(*_args, **_kwargs):
            raise socket.gaierror("no such host")

        monkeypatch.setattr(page_fetch.socket, "getaddrinfo", raise_dns)
        dns_failure = diagnose_domain_connectivity(
            "https://example.com/book",
            SubproductPageCacheConfig(),
        )
        assert dns_failure.status == "dns_unresolved"
        assert dns_failure.should_skip is True

    def test_fetch_page_via_browser_uses_playwright_result(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        fake_response = SimpleNamespace(
            url="https://example.com/final",
            status=200,
            headers={"content-type": "text/html"},
        )
        fake_page = SimpleNamespace(
            goto=lambda *args, **kwargs: fake_response,
            wait_for_load_state=lambda *args, **kwargs: None,
            content=lambda: "<html><title>Browser Title</title></html>",
            title=lambda: "Browser Title",
            url="https://example.com/final",
        )
        fake_context = SimpleNamespace(
            new_page=lambda: fake_page,
            close=lambda: None,
        )
        fake_browser = SimpleNamespace(
            new_context=lambda **_kwargs: fake_context,
            close=lambda: None,
        )
        fake_playwright = SimpleNamespace(
            chromium=SimpleNamespace(launch=lambda **_kwargs: fake_browser),
            stop=lambda: None,
        )
        monkeypatch.setattr(
            page_fetch,
            "sync_playwright",
            lambda: SimpleNamespace(start=lambda: fake_playwright),
        )

        result = fetch_page_via_browser(
            "https://example.com/book",
            BrowserConfig(headless=True, timeout_ms=5000, user_agent="test-agent"),
            SubproductPageRequestPolicy(
                host="example.com",
                rate_limit_delay=0.5,
                retry_statuses=[],
                retry_backoff_seconds=[],
                respect_retry_after=True,
                max_retry_after_seconds=10,
                retry_transport_failures=True,
                min_match_confidence=0.9,
            ),
        )

        assert result.final_url == "https://example.com/final"
        assert result.page_title == "Browser Title"
        assert result.status_code == 200
