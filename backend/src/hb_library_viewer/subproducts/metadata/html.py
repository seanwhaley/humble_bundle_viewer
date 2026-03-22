"""HTML extraction helpers for cached subproduct metadata pages."""

from __future__ import annotations

import json
import re
from html import unescape
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from .models import SubproductPageDetails
from .store import now_iso
from ..pages.models import SubproductPageManifestEntry

_JSON_LD_SELECTOR = "script[type='application/ld+json']"
_TYPE_PRIORITY = {
    "book": 100,
    "audiobook": 98,
    "audiowork": 95,
    "product": 85,
    "creativework": 75,
    "thing": 10,
}
_DESCRIPTION_HEADING_RE = re.compile(
    r"^(description|summary|synopsis|about the book|book description|blurb)$",
    re.IGNORECASE,
)
_TAG_SPLIT_RE = re.compile(r"\s*[,;|]\s*")


def clean_text(value: str | None) -> str | None:
    """Normalize text extracted from markup or structured metadata."""
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if "<" in text and ">" in text:
        text = BeautifulSoup(text, "html.parser").get_text(" ", strip=True)
    text = " ".join(unescape(text).split())
    return text or None


def dedupe_preserving_order(values: list[str]) -> list[str]:
    """Return cleaned strings without duplicates while preserving order."""
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        cleaned = clean_text(value)
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(cleaned)
    return ordered


def flatten_json_ld(payload: object) -> list[dict[str, object]]:
    """Flatten JSON-LD payloads and @graph structures into plain objects."""
    if isinstance(payload, list):
        objects: list[dict[str, object]] = []
        for item in payload:
            objects.extend(flatten_json_ld(item))
        return objects

    if not isinstance(payload, dict):
        return []

    objects: list[dict[str, object]] = []
    graph = payload.get("@graph")
    if graph is not None:
        objects.extend(flatten_json_ld(graph))

    candidate = dict(payload)
    candidate.pop("@graph", None)
    if candidate:
        objects.append(candidate)

    return objects


def load_json_ld_objects(soup: BeautifulSoup) -> list[dict[str, object]]:
    """Extract and parse JSON-LD script blocks from a page."""
    objects: list[dict[str, object]] = []
    for script in soup.select(_JSON_LD_SELECTOR):
        raw = script.string or script.get_text()
        if not raw or not raw.strip():
            continue
        normalized = raw.strip().strip("\ufeff")
        if normalized.startswith("<!--") and normalized.endswith("-->"):
            normalized = normalized[4:-3].strip()
        try:
            payload = json.loads(normalized)
        except ValueError:
            continue
        objects.extend(flatten_json_ld(payload))
    return objects


def coerce_names(value: object) -> list[str]:
    """Coerce structured values into a de-duplicated list of names."""
    if value is None:
        return []
    if isinstance(value, str):
        cleaned = clean_text(value)
        return [cleaned] if cleaned else []
    if isinstance(value, list):
        names: list[str] = []
        for item in value:
            names.extend(coerce_names(item))
        return dedupe_preserving_order(names)
    if isinstance(value, dict):
        names: list[str] = []
        direct_name = value.get("name")
        if isinstance(direct_name, str):
            cleaned = clean_text(direct_name)
            if cleaned:
                names.append(cleaned)
        for nested_key in ("author", "creator", "publisher"):
            nested = value.get(nested_key)
            if nested is not None and nested is not value:
                names.extend(coerce_names(nested))
        return dedupe_preserving_order(names)
    return []


def coerce_single_name(value: object) -> str | None:
    """Return the first normalized name extracted from a structured value."""
    names = coerce_names(value)
    return names[0] if names else None


def coerce_image_url(value: object) -> str | None:
    """Extract a representative image URL from a structured value."""
    if value is None:
        return None
    if isinstance(value, str):
        return clean_text(value)
    if isinstance(value, list):
        for item in value:
            image_url = coerce_image_url(item)
            if image_url:
                return image_url
        return None
    if isinstance(value, dict):
        for key in ("url", "contentUrl", "thumbnailUrl"):
            image_url = value.get(key)
            if isinstance(image_url, str):
                cleaned = clean_text(image_url)
                if cleaned:
                    return cleaned
    return None


def coerce_keywords(value: object) -> list[str]:
    """Normalize keyword values into a tag list."""
    if value is None:
        return []
    if isinstance(value, str):
        return dedupe_preserving_order(
            [part for part in _TAG_SPLIT_RE.split(value) if part.strip()]
        )
    if isinstance(value, list):
        tags: list[str] = []
        for item in value:
            tags.extend(coerce_keywords(item))
        return dedupe_preserving_order(tags)
    return []


def coerce_isbns(source: dict[str, object]) -> list[str]:
    """Collect ISBN-like identifiers from structured metadata."""
    values: list[str] = []
    for key in ("isbn", "isbn13", "gtin13", "gtin", "sku"):
        raw = source.get(key)
        if raw is None:
            continue
        if isinstance(raw, list):
            values.extend(str(item) for item in raw if item is not None)
        else:
            values.append(str(raw))
    cleaned = []
    for value in values:
        normalized = clean_text(value)
        if normalized:
            cleaned.append(normalized)
    return dedupe_preserving_order(cleaned)


def json_ld_types(source: dict[str, object]) -> list[str]:
    """Normalize the @type field from JSON-LD objects."""
    raw_type = source.get("@type")
    if isinstance(raw_type, str):
        return [raw_type.casefold()]
    if isinstance(raw_type, list):
        return [str(item).casefold() for item in raw_type]
    return []


def json_ld_candidate_score(source: dict[str, object]) -> int:
    """Score JSON-LD objects to prefer book-like objects with rich fields."""
    score = max(
        (_TYPE_PRIORITY.get(type_name, 0) for type_name in json_ld_types(source)),
        default=0,
    )
    if source.get("name") or source.get("headline"):
        score += 20
    if source.get("description"):
        score += 10
    if source.get("author") or source.get("creator"):
        score += 5
    if source.get("publisher"):
        score += 5
    return score


def select_best_json_ld_candidate(
    objects: list[dict[str, object]],
) -> dict[str, object] | None:
    """Pick the most useful JSON-LD object from a page."""
    if not objects:
        return None
    return max(objects, key=json_ld_candidate_score)


def extract_meta_content(
    soup: BeautifulSoup,
    *,
    names: tuple[str, ...] = (),
    properties: tuple[str, ...] = (),
    itemprops: tuple[str, ...] = (),
) -> str | None:
    """Extract meta/itemprop content using common metadata selector patterns."""
    for name in names:
        node = soup.find("meta", attrs={"name": name})
        if node and node.get("content"):
            cleaned = clean_text(str(node.get("content")))
            if cleaned:
                return cleaned
    for prop in properties:
        node = soup.find("meta", attrs={"property": prop})
        if node and node.get("content"):
            cleaned = clean_text(str(node.get("content")))
            if cleaned:
                return cleaned
    for itemprop in itemprops:
        node = soup.find(attrs={"itemprop": itemprop})
        if node:
            content = node.get("content") if hasattr(node, "get") else None
            if content:
                cleaned = clean_text(str(content))
                if cleaned:
                    return cleaned
            cleaned = clean_text(node.get_text(" ", strip=True))
            if cleaned:
                return cleaned
    return None


def extract_dom_title(soup: BeautifulSoup) -> str | None:
    """Extract a plausible visible title from common page structures."""
    for selector in (
        "h1",
        "main h1",
        "[itemprop='name']",
        ".product-title",
        ".page-title",
    ):
        for node in soup.select(selector):
            cleaned = clean_text(node.get_text(" ", strip=True))
            if cleaned and len(cleaned) <= 240:
                return cleaned
    return None


def extract_dom_description(soup: BeautifulSoup) -> str | None:
    """Extract a visible description block from common page structures."""
    candidates: list[str] = []
    for selector in (
        "#long-description",
        "[itemprop='description']",
        ".product-description",
        ".book-description",
        ".description",
        "article .description",
        "main .description",
    ):
        for node in soup.select(selector):
            cleaned = clean_text(node.get_text(" ", strip=True))
            if cleaned and 60 <= len(cleaned) <= 8000:
                candidates.append(cleaned)

    if candidates:
        return max(candidates, key=len)

    for heading in soup.find_all(["h2", "h3"]):
        heading_text = clean_text(heading.get_text(" ", strip=True))
        if not heading_text or not _DESCRIPTION_HEADING_RE.match(heading_text):
            continue
        blocks: list[str] = []
        sibling = heading.find_next_sibling()
        while sibling is not None and getattr(sibling, "name", None) not in {
            "h1",
            "h2",
            "h3",
        }:
            cleaned = clean_text(sibling.get_text(" ", strip=True))
            if cleaned:
                blocks.append(cleaned)
            sibling = sibling.find_next_sibling()
        if blocks:
            description = clean_text(" ".join(blocks))
            if description and len(description) >= 60:
                return description

    for node in soup.select("main p, article p"):
        cleaned = clean_text(node.get_text(" ", strip=True))
        if cleaned and len(cleaned) >= 120:
            return cleaned
    return None


def extract_details_from_html(
    html_text: str,
    entry: SubproductPageManifestEntry,
) -> SubproductPageDetails:
    """Extract structured metadata from cached HTML for one manifest entry."""
    soup = BeautifulSoup(html_text, "html.parser")
    json_ld_objects = load_json_ld_objects(soup)
    json_ld = select_best_json_ld_candidate(json_ld_objects)

    reference_title = next(
        (
            reference.subproduct_name
            for reference in entry.references
            if reference.subproduct_name
        ),
        None,
    )
    reference_publisher = next(
        (
            reference.payee_name
            for reference in entry.references
            if reference.payee_name
        ),
        None,
    )

    json_ld_title = None
    json_ld_subtitle = None
    json_ld_description = None
    json_ld_authors: list[str] = []
    json_ld_publisher = None
    json_ld_series = None
    json_ld_language = None
    json_ld_image = None
    json_ld_tags: list[str] = []
    json_ld_isbns: list[str] = []
    if json_ld is not None:
        json_ld_title = clean_text(
            str(json_ld.get("name") or json_ld.get("headline") or "")
        )
        json_ld_subtitle = clean_text(str(json_ld.get("alternativeHeadline") or ""))
        json_ld_description = clean_text(str(json_ld.get("description") or ""))
        json_ld_authors = coerce_names(json_ld.get("author") or json_ld.get("creator"))
        json_ld_publisher = coerce_single_name(json_ld.get("publisher"))
        json_ld_series = clean_text(
            str(json_ld.get("isPartOf") or json_ld.get("series") or "")
        )
        json_ld_language = clean_text(str(json_ld.get("inLanguage") or ""))
        json_ld_image = coerce_image_url(json_ld.get("image"))
        json_ld_tags = coerce_keywords(json_ld.get("keywords"))
        json_ld_isbns = coerce_isbns(json_ld)

    title = (
        json_ld_title
        or extract_meta_content(
            soup,
            properties=("og:title", "twitter:title"),
            itemprops=("name",),
        )
        or extract_dom_title(soup)
        or reference_title
        or entry.page_title
    )
    subtitle = json_ld_subtitle
    description = (
        json_ld_description
        or extract_meta_content(
            soup,
            names=("description",),
            properties=("og:description", "twitter:description"),
            itemprops=("description",),
        )
        or extract_dom_description(soup)
    )
    authors = json_ld_authors or coerce_names(
        extract_meta_content(
            soup,
            names=("author",),
            properties=("book:author", "article:author"),
        )
    )
    publisher = (
        json_ld_publisher
        or extract_meta_content(soup, properties=("og:site_name",))
        or reference_publisher
    )
    series = json_ld_series
    language = json_ld_language or clean_text(
        soup.html.get("lang") if soup.html else None
    )
    image_url = json_ld_image or extract_meta_content(
        soup,
        properties=("og:image", "twitter:image"),
        itemprops=("image",),
    )
    tags = dedupe_preserving_order(
        json_ld_tags + coerce_keywords(extract_meta_content(soup, names=("keywords",)))
    )
    isbns = dedupe_preserving_order(json_ld_isbns)

    return SubproductPageDetails(
        url=entry.url,
        final_url=entry.final_url,
        replacement_url=entry.replacement_url,
        page_title=entry.page_title,
        title=title,
        subtitle=subtitle,
        description=description,
        authors=authors,
        publisher=publisher,
        series=series,
        language=language,
        image_url=image_url,
        tags=tags,
        isbns=isbns,
        source_host=(urlparse(entry.final_url or entry.url).netloc or None),
        status_code=entry.status_code,
        content_type=entry.content_type,
        html_path=entry.html_path,
        recovery_method=entry.recovery_method,
        extracted_at=now_iso(),
    )
