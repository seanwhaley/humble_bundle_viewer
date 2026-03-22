"""HTTP, browser, and diagnostic helpers for subproduct page caching."""

from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
import logging
import re
import socket
import ssl
from urllib.parse import urlparse

from playwright.sync_api import (
    Error as PlaywrightError,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)
import requests
from requests.adapters import HTTPAdapter

from ...config import BrowserConfig, SubproductPageCacheConfig, SubproductPageHostPolicy
from .models import (
    BrowserPageFetchResult,
    DomainDiagnosticResult,
    SubproductPageManifestEntry,
    SubproductPageRequestPolicy,
)
from .store import now_iso

logger = logging.getLogger(__name__)

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


def _extract_page_title(html_text: str) -> str | None:
    match = _TITLE_RE.search(html_text)
    if not match:
        return None
    title = unescape(match.group(1)).strip()
    return title or None


def classify_request_failure(exc: OSError | requests.RequestException) -> str:
    """Classify a request exception into a stable failure label."""
    message = str(exc).lower()
    if (
        "nameresolutionerror" in message
        or "failed to resolve" in message
        or "getaddrinfo failed" in message
    ):
        return "dns_resolution"
    if "certificate verify failed" in message or "ssl" in message:
        return "ssl_error"
    if "timed out" in message:
        return "timeout"
    if (
        "connection aborted" in message
        or "connection reset" in message
        or "max retries exceeded" in message
    ):
        return "connection_error"
    return "request_error"


def resolve_request_policy(
    url: str,
    cache_config: SubproductPageCacheConfig,
) -> SubproductPageRequestPolicy:
    """Resolve the effective request policy for a target URL."""
    parsed = urlparse(url)
    host = (parsed.netloc or "").strip().lower()
    host_policy = cache_config.host_policies.get(host)
    default_host_policy = SubproductPageHostPolicy()

    return SubproductPageRequestPolicy(
        host=host,
        rate_limit_delay=(
            host_policy.rate_limit_delay
            if host_policy and host_policy.rate_limit_delay is not None
            else cache_config.rate_limit_delay
        ),
        retry_statuses=(
            host_policy.retry_statuses
            if host_policy and host_policy.retry_statuses is not None
            else list(cache_config.retry_statuses)
        ),
        retry_backoff_seconds=(
            host_policy.retry_backoff_seconds
            if host_policy and host_policy.retry_backoff_seconds is not None
            else list(cache_config.retry_backoff_seconds)
        ),
        respect_retry_after=(
            host_policy.respect_retry_after
            if host_policy and host_policy.respect_retry_after is not None
            else cache_config.respect_retry_after
        ),
        max_retry_after_seconds=(
            host_policy.max_retry_after_seconds
            if host_policy and host_policy.max_retry_after_seconds is not None
            else cache_config.max_retry_after_seconds
        ),
        retry_transport_failures=(
            host_policy.retry_transport_failures
            if host_policy and host_policy.retry_transport_failures is not None
            else cache_config.retry_transport_failures
        ),
        browser_fallback=host_policy.browser_fallback if host_policy else False,
        search_on_404=host_policy.search_on_404 if host_policy else False,
        min_match_confidence=(
            host_policy.min_match_confidence
            if host_policy
            else default_host_policy.min_match_confidence
        ),
        browser_timeout_ms=host_policy.browser_timeout_ms if host_policy else None,
        host_policy_applied=host if host_policy else None,
    )


def build_http_session() -> requests.Session:
    """Create a pooled HTTP session for cache runs."""
    session = requests.Session()
    adapter = HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=0)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def request_timeout_seconds(
    cache_config: SubproductPageCacheConfig,
) -> tuple[float, float]:
    """Return connect/read timeouts for external page requests."""
    return (
        float(cache_config.connect_timeout_seconds),
        float(cache_config.request_timeout_seconds),
    )


def fetch_page_via_browser(
    url: str,
    browser_config: BrowserConfig,
    request_policy: SubproductPageRequestPolicy,
) -> BrowserPageFetchResult:
    """Fetch a page through Playwright for host-specific fallback flows."""
    timeout_ms = request_policy.browser_timeout_ms or browser_config.timeout_ms
    playwright = None
    browser = None
    context = None

    try:
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=browser_config.headless)
        if browser_config.user_agent:
            context = browser.new_context(user_agent=browser_config.user_agent)
        else:
            context = browser.new_context()
        page = context.new_page()

        response = page.goto(
            url,
            wait_until="domcontentloaded",
            timeout=timeout_ms,
        )
        try:
            page.wait_for_load_state("load", timeout=timeout_ms)
        except PlaywrightTimeoutError as exc:
            logger.debug("Browser fallback load timeout for %s: %s", url, exc)

        html_text = page.content()
        final_url = page.url or (response.url if response else url)
        page_title = page.title() or _extract_page_title(html_text)
        status_code = response.status if response is not None else None
        content_type = (
            response.headers.get("content-type") if response is not None else None
        )

        return BrowserPageFetchResult(
            final_url=final_url,
            page_title=page_title,
            status_code=status_code,
            content_type=content_type,
            content_length_bytes=len(html_text.encode("utf-8")),
            html_text=html_text,
        )
    except PlaywrightError as exc:
        raise RuntimeError(f"Browser fallback failed: {exc}") from exc
    finally:
        if context is not None:
            try:
                context.close()
            except PlaywrightError:
                pass
        if browser is not None:
            try:
                browser.close()
            except PlaywrightError:
                pass
        if playwright is not None:
            try:
                playwright.stop()
            except PlaywrightError:
                pass


def parse_retry_after_seconds(value: str | None) -> float | None:
    """Parse a Retry-After header as seconds from now."""
    if value is None:
        return None

    stripped = value.strip()
    if not stripped:
        return None

    try:
        seconds = float(stripped)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(stripped)
        except (TypeError, ValueError, IndexError, OverflowError):
            return None

        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)

        seconds = (retry_at - datetime.now(timezone.utc)).total_seconds()

    return max(seconds, 0.0)


def http_retry_delay_seconds(
    response: requests.Response | None,
    request_policy: SubproductPageRequestPolicy,
    retry_count: int,
) -> float | None:
    """Determine the next HTTP retry delay for a response, if any."""
    if response is None:
        return None
    if response.status_code not in request_policy.retry_statuses:
        return None
    if retry_count >= len(request_policy.retry_backoff_seconds):
        return None

    delay = request_policy.retry_backoff_seconds[retry_count]
    if request_policy.respect_retry_after:
        retry_after = parse_retry_after_seconds(response.headers.get("Retry-After"))
        if retry_after is not None:
            retry_after = min(retry_after, request_policy.max_retry_after_seconds)
            delay = max(delay, retry_after)
    return delay


def request_failure_retry_delay_seconds(
    failure_label: str,
    request_policy: SubproductPageRequestPolicy,
    retry_count: int,
) -> float | None:
    """Determine the next retry delay for a transport failure, if any."""
    if not request_policy.retry_transport_failures:
        return None
    if failure_label not in {"timeout", "connection_error", "request_error"}:
        return None
    if retry_count >= len(request_policy.retry_backoff_seconds):
        return None
    return request_policy.retry_backoff_seconds[retry_count]


def should_diagnose_domain(failure_label: str) -> bool:
    """Return whether a failure type warrants a domain-level diagnostic."""
    return failure_label in {
        "dns_resolution",
        "ssl_error",
        "timeout",
        "connection_error",
        "request_error",
    }


def diagnose_domain_connectivity(
    url: str,
    cache_config: SubproductPageCacheConfig,
) -> DomainDiagnosticResult:
    """Run a quick DNS/TCP/TLS diagnostic for a failed host."""
    parsed = urlparse(url)
    host = (parsed.hostname or parsed.netloc or "").strip().lower()
    checked_at = now_iso()
    if not host:
        return DomainDiagnosticResult(
            host="unknown",
            status="invalid_host",
            reason="No hostname was present in the URL",
            checked_at=checked_at,
            should_skip=True,
        )

    try:
        socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        return DomainDiagnosticResult(
            host=host,
            status="dns_unresolved",
            reason=f"{type(exc).__name__}: {exc}",
            checked_at=checked_at,
            should_skip=True,
        )

    timeout_seconds = float(cache_config.domain_check_timeout_seconds)
    scheme = (parsed.scheme or "https").lower()
    port = 443 if scheme == "https" else 80

    try:
        with socket.create_connection((host, port), timeout=timeout_seconds) as sock:
            if scheme == "https":
                context = ssl.create_default_context()
                with context.wrap_socket(sock, server_hostname=host) as tls_socket:
                    tls_socket.do_handshake()
    except ssl.SSLError as exc:
        return DomainDiagnosticResult(
            host=host,
            status="tls_handshake_failed",
            reason=f"{type(exc).__name__}: {exc}",
            checked_at=checked_at,
            should_skip=True,
        )
    except TimeoutError as exc:
        return DomainDiagnosticResult(
            host=host,
            status="domain_connect_timeout",
            reason=f"{type(exc).__name__}: {exc}",
            checked_at=checked_at,
            should_skip=True,
        )
    except OSError as exc:
        return DomainDiagnosticResult(
            host=host,
            status="domain_connect_failed",
            reason=f"{type(exc).__name__}: {exc}",
            checked_at=checked_at,
            should_skip=True,
        )

    return DomainDiagnosticResult(
        host=host,
        status="domain_reachable",
        reason=None,
        checked_at=checked_at,
        should_skip=False,
    )


def apply_domain_metadata(
    entry: SubproductPageManifestEntry,
    *,
    host: str,
    diagnostic: DomainDiagnosticResult | None = None,
) -> SubproductPageManifestEntry:
    """Attach domain metadata to a manifest entry."""
    entry.domain = host
    if diagnostic is not None:
        entry.domain_status = diagnostic.status
        entry.domain_status_reason = diagnostic.reason
        entry.domain_checked_at = diagnostic.checked_at
    else:
        entry.domain_status = entry.domain_status or "domain_unchecked"
    return entry


def skipped_domain_entry(
    *,
    url: str,
    references,
    host: str,
    diagnostic: DomainDiagnosticResult,
    request_policy: SubproductPageRequestPolicy,
) -> SubproductPageManifestEntry:
    """Build a manifest entry for a domain-level skip decision."""
    entry = SubproductPageManifestEntry(
        url=url,
        final_url=None,
        replacement_url=None,
        page_title=None,
        status_code=None,
        content_type=None,
        content_length_bytes=None,
        fetched_at=now_iso(),
        html_path=None,
        recovery_method=None,
        recovery_confidence=None,
        search_query=None,
        attempt_count=1,
        host_policy_applied=request_policy.host_policy_applied,
        references=list(references),
        error=diagnostic.reason or diagnostic.status,
    )
    return apply_domain_metadata(entry, host=host, diagnostic=diagnostic)
