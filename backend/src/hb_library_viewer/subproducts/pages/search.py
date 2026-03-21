"""Search and title-matching helpers for subproduct page recovery."""

from __future__ import annotations

from difflib import SequenceMatcher
from html import unescape
from pathlib import Path
import re
from typing import Callable
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
import requests

from ...config import SubproductPageCacheConfig
from .models import (
    SiteSearchCandidate,
    SiteSearchFetchResult,
    SubproductPageReference,
    SubproductPageRequestPolicy,
)

_SLUG_RE = re.compile(r"[^a-z0-9]+")
_EDITION_SUFFIX_RE = re.compile(
    r"(?:,\s*)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+edition$",
    re.IGNORECASE,
)
_PACKT_ISBN_SUFFIX_RE = re.compile(r"-\d{10,13}$")
_BLACKLIBRARY_SUFFIX_RE = re.compile(r"-(?:eng|de|fr|es|cs)(?:-\d{4})?$", re.IGNORECASE)


def normalize_search_text(value: str | None) -> str:
    """Normalize text for title matching and search candidate scoring."""
    if not value:
        return ""
    normalized = _SLUG_RE.sub(" ", unescape(value).lower())
    return " ".join(normalized.split())


def dedupe_preserving_order(values: list[str]) -> list[str]:
    """Return de-duplicated strings while preserving their original order."""
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        cleaned = " ".join(value.split()).strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(cleaned)
    return ordered


def title_query_variants(title: str | None) -> list[str]:
    """Build plausible title query variants for site-search recovery."""
    if not title:
        return []

    normalized_title = " ".join(unescape(title).split()).strip()
    if not normalized_title:
        return []

    variants = [normalized_title]
    edition_stripped = _EDITION_SUFFIX_RE.sub("", normalized_title).strip(" ,:-")
    if edition_stripped and edition_stripped != normalized_title:
        variants.append(edition_stripped)

    for value in list(variants):
        if ":" in value:
            variants.append(value.rsplit(":", maxsplit=1)[-1].strip())
        if " - " in value:
            variants.append(value.rsplit(" - ", maxsplit=1)[-1].strip())

    return dedupe_preserving_order(variants)


def query_variant_from_url(url: str) -> str | None:
    """Infer a readable search query from a source URL slug."""
    path_name = Path(urlparse(url).path).name
    if not path_name:
        return None
    slug = path_name.removesuffix(".html")
    slug = _PACKT_ISBN_SUFFIX_RE.sub("", slug)
    slug = _BLACKLIBRARY_SUFFIX_RE.sub("", slug)
    slug = re.sub(r"(?i)-(?:ebook|mp3|audio|audiobook|video)(?=-|$)", "", slug)
    query = " ".join(slug.replace("-", " ").split()).strip()
    return query or None


def build_site_search_queries(
    url: str,
    references: list[SubproductPageReference],
) -> list[str]:
    """Build de-duplicated search queries from references and URL slugs."""
    queries: list[str] = []
    for reference in references:
        queries.extend(title_query_variants(reference.subproduct_name))
    slug_query = query_variant_from_url(url)
    if slug_query:
        queries.extend(title_query_variants(slug_query))
    return dedupe_preserving_order(queries)


def infer_expected_format_hint(
    url: str,
    references: list[SubproductPageReference],
) -> str | None:
    """Infer whether a URL is expected to resolve to ebook or audio content."""
    lowered_url = url.lower()
    if any(token in lowered_url for token in ("mp3", "/audio/", "audiobook")):
        return "audio"
    if "ebook" in lowered_url:
        return "ebook"

    product_names = " ".join(
        (reference.product_name or "")
        for reference in references
        if reference.product_name
    ).lower()
    if "audiobook" in product_names or "audio bundle" in product_names:
        return "audio"
    return None


def infer_candidate_format_hint(url: str) -> str | None:
    """Infer whether a candidate URL points to ebook or audio content."""
    lowered_path = urlparse(url).path.lower()
    if any(token in lowered_path for token in ("mp3", "/audio/", "audiobook")):
        return "audio"
    if any(token in lowered_path for token in ("ebook", "/novels/", "/all-products/")):
        return "ebook"
    return None


def packt_title_from_candidate_url(url: str) -> str | None:
    """Infer a Packt title from a candidate URL path."""
    slug = Path(urlparse(url).path).name
    if not slug:
        return None
    slug = _PACKT_ISBN_SUFFIX_RE.sub("", slug)
    slug = slug.replace("-", " ")
    return " ".join(slug.split()) or None


def blacklibrary_title_from_candidate_url(url: str) -> str | None:
    """Infer a Black Library title from a candidate URL path."""
    slug = Path(urlparse(url).path).name.removesuffix(".html")
    if not slug:
        return None
    slug = _BLACKLIBRARY_SUFFIX_RE.sub("", slug)
    slug = re.sub(r"(?i)^(?:ebook|mp3|audio)-", "", slug)
    slug = slug.replace("-", " ")
    return " ".join(slug.split()) or None


def collect_anchor_links(base_url: str, html_text: str) -> list[tuple[str, str]]:
    """Extract normalized anchor links from a search result page."""
    soup = BeautifulSoup(html_text, "html.parser")
    links: list[tuple[str, str]] = []
    for anchor in soup.select("a[href]"):
        href = anchor.get("href")
        if not href:
            continue
        text = " ".join(anchor.stripped_strings)
        links.append((urljoin(base_url, href), text))
    return links


def extract_packt_search_candidates(
    search_url: str,
    html_text: str,
) -> list[tuple[str, str]]:
    """Extract Packt-specific candidate URLs from a search response."""
    candidates: dict[str, str] = {}
    for href, text in collect_anchor_links(search_url, html_text):
        parsed = urlparse(href)
        if parsed.netloc.lower() not in {"www.packtpub.com", "packtpub.com"}:
            continue
        if "/product/" not in parsed.path.lower():
            continue
        title = packt_title_from_candidate_url(href) or text
        if not title:
            continue
        candidates.setdefault(href, title)
    return list(candidates.items())


def extract_blacklibrary_search_candidates(
    search_url: str,
    html_text: str,
) -> list[tuple[str, str]]:
    """Extract Black Library candidate URLs from a search response."""
    candidates: dict[str, str] = {}
    for href, text in collect_anchor_links(search_url, html_text):
        parsed = urlparse(href)
        path_lower = parsed.path.lower()
        if parsed.netloc.lower() != "www.blacklibrary.com":
            continue
        if not path_lower.endswith(".html"):
            continue
        if path_lower.startswith(("/home/", "/info/", "/login", "/basket")):
            continue
        title = " ".join(text.split()) or blacklibrary_title_from_candidate_url(href)
        if not title:
            continue
        candidates.setdefault(href, title)
    return list(candidates.items())


def extract_site_search_candidates(
    host: str,
    search_url: str,
    html_text: str,
) -> list[tuple[str, str]]:
    """Extract host-specific candidate links from a search result response."""
    if host == "www.packtpub.com":
        return extract_packt_search_candidates(search_url, html_text)
    if host == "www.blacklibrary.com":
        return extract_blacklibrary_search_candidates(search_url, html_text)
    return []


def build_site_search_request(
    host: str,
    query: str,
) -> tuple[str, dict[str, str]] | None:
    """Return the host-specific search URL and query parameters."""
    if host == "www.packtpub.com":
        return ("https://www.packtpub.com/en-us/search", {"q": query})
    if host == "www.blacklibrary.com":
        return (
            "https://www.blacklibrary.com/Home/Search-Results.html",
            {"filter_name": "SearchTerm", "filter_value": query},
        )
    return None


def score_search_candidate(
    *,
    candidate_title: str,
    query_variants: list[str],
    candidate_url: str,
    expected_format: str | None,
    query_subset_score: float,
    candidate_subset_score: float,
    matching_format_bonus: float,
    mismatched_format_penalty: float,
) -> float:
    """Score how well a recovered candidate matches the requested title."""
    candidate_normalized = normalize_search_text(candidate_title)
    if not candidate_normalized:
        return 0.0

    best_score = 0.0
    candidate_tokens = set(candidate_normalized.split())
    for query in query_variants:
        query_normalized = normalize_search_text(query)
        if not query_normalized:
            continue

        if query_normalized == candidate_normalized:
            score = 1.0
        else:
            query_tokens = set(query_normalized.split())
            token_overlap = (
                len(query_tokens & candidate_tokens) / len(query_tokens)
                if query_tokens
                else 0.0
            )
            containment_score = 0.0
            if query_tokens and query_tokens <= candidate_tokens:
                containment_score = query_subset_score
            elif candidate_tokens and candidate_tokens <= query_tokens:
                containment_score = candidate_subset_score
            sequence_score = SequenceMatcher(
                None,
                query_normalized,
                candidate_normalized,
            ).ratio()
            score = max(token_overlap, containment_score, sequence_score)

        best_score = max(best_score, score)

    candidate_format = infer_candidate_format_hint(candidate_url)
    if expected_format and candidate_format:
        if expected_format == candidate_format:
            best_score = min(1.0, best_score + matching_format_bonus)
        else:
            best_score = max(0.0, best_score - mismatched_format_penalty)

    return round(best_score, 4)


def attempt_site_search_recovery(
    url: str,
    references: list[SubproductPageReference],
    cache_config: SubproductPageCacheConfig,
    request_policy: SubproductPageRequestPolicy,
    request_page: Callable[..., requests.Response],
    *,
    extract_title: Callable[[str], str | None],
) -> SiteSearchFetchResult | None:
    """Try recovering a missing page through a host-specific site search flow."""
    search_queries = build_site_search_queries(url, references)
    if not search_queries:
        return None

    expected_format = infer_expected_format_hint(url, references)
    candidates_by_url: dict[str, SiteSearchCandidate] = {}
    search_attempts = 0

    for query in search_queries:
        search_request = build_site_search_request(request_policy.host, query)
        if search_request is None:
            break

        search_url, search_params = search_request
        search_attempts += 1
        try:
            search_response = request_page(search_url, params=search_params)
            search_response.raise_for_status()
        except (OSError, requests.RequestException):
            continue

        for candidate_url, candidate_title in extract_site_search_candidates(
            request_policy.host,
            search_response.url or search_url,
            search_response.text,
        ):
            confidence = score_search_candidate(
                candidate_title=candidate_title,
                query_variants=search_queries,
                candidate_url=candidate_url,
                expected_format=expected_format,
                query_subset_score=cache_config.search_scoring.query_subset_score,
                candidate_subset_score=cache_config.search_scoring.candidate_subset_score,
                matching_format_bonus=cache_config.search_scoring.matching_format_bonus,
                mismatched_format_penalty=(
                    cache_config.search_scoring.mismatched_format_penalty
                ),
            )
            existing = candidates_by_url.get(candidate_url)
            if existing is None or confidence > existing.confidence:
                candidates_by_url[candidate_url] = SiteSearchCandidate(
                    url=candidate_url,
                    title=candidate_title,
                    query=query,
                    confidence=confidence,
                )

    if not candidates_by_url:
        return None

    candidate_fetch_attempts = 0
    for candidate in sorted(
        candidates_by_url.values(),
        key=lambda item: (-item.confidence, item.url),
    ):
        if candidate.confidence < request_policy.min_match_confidence:
            continue

        candidate_fetch_attempts += 1
        try:
            response = request_page(candidate.url)
            response.raise_for_status()
        except (OSError, requests.RequestException):
            continue

        html_text = response.text
        return SiteSearchFetchResult(
            final_url=response.url,
            page_title=extract_title(html_text),
            status_code=response.status_code,
            content_type=response.headers.get("content-type"),
            content_length_bytes=len(response.content),
            html_text=html_text,
            search_query=candidate.query,
            recovery_confidence=candidate.confidence,
            attempts_used=search_attempts + candidate_fetch_attempts,
        )

    return None
