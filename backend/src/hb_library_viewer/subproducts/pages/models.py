"""Typed models used by subproduct page caching workflows."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
import threading
from pathlib import Path

from pydantic import BaseModel, Field
from tqdm import tqdm


class SubproductPageReference(BaseModel):
    """Library reference pointing to an external subproduct info page."""

    product_gamekey: str | None = Field(default=None)
    product_name: str | None = Field(default=None)
    product_machine_name: str | None = Field(default=None)
    subproduct_name: str | None = Field(default=None)
    subproduct_machine_name: str | None = Field(default=None)
    payee_name: str | None = Field(default=None)


class SubproductPageManifestEntry(BaseModel):
    """Metadata describing a cached external page."""

    url: str
    final_url: str | None = Field(default=None)
    replacement_url: str | None = Field(default=None)
    page_title: str | None = Field(default=None)
    status_code: int | None = Field(default=None)
    content_type: str | None = Field(default=None)
    content_length_bytes: int | None = Field(default=None)
    fetched_at: str | None = Field(default=None)
    html_path: str | None = Field(default=None)
    recovery_method: str | None = Field(default=None)
    recovery_confidence: float | None = Field(default=None)
    search_query: str | None = Field(default=None)
    attempt_count: int | None = Field(default=None)
    host_policy_applied: str | None = Field(default=None)
    domain: str | None = Field(default=None)
    domain_status: str | None = Field(default=None)
    domain_status_reason: str | None = Field(default=None)
    domain_checked_at: str | None = Field(default=None)
    references: list[SubproductPageReference] = Field(default_factory=list)
    error: str | None = Field(default=None)


class SubproductPageDomainSummary(BaseModel):
    """Per-domain summary for a cache run."""

    host: str
    requested_urls: int
    fetched_pages: int = 0
    reused_pages: int = 0
    failed_pages: int = 0
    skipped_pages: int = 0
    failure_breakdown: dict[str, int] = Field(default_factory=dict)
    domain_status_breakdown: dict[str, int] = Field(default_factory=dict)


class SubproductPageManifest(BaseModel):
    """Manifest mapping external info URLs to cached files."""

    generated_at: str
    total_entries: int = 0
    domain_summaries: list[SubproductPageDomainSummary] = Field(default_factory=list)
    items: list[SubproductPageManifestEntry] = Field(default_factory=list)


class SubproductPageCacheSummary(BaseModel):
    """Summary of a cache refresh run."""

    requested_urls: int
    processed_urls: int
    fetched_pages: int
    reused_pages: int
    failed_pages: int
    skipped_pages: int
    failure_limit: int | None
    aborted: bool
    manifest_path: Path
    elapsed_seconds: float = 0.0
    failure_breakdown: dict[str, int] = Field(default_factory=dict)
    domain_summaries: list[SubproductPageDomainSummary] = Field(default_factory=list)


@dataclass(slots=True)
class SubproductPageRequestPolicy:
    """Effective request policy for a single host fetch."""

    host: str
    rate_limit_delay: float
    retry_statuses: list[int]
    retry_backoff_seconds: list[float]
    respect_retry_after: bool
    max_retry_after_seconds: int
    retry_transport_failures: bool
    min_match_confidence: float
    browser_fallback: bool = False
    search_on_404: bool = False
    browser_timeout_ms: int | None = None
    host_policy_applied: str | None = None


@dataclass(slots=True)
class BrowserPageFetchResult:
    """Result of a browser-based fallback fetch."""

    final_url: str | None
    page_title: str | None
    status_code: int | None
    content_type: str | None
    content_length_bytes: int
    html_text: str


@dataclass(slots=True)
class SiteSearchCandidate:
    """Candidate replacement page discovered via host-specific site search."""

    url: str
    title: str
    query: str
    confidence: float


@dataclass(slots=True)
class SiteSearchFetchResult:
    """Result of recovering a page through a host-specific site search."""

    final_url: str | None
    page_title: str | None
    status_code: int | None
    content_type: str | None
    content_length_bytes: int
    html_text: str
    search_query: str
    recovery_confidence: float
    attempts_used: int


@dataclass(slots=True)
class DomainDiagnosticResult:
    """Fast domain-level diagnostic used after unresolved transport failures."""

    host: str
    status: str
    reason: str | None
    checked_at: str
    should_skip: bool


@dataclass(slots=True)
class PageCacheOutcome:
    """Per-URL result used by grouped and concurrent cache workers."""

    entry: SubproductPageManifestEntry
    outcome: str
    fetched: int = 0
    reused: int = 0
    failed: int = 0
    skipped: int = 0
    failure_label: str | None = None
    counts_toward_failure_limit: bool = False
    domain_diagnostic: DomainDiagnosticResult | None = None


@dataclass(slots=True)
class SharedCacheRunState:
    """Thread-safe aggregate state for a cache refresh run."""

    requested_urls: int
    failure_limit: int | None
    started_at: float
    progress_log_every: int
    items_by_url: dict[str, SubproductPageManifestEntry]
    progress_bar: tqdm
    processed_urls: int = 0
    fetched_pages: int = 0
    reused_pages: int = 0
    failed_pages: int = 0
    skipped_pages: int = 0
    aborted: bool = False
    failure_breakdown: Counter[str] = field(default_factory=Counter)
    domain_stats: dict[str, SubproductPageDomainSummary] = field(default_factory=dict)
    last_progress_logged: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    abort_event: threading.Event = field(default_factory=threading.Event, repr=False)
