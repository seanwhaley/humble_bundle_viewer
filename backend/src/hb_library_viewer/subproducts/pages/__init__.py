"""Public API for subproduct page caching workflows."""

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
from .service import cache_subproduct_pages
from .store import (
    collect_subproduct_page_references,
    filter_subproduct_page_references,
    load_subproduct_page_manifest,
)

__all__ = [
    "BrowserPageFetchResult",
    "DomainDiagnosticResult",
    "PageCacheOutcome",
    "SharedCacheRunState",
    "SiteSearchFetchResult",
    "SubproductPageCacheSummary",
    "SubproductPageDomainSummary",
    "SubproductPageManifest",
    "SubproductPageManifestEntry",
    "SubproductPageReference",
    "SubproductPageRequestPolicy",
    "cache_subproduct_pages",
    "collect_subproduct_page_references",
    "filter_subproduct_page_references",
    "load_subproduct_page_manifest",
]
