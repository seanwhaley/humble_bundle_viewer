"""Unit tests for external subproduct page caching."""

from __future__ import annotations

import json
from pathlib import Path
import threading
import time
from typing import Any
from urllib.parse import urlparse

import pytest
import requests

from hb_library_viewer.config import SubproductPageCacheConfig, SubproductPageHostPolicy
from hb_library_viewer.parsing import LibraryData, Product, Subproduct
from hb_library_viewer.subproducts.pages import service as page_service
from hb_library_viewer.subproducts.pages import (
    BrowserPageFetchResult,
    DomainDiagnosticResult,
    PageCacheOutcome,
    SubproductPageManifestEntry,
    collect_subproduct_page_references,
    filter_subproduct_page_references,
    load_subproduct_page_manifest,
)
from hb_library_viewer.subproducts.pages.service import (
    _record_page_outcome,
    cache_subproduct_pages,
)


class DummyResponse:
    """Minimal response object for requests.get mocking."""

    def __init__(
        self,
        *,
        url: str,
        text: str,
        status_code: int = 200,
        content_type: str = "text/html; charset=utf-8",
        headers: dict[str, str] | None = None,
    ):
        self.url = url
        self.text = text
        self.content = text.encode("utf-8")
        self.status_code = status_code
        self.headers = {"content-type": content_type}
        if headers:
            self.headers.update(headers)

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            error = requests.exceptions.HTTPError(f"HTTP {self.status_code}")
            error.response = self  # type: ignore[attr-defined]
            raise error


class RequestsGetProxySession:
    """Session test double that forwards through the patched requests.get."""

    def get(self, url: str, **kwargs: Any):
        timeout = kwargs.pop("timeout", 30)
        return requests.get(url, timeout=timeout, **kwargs)

    def close(self) -> None:
        return None


def _library_with_info_urls() -> LibraryData:
    return LibraryData(
        products=[
            Product(
                gamekey="bundle-1",
                product_name="Programming Bundle",
                machine_name="programming_bundle",
                category="ebook",
                subproducts=[
                    Subproduct(
                        human_name="Clean Code in JavaScript",
                        machine_name="clean_code_js",
                        url="https://publisher.example.com/books/clean-code-js",
                    ),
                    Subproduct(
                        human_name="Clean Code in JavaScript Duplicate",
                        machine_name="clean_code_js_duplicate",
                        url="https://publisher.example.com/books/clean-code-js",
                    ),
                    Subproduct(
                        human_name="Another Book",
                        machine_name="another_book",
                        url="https://publisher.example.com/books/another-book",
                    ),
                ],
            )
        ],
        total_products=1,
        captured_at="2026-03-10T12:00:00",
    )


class FakeClock:
    """Simple controllable clock for retry/backoff tests."""

    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture(autouse=True)
def patch_http_session(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep tests compatible with the pooled-session implementation."""
    monkeypatch.setattr(page_service, "_build_http_session", RequestsGetProxySession)


@pytest.fixture(autouse=True)
def patch_domain_diagnostics(monkeypatch: pytest.MonkeyPatch) -> None:
    """Avoid real socket probes during unit tests unless a test overrides them."""

    def fake_diagnose(url: str, _cache_config: SubproductPageCacheConfig):
        return DomainDiagnosticResult(
            host=(urlparse(url).netloc or "unknown").lower(),
            status="domain_reachable",
            reason=None,
            checked_at="2026-03-12T00:00:00",
            should_skip=False,
        )

    monkeypatch.setattr(page_service, "_diagnose_domain_connectivity", fake_diagnose)


@pytest.mark.unit
class TestSubproductPageCaching:
    """Verify manifest creation and cache reuse."""

    def test_collect_subproduct_page_references_deduplicates_urls(self):
        references = collect_subproduct_page_references(_library_with_info_urls())

        assert set(references) == {
            "https://publisher.example.com/books/clean-code-js",
            "https://publisher.example.com/books/another-book",
        }
        assert len(references["https://publisher.example.com/books/clean-code-js"]) == 2

    def test_filter_subproduct_page_references_by_query_and_limit(self):
        references = collect_subproduct_page_references(_library_with_info_urls())

        filtered = filter_subproduct_page_references(
            references,
            subproduct_query="another",
            limit=1,
        )

        assert list(filtered) == ["https://publisher.example.com/books/another-book"]

    def test_filter_subproduct_page_references_by_exact_url(self):
        references = collect_subproduct_page_references(_library_with_info_urls())

        filtered = filter_subproduct_page_references(
            references,
            target_url="https://publisher.example.com/books/clean-code-js",
        )

        assert list(filtered) == ["https://publisher.example.com/books/clean-code-js"]

    def test_cache_subproduct_pages_fetches_and_writes_manifest(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(base_dir=tmp_path / "subproduct_pages")

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            return DummyResponse(
                url=url,
                text=f"<html><head><title>{url}</title></head><body>ok</body></html>",
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        summary = cache_subproduct_pages(library, config)
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert summary.requested_urls == 2
        assert summary.processed_urls == 2
        assert summary.fetched_pages == 2
        assert summary.reused_pages == 0
        assert summary.failed_pages == 0
        assert summary.skipped_pages == 0
        assert summary.failure_limit == 5
        assert summary.aborted is False
        assert summary.elapsed_seconds >= 0
        assert summary.failure_breakdown == {}
        assert len(summary.domain_summaries) == 1
        assert summary.domain_summaries[0].host == "publisher.example.com"
        assert summary.domain_summaries[0].fetched_pages == 2
        assert summary.manifest_path.exists()
        assert manifest.total_entries == 2
        assert len(manifest.domain_summaries) == 1
        assert manifest.domain_summaries[0].requested_urls == 2
        assert all(item.html_path for item in manifest.items)
        assert all(
            (config.base_dir / item.html_path).exists()
            for item in manifest.items
            if item.html_path
        )
        assert manifest.items[0].page_title is not None

    def test_cache_subproduct_pages_reuses_existing_files(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(base_dir=tmp_path / "subproduct_pages")
        call_count = {"count": 0}

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            call_count["count"] += 1
            return DummyResponse(
                url=url,
                text=f"<html><head><title>{url}</title></head><body>cached</body></html>",
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        first_summary = cache_subproduct_pages(library, config)
        second_summary = cache_subproduct_pages(library, config)

        assert first_summary.fetched_pages == 2
        assert second_summary.fetched_pages == 0
        assert second_summary.processed_urls == 2
        assert second_summary.reused_pages == 2
        assert call_count["count"] == 2

    def test_cache_subproduct_pages_redownloads_when_forced(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(base_dir=tmp_path / "subproduct_pages")
        call_count = {"count": 0}

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            call_count["count"] += 1
            return DummyResponse(
                url=url,
                text=(
                    "<html><head>"
                    f"<title>fetch-{call_count['count']}-{url}</title>"
                    "</head><body>fresh</body></html>"
                ),
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        cache_subproduct_pages(library, config)
        summary = cache_subproduct_pages(
            library,
            config,
            redownload_existing=True,
        )
        manifest_payload = json.loads(summary.manifest_path.read_text(encoding="utf-8"))

        assert summary.fetched_pages == 2
        assert summary.reused_pages == 0
        assert call_count["count"] == 4
        assert manifest_payload["total_entries"] == 2

    def test_cache_subproduct_pages_limits_to_single_match(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(base_dir=tmp_path / "subproduct_pages")
        requested_urls: list[str] = []

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            requested_urls.append(url)
            return DummyResponse(
                url=url,
                text=f"<html><head><title>{url}</title></head><body>single</body></html>",
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        summary = cache_subproduct_pages(
            library,
            config,
            subproduct_query="another book",
            limit=1,
        )

        assert summary.requested_urls == 1
        assert summary.processed_urls == 1
        assert requested_urls == ["https://publisher.example.com/books/another-book"]

    def test_cache_subproduct_pages_aborts_after_max_failures(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            max_failures=1,
            retry_transport_failures=False,
        )
        requested_urls: list[str] = []

        def fake_get(url: str, **_kwargs: Any):
            requested_urls.append(url)
            raise requests.exceptions.ConnectionError("boom")

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        summary = cache_subproduct_pages(library, config)

        assert summary.requested_urls == 2
        assert summary.processed_urls == 1
        assert summary.failed_pages == 1
        assert summary.skipped_pages == 0
        assert summary.aborted is True
        assert summary.failure_limit == 1
        assert len(requested_urls) == 1

    def test_cache_subproduct_pages_does_not_abort_on_nonconsecutive_failures(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            max_failures=2,
            retry_transport_failures=False,
        )
        responses = iter(
            [
                requests.exceptions.ConnectionError("first"),
                DummyResponse(
                    url="https://publisher.example.com/books/clean-code-js",
                    text="<html><head><title>ok</title></head><body>ok</body></html>",
                ),
                requests.exceptions.ConnectionError("second"),
            ]
        )

        def fake_get(_url: str, **_kwargs: Any):
            outcome = next(responses)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        summary = cache_subproduct_pages(library, config)

        assert summary.requested_urls == 2
        assert summary.processed_urls == 2
        assert summary.failed_pages == 1
        assert summary.fetched_pages == 1
        assert summary.aborted is False

    def test_cache_subproduct_pages_records_http_error_metadata(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(base_dir=tmp_path / "subproduct_pages")

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            return DummyResponse(
                url=url,
                text="<html><head><title>Forbidden Page</title></head><body>blocked</body></html>",
                status_code=403,
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        summary = cache_subproduct_pages(
            library,
            config,
            target_url="https://publisher.example.com/books/another-book",
            max_failures=1,
        )
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert summary.failed_pages == 1
        assert summary.aborted is False
        assert summary.failure_breakdown == {"http_403": 1}
        assert manifest.items[0].domain == "publisher.example.com"
        assert manifest.items[0].status_code == 403
        assert manifest.items[0].page_title == "Forbidden Page"
        assert manifest.items[0].fetched_at is not None

    def test_cache_subproduct_pages_retries_retryable_http_error_before_success(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            retry_backoff_seconds=[2.0],
        )
        responses = iter(
            [
                DummyResponse(
                    url="https://publisher.example.com/books/another-book",
                    text="<html><head><title>Busy</title></head><body>retry</body></html>",
                    status_code=429,
                ),
                DummyResponse(
                    url="https://publisher.example.com/books/another-book",
                    text="<html><head><title>Recovered</title></head><body>ok</body></html>",
                ),
            ]
        )
        clock = FakeClock()

        def fake_get(_url: str, **_kwargs: Any) -> DummyResponse:
            return next(responses)

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        monkeypatch.setattr(page_service.time, "sleep", clock.sleep)
        monkeypatch.setattr(page_service.time, "monotonic", clock.monotonic)

        summary = cache_subproduct_pages(
            library,
            config,
            target_url="https://publisher.example.com/books/another-book",
        )
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert summary.fetched_pages == 1
        assert summary.failed_pages == 0
        assert summary.failure_breakdown == {}
        assert clock.sleeps == [2.0]
        assert manifest.items[0].status_code == 200
        assert manifest.items[0].page_title == "Recovered"
        assert manifest.items[0].recovery_method == "retry_recovery"
        assert manifest.items[0].attempt_count == 2

    def test_cache_subproduct_pages_respects_retry_after_header(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            retry_backoff_seconds=[2.0],
            max_retry_after_seconds=30,
        )
        responses = iter(
            [
                DummyResponse(
                    url="https://publisher.example.com/books/another-book",
                    text="<html><head><title>Rate Limited</title></head><body>retry</body></html>",
                    status_code=429,
                    headers={"Retry-After": "7"},
                ),
                DummyResponse(
                    url="https://publisher.example.com/books/another-book",
                    text="<html><head><title>Recovered</title></head><body>ok</body></html>",
                ),
            ]
        )
        clock = FakeClock()

        def fake_get(_url: str, **_kwargs: Any) -> DummyResponse:
            return next(responses)

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        monkeypatch.setattr(page_service.time, "sleep", clock.sleep)
        monkeypatch.setattr(page_service.time, "monotonic", clock.monotonic)

        summary = cache_subproduct_pages(
            library,
            config,
            target_url="https://publisher.example.com/books/another-book",
        )

        assert summary.fetched_pages == 1
        assert summary.failed_pages == 0
        assert clock.sleeps == [7.0]

    def test_cache_subproduct_pages_applies_host_policy_and_records_provenance(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            retry_backoff_seconds=[2.0],
            host_policies={
                "publisher.example.com": SubproductPageHostPolicy(
                    retry_backoff_seconds=[9.0],
                    rate_limit_delay=1.5,
                )
            },
        )
        responses = iter(
            [
                DummyResponse(
                    url="https://publisher.example.com/books/another-book",
                    text="<html><head><title>Busy</title></head><body>retry</body></html>",
                    status_code=429,
                ),
                DummyResponse(
                    url="https://publisher.example.com/books/another-book-2",
                    text="<html><head><title>Recovered Redirect</title></head><body>ok</body></html>",
                ),
            ]
        )
        clock = FakeClock()

        def fake_get(_url: str, **_kwargs: Any) -> DummyResponse:
            return next(responses)

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        monkeypatch.setattr(page_service.time, "sleep", clock.sleep)
        monkeypatch.setattr(page_service.time, "monotonic", clock.monotonic)

        cache_subproduct_pages(
            library,
            config,
            target_url="https://publisher.example.com/books/another-book",
        )
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert clock.sleeps == [9.0]
        assert manifest.items[0].status_code == 200
        assert manifest.items[0].attempt_count == 2
        assert manifest.items[0].host_policy_applied == "publisher.example.com"
        assert manifest.items[0].replacement_url == (
            "https://publisher.example.com/books/another-book-2"
        )
        assert manifest.items[0].recovery_method == "retry_redirected"

    def test_cache_subproduct_pages_uses_packt_site_search_after_404(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = LibraryData(
            products=[
                Product(
                    gamekey="bundle-1",
                    product_name="Humble Book Bundle: Big Data by Packt",
                    machine_name="bigdata_bookbundle",
                    category="ebook",
                    subproducts=[
                        Subproduct(
                            human_name="Apache Hive Essentials",
                            machine_name="apachehiveessentials",
                            url="https://www.packtpub.com/application-development/apache-hive-essentials-second-edition",
                        )
                    ],
                )
            ],
            total_products=1,
            captured_at="2026-03-10T12:00:00",
        )
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            host_policies={
                "www.packtpub.com": SubproductPageHostPolicy(
                    search_on_404=True,
                    min_match_confidence=0.92,
                )
            },
        )
        search_queries: list[str] = []

        def fake_get(url: str, params: dict[str, str] | None = None, **_kwargs: Any):
            if (
                url
                == "https://www.packtpub.com/application-development/apache-hive-essentials-second-edition"
            ):
                return DummyResponse(
                    url=url,
                    text="<html><head><title>Page not found - 404</title></head><body>missing</body></html>",
                    status_code=404,
                )
            if url == "https://www.packtpub.com/en-us/search":
                search_queries.append((params or {}).get("q", ""))
                return DummyResponse(
                    url=f"{url}?q=Apache+Hive+Essentials",
                    text=(
                        "<html><body>"
                        '<a href="https://www.packtpub.com/en-us/product/apache-hive-essentials-9781782175056">'
                        "Apache Hive Essentials"
                        "</a>"
                        "</body></html>"
                    ),
                )
            if (
                url
                == "https://www.packtpub.com/en-us/product/apache-hive-essentials-9781782175056"
            ):
                return DummyResponse(
                    url=url,
                    text="<html><head><title>Apache Hive Essentials | Packt</title></head><body>ok</body></html>",
                )
            raise AssertionError(f"Unexpected URL requested: {url} params={params}")

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        summary = cache_subproduct_pages(library, config)
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert summary.fetched_pages == 1
        assert summary.failed_pages == 0
        assert search_queries[0] == "Apache Hive Essentials"
        assert "apache hive essentials second edition" in search_queries
        assert manifest.items[0].recovery_method == "site_search_match"
        assert manifest.items[0].replacement_url == (
            "https://www.packtpub.com/en-us/product/apache-hive-essentials-9781782175056"
        )
        assert manifest.items[0].search_query == "Apache Hive Essentials"
        assert manifest.items[0].recovery_confidence is not None
        assert manifest.items[0].recovery_confidence >= 0.92
        assert manifest.items[0].attempt_count == 4
        assert manifest.items[0].host_policy_applied == "www.packtpub.com"

    def test_cache_subproduct_pages_prefers_blacklibrary_audio_search_match(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = LibraryData(
            products=[
                Product(
                    gamekey="bundle-1",
                    product_name="Humble Audiobook Bundle: Voices from the Worlds of Warhammer",
                    machine_name="voicesfromtheworldsofwarhammeraudio_bookbundle",
                    category="audio",
                    subproducts=[
                        Subproduct(
                            human_name="The Realmgate Wars: The Beasts of Cartha",
                            machine_name="therealmgatewars_thebeastsofcartha",
                            url="https://www.blacklibrary.com/audio/age-of-sigmar-audio-dramas/beasts-of-cartha-mp3.html",
                        )
                    ],
                )
            ],
            total_products=1,
            captured_at="2026-03-10T12:00:00",
        )
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            host_policies={
                "www.blacklibrary.com": SubproductPageHostPolicy(
                    search_on_404=True,
                    min_match_confidence=0.9,
                )
            },
        )
        fetched_candidates: list[str] = []

        def fake_get(url: str, params: dict[str, str] | None = None, **_kwargs: Any):
            if (
                url
                == "https://www.blacklibrary.com/audio/age-of-sigmar-audio-dramas/beasts-of-cartha-mp3.html"
            ):
                return DummyResponse(
                    url=url,
                    text="<html><head><title>Black Library - Page not found</title></head><body>missing</body></html>",
                    status_code=404,
                )
            if url == "https://www.blacklibrary.com/Home/Search-Results.html":
                assert params is not None
                assert "beasts of cartha" in params.get("filter_value", "").lower()
                return DummyResponse(
                    url="https://www.blacklibrary.com/Home/Search-Results.html?filter_value=Beasts+of+Cartha",
                    text=(
                        "<html><body>"
                        '<a href="https://www.blacklibrary.com/warhammer-age-of-sigmar/novels/the-beasts-of-cartha-ebook.html">'
                        "The Beasts of Cartha"
                        "</a>"
                        '<a href="https://www.blacklibrary.com/audio/age-of-sigmar-audiobooks/beasts-of-cartha-mp3.html">'
                        "The Beasts of Cartha"
                        "</a>"
                        "</body></html>"
                    ),
                )
            if url in {
                "https://www.blacklibrary.com/warhammer-age-of-sigmar/novels/the-beasts-of-cartha-ebook.html",
                "https://www.blacklibrary.com/audio/age-of-sigmar-audiobooks/beasts-of-cartha-mp3.html",
            }:
                fetched_candidates.append(url)
                return DummyResponse(
                    url=url,
                    text="<html><head><title>The Beasts of Cartha | Black Library</title></head><body>ok</body></html>",
                )
            raise AssertionError(f"Unexpected URL requested: {url} params={params}")

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        summary = cache_subproduct_pages(library, config)
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert summary.fetched_pages == 1
        assert summary.failed_pages == 0
        assert fetched_candidates == [
            "https://www.blacklibrary.com/audio/age-of-sigmar-audiobooks/beasts-of-cartha-mp3.html"
        ]
        assert manifest.items[0].recovery_method == "site_search_match"
        assert manifest.items[0].replacement_url == (
            "https://www.blacklibrary.com/audio/age-of-sigmar-audiobooks/beasts-of-cartha-mp3.html"
        )
        assert manifest.items[0].search_query is not None
        assert "Beasts of Cartha" in manifest.items[0].search_query
        assert manifest.items[0].recovery_confidence is not None
        assert manifest.items[0].recovery_confidence >= 0.9
        assert manifest.items[0].host_policy_applied == "www.blacklibrary.com"

    def test_cache_subproduct_pages_retries_transport_failure_before_success(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            retry_backoff_seconds=[3.0],
        )
        responses = iter(
            [
                requests.exceptions.ConnectionError("connection reset by peer"),
                DummyResponse(
                    url="https://publisher.example.com/books/another-book",
                    text="<html><head><title>Recovered</title></head><body>ok</body></html>",
                ),
            ]
        )
        clock = FakeClock()

        def fake_get(_url: str, **_kwargs: Any):
            outcome = next(responses)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        monkeypatch.setattr(page_service.time, "sleep", clock.sleep)
        monkeypatch.setattr(page_service.time, "monotonic", clock.monotonic)

        summary = cache_subproduct_pages(
            library,
            config,
            target_url="https://publisher.example.com/books/another-book",
        )

        assert summary.fetched_pages == 1
        assert summary.failed_pages == 0
        assert summary.failure_breakdown == {}
        assert clock.sleeps == [3.0]

    def test_cache_subproduct_pages_does_not_abort_on_consecutive_http_errors(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(base_dir=tmp_path / "subproduct_pages")

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            return DummyResponse(
                url=url,
                text="<html><head><title>Gone</title></head><body>missing</body></html>",
                status_code=404,
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        summary = cache_subproduct_pages(library, config, max_failures=1)
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert summary.requested_urls == 2
        assert summary.processed_urls == 2
        assert summary.failed_pages == 2
        assert summary.aborted is False
        assert summary.failure_breakdown == {"http_404": 2}
        assert [item.status_code for item in manifest.items] == [404, 404]

    def test_cache_subproduct_pages_does_not_retry_nonretryable_http_error(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            retry_backoff_seconds=[2.0],
        )
        call_count = {"count": 0}
        clock = FakeClock()

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            call_count["count"] += 1
            return DummyResponse(
                url=url,
                text="<html><head><title>Forbidden</title></head><body>blocked</body></html>",
                status_code=403,
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        monkeypatch.setattr(page_service.time, "sleep", clock.sleep)
        monkeypatch.setattr(page_service.time, "monotonic", clock.monotonic)

        summary = cache_subproduct_pages(
            library,
            config,
            target_url="https://publisher.example.com/books/another-book",
        )

        assert summary.failed_pages == 1
        assert summary.failure_breakdown == {"http_403": 1}
        assert call_count["count"] == 1
        assert clock.sleeps == []

    def test_cache_subproduct_pages_records_http_failure_provenance(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(base_dir=tmp_path / "subproduct_pages")

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            return DummyResponse(
                url=f"{url}?blocked=1",
                text="<html><head><title>Forbidden</title></head><body>blocked</body></html>",
                status_code=403,
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        cache_subproduct_pages(
            library,
            config,
            target_url="https://publisher.example.com/books/another-book",
        )
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert manifest.items[0].recovery_method == "http_failure"
        assert manifest.items[0].recovery_confidence is None
        assert manifest.items[0].search_query is None
        assert manifest.items[0].attempt_count == 1
        assert manifest.items[0].replacement_url == (
            "https://publisher.example.com/books/another-book?blocked=1"
        )

    def test_cache_subproduct_pages_uses_browser_fallback_for_host_policy(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            host_policies={
                "publisher.example.com": SubproductPageHostPolicy(
                    browser_fallback=True,
                )
            },
        )

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            return DummyResponse(
                url=url,
                text="<html><head><title>Forbidden</title></head><body>blocked</body></html>",
                status_code=403,
            )

        browser_calls: list[str] = []

        def fake_browser_fetch(
            url: str,
            _browser_config,
            _request_policy,
        ) -> BrowserPageFetchResult:
            browser_calls.append(url)
            return BrowserPageFetchResult(
                final_url=f"{url}/landing",
                page_title="Recovered in Browser",
                status_code=200,
                content_type="text/html; charset=utf-8",
                content_length_bytes=42,
                html_text="<html><head><title>Recovered in Browser</title></head><body>ok</body></html>",
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        monkeypatch.setattr(page_service, "_fetch_page_via_browser", fake_browser_fetch)

        summary = cache_subproduct_pages(
            library,
            config,
            target_url="https://publisher.example.com/books/another-book",
        )
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert summary.fetched_pages == 1
        assert summary.failed_pages == 0
        assert browser_calls == ["https://publisher.example.com/books/another-book"]
        assert manifest.items[0].recovery_method == "browser_fallback_redirected"
        assert manifest.items[0].attempt_count == 2
        assert manifest.items[0].host_policy_applied == "publisher.example.com"
        assert manifest.items[0].replacement_url == (
            "https://publisher.example.com/books/another-book/landing"
        )

    def test_cache_subproduct_pages_records_browser_fallback_failure_provenance(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            host_policies={
                "publisher.example.com": SubproductPageHostPolicy(
                    browser_fallback=True,
                )
            },
        )

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            return DummyResponse(
                url=url,
                text="<html><head><title>Forbidden</title></head><body>blocked</body></html>",
                status_code=403,
            )

        def fake_browser_fetch(_url: str, *_args: Any, **_kwargs: Any):
            raise RuntimeError("browser blocked")

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        monkeypatch.setattr(page_service, "_fetch_page_via_browser", fake_browser_fetch)

        summary = cache_subproduct_pages(
            library,
            config,
            target_url="https://publisher.example.com/books/another-book",
        )
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert summary.failed_pages == 1
        assert manifest.items[0].recovery_method == "http_failure"
        assert manifest.items[0].attempt_count == 2
        assert "browser_fallback=browser blocked" in (manifest.items[0].error or "")

    def test_cache_subproduct_pages_logs_progress_summary(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        caplog: pytest.LogCaptureFixture,
    ):
        library = _library_with_info_urls()
        config = SubproductPageCacheConfig(base_dir=tmp_path / "subproduct_pages")

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            return DummyResponse(
                url=url,
                text=f"<html><head><title>{url}</title></head><body>ok</body></html>",
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        with caplog.at_level("INFO"):
            cache_subproduct_pages(library, config)

        assert "Caching 2 subproduct info URL(s) into" in caplog.text
        assert "Subproduct page cache progress: 2/2" in caplog.text
        assert "Domain run summary" in caplog.text

    def test_cache_subproduct_pages_groups_urls_by_domain_before_fetching(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = LibraryData(
            products=[
                Product(
                    gamekey="bundle-1",
                    product_name="Mixed Domains",
                    machine_name="mixed_domains",
                    category="ebook",
                    subproducts=[
                        Subproduct(
                            human_name="Zeta One",
                            machine_name="zeta_one",
                            url="https://zeta.example.com/books/one",
                        ),
                        Subproduct(
                            human_name="Alpha One",
                            machine_name="alpha_one",
                            url="https://alpha.example.com/books/one",
                        ),
                        Subproduct(
                            human_name="Zeta Two",
                            machine_name="zeta_two",
                            url="https://zeta.example.com/books/two",
                        ),
                        Subproduct(
                            human_name="Alpha Two",
                            machine_name="alpha_two",
                            url="https://alpha.example.com/books/two",
                        ),
                    ],
                )
            ],
            total_products=1,
            captured_at="2026-03-10T12:00:00",
        )
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            domain_workers=1,
        )
        requested_urls: list[str] = []

        def fake_get(url: str, **_kwargs: Any) -> DummyResponse:
            requested_urls.append(url)
            return DummyResponse(
                url=url,
                text=f"<html><head><title>{url}</title></head><body>ok</body></html>",
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)

        cache_subproduct_pages(library, config)

        assert requested_urls == [
            "https://alpha.example.com/books/one",
            "https://alpha.example.com/books/two",
            "https://zeta.example.com/books/one",
            "https://zeta.example.com/books/two",
        ]

    def test_cache_subproduct_pages_skips_remaining_urls_for_bad_domain(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        library = LibraryData(
            products=[
                Product(
                    gamekey="bundle-1",
                    product_name="Mixed Domains",
                    machine_name="mixed_domains",
                    category="ebook",
                    subproducts=[
                        Subproduct(
                            human_name="Dead One",
                            machine_name="dead_one",
                            url="https://dead.example.com/books/one",
                        ),
                        Subproduct(
                            human_name="Dead Two",
                            machine_name="dead_two",
                            url="https://dead.example.com/books/two",
                        ),
                        Subproduct(
                            human_name="Live One",
                            machine_name="live_one",
                            url="https://live.example.com/books/one",
                        ),
                    ],
                )
            ],
            total_products=1,
            captured_at="2026-03-10T12:00:00",
        )
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            domain_workers=1,
            retry_transport_failures=False,
        )
        requested_urls: list[str] = []

        def fake_get(url: str, **_kwargs: Any):
            requested_urls.append(url)
            if "dead.example.com" in url:
                raise requests.exceptions.ConnectionError("Failed to resolve host")
            return DummyResponse(
                url=url,
                text="<html><head><title>Live</title></head><body>ok</body></html>",
            )

        monkeypatch.setattr(page_service.requests, "get", fake_get)
        monkeypatch.setattr(
            page_service,
            "_diagnose_domain_connectivity",
            lambda _url, _cache_config: DomainDiagnosticResult(
                host="dead.example.com",
                status="dns_unresolved",
                reason="mocked nxdomain",
                checked_at="2026-03-12T00:00:00",
                should_skip=True,
            ),
        )

        summary = cache_subproduct_pages(library, config)
        manifest = load_subproduct_page_manifest(config.base_dir)

        assert requested_urls == [
            "https://dead.example.com/books/one",
            "https://live.example.com/books/one",
        ]
        assert summary.failed_pages == 2
        assert summary.skipped_pages == 1
        assert summary.failure_breakdown == {
            "dns_resolution": 1,
            "skipped_bad_domain": 1,
        }
        dead_summary = next(
            item for item in summary.domain_summaries if item.host == "dead.example.com"
        )
        assert dead_summary.failed_pages == 2
        assert dead_summary.skipped_pages == 1
        assert dead_summary.failure_breakdown == {
            "dns_resolution": 1,
            "skipped_bad_domain": 1,
        }
        dead_entries = [
            item for item in manifest.items if item.domain == "dead.example.com"
        ]
        manifest_dead_summary = next(
            item
            for item in manifest.domain_summaries
            if item.host == "dead.example.com"
        )
        assert manifest_dead_summary.domain_status_breakdown == {"dns_unresolved": 2}
        assert dead_entries[0].domain_status == "dns_unresolved"
        assert dead_entries[1].recovery_method == "skipped_bad_domain"

    def test_cache_subproduct_pages_can_process_domains_on_multiple_threads(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        thread_names: list[str] = []
        barrier = threading.Barrier(2)

        def fake_process_domain_batch(**kwargs: Any) -> None:
            thread_names.append(threading.current_thread().name)
            barrier.wait(timeout=1)
            time.sleep(0.05)
            shared_state = kwargs["shared_state"]
            host = kwargs["host"]
            for url, references in kwargs["url_items"]:
                manifest_entry = SubproductPageManifestEntry(
                    url=url,
                    references=references,
                    html_path=f"pages/{host}.html",
                    fetched_at="2026-03-12T00:00:00",
                    recovery_method="direct_fetch",
                    domain=host,
                    domain_status="domain_reachable",
                    domain_checked_at="2026-03-12T00:00:00",
                )
                _record_page_outcome(
                    shared_state,
                    url=url,
                    outcome=PageCacheOutcome(
                        entry=manifest_entry,
                        outcome="fetched live",
                        fetched=1,
                    ),
                )

        library = LibraryData(
            products=[
                Product(
                    gamekey="bundle-1",
                    product_name="Mixed Domains",
                    machine_name="mixed_domains",
                    category="ebook",
                    subproducts=[
                        Subproduct(
                            human_name="Alpha One",
                            machine_name="alpha_one",
                            url="https://alpha.example.com/books/one",
                        ),
                        Subproduct(
                            human_name="Beta One",
                            machine_name="beta_one",
                            url="https://beta.example.com/books/one",
                        ),
                    ],
                )
            ],
            total_products=1,
            captured_at="2026-03-10T12:00:00",
        )
        config = SubproductPageCacheConfig(
            base_dir=tmp_path / "subproduct_pages",
            domain_workers=2,
        )

        monkeypatch.setattr(
            page_service, "_process_domain_batch", fake_process_domain_batch
        )

        summary = cache_subproduct_pages(library, config)

        assert summary.fetched_pages == 2
        assert len(set(thread_names)) >= 2
