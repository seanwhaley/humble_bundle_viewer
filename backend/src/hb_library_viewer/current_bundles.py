"""Fetch current Humble Bundle offer pages and report library overlap.

This module provides a reusable workflow for:

- fetching the current ``https://www.humblebundle.com/bundles`` index
- saving the raw HTML for the index and each bundle page
- parsing saved bundle pages into tier/item snapshots
- comparing cumulative support tiers against ``library_products.json``
- writing machine-readable JSON plus a markdown summary report

The saved raw HTML is treated as the source artifact, and the overlap report is
derived from those saved files rather than from live browser state.
"""

from __future__ import annotations

from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from html import escape, unescape
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, NavigableString, Tag
from pydantic import BaseModel, Field
import requests

from .parsing import LibraryData
from .sync import load_library_data
from .subproducts.pages.search import normalize_search_text, title_query_variants

BUNDLES_INDEX_URL = "https://www.humblebundle.com/bundles"
DEFAULT_TIMEOUT_SECONDS = 30
USER_AGENT = (
    "HB Library Viewer/1.0 (+https://github.com/seanwhaley/humble_bundle_viewer)"
)

_BUNDLE_PATH_RE = re.compile(r"^/(games|books|software)/[^/]+/?$")
_FILTER_LABEL_RE = re.compile(r"(?:Entire\s+)?\d[\d,]*\s+Item Bundle", re.IGNORECASE)
_TIER_HEADING_RE = re.compile(
    r"Pay\s+(?P<kind>at least|more than the average of)\s+\$(?P<price>[\d.,]+)\s+for\s+these\s+(?P<count>[\d,]+)\s+items",
    re.IGNORECASE,
)
_ITEM_REQUIREMENT_RE = re.compile(
    r"Pay\s+(?P<kind>at least|more than the average of)\s+\$(?P<price>[\d.,]+)\s+to\s+get\s+this\s+item",
    re.IGNORECASE,
)
_MSRP_RE = re.compile(
    r"(?P<label>Retail|MSRP):\s*\$(?P<price>[\d.,]+)",
    re.IGNORECASE,
)
_TITLE_SUFFIX_RE = re.compile(r"\s*\(pay what you want.*\)$", re.IGNORECASE)
_HEADING_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6")
_GENERIC_HEADINGS = {
    "about",
    "additional links",
    "bundle details",
    "bundle filters",
    "bundles you may also like",
    "charity information",
    "leaderboard",
    "trending games",
    "your privacy is important to us.",
}
_CATEGORY_DISPLAY_NAMES = {
    "games": "Games",
    "books": "Books",
    "software": "Software",
}
_CATEGORY_DISPLAY_ORDER = ("games", "books", "software")
SUPPORTED_BUNDLE_TYPES = _CATEGORY_DISPLAY_ORDER


class BundleLink(BaseModel):
    """One bundle discovered on the live bundles index page."""

    title: str
    url: str
    offer_ends_text: str | None = None
    offer_ends_in_days: int | None = Field(default=None, ge=0)
    offer_ends_detail: str | None = None


class BundleItem(BaseModel):
    """One item found on a bundle page with its minimum tier requirement."""

    title: str
    price_label: str
    price_value: float = Field(ge=0)
    price_kind: str
    msrp_label: str | None = None
    msrp_value: float | None = Field(default=None, ge=0)
    flavor_text: str | None = None
    description: str | None = None


class BundleTier(BaseModel):
    """Cumulative support tier reconstructed from item-level minimum prices."""

    label: str
    price_label: str
    price_value: float = Field(ge=0)
    item_count: int = Field(ge=0)
    titles: list[str] = Field(default_factory=list)


class BundlePageSnapshot(BaseModel):
    """Parsed snapshot for one saved Humble bundle page."""

    title: str
    bundle_type: str
    category: str
    url: str
    slug: str
    fetched_at: str
    html_path: str
    offer_ends_text: str | None = None
    offer_ends_in_days: int | None = Field(default=None, ge=0)
    offer_ends_detail: str | None = None
    filter_labels: list[str] = Field(default_factory=list)
    items: list[BundleItem] = Field(default_factory=list)
    tiers: list[BundleTier] = Field(default_factory=list)


class BundleCatalogSnapshot(BaseModel):
    """Saved catalog snapshot built from the bundles index plus bundle pages."""

    fetched_at: str
    index_url: str
    index_html_path: str
    bundle_links_path: str
    catalog_json_path: str
    bundles: list[BundlePageSnapshot] = Field(default_factory=list)


class BundleTierOverlap(BaseModel):
    """Owned-vs-new summary for one cumulative support tier."""

    label: str
    price_label: str
    price_value: float = Field(ge=0)
    total_items: int = Field(ge=0)
    owned_items: int = Field(ge=0)
    new_items: int = Field(ge=0)
    owned_percent: float = Field(default=0, ge=0, le=100)
    missing_percent: float = Field(ge=0, le=100)
    added_items: int = Field(default=0, ge=0)
    added_owned_items: int = Field(default=0, ge=0)
    added_new_items: int = Field(default=0, ge=0)
    added_owned_percent: float = Field(default=0, ge=0, le=100)
    added_new_percent: float = Field(default=0, ge=0, le=100)
    added_titles: list[str] = Field(default_factory=list)
    added_owned_titles: list[str] = Field(default_factory=list)
    added_new_titles: list[str] = Field(default_factory=list)
    owned_titles: list[str] = Field(default_factory=list)
    new_titles: list[str] = Field(default_factory=list)
    msrp_total: float | None = Field(default=None, ge=0)
    msrp_known_items: int = Field(default=0, ge=0)
    savings_percent: float | None = Field(default=None, ge=0, le=100)
    value_multiple: float | None = Field(default=None, ge=0)


class BundleOverlapBundle(BaseModel):
    """Owned-vs-new summary for one bundle across all tiers."""

    title: str
    bundle_type: str
    category: str
    url: str
    offer_ends_text: str | None = None
    offer_ends_in_days: int | None = Field(default=None, ge=0)
    offer_ends_detail: str | None = None
    items: list[BundleItem] = Field(default_factory=list)
    tiers: list[BundleTierOverlap] = Field(default_factory=list)
    top_tier_status: str
    display_title: str | None = None
    display_type: str | None = None
    progression_summary: str | None = None


class BundleOverlapReport(BaseModel):
    """Full overlap report produced from saved bundle artifacts."""

    generated_at: str
    library_path: str
    bundle_types: list[str] = Field(default_factory=list)
    bundle_count: int = Field(ge=0)
    report_json_path: str
    report_markdown_path: str
    bundles: list[BundleOverlapBundle] = Field(default_factory=list)


class BundleWorkflowArtifacts(BaseModel):
    """Top-level paths returned by the capture/report workflow."""

    output_dir: str
    index_html_path: str
    bundle_links_path: str
    catalog_json_path: str
    report_json_path: str
    report_markdown_path: str
    bundle_types: list[str] = Field(default_factory=list)
    bundle_count: int = Field(ge=0)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(unescape(value).split()).strip()


def _strip_title_suffix(value: str) -> str:
    cleaned = _clean_text(value)
    return _TITLE_SUFFIX_RE.sub("", cleaned).strip() or cleaned


def _bundle_category_from_url(url: str) -> str:
    path_parts = [part for part in urlparse(url).path.split("/") if part]
    if not path_parts:
        return "unknown"
    return path_parts[0].lower()


def _bundle_slug(url: str) -> str:
    return Path(urlparse(url).path).name.strip() or "bundle"


def normalize_bundle_types(bundle_types: list[str] | None) -> list[str]:
    """Normalize bundle-type filters used for capture and reporting."""

    raw_values = bundle_types or list(SUPPORTED_BUNDLE_TYPES)
    normalized: list[str] = []
    seen: set[str] = set()
    for value in raw_values:
        cleaned = _clean_text(value).lower()
        if cleaned not in SUPPORTED_BUNDLE_TYPES:
            raise ValueError(
                "bundle_types values must be one of: "
                + ", ".join(SUPPORTED_BUNDLE_TYPES)
            )
        if cleaned not in seen:
            seen.add(cleaned)
            normalized.append(cleaned)

    if not normalized:
        raise ValueError("bundle_types must include at least one bundle type")

    return normalized


def _parse_price_match(match: re.Match[str]) -> tuple[str, float, str]:
    kind = match.group("kind").lower()
    raw_price = match.group("price").replace(",", "")
    price_value = float(raw_price)
    if kind == "more than the average of":
        label = f"Pay more than the average of ${price_value:.2f}"
    else:
        if price_value.is_integer():
            label = f"Pay at least ${int(price_value)}"
        else:
            label = f"Pay at least ${price_value:.2f}"
    return label, price_value, kind


def _parse_filter_item_count(label: str) -> int | None:
    match = re.search(r"(\d[\d,]*)\s+Item Bundle", label, re.IGNORECASE)
    if match is None:
        return None
    return int(match.group(1).replace(",", ""))


def _is_bundle_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.netloc.lower() == "www.humblebundle.com" and bool(
        _BUNDLE_PATH_RE.match(parsed.path)
    )


def _is_item_title_candidate(text: str, bundle_title: str) -> bool:
    normalized = _clean_text(text)
    if not normalized:
        return False
    if len(normalized) > 220:
        return False
    if normalized.lower() in _GENERIC_HEADINGS:
        return False
    if normalize_search_text(normalized) == normalize_search_text(bundle_title):
        return False
    if _TIER_HEADING_RE.search(normalized):
        return False
    if normalized.lower().startswith("preview "):
        return False
    if "previous item" in normalized.lower() or "back to top" in normalized.lower():
        return False
    if normalized.startswith("$"):
        return False
    return True


def _dedupe_titles(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        cleaned = _clean_text(value)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(cleaned)
    return ordered


def _extract_msrp_value(text: str | None) -> tuple[str | None, float | None]:
    cleaned = _clean_text(text)
    if not cleaned:
        return None, None

    match = _MSRP_RE.search(cleaned)
    if match is None:
        return None, None

    return cleaned, float(match.group("price").replace(",", ""))


def _merge_item_enrichment(
    target: dict[str, str | float | None],
    payload: dict[str, str | float | None],
) -> None:
    for field_name in ("msrp_label", "msrp_value", "flavor_text", "description"):
        value = payload.get(field_name)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        if target.get(field_name) in (None, ""):
            target[field_name] = value


def _extract_item_enrichment_map(
    soup: BeautifulSoup,
    bundle_title: str,
) -> dict[str, dict[str, str | float | None]]:
    enrichments: dict[str, dict[str, str | float | None]] = {}

    for card in soup.select(".tier-item-view"):
        title_tag = card.select_one(".item-title")
        if not isinstance(title_tag, Tag):
            continue

        item_title = _clean_text(title_tag.get_text(" ", strip=True))
        if not _is_item_title_candidate(item_title, bundle_title):
            continue

        flavor_values: list[str] = []
        msrp_label: str | None = None
        msrp_value: float | None = None
        for selector in (".item-flavor-text", ".extra-info"):
            for node in card.select(selector):
                text = _clean_text(node.get_text(" ", strip=True))
                if not text:
                    continue
                parsed_msrp_label, parsed_msrp_value = _extract_msrp_value(text)
                if parsed_msrp_label is not None and msrp_label is None:
                    msrp_label = parsed_msrp_label
                    msrp_value = parsed_msrp_value
                    continue
                flavor_values.append(text)

        payload = {
            "msrp_label": msrp_label,
            "msrp_value": msrp_value,
            "flavor_text": " · ".join(_dedupe_titles(flavor_values)) or None,
            "description": None,
        }
        enrichments.setdefault(_title_key(item_title), payload)

    for details_view in soup.select(".tier-item-details-view"):
        title_tag = details_view.select_one("section.header-area h2")
        if not isinstance(title_tag, Tag):
            continue

        item_title = _clean_text(title_tag.get_text(" ", strip=True))
        if not _is_item_title_candidate(item_title, bundle_title):
            continue

        msrp_tag = details_view.select_one(".msrp")
        msrp_label, msrp_value = (
            _extract_msrp_value(msrp_tag.get_text(" ", strip=True))
            if isinstance(msrp_tag, Tag)
            else (None, None)
        )
        description_tag = details_view.select_one("section.description")
        description = (
            _clean_text(description_tag.get_text(" ", strip=True))
            if isinstance(description_tag, Tag)
            else None
        )

        payload = {
            "msrp_label": msrp_label,
            "msrp_value": msrp_value,
            "flavor_text": None,
            "description": description or None,
        }

        enrichment = enrichments.setdefault(
            _title_key(item_title),
            {
                "msrp_label": None,
                "msrp_value": None,
                "flavor_text": None,
                "description": None,
            },
        )
        _merge_item_enrichment(enrichment, payload)

    return enrichments


def build_bundle_links(index_html: str) -> list[BundleLink]:
    """Parse the bundles index HTML and return unique live bundle links."""

    soup = BeautifulSoup(index_html, "html.parser")
    links: OrderedDict[str, BundleLink] = OrderedDict()
    for anchor in soup.select("a[href]"):
        href = anchor.get("href")
        if not href:
            continue
        absolute_url = urljoin(BUNDLES_INDEX_URL, href)
        if not _is_bundle_url(absolute_url):
            continue
        title = _extract_bundle_link_title(anchor, absolute_url)
        offer_ends_text, offer_ends_in_days, offer_ends_detail = (
            _extract_offer_countdown(anchor)
        )
        links.setdefault(
            absolute_url,
            BundleLink(
                title=title,
                url=absolute_url,
                offer_ends_text=offer_ends_text,
                offer_ends_in_days=offer_ends_in_days,
                offer_ends_detail=offer_ends_detail,
            ),
        )

    return list(links.values())


def _extract_offer_countdown(anchor: Tag) -> tuple[str | None, int | None, str | None]:
    countdown = anchor.select_one(".js-countdown-timer")
    if not isinstance(countdown, Tag):
        return None, None, None

    detail = _clean_text(countdown.get("aria-label")) or None
    days_tag = countdown.select_one(".js-days")
    label_tag = countdown.select_one(".countdown-label")

    days_text = (
        _clean_text(days_tag.get_text(" ", strip=True))
        if isinstance(days_tag, Tag)
        else ""
    )
    label_text = (
        _clean_text(label_tag.get_text(" ", strip=True))
        if isinstance(label_tag, Tag)
        else ""
    )

    offer_ends_in_days: int | None = None
    if days_text.isdigit():
        offer_ends_in_days = int(days_text)
    elif detail:
        detail_match = re.search(r"(?P<days>\d+)\s+days?", detail, re.IGNORECASE)
        if detail_match is not None:
            offer_ends_in_days = int(detail_match.group("days"))

    offer_ends_text = (
        " ".join(part for part in (days_text, label_text) if part).strip() or None
    )
    if offer_ends_in_days is not None and (
        offer_ends_text is None or "left" not in offer_ends_text.casefold()
    ):
        suffix = "Day Left" if offer_ends_in_days == 1 else "Days Left"
        offer_ends_text = f"{offer_ends_in_days} {suffix}"

    return offer_ends_text, offer_ends_in_days, detail


def _extract_bundle_link_title(anchor: Tag, url: str) -> str:
    for attribute_name in ("aria-label", "title"):
        value = _strip_title_suffix(anchor.get(attribute_name))
        if value:
            return value

    image = anchor.find("img", alt=True)
    if isinstance(image, Tag):
        alt_text = _strip_title_suffix(image.get("alt"))
        if alt_text:
            return alt_text

    for heading_name in _HEADING_TAGS:
        heading = anchor.find(heading_name)
        if isinstance(heading, Tag):
            text = _strip_title_suffix(heading.get_text(" ", strip=True))
            if text:
                return text

    text = _strip_title_suffix(anchor.get_text(" ", strip=True))
    return text or _bundle_slug(url)


def _extract_bundle_title(soup: BeautifulSoup, url: str) -> str:
    for selector, attribute in (
        ('meta[property="og:title"]', "content"),
        ('meta[name="twitter:title"]', "content"),
    ):
        tag = soup.select_one(selector)
        if isinstance(tag, Tag):
            value = _clean_text(tag.get(attribute))
            if value:
                return _strip_title_suffix(value)

    if soup.title and soup.title.string:
        return _strip_title_suffix(soup.title.string)

    image = soup.find("img", alt=True)
    if isinstance(image, Tag):
        alt_text = _clean_text(image.get("alt"))
        if alt_text:
            return alt_text

    for heading_name in _HEADING_TAGS:
        heading = soup.find(heading_name)
        if isinstance(heading, Tag):
            text = _clean_text(heading.get_text(" ", strip=True))
            if text:
                return text

    return _bundle_slug(url).replace("-", " ").title()


def _extract_bundle_type(soup: BeautifulSoup, url: str) -> str:
    for text in soup.stripped_strings:
        cleaned = _clean_text(text)
        if re.fullmatch(r"(?:Game|Book|Comic|Software) Bundle", cleaned, re.IGNORECASE):
            return cleaned
    category = _bundle_category_from_url(url)
    return f"{category.title()} Bundle" if category != "unknown" else "Bundle"


def _extract_filter_labels(soup: BeautifulSoup) -> list[str]:
    strings = [_clean_text(text) for text in soup.stripped_strings]
    for index, value in enumerate(strings):
        if value.lower() != "bundle filters":
            continue
        nearby = " ".join(strings[index : index + 20])
        labels = _dedupe_titles(_FILTER_LABEL_RE.findall(nearby))
        if labels:
            return labels
    return _dedupe_titles(_FILTER_LABEL_RE.findall(" ".join(strings)))


def _extract_item_entries(soup: BeautifulSoup, bundle_title: str) -> list[BundleItem]:
    items: list[BundleItem] = []
    seen: set[tuple[str, str]] = set()
    enrichment_map = _extract_item_enrichment_map(soup, bundle_title)

    for node in soup.find_all(string=_ITEM_REQUIREMENT_RE):
        if not isinstance(node, NavigableString):
            continue
        requirement_text = _clean_text(str(node))
        match = _ITEM_REQUIREMENT_RE.search(requirement_text)
        if match is None:
            continue

        heading = node.find_previous(_HEADING_TAGS)
        item_title: str | None = None
        while heading is not None:
            candidate = _clean_text(heading.get_text(" ", strip=True))
            if _is_item_title_candidate(candidate, bundle_title):
                item_title = candidate
                break
            heading = heading.find_previous(_HEADING_TAGS)

        if not item_title:
            continue

        price_label, price_value, price_kind = _parse_price_match(match)
        dedupe_key = (normalize_search_text(item_title), price_label)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        enrichment = enrichment_map.get(
            _title_key(item_title),
            {
                "msrp_label": None,
                "msrp_value": None,
                "flavor_text": None,
                "description": None,
            },
        )
        items.append(
            BundleItem(
                title=item_title,
                price_label=price_label,
                price_value=price_value,
                price_kind=price_kind,
                msrp_label=enrichment.get("msrp_label"),
                msrp_value=enrichment.get("msrp_value"),
                flavor_text=enrichment.get("flavor_text"),
                description=enrichment.get("description"),
            )
        )

    return items


def _build_cumulative_tiers(
    filter_labels: list[str],
    items: list[BundleItem],
) -> list[BundleTier]:
    grouped_titles: OrderedDict[tuple[float, str], list[str]] = OrderedDict()
    for item in sorted(
        items, key=lambda value: (value.price_value, value.title.lower())
    ):
        key = (item.price_value, item.price_label)
        grouped_titles.setdefault(key, [])
        grouped_titles[key].append(item.title)

    filter_labels_by_count = {
        count: label
        for label in filter_labels
        if (count := _parse_filter_item_count(label)) is not None
    }

    tiers: list[BundleTier] = []
    cumulative_titles: list[str] = []
    seen_titles: set[str] = set()
    for (price_value, price_label), titles in grouped_titles.items():
        for title in _dedupe_titles(titles):
            normalized = normalize_search_text(title)
            if normalized in seen_titles:
                continue
            seen_titles.add(normalized)
            cumulative_titles.append(title)

        matched_label = filter_labels_by_count.get(
            len(cumulative_titles), f"{price_label} tier"
        )
        tiers.append(
            BundleTier(
                label=matched_label,
                price_label=price_label,
                price_value=price_value,
                item_count=len(cumulative_titles),
                titles=list(cumulative_titles),
            )
        )

    return tiers


def parse_bundle_page_html(
    html_text: str,
    *,
    url: str,
    fetched_at: str,
    html_path: Path,
) -> BundlePageSnapshot:
    """Parse one saved bundle page HTML file into a normalized snapshot."""

    soup = BeautifulSoup(html_text, "html.parser")
    title = _extract_bundle_title(soup, url)
    filter_labels = _extract_filter_labels(soup)
    items = _extract_item_entries(soup, title)
    tiers = _build_cumulative_tiers(filter_labels, items)
    bundle_type = _extract_bundle_type(soup, url)
    category = _bundle_category_from_url(url)
    return BundlePageSnapshot(
        title=title,
        bundle_type=bundle_type,
        category=category,
        url=url,
        slug=_bundle_slug(url),
        fetched_at=fetched_at,
        html_path=str(html_path),
        filter_labels=filter_labels,
        items=items,
        tiers=tiers,
    )


def _write_json(path: Path, payload: BaseModel | dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(payload, BaseModel):
        data = payload.model_dump(mode="json")
    else:
        data = payload
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _fetch_rendered_htmls(
    urls: list[str],
    *,
    timeout_seconds: int,
) -> dict[str, str]:
    """Fetch rendered HTML for one or more Humble pages via Playwright."""

    from playwright.sync_api import sync_playwright

    rendered_htmls: dict[str, str] = {}
    timeout_ms = timeout_seconds * 1000
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)
        for url in urls:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            try:
                page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 10_000))
            except Exception:  # pragma: no cover - best-effort settling for live pages
                page.wait_for_timeout(1_500)
            else:
                page.wait_for_timeout(500)
            rendered_htmls[url] = page.content()
        browser.close()
    return rendered_htmls


def fetch_current_bundle_catalog(
    *,
    output_dir: Path,
    bundle_types: list[str] | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> BundleCatalogSnapshot:
    """Fetch the current bundles index and every bundle page into saved artifacts."""

    resolved_output_dir = output_dir.expanduser().resolve()
    selected_bundle_types = normalize_bundle_types(bundle_types)
    pages_dir = resolved_output_dir / "bundle_pages"
    index_html_path = resolved_output_dir / "bundles_index.html"
    bundle_links_path = resolved_output_dir / "bundle_links.json"
    catalog_json_path = resolved_output_dir / "bundle_catalog.json"

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    index_response = session.get(BUNDLES_INDEX_URL, timeout=timeout_seconds)
    index_response.raise_for_status()
    index_fetched_at = _utc_now()
    index_html = index_response.text
    _write_text(index_html_path, index_html)

    bundle_links = build_bundle_links(index_html)
    rendered_htmls: dict[str, str] = {}
    if not bundle_links:
        rendered_htmls = _fetch_rendered_htmls(
            [BUNDLES_INDEX_URL],
            timeout_seconds=timeout_seconds,
        )
        index_html = rendered_htmls[BUNDLES_INDEX_URL]
        _write_text(index_html_path, index_html)
        bundle_links = build_bundle_links(index_html)

    bundle_links = [
        link
        for link in bundle_links
        if _bundle_category_from_url(link.url) in selected_bundle_types
    ]

    if not bundle_links:
        raise ValueError(
            "No bundle links matched the selected bundle types: "
            + ", ".join(selected_bundle_types)
        )

    _write_json(
        bundle_links_path, [link.model_dump(mode="json") for link in bundle_links]
    )

    bundle_snapshots: list[BundlePageSnapshot] = []
    for link in bundle_links:
        page_response = session.get(link.url, timeout=timeout_seconds)
        page_response.raise_for_status()
        page_html = page_response.text
        html_path = pages_dir / f"{_bundle_slug(link.url)}.html"
        snapshot = parse_bundle_page_html(
            page_html,
            url=link.url,
            fetched_at=_utc_now(),
            html_path=html_path,
        )
        snapshot = snapshot.model_copy(
            update={
                "offer_ends_text": link.offer_ends_text,
                "offer_ends_in_days": link.offer_ends_in_days,
                "offer_ends_detail": link.offer_ends_detail,
            }
        )

        if not snapshot.filter_labels and not snapshot.items:
            if link.url not in rendered_htmls:
                rendered_htmls.update(
                    _fetch_rendered_htmls(
                        [link.url],
                        timeout_seconds=timeout_seconds,
                    )
                )
            page_html = rendered_htmls[link.url]
            snapshot = parse_bundle_page_html(
                page_html,
                url=link.url,
                fetched_at=_utc_now(),
                html_path=html_path,
            )
            snapshot = snapshot.model_copy(
                update={
                    "offer_ends_text": link.offer_ends_text,
                    "offer_ends_in_days": link.offer_ends_in_days,
                    "offer_ends_detail": link.offer_ends_detail,
                }
            )

        _write_text(html_path, page_html)
        bundle_snapshots.append(snapshot)

    catalog = BundleCatalogSnapshot(
        fetched_at=index_fetched_at,
        index_url=BUNDLES_INDEX_URL,
        index_html_path=str(index_html_path),
        bundle_links_path=str(bundle_links_path),
        catalog_json_path=str(catalog_json_path),
        bundles=bundle_snapshots,
    )
    _write_json(catalog_json_path, catalog)
    return catalog


def _collect_library_titles(library: LibraryData) -> list[str]:
    titles: list[str] = []
    for product in library.products:
        titles.extend(
            [
                product.product_name,
                product.machine_name,
            ]
        )
        for key in product.keys:
            titles.extend([key.human_name, key.machine_name])
        for subproduct in product.subproducts:
            titles.extend([subproduct.human_name, subproduct.machine_name])
            for key in subproduct.keys:
                titles.extend([key.human_name, key.machine_name])
    return _dedupe_titles([title for title in titles if title])


def _build_library_variant_set(library: LibraryData) -> set[str]:
    variants: set[str] = set()
    for title in _collect_library_titles(library):
        for variant in title_query_variants(title) or [title]:
            normalized = normalize_search_text(variant)
            if normalized:
                variants.add(normalized)
        normalized_title = normalize_search_text(title)
        if normalized_title:
            variants.add(normalized_title)
    return variants


def _library_contains_title(title: str, library_variants: set[str]) -> bool:
    for variant in title_query_variants(title) or [title]:
        normalized = normalize_search_text(variant)
        if normalized and normalized in library_variants:
            return True
    normalized_title = normalize_search_text(title)
    return bool(normalized_title and normalized_title in library_variants)


def _percent(part: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return (part / total) * 100


def _sum_msrp_for_titles(
    titles: list[str],
    item_lookup: dict[str, BundleItem],
) -> tuple[float | None, int]:
    msrp_values = [
        item.msrp_value
        for title in titles
        if (item := item_lookup.get(_title_key(title))) is not None
        and item.msrp_value is not None
    ]
    if not msrp_values:
        return None, 0
    return round(sum(msrp_values), 2), len(msrp_values)


def _title_key(title: str) -> str:
    normalized = normalize_search_text(title)
    return normalized or title.casefold()


def build_bundle_overlap_report(
    catalog: BundleCatalogSnapshot,
    *,
    library_path: Path,
    output_dir: Path,
    bundle_types: list[str] | None = None,
) -> BundleOverlapReport:
    """Compare saved bundle tiers against the current local library artifact."""

    resolved_library_path = library_path.expanduser().resolve()
    library = load_library_data(resolved_library_path)
    library_variants = _build_library_variant_set(library)
    resolved_output_dir = output_dir.expanduser().resolve()
    selected_bundle_types = normalize_bundle_types(bundle_types)
    report_json_path = resolved_output_dir / "bundle_overlap_report.json"
    report_markdown_path = resolved_output_dir / "bundle_overlap_report.md"

    bundle_reports: list[BundleOverlapBundle] = []
    for bundle in catalog.bundles:
        tier_reports: list[BundleTierOverlap] = []
        seen_titles: set[str] = set()
        bundle_item_lookup = {_title_key(item.title): item for item in bundle.items}
        for tier in bundle.tiers:
            owned_titles = [
                title
                for title in tier.titles
                if _library_contains_title(title, library_variants)
            ]
            new_titles = [title for title in tier.titles if title not in owned_titles]

            added_titles: list[str] = []
            for title in tier.titles:
                key = _title_key(title)
                if key in seen_titles:
                    continue
                seen_titles.add(key)
                added_titles.append(title)

            added_owned_titles = [
                title
                for title in added_titles
                if _library_contains_title(title, library_variants)
            ]
            added_new_titles = [
                title for title in added_titles if title not in added_owned_titles
            ]

            total_items = len(tier.titles)
            owned_items = len(owned_titles)
            new_items = len(new_titles)
            added_items = len(added_titles)
            added_owned_items = len(added_owned_titles)
            added_new_items = len(added_new_titles)
            msrp_total, msrp_known_items = _sum_msrp_for_titles(
                tier.titles,
                bundle_item_lookup,
            )
            savings_percent: float | None = None
            value_multiple: float | None = None
            if msrp_total is not None and tier.price_value > 0:
                savings_percent = round(
                    max(0.0, (1 - (tier.price_value / msrp_total)) * 100),
                    1,
                )
                value_multiple = round(msrp_total / tier.price_value, 2)
            tier_reports.append(
                BundleTierOverlap(
                    label=tier.label,
                    price_label=tier.price_label,
                    price_value=tier.price_value,
                    total_items=total_items,
                    owned_items=owned_items,
                    new_items=new_items,
                    owned_percent=_percent(owned_items, total_items),
                    missing_percent=_percent(new_items, total_items),
                    added_items=added_items,
                    added_owned_items=added_owned_items,
                    added_new_items=added_new_items,
                    added_owned_percent=_percent(added_owned_items, added_items),
                    added_new_percent=_percent(added_new_items, added_items),
                    added_titles=added_titles,
                    added_owned_titles=added_owned_titles,
                    added_new_titles=added_new_titles,
                    owned_titles=owned_titles,
                    new_titles=new_titles,
                    msrp_total=msrp_total,
                    msrp_known_items=msrp_known_items,
                    savings_percent=savings_percent,
                    value_multiple=value_multiple,
                )
            )

        top_tier = tier_reports[-1] if tier_reports else None
        if top_tier is None or top_tier.owned_items == 0:
            top_tier_status = "only_new"
        elif top_tier.owned_items == top_tier.total_items:
            top_tier_status = "all_owned"
        else:
            top_tier_status = "partial_overlap"

        bundle_report = BundleOverlapBundle(
            title=bundle.title,
            bundle_type=bundle.bundle_type,
            category=bundle.category,
            url=bundle.url,
            offer_ends_text=bundle.offer_ends_text,
            offer_ends_in_days=bundle.offer_ends_in_days,
            offer_ends_detail=bundle.offer_ends_detail,
            items=bundle.items,
            tiers=tier_reports,
            top_tier_status=top_tier_status,
        )
        display_title, display_type = _display_bundle_row_fields(bundle_report)
        bundle_report.display_title = display_title
        bundle_report.display_type = display_type
        bundle_report.progression_summary = _summarize_bundle_progression(bundle_report)
        bundle_reports.append(bundle_report)

    report = BundleOverlapReport(
        generated_at=_utc_now(),
        library_path=str(resolved_library_path),
        bundle_types=selected_bundle_types,
        bundle_count=len(bundle_reports),
        report_json_path=str(report_json_path),
        report_markdown_path=str(report_markdown_path),
        bundles=bundle_reports,
    )
    _write_json(report_json_path, report)
    _write_text(report_markdown_path, render_bundle_overlap_markdown(report))
    return report


def render_bundle_overlap_markdown(report: BundleOverlapReport) -> str:
    """Render a concise markdown summary for the saved overlap report."""

    report = _hydrate_bundle_display_fields(report)

    bundles_by_category = _group_bundles_by_category(report.bundles)

    lines: list[str] = [
        "# Current Humble Bundle overlap report",
        "",
        f"Generated: {report.generated_at}",
        f"Library: `{report.library_path}`",
        f"Bundles analyzed: {report.bundle_count}",
    ]

    for category in _ordered_categories(bundles_by_category):
        category_bundles = bundles_by_category[category]
        lines.extend(
            _render_category_section(
                category=_category_display_name(category),
                bundles=category_bundles,
            )
        )

    return "\n".join(lines).rstrip() + "\n"


def _ordered_categories(
    bundles_by_category: dict[str, list[BundleOverlapBundle]],
) -> list[str]:
    known_categories = [
        category
        for category in _CATEGORY_DISPLAY_ORDER
        if bundles_by_category.get(category)
    ]
    extra_categories = sorted(
        category
        for category, bundles in bundles_by_category.items()
        if bundles and category not in _CATEGORY_DISPLAY_ORDER
    )
    return known_categories + extra_categories


def _group_bundles_by_category(
    bundles: list[BundleOverlapBundle],
) -> dict[str, list[BundleOverlapBundle]]:
    grouped: defaultdict[str, list[BundleOverlapBundle]] = defaultdict(list)
    for bundle in bundles:
        grouped[bundle.category].append(bundle)

    return {
        category: sorted(
            category_bundles,
            key=lambda bundle: (bundle.title.lower(), bundle.bundle_type.lower()),
        )
        for category, category_bundles in grouped.items()
    }


def _category_display_name(category: str) -> str:
    return _CATEGORY_DISPLAY_NAMES.get(category, category.title())


def _render_category_section(
    *,
    category: str,
    bundles: list[BundleOverlapBundle],
) -> list[str]:
    lines = ["", f"## {category}", "", "### Tier progression summary", ""]
    lines.extend(_render_tier_progression_summary(bundles))

    lines.extend(
        [
            "",
            "### Tier value table",
            "",
            (
                "Tier columns run from lowest pledge to highest pledge for each bundle. "
                "Tier cells use four lines: pledge amount, owned count, new item count, and new-content percentage. "
                "Blank means the bundle does not offer that many tiers."
            ),
            "",
        ]
    )
    lines.extend(_render_category_tier_table(bundles))
    return lines


def _render_tier_progression_summary(bundles: list[BundleOverlapBundle]) -> list[str]:
    if not bundles:
        return ["- None", ""]

    return [
        f"- {bundle.title} — {_bundle_progression_summary(bundle)}"
        for bundle in bundles
    ]


def _summarize_bundle_progression(bundle: BundleOverlapBundle) -> str:
    if not bundle.tiers:
        return "no tier data"

    first_overlap_index = next(
        (index for index, tier in enumerate(bundle.tiers) if tier.owned_items > 0),
        None,
    )
    if first_overlap_index is None:
        return "all tiers are new"

    segments: list[str] = []
    if first_overlap_index > 0:
        last_all_new_tier = bundle.tiers[first_overlap_index - 1]
        segments.append(
            f"only new through {_format_price_value(last_all_new_tier.price_value)}"
        )

    overlap_threshold_indices = [
        index
        for index, tier in enumerate(bundle.tiers)
        if tier.owned_items > (bundle.tiers[index - 1].owned_items if index > 0 else 0)
    ]

    for position, threshold_index in enumerate(overlap_threshold_indices):
        threshold_tier = bundle.tiers[threshold_index]
        price_label = _format_price_value(threshold_tier.price_value)
        owned_label = _count_label(
            threshold_tier.owned_items, "owned item", "owned items"
        )
        segment = f"{price_label}+ include {owned_label}"

        next_threshold_index = (
            overlap_threshold_indices[position + 1]
            if position + 1 < len(overlap_threshold_indices)
            else len(bundle.tiers)
        )
        only_new_prices = [
            _format_price_value(tier.price_value)
            for tier in bundle.tiers[threshold_index + 1 : next_threshold_index]
            if tier.added_owned_items == 0 and tier.added_new_items > 0
        ]
        if only_new_prices:
            verb = "adds" if len(only_new_prices) == 1 else "add"
            segment += f"; {_format_price_list(only_new_prices)} only {verb} new"

        segments.append(segment)

    return "; ".join(segments)


def _render_category_tier_table(bundles: list[BundleOverlapBundle]) -> list[str]:
    max_tier_count = max((len(bundle.tiers) for bundle in bundles), default=0)
    if max_tier_count <= 0:
        return ["No tier data available."]

    lines = [
        '<table style="width: 100%; table-layout: fixed;">',
        "  <thead>",
        "    <tr>",
        '      <th align="left" style="width: 20%;">Bundle</th>',
        '      <th align="left" style="width: 10%;">Type</th>',
        *[
            f'      <th align="left">Tier {index}</th>'
            for index in range(1, max_tier_count + 1)
        ],
        "    </tr>",
        "  </thead>",
        "  <tbody>",
    ]

    for bundle in bundles:
        display_title, display_type = _bundle_display_fields(bundle)
        row_cells: list[str] = []
        for tier_index in range(max_tier_count):
            tier = bundle.tiers[tier_index] if tier_index < len(bundle.tiers) else None
            if tier is None:
                row_cells.append("      <td></td>")
                continue
            row_cells.append(
                '      <td style="vertical-align: top;">'
                + _render_multiline_cell(
                    [
                        _format_price_value(tier.price_value),
                        f"{tier.owned_items} already owned",
                        _count_label(tier.new_items, "new item", "new items"),
                        f"{_format_percent(tier.missing_percent)} new content",
                    ]
                )
                + "</td>"
            )

        lines.extend(
            [
                "    <tr>",
                '      <td style="vertical-align: top;">'
                + _render_multiline_cell(_wrap_bundle_title_lines(display_title))
                + "</td>",
                '      <td style="vertical-align: top;">'
                + escape(display_type)
                + "</td>",
                *row_cells,
                "    </tr>",
            ]
        )

    lines.extend(["  </tbody>", "</table>"])
    return lines


def _format_price_value(value: float) -> str:
    if value.is_integer():
        return f"${int(value)}"
    return f"${value:.2f}".rstrip("0").rstrip(".")


def _render_multiline_cell(lines: list[str]) -> str:
    return "".join(f"<div>{escape(line)}</div>" for line in lines)


def _bundle_display_fields(bundle: BundleOverlapBundle) -> tuple[str, str]:
    if bundle.display_title and bundle.display_type:
        return bundle.display_title, bundle.display_type
    return _display_bundle_row_fields(bundle)


def _bundle_progression_summary(bundle: BundleOverlapBundle) -> str:
    if bundle.progression_summary:
        return bundle.progression_summary
    return _summarize_bundle_progression(bundle)


def _display_bundle_row_fields(bundle: BundleOverlapBundle) -> tuple[str, str]:
    display_title = bundle.title
    display_type = _short_bundle_type(bundle.bundle_type)

    if bundle.category == "books":
        grouped_title, grouped_type = _split_books_title_and_type(bundle.title)
        if grouped_title and grouped_type:
            display_title = grouped_title
            display_type = grouped_type

    return display_title, display_type


def _split_books_title_and_type(title: str) -> tuple[str | None, str | None]:
    prefix, separator, remainder = title.partition(":")
    if separator != ":":
        return None, None

    cleaned_prefix = _clean_text(prefix)
    cleaned_remainder = _clean_text(remainder)
    if not cleaned_remainder:
        return None, None
    if not re.match(r"^Humble\s+.+\s+Bundle$", cleaned_prefix, re.IGNORECASE):
        return None, None

    base_type = re.sub(r"^Humble\s+", "", cleaned_prefix, flags=re.IGNORECASE)
    base_type = re.sub(r"\s+Bundle$", "", base_type, flags=re.IGNORECASE).strip()
    base_type = re.sub(r"^Comics$", "Comic", base_type, flags=re.IGNORECASE)

    if base_type.casefold() == "book":
        grouped_type, grouped_title = _extract_generic_book_grouping(cleaned_remainder)
        if grouped_type and grouped_title:
            return grouped_title, grouped_type

    return cleaned_remainder, base_type or None


def _extract_generic_book_grouping(value: str) -> tuple[str | None, str | None]:
    group, separator, remainder = value.partition(":")
    cleaned_group = _clean_text(group)
    cleaned_remainder = _clean_text(remainder)
    if separator == ":" and cleaned_group and cleaned_remainder:
        return cleaned_group, cleaned_remainder

    by_match = re.match(
        r"^(?P<group>.+?)\s+by\s+(?P<publisher>.+)$", value, re.IGNORECASE
    )
    if by_match is None:
        return None, None

    cleaned_group = _clean_text(by_match.group("group"))
    cleaned_full_title = _clean_text(value)
    if not cleaned_group or not cleaned_full_title:
        return None, None

    return cleaned_group, cleaned_full_title


def _wrap_bundle_title_lines(title: str, *, target_length: int = 28) -> list[str]:
    if len(title) <= target_length:
        return [title]

    words = title.split()
    wrapped: list[str] = []
    current_line: list[str] = []
    current_length = 0
    for word in words:
        projected_length = current_length + len(word) + (1 if current_line else 0)
        if current_line and projected_length > target_length:
            wrapped.append(" ".join(current_line))
            current_line = [word]
            current_length = len(word)
            continue
        current_line.append(word)
        current_length = projected_length

    if current_line:
        wrapped.append(" ".join(current_line))

    return wrapped or [title]


def _format_price_list(values: list[str]) -> str:
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def _count_label(count: int, singular: str, plural: str) -> str:
    label = singular if count == 1 else plural
    return f"{count} {label}"


def _short_bundle_type(bundle_type: str) -> str:
    shortened = re.sub(r"\s+Bundle$", "", bundle_type).strip()
    return shortened or bundle_type


def _format_percent(value: float) -> str:
    rounded = round(value, 1)
    if rounded.is_integer():
        return f"{int(rounded)}%"
    return f"{rounded:.1f}%"


def _hydrate_bundle_display_fields(report: BundleOverlapReport) -> BundleOverlapReport:
    if not report.bundle_types:
        report.bundle_types = _ordered_categories(
            _group_bundles_by_category(report.bundles)
        )

    for bundle in report.bundles:
        if not bundle.display_title or not bundle.display_type:
            display_title, display_type = _display_bundle_row_fields(bundle)
            bundle.display_title = bundle.display_title or display_title
            bundle.display_type = bundle.display_type or display_type
        if not bundle.progression_summary:
            bundle.progression_summary = _summarize_bundle_progression(bundle)

    return report


def load_bundle_overlap_report(report_json_path: Path) -> BundleOverlapReport:
    """Load a saved bundle overlap report and backfill display metadata."""

    resolved_report_path = report_json_path.expanduser().resolve()
    if not resolved_report_path.exists():
        raise FileNotFoundError(
            f"Current bundle report not found: {resolved_report_path}"
        )

    report = BundleOverlapReport.model_validate_json(
        resolved_report_path.read_text(encoding="utf-8")
    )
    return _hydrate_bundle_display_fields(report)


def capture_and_report_current_bundles(
    *,
    output_dir: Path,
    library_path: Path,
    bundle_types: list[str] | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> BundleWorkflowArtifacts:
    """Fetch current bundle pages into saved artifacts and write the overlap report."""

    selected_bundle_types = normalize_bundle_types(bundle_types)

    catalog = fetch_current_bundle_catalog(
        output_dir=output_dir,
        bundle_types=selected_bundle_types,
        timeout_seconds=timeout_seconds,
    )
    report = build_bundle_overlap_report(
        catalog,
        library_path=library_path,
        output_dir=output_dir,
        bundle_types=selected_bundle_types,
    )
    return BundleWorkflowArtifacts(
        output_dir=str(output_dir.expanduser().resolve()),
        index_html_path=catalog.index_html_path,
        bundle_links_path=catalog.bundle_links_path,
        catalog_json_path=catalog.catalog_json_path,
        report_json_path=report.report_json_path,
        report_markdown_path=report.report_markdown_path,
        bundle_types=selected_bundle_types,
        bundle_count=report.bundle_count,
    )
