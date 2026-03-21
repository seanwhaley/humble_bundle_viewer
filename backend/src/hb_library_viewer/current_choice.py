"""Fetch the current Humble Choice page and report overlap against the library.

This module provides a reusable workflow for:

- fetching the live ``https://www.humblebundle.com/membership`` page
- saving the raw Humble Choice HTML used for the current month summary
- parsing the current month label, monthly price, and included game titles
- comparing those titles against ``library_products.json``
- writing machine-readable JSON plus a markdown summary report
"""

from __future__ import annotations

from collections import defaultdict
from html import escape, unescape
import json
from pathlib import Path
import re

from bs4 import BeautifulSoup, Tag
from pydantic import BaseModel, Field
import requests

from .current_bundles import (
    DEFAULT_TIMEOUT_SECONDS,
    USER_AGENT,
    _clean_text,
    _dedupe_titles,
    _fetch_rendered_htmls,
    _utc_now,
    _write_json,
    _write_text,
)
from .parsing import LibraryData
from .sync import load_library_data
from .subproducts.pages.search import normalize_search_text, title_query_variants

CURRENT_CHOICE_URL = "https://www.humblebundle.com/membership"

_HEADING_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6")
_CHOICE_SECTION_MARKER = "This Month's Games"
_CHOICE_SECTION_END_MARKERS = (
    "Get Rewarded For Being a Member",
    "Get Your Games Today",
    "Supporting Charity in Everything We Do",
    "About",
    "Trending Games",
)
_CHOICE_MONTH_PATTERNS = (
    re.compile(r"Get\s+(?P<month>[A-Za-z]+)[’']s\s+Games", re.IGNORECASE),
    re.compile(
        r"(?P<month>[A-Za-z]+)[’']s\s+Humble Choice",
        re.IGNORECASE,
    ),
)
_CHOICE_PRICE_PATTERNS = (
    re.compile(
        r"Humble Choice for only \$(?P<price>[\d]+(?:\.[\d]+)?)",
        re.IGNORECASE,
    ),
    re.compile(r"only \$(?P<price>[\d]+(?:\.[\d]+)?)/month", re.IGNORECASE),
)
_CHOICE_GENERIC_VALUES = {
    "this month's games",
    "featured game",
    "read our recommendation",
    "join choice",
    "join now",
    "get rewarded for being a member",
    "get your games today",
    "supporting charity in everything we do",
    "play even more games!",
    "explore the vault",
    "rewards illustration",
    "about",
    "trending games",
}
_CHOICE_GENRE_WORDS = {
    "action",
    "adventure",
    "casual",
    "fan favorite",
    "horror",
    "indie",
    "puzzle",
    "racing",
    "rpg",
    "simulation",
    "sports",
    "strategy",
}
_PROMOTIONAL_DELIVERY_METHODS = {"other-key"}


class CurrentChoiceGame(BaseModel):
    """One current-month Humble Choice title compared with the local library."""

    title: str
    owned: bool = False
    matched_library_titles: list[str] = Field(default_factory=list)


class CurrentChoicePageSnapshot(BaseModel):
    """Parsed snapshot of the current Humble Choice page."""

    fetched_at: str
    page_url: str
    page_html_path: str
    snapshot_json_path: str
    month_label: str
    price_label: str | None = None
    price_value: float | None = Field(default=None, ge=0)
    titles: list[str] = Field(default_factory=list)


class CurrentChoiceReport(BaseModel):
    """Saved overlap report for the current Humble Choice month."""

    generated_at: str
    month_label: str
    page_url: str
    page_html_path: str
    snapshot_json_path: str
    library_path: str
    price_label: str | None = None
    price_value: float | None = Field(default=None, ge=0)
    total_titles: int = Field(ge=0)
    owned_titles: int = Field(ge=0)
    new_titles: int = Field(ge=0)
    owned_percent: float = Field(default=0, ge=0, le=100)
    new_percent: float = Field(default=0, ge=0, le=100)
    report_json_path: str
    report_markdown_path: str
    games: list[CurrentChoiceGame] = Field(default_factory=list)


class CurrentChoiceWorkflowArtifacts(BaseModel):
    """Top-level paths returned by the current Humble Choice workflow."""

    output_dir: str
    page_html_path: str
    snapshot_json_path: str
    report_json_path: str
    report_markdown_path: str
    month_label: str
    game_count: int = Field(ge=0)


def _find_casefold_index(value: str, marker: str, *, start: int = 0) -> int:
    return value.casefold().find(marker.casefold(), start)


def _slice_choice_section_html(html_text: str) -> str | None:
    start = _find_casefold_index(html_text, _CHOICE_SECTION_MARKER)
    if start < 0:
        return None

    end_positions = [
        index
        for marker in _CHOICE_SECTION_END_MARKERS
        if (index := _find_casefold_index(html_text, marker, start=start + 1)) >= 0
    ]
    end = min(end_positions) if end_positions else len(html_text)
    return html_text[start:end]


def _find_choice_section(soup: BeautifulSoup) -> Tag | None:
    section = soup.select_one("section.marketing-your-games")
    if isinstance(section, Tag):
        return section

    for heading in soup.find_all(_HEADING_TAGS):
        heading_text = _clean_text(heading.get_text(" ", strip=True))
        if heading_text.casefold() != _CHOICE_SECTION_MARKER.casefold():
            continue

        for parent in heading.parents:
            if not isinstance(parent, Tag):
                continue
            class_names = {str(name) for name in parent.get("class", [])}
            if "marketing-your-games" in class_names or parent.select_one(
                ".discover-game"
            ):
                return parent

        return heading.parent if isinstance(heading.parent, Tag) else None

    return None


def _extract_choice_month_label(html_text: str, soup: BeautifulSoup) -> str:
    haystacks = [
        html_text,
        " ".join(_clean_text(text) for text in soup.stripped_strings),
    ]
    for haystack in haystacks:
        for pattern in _CHOICE_MONTH_PATTERNS:
            match = pattern.search(haystack)
            if match is not None:
                month = _clean_text(match.group("month"))
                if month:
                    return month
    return "Current"


def _extract_choice_price(
    html_text: str,
    soup: BeautifulSoup,
) -> tuple[str | None, float | None]:
    haystacks = [
        html_text,
        " ".join(_clean_text(text) for text in soup.stripped_strings),
    ]
    for haystack in haystacks:
        for pattern in _CHOICE_PRICE_PATTERNS:
            match = pattern.search(haystack)
            if match is None:
                continue
            raw_price = match.group("price")
            price_value = float(raw_price)
            return f"${price_value:.2f}/month", price_value
    return None, None


def _is_choice_title_candidate(value: str) -> bool:
    cleaned = _clean_text(value)
    if not cleaned or len(cleaned) > 120:
        return False

    lowered = cleaned.casefold()
    if lowered in _CHOICE_GENERIC_VALUES:
        return False
    if "positive" in lowered or "recommendation" in lowered:
        return False
    if lowered.startswith("get ") or lowered.startswith("join "):
        return False
    if lowered.startswith("play even more") or lowered.startswith("discover more"):
        return False
    if lowered.startswith("own all this month") or lowered.startswith(
        "supporting charity"
    ):
        return False
    if cleaned.startswith("$"):
        return False
    if re.search(r"\d{1,3}(?:,\d{3})+", cleaned):
        return False
    if "," in cleaned:
        tokens = {token.strip().casefold() for token in cleaned.split(",")}
        if tokens and tokens.issubset(_CHOICE_GENRE_WORDS):
            return False
    return True


def _extract_choice_titles_from_embedded_data(section_soup: BeautifulSoup) -> list[str]:
    payload_host = section_soup.find(attrs={"data-content-choice-data": True})
    if not isinstance(payload_host, Tag):
        return []

    raw_payload = payload_host.get("data-content-choice-data")
    raw_display_order = payload_host.get("data-display-order")
    if not raw_payload or not raw_display_order:
        return []

    try:
        payload = json.loads(unescape(str(raw_payload)))
        display_order = json.loads(unescape(str(raw_display_order)))
    except (TypeError, ValueError, json.JSONDecodeError):
        return []

    if not isinstance(payload, dict) or not isinstance(display_order, list):
        return []

    titles: list[str] = []
    for machine_name in display_order:
        if not isinstance(machine_name, str):
            continue

        raw_entry = payload.get(machine_name)
        if not isinstance(raw_entry, dict):
            continue

        title = _clean_text(str(raw_entry.get("title") or ""))
        if not _is_choice_title_candidate(title):
            continue

        delivery_methods = {
            str(method).strip().casefold()
            for method in (raw_entry.get("delivery_methods") or [])
            if method
        }
        platforms = [item for item in (raw_entry.get("platforms") or []) if item]
        genres = [item for item in (raw_entry.get("genres") or []) if item]
        if (
            delivery_methods
            and delivery_methods.issubset(_PROMOTIONAL_DELIVERY_METHODS)
            and not platforms
            and not genres
        ):
            continue

        titles.append(title)

    return _dedupe_titles(titles)


def _collect_choice_titles(section_soup: BeautifulSoup) -> list[str]:
    structured_titles = _extract_choice_titles_from_embedded_data(section_soup)
    if structured_titles:
        return structured_titles

    human_name_titles = _dedupe_titles(
        [
            title
            for title in (
                _clean_text(node.get_text(" ", strip=True))
                for node in section_soup.select(".discover-game .human-name")
            )
            if _is_choice_title_candidate(title)
        ]
    )
    if human_name_titles:
        return human_name_titles

    candidates: list[str] = []

    for tag in section_soup.find_all(True):
        if tag.name == "img":
            alt_text = _clean_text(tag.get("alt"))
            if _is_choice_title_candidate(alt_text):
                candidates.append(alt_text)
            continue

        if tag.name in _HEADING_TAGS:
            heading_text = _clean_text(tag.get_text(" ", strip=True))
            if _is_choice_title_candidate(heading_text):
                candidates.append(heading_text)

    deduped = _dedupe_titles(candidates)
    if deduped:
        return deduped

    fallback_values = [
        _clean_text(text)
        for text in section_soup.stripped_strings
        if _is_choice_title_candidate(text)
    ]
    return _dedupe_titles(fallback_values)


def parse_current_choice_page_html(
    html_text: str,
    *,
    url: str,
    fetched_at: str,
    page_html_path: Path,
    snapshot_json_path: Path,
) -> CurrentChoicePageSnapshot:
    """Parse the current Humble Choice page into a saved snapshot model."""

    soup = BeautifulSoup(html_text, "html.parser")
    section = _find_choice_section(soup)
    if section is not None:
        section_soup = BeautifulSoup(str(section), "html.parser")
    else:
        section_html = _slice_choice_section_html(html_text)
        section_soup = BeautifulSoup(section_html or html_text, "html.parser")
    titles = _collect_choice_titles(section_soup)
    if not titles:
        raise ValueError(
            "Unable to extract current Humble Choice titles from page HTML"
        )

    price_label, price_value = _extract_choice_price(html_text, soup)
    return CurrentChoicePageSnapshot(
        fetched_at=fetched_at,
        page_url=url,
        page_html_path=str(page_html_path),
        snapshot_json_path=str(snapshot_json_path),
        month_label=_extract_choice_month_label(html_text, soup),
        price_label=price_label,
        price_value=price_value,
        titles=titles,
    )


def _collect_library_titles(library: LibraryData) -> list[str]:
    titles: list[str] = []
    for product in library.products:
        titles.extend([product.product_name, product.machine_name])
        for key in product.keys:
            titles.extend([key.human_name, key.machine_name])
        for subproduct in product.subproducts:
            titles.extend([subproduct.human_name, subproduct.machine_name])
            for key in subproduct.keys:
                titles.extend([key.human_name, key.machine_name])
    return _dedupe_titles([title for title in titles if title])


def _build_library_variant_map(library: LibraryData) -> dict[str, list[str]]:
    variant_map: defaultdict[str, set[str]] = defaultdict(set)
    for title in _collect_library_titles(library):
        cleaned_title = _clean_text(title)
        if not cleaned_title:
            continue
        for variant in title_query_variants(cleaned_title) or [cleaned_title]:
            normalized = normalize_search_text(variant)
            if normalized:
                variant_map[normalized].add(cleaned_title)
        normalized_title = normalize_search_text(cleaned_title)
        if normalized_title:
            variant_map[normalized_title].add(cleaned_title)

    return {
        variant: sorted(values, key=lambda item: item.casefold())
        for variant, values in variant_map.items()
    }


def _matching_library_titles(
    title: str,
    library_variants: dict[str, list[str]],
) -> list[str]:
    matches: list[str] = []
    seen: set[str] = set()
    for variant in title_query_variants(title) or [title]:
        normalized = normalize_search_text(variant)
        if not normalized:
            continue
        for matched_title in library_variants.get(normalized, []):
            key = normalize_search_text(matched_title) or matched_title.casefold()
            if key in seen:
                continue
            seen.add(key)
            matches.append(matched_title)
    return matches


def _percent(part: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return (part / total) * 100


def _format_percent(value: float) -> str:
    rounded = round(value, 1)
    if rounded.is_integer():
        return f"{int(rounded)}%"
    return f"{rounded:.1f}%"


def build_current_choice_report(
    snapshot: CurrentChoicePageSnapshot,
    *,
    library_path: Path,
    output_dir: Path,
) -> CurrentChoiceReport:
    """Compare the current Humble Choice month against the local library."""

    resolved_library_path = library_path.expanduser().resolve()
    library = load_library_data(resolved_library_path)
    library_variants = _build_library_variant_map(library)
    resolved_output_dir = output_dir.expanduser().resolve()
    report_json_path = resolved_output_dir / "choice_overlap_report.json"
    report_markdown_path = resolved_output_dir / "choice_overlap_report.md"

    games: list[CurrentChoiceGame] = []
    for title in snapshot.titles:
        matches = _matching_library_titles(title, library_variants)
        games.append(
            CurrentChoiceGame(
                title=title,
                owned=bool(matches),
                matched_library_titles=matches,
            )
        )

    total_titles = len(games)
    owned_titles = sum(1 for game in games if game.owned)
    new_titles = total_titles - owned_titles
    report = CurrentChoiceReport(
        generated_at=_utc_now(),
        month_label=snapshot.month_label,
        page_url=snapshot.page_url,
        page_html_path=snapshot.page_html_path,
        snapshot_json_path=snapshot.snapshot_json_path,
        library_path=str(resolved_library_path),
        price_label=snapshot.price_label,
        price_value=snapshot.price_value,
        total_titles=total_titles,
        owned_titles=owned_titles,
        new_titles=new_titles,
        owned_percent=_percent(owned_titles, total_titles),
        new_percent=_percent(new_titles, total_titles),
        report_json_path=str(report_json_path),
        report_markdown_path=str(report_markdown_path),
        games=games,
    )
    _write_json(report_json_path, report)
    _write_text(report_markdown_path, render_current_choice_markdown(report))
    return report


def render_current_choice_markdown(report: CurrentChoiceReport) -> str:
    """Render a concise markdown summary for the current Humble Choice report."""

    lines = [
        "# Current Humble Choice overlap report",
        "",
        f"Generated: {report.generated_at}",
        f"Month: {report.month_label}",
        f"Choice page: {report.page_url}",
        f"Library: `{report.library_path}`",
        f"Games analyzed: {report.total_titles}",
        f"Already in library: {report.owned_titles}",
        f"New this month: {report.new_titles} ({_format_percent(report.new_percent)})",
    ]

    if report.price_label:
        lines.append(f"Price: {report.price_label}")

    lines.extend(
        [
            "",
            "## Current month table",
            "",
            '<table style="width: 100%; table-layout: fixed;">',
            "  <thead>",
            "    <tr>",
            '      <th align="left" style="width: 42%;">Game</th>',
            '      <th align="left" style="width: 16%;">Status</th>',
            '      <th align="left">Matched library titles</th>',
            "    </tr>",
            "  </thead>",
            "  <tbody>",
        ]
    )

    for game in report.games:
        lines.extend(
            [
                "    <tr>",
                f'      <td style="vertical-align: top;">{escape(game.title)}</td>',
                (
                    '      <td style="vertical-align: top;">Already owned</td>'
                    if game.owned
                    else '      <td style="vertical-align: top;">New this month</td>'
                ),
                (
                    '      <td style="vertical-align: top;">'
                    + escape("; ".join(game.matched_library_titles))
                    + "</td>"
                    if game.matched_library_titles
                    else '      <td style="vertical-align: top;"></td>'
                ),
                "    </tr>",
            ]
        )

    lines.extend(["  </tbody>", "</table>"])
    return "\n".join(lines).rstrip() + "\n"


def load_current_choice_report(report_json_path: Path) -> CurrentChoiceReport:
    """Load a saved current Humble Choice report from disk."""

    resolved_report_path = report_json_path.expanduser().resolve()
    if not resolved_report_path.exists():
        raise FileNotFoundError(
            f"Current Humble Choice report not found: {resolved_report_path}"
        )

    return CurrentChoiceReport.model_validate_json(
        resolved_report_path.read_text(encoding="utf-8")
    )


def capture_and_report_current_choice(
    *,
    output_dir: Path,
    library_path: Path,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> CurrentChoiceWorkflowArtifacts:
    """Fetch the live Humble Choice page and build overlap analysis artifacts."""

    resolved_output_dir = output_dir.expanduser().resolve()
    page_html_path = resolved_output_dir / "membership.html"
    snapshot_json_path = resolved_output_dir / "choice_snapshot.json"

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    response = session.get(CURRENT_CHOICE_URL, timeout=timeout_seconds)
    response.raise_for_status()
    html_text = response.text
    fetched_at = _utc_now()

    try:
        snapshot = parse_current_choice_page_html(
            html_text,
            url=CURRENT_CHOICE_URL,
            fetched_at=fetched_at,
            page_html_path=page_html_path,
            snapshot_json_path=snapshot_json_path,
        )
    except ValueError:
        rendered_html = _fetch_rendered_htmls(
            [CURRENT_CHOICE_URL],
            timeout_seconds=timeout_seconds,
        )[CURRENT_CHOICE_URL]
        html_text = rendered_html
        snapshot = parse_current_choice_page_html(
            html_text,
            url=CURRENT_CHOICE_URL,
            fetched_at=_utc_now(),
            page_html_path=page_html_path,
            snapshot_json_path=snapshot_json_path,
        )

    _write_text(page_html_path, html_text)
    _write_json(snapshot_json_path, snapshot)
    report = build_current_choice_report(
        snapshot,
        library_path=library_path,
        output_dir=resolved_output_dir,
    )
    return CurrentChoiceWorkflowArtifacts(
        output_dir=str(resolved_output_dir),
        page_html_path=str(page_html_path),
        snapshot_json_path=str(snapshot_json_path),
        report_json_path=report.report_json_path,
        report_markdown_path=report.report_markdown_path,
        month_label=report.month_label,
        game_count=report.total_titles,
    )
