"""Cache external subproduct info pages for later scraping.

This module now acts as the orchestration layer for subproduct-page caching.
Pure models, manifest helpers, search helpers, and fetch utilities live in
dedicated modules so the cache runner stays easier to test and maintain.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import sys
import logging
import re
import time
from collections import Counter
from html import unescape
from pathlib import Path
from typing import TYPE_CHECKING, Callable
from urllib.parse import urlparse

import requests
from tqdm import tqdm

from ...config import BrowserConfig, SubproductPageCacheConfig
from ...runtime_status import estimate_eta_seconds, format_hms
from .fetch import (
    apply_domain_metadata as _apply_domain_metadata,
    build_http_session as _build_http_session,
    classify_request_failure as _classify_request_failure,
    diagnose_domain_connectivity as _diagnose_domain_connectivity,
    fetch_page_via_browser as _fetch_page_via_browser,
    http_retry_delay_seconds as _http_retry_delay_seconds,
    request_failure_retry_delay_seconds as _request_failure_retry_delay_seconds,
    request_timeout_seconds as _request_timeout_seconds,
    resolve_request_policy as _resolve_request_policy,
    should_diagnose_domain as _should_diagnose_domain,
    skipped_domain_entry as _skipped_domain_entry,
)
from .models import (
    BrowserPageFetchResult,
    DomainDiagnosticResult,
    PageCacheOutcome,
    SharedCacheRunState,
    SiteSearchFetchResult,
    SubproductPageCacheSummary,
    SubproductPageDomainSummary,
    SubproductPageManifest,
    SubproductPageManifestEntry,
    SubproductPageReference,
    SubproductPageRequestPolicy,
)
from .search import (
    attempt_site_search_recovery as _attempt_site_search_recovery,
)
from .store import (
    build_html_relative_path as _build_html_relative_path,
    collect_subproduct_page_references,
    filter_subproduct_page_references,
    load_subproduct_page_manifest,
    manifest_path as _manifest_path,
    now_iso as _now_iso,
    pages_dir as _pages_dir,
    replacement_url as _replacement_url,
    write_manifest as _write_manifest,
)

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from ...parsing import LibraryData


def _extract_page_title(html_text: str) -> str | None:
    title = unescape(html_text)
    match = re.search(r"<title[^>]*>(.*?)</title>", title, re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    page_title = match.group(1).strip()
    return page_title or None


def _domain_for_url(url: str) -> str:
    return (urlparse(url).netloc or "").strip().lower() or "unknown"


def _group_urls_by_domain(
    references_by_url: dict[str, list[SubproductPageReference]],
) -> list[tuple[str, list[tuple[str, list[SubproductPageReference]]]]]:
    grouped: dict[str, list[tuple[str, list[SubproductPageReference]]]] = {}
    for url in sorted(references_by_url):
        grouped.setdefault(_domain_for_url(url), []).append(
            (url, references_by_url[url])
        )
    return [(host, grouped[host]) for host in sorted(grouped)]


def _build_skipped_domain_entry(
    *,
    url: str,
    references: list[SubproductPageReference],
    request_policy: SubproductPageRequestPolicy,
    existing_entry: SubproductPageManifestEntry | None,
    relative_html_path: Path,
    absolute_html_path: Path,
    diagnostic: DomainDiagnosticResult,
) -> PageCacheOutcome:
    if (
        existing_entry is not None
        and existing_entry.html_path
        and absolute_html_path.exists()
    ):
        existing_entry.references = references
        _apply_domain_metadata(
            existing_entry,
            host=request_policy.host,
            diagnostic=diagnostic,
        )
        return PageCacheOutcome(
            entry=existing_entry,
            outcome="reused cache",
            reused=1,
            domain_diagnostic=diagnostic,
        )

    entry = _skipped_domain_entry(
        url=url,
        references=references,
        host=request_policy.host,
        diagnostic=diagnostic,
        request_policy=request_policy,
    )
    entry.recovery_method = "skipped_bad_domain"
    return PageCacheOutcome(
        entry=entry,
        outcome="skipped domain",
        failed=1,
        skipped=1,
        failure_label="skipped_bad_domain",
        domain_diagnostic=diagnostic,
    )


def _record_page_outcome(
    state: SharedCacheRunState,
    *,
    url: str,
    outcome: PageCacheOutcome,
) -> None:
    with state.lock:
        state.items_by_url[url] = outcome.entry
        state.processed_urls += 1
        state.fetched_pages += outcome.fetched
        state.reused_pages += outcome.reused
        state.failed_pages += outcome.failed
        state.skipped_pages += outcome.skipped
        if outcome.failure_label is not None:
            state.failure_breakdown[outcome.failure_label] += 1

        host = outcome.entry.domain or _domain_for_url(url)
        domain_summary = state.domain_stats.get(host)
        if domain_summary is None:
            domain_summary = SubproductPageDomainSummary(host=host, requested_urls=1)
            state.domain_stats[host] = domain_summary

        domain_summary.fetched_pages += outcome.fetched
        domain_summary.reused_pages += outcome.reused
        domain_summary.failed_pages += outcome.failed
        domain_summary.skipped_pages += outcome.skipped
        if outcome.failure_label is not None:
            domain_summary.failure_breakdown[outcome.failure_label] = (
                domain_summary.failure_breakdown.get(outcome.failure_label, 0) + 1
            )
        if outcome.entry.domain_status:
            domain_summary.domain_status_breakdown[outcome.entry.domain_status] = (
                domain_summary.domain_status_breakdown.get(
                    outcome.entry.domain_status, 0
                )
                + 1
            )

        state.progress_bar.update(1)
        state.progress_bar.set_postfix(
            live=state.fetched_pages,
            cached=state.reused_pages,
            failed=state.failed_pages,
            skipped=state.skipped_pages,
            refresh=False,
        )

        if (
            state.processed_urls == state.requested_urls
            or state.aborted
            or state.processed_urls - state.last_progress_logged
            >= state.progress_log_every
        ):
            _log_cache_progress(
                processed_urls=state.processed_urls,
                requested_urls=state.requested_urls,
                fetched_pages=state.fetched_pages,
                reused_pages=state.reused_pages,
                failed_pages=state.failed_pages,
                elapsed_seconds=time.monotonic() - state.started_at,
                current_url=url,
                outcome=outcome.outcome,
                failure_breakdown=state.failure_breakdown,
            )
            state.last_progress_logged = state.processed_urls


def _process_url_for_cache(
    *,
    url: str,
    references: list[SubproductPageReference],
    cache_config: SubproductPageCacheConfig,
    browser_config: BrowserConfig,
    request_policy: SubproductPageRequestPolicy,
    existing_entry: SubproductPageManifestEntry | None,
    relative_html_path: Path,
    absolute_html_path: Path,
    effective_redownload: bool,
    session: requests.Session,
    host_last_request_time: dict[str, float],
) -> PageCacheOutcome:
    if (
        not effective_redownload
        and existing_entry is not None
        and existing_entry.html_path
        and absolute_html_path.exists()
    ):
        existing_entry.references = references
        _apply_domain_metadata(existing_entry, host=request_policy.host)
        return PageCacheOutcome(entry=existing_entry, outcome="reused cache", reused=1)

    retry_count = 0
    max_retries = len(request_policy.retry_backoff_seconds)

    def perform_request(
        fetch_url: str,
        *,
        params: dict[str, str] | None = None,
    ) -> requests.Response:
        last_live_request_finished_at = host_last_request_time.get(request_policy.host)
        if last_live_request_finished_at is not None:
            elapsed = time.monotonic() - last_live_request_finished_at
            if elapsed < request_policy.rate_limit_delay:
                time.sleep(request_policy.rate_limit_delay - elapsed)

        try:
            return session.get(
                fetch_url,
                params=params,
                timeout=_request_timeout_seconds(cache_config),
                headers={"User-Agent": cache_config.user_agent},
            )
        finally:
            host_last_request_time[request_policy.host] = time.monotonic()

    while True:
        try:
            response = perform_request(url)
            response.raise_for_status()

            html_text = response.text
            absolute_html_path.parent.mkdir(parents=True, exist_ok=True)
            absolute_html_path.write_text(html_text, encoding="utf-8")

            entry = SubproductPageManifestEntry(
                url=url,
                final_url=response.url,
                replacement_url=_replacement_url(url, response.url),
                page_title=_extract_page_title(html_text),
                status_code=response.status_code,
                content_type=response.headers.get("content-type"),
                content_length_bytes=len(response.content),
                fetched_at=_now_iso(),
                html_path=relative_html_path.as_posix(),
                recovery_method=(
                    "retry_redirected"
                    if retry_count and response.url != url
                    else (
                        "retry_recovery"
                        if retry_count
                        else ("redirected" if response.url != url else "direct_fetch")
                    )
                ),
                recovery_confidence=None,
                search_query=None,
                attempt_count=retry_count + 1,
                host_policy_applied=request_policy.host_policy_applied,
                references=references,
                error=None,
            )
            _apply_domain_metadata(entry, host=request_policy.host)
            if retry_count:
                logger.info(
                    "Recovered subproduct page %s after %s retr%s",
                    url,
                    retry_count,
                    "y" if retry_count == 1 else "ies",
                )
                result_outcome = f"fetched live after {retry_count + 1} attempts"
            else:
                result_outcome = "fetched live"
            return PageCacheOutcome(entry=entry, outcome=result_outcome, fetched=1)
        except requests.exceptions.HTTPError as exc:
            response = exc.response
            failure_label = (
                f"http_{response.status_code}" if response is not None else "http_error"
            )
            retry_delay = _http_retry_delay_seconds(
                response, request_policy, retry_count
            )
            if retry_delay is not None:
                retry_count += 1
                logger.warning(
                    "Retrying subproduct page %s [%s, retry %s/%s] in %s%s",
                    url,
                    failure_label,
                    retry_count,
                    max_retries,
                    format_hms(retry_delay),
                    (
                        f" | policy={request_policy.host_policy_applied}"
                        if request_policy.host_policy_applied
                        else ""
                    ),
                )
                time.sleep(retry_delay)
                continue

            browser_result: BrowserPageFetchResult | None = None
            browser_failure: Exception | None = None
            if (
                response is not None
                and response.status_code == 403
                and request_policy.browser_fallback
            ):
                try:
                    logger.warning(
                        "Trying browser fallback for subproduct page %s [%s]%s",
                        url,
                        failure_label,
                        (
                            f" | policy={request_policy.host_policy_applied}"
                            if request_policy.host_policy_applied
                            else ""
                        ),
                    )
                    browser_result = _fetch_page_via_browser(
                        url,
                        browser_config,
                        request_policy,
                    )
                except (
                    Exception
                ) as browser_exc:  # pylint: disable=broad-exception-caught
                    browser_failure = browser_exc
                    logger.warning(
                        "Browser fallback failed for subproduct page %s: %s",
                        url,
                        browser_exc,
                    )

            search_result: SiteSearchFetchResult | None = None
            if (
                response is not None
                and response.status_code == 404
                and request_policy.search_on_404
            ):
                logger.warning(
                    "Trying site-search fallback for subproduct page %s [%s]%s",
                    url,
                    failure_label,
                    (
                        f" | policy={request_policy.host_policy_applied}"
                        if request_policy.host_policy_applied
                        else ""
                    ),
                )
                search_result = _attempt_site_search_recovery(
                    url,
                    references,
                    cache_config,
                    request_policy,
                    perform_request,
                    extract_title=_extract_page_title,
                )

            if browser_result is not None and (
                browser_result.status_code is None or browser_result.status_code < 400
            ):
                absolute_html_path.parent.mkdir(parents=True, exist_ok=True)
                absolute_html_path.write_text(
                    browser_result.html_text, encoding="utf-8"
                )
                entry = SubproductPageManifestEntry(
                    url=url,
                    final_url=browser_result.final_url,
                    replacement_url=_replacement_url(url, browser_result.final_url),
                    page_title=browser_result.page_title,
                    status_code=browser_result.status_code,
                    content_type=browser_result.content_type,
                    content_length_bytes=browser_result.content_length_bytes,
                    fetched_at=_now_iso(),
                    html_path=relative_html_path.as_posix(),
                    recovery_method=(
                        "browser_fallback_redirected"
                        if browser_result.final_url not in {None, url}
                        else "browser_fallback"
                    ),
                    recovery_confidence=None,
                    search_query=None,
                    attempt_count=retry_count + 2,
                    host_policy_applied=request_policy.host_policy_applied,
                    references=references,
                    error=None,
                )
                _apply_domain_metadata(entry, host=request_policy.host)
                return PageCacheOutcome(
                    entry=entry, outcome="browser fallback", fetched=1
                )

            if search_result is not None and (
                search_result.status_code is None or search_result.status_code < 400
            ):
                absolute_html_path.parent.mkdir(parents=True, exist_ok=True)
                absolute_html_path.write_text(search_result.html_text, encoding="utf-8")
                entry = SubproductPageManifestEntry(
                    url=url,
                    final_url=search_result.final_url,
                    replacement_url=_replacement_url(url, search_result.final_url),
                    page_title=search_result.page_title,
                    status_code=search_result.status_code,
                    content_type=search_result.content_type,
                    content_length_bytes=search_result.content_length_bytes,
                    fetched_at=_now_iso(),
                    html_path=relative_html_path.as_posix(),
                    recovery_method="site_search_match",
                    recovery_confidence=search_result.recovery_confidence,
                    search_query=search_result.search_query,
                    attempt_count=retry_count + 1 + search_result.attempts_used,
                    host_policy_applied=request_policy.host_policy_applied,
                    references=references,
                    error=None,
                )
                _apply_domain_metadata(entry, host=request_policy.host)
                logger.info(
                    "Recovered subproduct page %s via site search query %r (confidence=%.2f)",
                    url,
                    search_result.search_query,
                    search_result.recovery_confidence,
                )
                return PageCacheOutcome(entry=entry, outcome="site search", fetched=1)

            logger.warning(
                "Failed to cache subproduct page %s [%s, attempts=%s]: %s",
                url,
                failure_label,
                retry_count + 1,
                exc,
            )
            entry = existing_entry or SubproductPageManifestEntry(url=url)
            entry.references = references
            entry.error = str(exc)
            if browser_failure is not None:
                entry.error = f"{entry.error}; browser_fallback={browser_failure}"
            entry.fetched_at = _now_iso()
            entry.final_url = (
                search_result.final_url
                if search_result is not None and search_result.final_url
                else (
                    browser_result.final_url
                    if browser_result is not None and browser_result.final_url
                    else response.url if response is not None else None
                )
            )
            entry.replacement_url = _replacement_url(url, entry.final_url)
            entry.status_code = (
                search_result.status_code
                if search_result is not None
                else (
                    browser_result.status_code
                    if browser_result is not None
                    else response.status_code if response is not None else None
                )
            )
            entry.content_type = (
                search_result.content_type
                if search_result is not None
                else (
                    browser_result.content_type
                    if browser_result is not None
                    else (
                        response.headers.get("content-type")
                        if response is not None
                        else None
                    )
                )
            )
            entry.content_length_bytes = (
                search_result.content_length_bytes
                if search_result is not None
                else (
                    browser_result.content_length_bytes
                    if browser_result is not None
                    else len(response.content) if response is not None else None
                )
            )
            entry.page_title = (
                search_result.page_title
                if search_result is not None
                else (
                    browser_result.page_title
                    if browser_result is not None
                    else (
                        _extract_page_title(response.text)
                        if response is not None
                        else None
                    )
                )
            )
            entry.html_path = (
                relative_html_path.as_posix() if absolute_html_path.exists() else None
            )
            entry.recovery_method = (
                "site_search_http_failure"
                if search_result is not None
                else (
                    "browser_fallback_http_failure"
                    if browser_result is not None
                    else "http_failure_after_retry" if retry_count else "http_failure"
                )
            )
            entry.recovery_confidence = (
                search_result.recovery_confidence if search_result is not None else None
            )
            entry.search_query = (
                search_result.search_query if search_result is not None else None
            )
            entry.attempt_count = (
                retry_count + 1 + search_result.attempts_used
                if search_result is not None
                else (
                    retry_count + 2
                    if browser_result is not None or browser_failure is not None
                    else retry_count + 1
                )
            )
            entry.host_policy_applied = request_policy.host_policy_applied
            _apply_domain_metadata(entry, host=request_policy.host)
            return PageCacheOutcome(
                entry=entry,
                outcome=f"failed ({failure_label})",
                failed=1,
                failure_label=failure_label,
            )
        except (OSError, requests.RequestException) as exc:
            failure_label = _classify_request_failure(exc)
            retry_delay = _request_failure_retry_delay_seconds(
                failure_label,
                request_policy,
                retry_count,
            )
            if retry_delay is not None:
                retry_count += 1
                logger.warning(
                    "Retrying subproduct page %s [%s, retry %s/%s] in %s%s",
                    url,
                    failure_label,
                    retry_count,
                    max_retries,
                    format_hms(retry_delay),
                    (
                        f" | policy={request_policy.host_policy_applied}"
                        if request_policy.host_policy_applied
                        else ""
                    ),
                )
                time.sleep(retry_delay)
                continue

            logger.warning(
                "Failed to cache subproduct page %s [%s, attempts=%s]: %s",
                url,
                failure_label,
                retry_count + 1,
                exc,
            )
            domain_diagnostic = (
                _diagnose_domain_connectivity(url, cache_config)
                if _should_diagnose_domain(failure_label)
                else None
            )
            entry = existing_entry or SubproductPageManifestEntry(url=url)
            entry.references = references
            entry.error = str(exc)
            entry.fetched_at = _now_iso()
            entry.html_path = (
                relative_html_path.as_posix() if absolute_html_path.exists() else None
            )
            entry.recovery_method = (
                "transport_failure_after_retry" if retry_count else "transport_failure"
            )
            entry.recovery_confidence = None
            entry.search_query = None
            entry.attempt_count = retry_count + 1
            entry.host_policy_applied = request_policy.host_policy_applied
            _apply_domain_metadata(
                entry,
                host=request_policy.host,
                diagnostic=domain_diagnostic,
            )
            return PageCacheOutcome(
                entry=entry,
                outcome=f"failed ({failure_label})",
                failed=1,
                failure_label=failure_label,
                counts_toward_failure_limit=True,
                domain_diagnostic=domain_diagnostic,
            )


def _process_domain_batch(
    *,
    host: str,
    url_items: list[tuple[str, list[SubproductPageReference]]],
    cache_config: SubproductPageCacheConfig,
    browser_config: BrowserConfig,
    effective_redownload: bool,
    effective_max_failures: int | None,
    existing_items_by_url: dict[str, SubproductPageManifestEntry],
    shared_state: SharedCacheRunState,
) -> None:
    session = _build_http_session()
    host_last_request_time: dict[str, float] = {}
    consecutive_failures = 0
    bad_domain_diagnostic: DomainDiagnosticResult | None = None

    try:
        for url, references in url_items:
            if shared_state.abort_event.is_set():
                break

            request_policy = _resolve_request_policy(url, cache_config)
            existing_entry = existing_items_by_url.get(url)
            relative_html_path = _build_html_relative_path(
                url, references, existing_entry
            )
            absolute_html_path = (cache_config.base_dir / relative_html_path).resolve()

            if bad_domain_diagnostic is not None and bad_domain_diagnostic.should_skip:
                outcome = _build_skipped_domain_entry(
                    url=url,
                    references=references,
                    request_policy=request_policy,
                    existing_entry=existing_entry,
                    relative_html_path=relative_html_path,
                    absolute_html_path=absolute_html_path,
                    diagnostic=bad_domain_diagnostic,
                )
            else:
                outcome = _process_url_for_cache(
                    url=url,
                    references=references,
                    cache_config=cache_config,
                    browser_config=browser_config,
                    request_policy=request_policy,
                    existing_entry=existing_entry,
                    relative_html_path=relative_html_path,
                    absolute_html_path=absolute_html_path,
                    effective_redownload=effective_redownload,
                    session=session,
                    host_last_request_time=host_last_request_time,
                )
                if (
                    outcome.domain_diagnostic is not None
                    and outcome.domain_diagnostic.should_skip
                ):
                    bad_domain_diagnostic = outcome.domain_diagnostic
                    logger.warning(
                        "Skipping remaining subproduct URLs for domain %s after diagnostic %s%s",
                        host,
                        bad_domain_diagnostic.status,
                        (
                            f": {bad_domain_diagnostic.reason}"
                            if bad_domain_diagnostic.reason
                            else ""
                        ),
                    )

            if outcome.counts_toward_failure_limit:
                consecutive_failures += 1
                if (
                    effective_max_failures is not None
                    and consecutive_failures >= effective_max_failures
                ):
                    shared_state.aborted = True
                    shared_state.abort_event.set()
                    logger.warning(
                        "Stopping subproduct page cache after %s consecutive failure(s) on domain %s (limit %s)",
                        consecutive_failures,
                        host,
                        effective_max_failures,
                    )
            else:
                consecutive_failures = 0

            _record_page_outcome(shared_state, url=url, outcome=outcome)

            if shared_state.abort_event.is_set():
                break
    finally:
        session.close()


def _format_failure_breakdown(
    failure_breakdown: Counter[str], limit: int = 5
) -> str | None:
    if not failure_breakdown:
        return None
    parts = [
        f"{label}={count}" for label, count in failure_breakdown.most_common(limit)
    ]
    return ", ".join(parts)


def _log_domain_summaries(
    domain_summaries: list[SubproductPageDomainSummary],
    *,
    limit: int = 10,
) -> None:
    if not domain_summaries:
        return

    logger.info("Domain run summary (top %s):", min(limit, len(domain_summaries)))
    ordered = sorted(
        domain_summaries,
        key=lambda item: (
            -(item.failed_pages + item.skipped_pages),
            -item.requested_urls,
            item.host,
        ),
    )
    for summary in ordered[:limit]:
        failures = _format_failure_breakdown(
            Counter(summary.failure_breakdown),
            limit=3,
        )
        statuses = _format_failure_breakdown(
            Counter(summary.domain_status_breakdown),
            limit=3,
        )
        logger.info(
            "  %s | total=%s live=%s cached=%s failed=%s skipped=%s%s%s",
            summary.host,
            summary.requested_urls,
            summary.fetched_pages,
            summary.reused_pages,
            summary.failed_pages,
            summary.skipped_pages,
            f" | failures={failures}" if failures else "",
            f" | domain_status={statuses}" if statuses else "",
        )


def _log_cache_progress(
    *,
    processed_urls: int,
    requested_urls: int,
    fetched_pages: int,
    reused_pages: int,
    failed_pages: int,
    elapsed_seconds: float,
    current_url: str,
    outcome: str,
    failure_breakdown: Counter[str],
) -> None:
    percent = (processed_urls / requested_urls * 100) if requested_urls else 100.0
    breakdown = _format_failure_breakdown(failure_breakdown)
    eta_seconds = estimate_eta_seconds(
        elapsed_seconds=elapsed_seconds,
        completed_items=processed_urls,
        total_items=requested_urls,
    )
    eta_suffix = f" | eta={format_hms(eta_seconds)}" if eta_seconds is not None else ""
    suffix = f" | failures={breakdown}" if breakdown else ""
    logger.info(
        "Subproduct page cache progress: %s/%s (%.1f%%) | live=%s cached=%s failed=%s | last=%s | current=%s | elapsed=%s%s%s",
        processed_urls,
        requested_urls,
        percent,
        fetched_pages,
        reused_pages,
        failed_pages,
        outcome,
        current_url,
        format_hms(elapsed_seconds),
        eta_suffix,
        suffix,
    )


def cache_subproduct_pages(
    library: LibraryData,
    cache_config: SubproductPageCacheConfig,
    *,
    browser_config: BrowserConfig | None = None,
    redownload_existing: bool | None = None,
    subproduct_query: str | None = None,
    target_url: str | None = None,
    limit: int | None = None,
    max_failures: int | None = None,
) -> SubproductPageCacheSummary:
    """Fetch and cache external subproduct info pages.

    Existing cached files are reused by default. Pass ``redownload_existing=True``
    to force a live refetch of every known URL. Early-abort limits apply only to
    consecutive non-HTTP fetch failures so clusters of expected upstream 4xx/5xx
    responses do not stop large historical-library runs.
    """
    base_dir = cache_config.base_dir.expanduser().resolve()
    effective_browser_config = browser_config or BrowserConfig()
    base_dir.mkdir(parents=True, exist_ok=True)
    _pages_dir(base_dir).mkdir(parents=True, exist_ok=True)

    effective_redownload = (
        cache_config.redownload_existing
        if redownload_existing is None
        else redownload_existing
    )
    effective_max_failures = (
        cache_config.max_failures if max_failures is None else max_failures
    )

    url_references = collect_subproduct_page_references(library)
    url_references = filter_subproduct_page_references(
        url_references,
        subproduct_query=subproduct_query,
        target_url=target_url,
        limit=limit,
    )
    manifest = load_subproduct_page_manifest(base_dir)
    items_by_url = {entry.url: entry for entry in manifest.items}

    if not url_references:
        return SubproductPageCacheSummary(
            requested_urls=0,
            processed_urls=0,
            fetched_pages=0,
            reused_pages=0,
            failed_pages=0,
            skipped_pages=0,
            failure_limit=effective_max_failures,
            aborted=False,
            manifest_path=_manifest_path(base_dir),
        )

    domain_groups = _group_urls_by_domain(url_references)
    requested_urls = len(url_references)
    domain_workers = max(1, min(cache_config.domain_workers, len(domain_groups)))
    logger.info(
        "Caching %s subproduct info URL(s) into %s",
        requested_urls,
        base_dir,
    )
    logger.info(
        "Domain scheduling: %s domain(s), %s worker(s), grouped by host",
        len(domain_groups),
        domain_workers,
    )
    logger.info(
        "Cache mode: %s | connect timeout=%ss | request timeout=%ss | rate limit=%ss | failure limit=%s",
        "redownload existing pages" if effective_redownload else "reuse cached pages",
        cache_config.connect_timeout_seconds,
        cache_config.request_timeout_seconds,
        cache_config.rate_limit_delay,
        effective_max_failures if effective_max_failures is not None else "disabled",
    )
    if cache_config.retry_backoff_seconds:
        logger.info(
            "Retry policy: statuses=%s | backoff=%s | retry_after=%s | transport_failures=%s",
            cache_config.retry_statuses,
            cache_config.retry_backoff_seconds,
            "enabled" if cache_config.respect_retry_after else "disabled",
            "enabled" if cache_config.retry_transport_failures else "disabled",
        )
    else:
        logger.info("Retry policy: disabled")
    if cache_config.host_policies:
        logger.info(
            "Host-specific policies: %s",
            ", ".join(sorted(cache_config.host_policies)),
        )
    if subproduct_query or target_url or limit is not None:
        logger.info(
            "Cache filters: query=%r | url=%r | limit=%r",
            subproduct_query,
            target_url,
            limit,
        )

    started_at = time.monotonic()
    progress_bar = tqdm(
        total=requested_urls,
        desc="Caching subproduct pages",
        unit="url",
        disable=not sys.stderr or not sys.stderr.isatty(),
        dynamic_ncols=True,
    )
    shared_state = SharedCacheRunState(
        requested_urls=requested_urls,
        failure_limit=effective_max_failures,
        started_at=started_at,
        progress_log_every=cache_config.progress_log_every,
        items_by_url=dict(items_by_url),
        domain_stats={
            host: SubproductPageDomainSummary(
                host=host,
                requested_urls=len(url_items),
            )
            for host, url_items in domain_groups
        },
        progress_bar=progress_bar,
    )
    existing_items_by_url = dict(items_by_url)

    try:
        if domain_workers == 1:
            for host, url_items in domain_groups:
                if shared_state.abort_event.is_set():
                    break
                _process_domain_batch(
                    host=host,
                    url_items=url_items,
                    cache_config=cache_config,
                    browser_config=effective_browser_config,
                    effective_redownload=effective_redownload,
                    effective_max_failures=effective_max_failures,
                    existing_items_by_url=existing_items_by_url,
                    shared_state=shared_state,
                )
        else:
            with ThreadPoolExecutor(
                max_workers=domain_workers,
                thread_name_prefix="subproduct-domain",
            ) as executor:
                futures = [
                    executor.submit(
                        _process_domain_batch,
                        host=host,
                        url_items=url_items,
                        cache_config=cache_config,
                        browser_config=effective_browser_config,
                        effective_redownload=effective_redownload,
                        effective_max_failures=effective_max_failures,
                        existing_items_by_url=existing_items_by_url,
                        shared_state=shared_state,
                    )
                    for host, url_items in domain_groups
                ]
                for future in as_completed(futures):
                    future.result()
                    if shared_state.abort_event.is_set():
                        for pending in futures:
                            pending.cancel()
                        break
    finally:
        progress_bar.close()

    domain_summaries = [
        shared_state.domain_stats[host] for host in sorted(shared_state.domain_stats)
    ]
    _log_domain_summaries(domain_summaries)

    manifest.generated_at = _now_iso()
    manifest.domain_summaries = domain_summaries
    manifest.items = [
        shared_state.items_by_url[manifest_url]
        for manifest_url in sorted(shared_state.items_by_url)
    ]
    manifest.total_entries = len(manifest.items)
    manifest_path = _write_manifest(base_dir, manifest)

    return SubproductPageCacheSummary(
        requested_urls=requested_urls,
        processed_urls=shared_state.processed_urls,
        fetched_pages=shared_state.fetched_pages,
        reused_pages=shared_state.reused_pages,
        failed_pages=shared_state.failed_pages,
        skipped_pages=shared_state.skipped_pages,
        failure_limit=effective_max_failures,
        aborted=shared_state.aborted,
        manifest_path=manifest_path,
        elapsed_seconds=time.monotonic() - started_at,
        failure_breakdown=dict(shared_state.failure_breakdown),
        domain_summaries=domain_summaries,
    )
