"""Unit tests for subproduct page search recovery helpers."""

from __future__ import annotations

from typing import Any, cast

import pytest

from hb_library_viewer.config import SubproductPageCacheConfig
from hb_library_viewer.subproducts.pages.models import (
    SubproductPageReference,
    SubproductPageRequestPolicy,
)
from hb_library_viewer.subproducts.pages.search import (
    attempt_site_search_recovery,
    build_site_search_queries,
    extract_site_search_candidates,
    score_search_candidate,
)


class FakeResponse:
    """Small response stub used for site-search tests."""

    def __init__(self, url: str, text: str, *, status_code: int = 200):
        self.url = url
        self.text = text
        self.status_code = status_code
        self.headers = {"content-type": "text/html"}
        self.content = text.encode("utf-8")

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


@pytest.mark.unit
class TestSubproductPageSearch:
    """Behavior tests for search query generation and recovery."""

    def test_build_site_search_queries_combines_reference_and_url_variants(self):
        queries = build_site_search_queries(
            "https://www.packtpub.com/product/python-testing-9781801076203",
            [
                SubproductPageReference(
                    subproduct_name="Python Testing, 2nd Edition",
                    product_name="Python Bundle",
                )
            ],
        )

        assert queries[0] == "Python Testing, 2nd Edition"
        assert "Python Testing" in queries

    def test_extract_site_search_candidates_for_black_library(self):
        html_text = """
        <html><body>
          <a href="/warhammer-40000/novels/ebook-spear-of-the-emperor-eng-2020.html">
            Spear of the Emperor
          </a>
          <a href="/home/ignored.html">Home</a>
        </body></html>
        """

        candidates = extract_site_search_candidates(
            "www.blacklibrary.com",
            "https://www.blacklibrary.com/Home/Search-Results.html",
            html_text,
        )

        assert candidates == [
            (
                "https://www.blacklibrary.com/warhammer-40000/novels/ebook-spear-of-the-emperor-eng-2020.html",
                "Spear of the Emperor",
            )
        ]

    def test_score_search_candidate_applies_matching_format_bonus(self):
        ebook_score = score_search_candidate(
            candidate_title="Python Testing",
            query_variants=["Python Testing"],
            candidate_url="https://example.com/ebook/python-testing",
            expected_format="ebook",
            query_subset_score=0.9,
            candidate_subset_score=0.8,
            matching_format_bonus=0.05,
            mismatched_format_penalty=0.15,
        )
        audio_score = score_search_candidate(
            candidate_title="Python Testing",
            query_variants=["Python Testing"],
            candidate_url="https://example.com/audio/python-testing",
            expected_format="ebook",
            query_subset_score=0.9,
            candidate_subset_score=0.8,
            matching_format_bonus=0.05,
            mismatched_format_penalty=0.15,
        )

        assert ebook_score == 1.0
        assert audio_score < ebook_score

    def test_attempt_site_search_recovery_returns_best_candidate(self):
        cache_config = SubproductPageCacheConfig()
        request_policy = SubproductPageRequestPolicy(
            host="www.packtpub.com",
            rate_limit_delay=0.5,
            retry_statuses=[],
            retry_backoff_seconds=[],
            respect_retry_after=True,
            max_retry_after_seconds=30,
            retry_transport_failures=False,
            min_match_confidence=0.9,
            search_on_404=True,
        )
        references = [SubproductPageReference(subproduct_name="Python Testing")]
        search_html = """
        <html><body>
          <a href="https://www.packtpub.com/en-us/product/python-testing-9781801076203">
            Python Testing
          </a>
        </body></html>
        """

        def request_page(url: str, params=None):
            if params is not None:
                return FakeResponse(url, search_html)
            return FakeResponse(
                "https://www.packtpub.com/en-us/product/python-testing-9781801076203",
                "<html><title>Python Testing</title><body>content</body></html>",
            )

        result = attempt_site_search_recovery(
            "https://www.packtpub.com/product/python-testing-9781801076203",
            references,
            cache_config,
            request_policy,
            cast(Any, request_page),
            extract_title=lambda html: (
                "Python Testing" if "<title>Python Testing</title>" in html else None
            ),
        )

        assert result is not None
        assert result.page_title == "Python Testing"
        assert result.search_query == "Python Testing"
        assert result.recovery_confidence >= 0.9
