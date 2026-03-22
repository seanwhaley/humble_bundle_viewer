"""Reusable analysis helpers for extracted subproduct metadata."""

from __future__ import annotations

from datetime import date
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pandas as pd


FIELDS = [
    "final_url",
    "replacement_url",
    "page_title",
    "title",
    "subtitle",
    "description",
    "authors",
    "publisher",
    "series",
    "language",
    "image_url",
    "tags",
    "isbns",
    "source_host",
    "status_code",
    "content_type",
    "html_path",
    "recovery_method",
    "extracted_at",
]

CORE_CONTENT_FIELDS = [
    "title",
    "description",
    "authors",
    "publisher",
    "language",
    "image_url",
    "tags",
    "isbns",
    "subtitle",
    "series",
]

STRING_FIELDS = [
    "final_url",
    "replacement_url",
    "page_title",
    "title",
    "subtitle",
    "description",
    "publisher",
    "series",
    "language",
    "image_url",
    "source_host",
    "content_type",
    "html_path",
    "recovery_method",
]

LIST_FIELDS = ["authors", "tags", "isbns"]


def metadata_analysis_markdown_path(base_dir: Path) -> Path:
    """Return the default markdown analysis path for a cache directory."""

    date_stamp = date.today().isoformat()
    return base_dir / f"subproduct_metadata_coverage_summary_{date_stamp}.md"


def _present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return len(value) > 0
    return True


def _string_length(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return len(stripped) if stripped else None


def _list_length(value: Any) -> int | None:
    if not isinstance(value, list):
        return None
    return len(value) if value else None


def _markdown_table(dataframe: pd.DataFrame) -> str:
    if dataframe.empty:
        return "| _No rows_ |\n|---|"

    headers = [str(column) for column in dataframe.columns]
    align_row: list[str] = []
    for dtype in dataframe.dtypes:
        align_row.append("---:" if pd.api.types.is_numeric_dtype(dtype) else "---")

    lines = [
        "| " + " | ".join(headers) + " |",
        "|" + "|".join(align_row) + "|",
    ]
    for _, row in dataframe.iterrows():
        values = []
        for value in row.tolist():
            if pd.isna(value):
                values.append("")
            else:
                values.append(str(value).replace("\n", " "))
        lines.append("| " + " | ".join(values) + " |")
    return "\n".join(lines)


def _trim_text(value: Any, *, limit: int = 120) -> str:
    text = str(value or "").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}…"


def _load_details_frame(metadata_path: Path) -> pd.DataFrame:
    payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = []
    for item in payload.get("items", []):
        details = dict(item.get("details") or {})
        details["entry_url"] = item.get("url")
        details["retrieved"] = _present(details.get("html_path"))
        for field in FIELDS:
            details[f"has_{field}"] = _present(details.get(field))
        rows.append(details)
    return pd.DataFrame(rows)


def _error_category(error: Any, status_code: Any) -> str:
    status = int(status_code) if pd.notna(status_code) else None
    error_text = str(error or "").lower()
    if status == 403:
        return "http_403"
    if status == 404:
        return "http_404"
    if status is not None and status >= 500:
        return "http_5xx"
    if (
        "failed to resolve" in error_text
        or "nameresolutionerror" in error_text
        or "getaddrinfo failed" in error_text
    ):
        return "dns_resolution"
    if "timed out" in error_text or "timeout" in error_text:
        return "timeout"
    if "ssl" in error_text or "certificate" in error_text:
        return "ssl_error"
    if (
        "connection reset" in error_text
        or "connection aborted" in error_text
        or "max retries exceeded" in error_text
    ):
        return "connection_error"
    if status is not None:
        return f"http_{status}"
    if error_text:
        return "request_error"
    return "unknown"


def _resolve_domain(url: Any, final_url: Any) -> str:
    candidate = str(final_url or url or "").strip()
    parsed = urlparse(candidate)
    return parsed.netloc or "unknown"


def _load_failed_frame(manifest_path: Path) -> pd.DataFrame:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = []
    for item in payload.get("items", []):
        retrieved = _present(item.get("html_path"))
        if retrieved:
            continue
        url = item.get("url")
        final_url = item.get("final_url")
        domain = _resolve_domain(url, final_url)
        error = item.get("error")
        status_code = item.get("status_code")
        rows.append(
            {
                "url": url,
                "final_url": final_url,
                "domain": domain,
                "status_code": status_code,
                "recovery_method": item.get("recovery_method"),
                "attempt_count": item.get("attempt_count"),
                "host_policy_applied": item.get("host_policy_applied"),
                "error": error,
                "error_category": _error_category(error, status_code),
                "error_summary": _trim_text(error, limit=160),
            }
        )
    return pd.DataFrame(rows)


def build_retrieval_overview(frame: pd.DataFrame) -> pd.DataFrame:
    """Build retrieval summary metrics."""

    total = len(frame)
    retrieved = int(frame["retrieved"].sum()) if total else 0
    not_retrieved = total - retrieved
    metrics = [
        ("Total subproducts", total),
        ("Successfully retrieved", retrieved),
        ("Not successfully retrieved", not_retrieved),
    ]
    result = pd.DataFrame(metrics, columns=["Metric", "Count"])
    result["Percent"] = result["Count"].map(
        lambda count: f"{(count / total * 100):.1f}%" if total else "0.0%"
    )
    return result


def build_failed_overview(failed_frame: pd.DataFrame, *, total: int) -> pd.DataFrame:
    """Build summary metrics for failed URL retrievals."""

    failed = len(failed_frame)
    unique_domains = int(failed_frame["domain"].nunique()) if failed else 0
    with_status = int(failed_frame["status_code"].notna().sum()) if failed else 0
    without_status = failed - with_status
    metrics = [
        ("Failed subproduct URLs", failed),
        ("Unique failed domains", unique_domains),
        ("Failures with HTTP status", with_status),
        ("Failures without HTTP status", without_status),
    ]
    result = pd.DataFrame(metrics, columns=["Metric", "Count"])
    result["Percent of all subproducts"] = result["Count"].map(
        lambda count: f"{(count / total * 100):.1f}%" if total else "0.0%"
    )
    return result


def build_field_coverage(frame: pd.DataFrame) -> pd.DataFrame:
    """Build per-field coverage summary."""

    total = len(frame)
    retrieved_total = int(frame["retrieved"].sum()) if total else 0
    rows: list[dict[str, Any]] = []
    retrieved_frame = frame[frame["retrieved"]]
    for field in FIELDS:
        included_all = int(frame[f"has_{field}"].sum())
        included_retrieved = int(retrieved_frame[f"has_{field}"].sum())
        rows.append(
            {
                "Field": f"`{field}`",
                "Included / All": included_all,
                "Missing / All": total - included_all,
                "Included / Retrieved": included_retrieved,
                "Missing / Retrieved": retrieved_total - included_retrieved,
                "Coverage / Retrieved": (
                    f"{(included_retrieved / retrieved_total * 100):.1f}%"
                    if retrieved_total
                    else "0.0%"
                ),
            }
        )
    return pd.DataFrame(rows)


def build_content_statistics(frame: pd.DataFrame) -> pd.DataFrame:
    """Build length and list-size statistics for content-oriented fields."""

    retrieved_frame = frame[frame["retrieved"]].copy()
    rows: list[dict[str, Any]] = []

    for field in STRING_FIELDS:
        lengths = retrieved_frame[field].map(_string_length).dropna()
        rows.append(
            {
                "Field": f"`{field}`",
                "Kind": "string",
                "Populated / Retrieved": int(retrieved_frame[f"has_{field}"].sum()),
                "Avg size": (
                    round(float(lengths.mean()), 1) if not lengths.empty else 0.0
                ),
                "Median size": int(lengths.median()) if not lengths.empty else 0,
                "Max size": int(lengths.max()) if not lengths.empty else 0,
            }
        )

    for field in LIST_FIELDS:
        lengths = retrieved_frame[field].map(_list_length).dropna()
        rows.append(
            {
                "Field": f"`{field}`",
                "Kind": "list",
                "Populated / Retrieved": int(retrieved_frame[f"has_{field}"].sum()),
                "Avg size": (
                    round(float(lengths.mean()), 2) if not lengths.empty else 0.0
                ),
                "Median size": int(lengths.median()) if not lengths.empty else 0,
                "Max size": int(lengths.max()) if not lengths.empty else 0,
            }
        )

    result = pd.DataFrame(rows)
    return result[result["Field"].isin([f"`{field}`" for field in CORE_CONTENT_FIELDS])]


def build_richness_distribution(frame: pd.DataFrame) -> pd.DataFrame:
    """Build distribution of how many core content fields each retrieved row contains."""

    retrieved_frame = frame[frame["retrieved"]].copy()
    presence_columns = [f"has_{field}" for field in CORE_CONTENT_FIELDS]
    retrieved_frame["Core content fields present"] = (
        retrieved_frame[presence_columns].sum(axis=1).astype(int)
    )
    distribution = (
        retrieved_frame["Core content fields present"]
        .value_counts()
        .sort_index()
        .rename_axis("Core content fields present")
        .reset_index(name="Retrieved subproducts")
    )
    total = (
        int(distribution["Retrieved subproducts"].sum())
        if not distribution.empty
        else 0
    )
    distribution["Percent of retrieved"] = distribution["Retrieved subproducts"].map(
        lambda count: f"{(count / total * 100):.1f}%" if total else "0.0%"
    )
    return distribution


def build_top_values(
    frame: pd.DataFrame, field: str, *, limit: int = 10
) -> pd.DataFrame:
    """Build top-value frequency table for a categorical field."""

    source_frame = frame.copy()
    if "retrieved" in source_frame.columns:
        source_frame = source_frame[source_frame["retrieved"]].copy()

    if field not in source_frame.columns:
        return pd.DataFrame(columns=["Value", "Count"])

    if field in LIST_FIELDS:
        series = source_frame[field].explode().dropna()
    else:
        series = source_frame[field].dropna()

    if field not in LIST_FIELDS:
        series = series.map(
            lambda value: value.strip() if isinstance(value, str) else value
        )
        series = series[
            series.map(lambda value: bool(value) if isinstance(value, str) else True)
        ]

    counts = series.value_counts().head(limit)
    result = counts.rename_axis(field).reset_index(name="Count")
    return result.rename(columns={field: "Value"})


def build_failed_url_details(failed_frame: pd.DataFrame) -> pd.DataFrame:
    """Build a detailed failed URL table for markdown output."""

    if failed_frame.empty:
        return pd.DataFrame(
            columns=[
                "Domain",
                "Status",
                "Recovery method",
                "Error category",
                "Original URL",
                "Error",
            ]
        )

    detail_frame = failed_frame.copy()
    detail_frame["Status"] = detail_frame["status_code"].fillna("—")
    detail_frame["Recovery method"] = detail_frame["recovery_method"].fillna("—")
    detail_frame["Error"] = detail_frame["error_summary"].fillna("—")
    detail_frame["Original URL"] = detail_frame["url"].map(
        lambda value: _trim_text(value, limit=110)
    )
    result = detail_frame[
        [
            "domain",
            "Status",
            "Recovery method",
            "error_category",
            "Original URL",
            "Error",
        ]
    ].rename(
        columns={
            "domain": "Domain",
            "error_category": "Error category",
        }
    )
    return result.sort_values(["Domain", "Error category", "Original URL"]).reset_index(
        drop=True
    )


def render_markdown(
    metadata_path: Path,
    *,
    manifest_path: Path,
    retrieval_overview: pd.DataFrame,
    failed_overview: pd.DataFrame,
    field_coverage: pd.DataFrame,
    content_statistics: pd.DataFrame,
    richness_distribution: pd.DataFrame,
    top_hosts: pd.DataFrame,
    top_recovery_methods: pd.DataFrame,
    top_languages: pd.DataFrame,
    failed_domains: pd.DataFrame,
    failed_error_categories: pd.DataFrame,
    failed_url_details: pd.DataFrame,
) -> str:
    """Render the markdown analysis report."""

    return "\n".join(
        [
            "# Subproduct Metadata Coverage Summary",
            "",
            "Generated by: `tools/scripts/analyze_subproduct_metadata.py`  ",
            f"Source: `{metadata_path.as_posix()}`",
            f"Scrape manifest: `{manifest_path.as_posix()}`",
            "",
            "## Retrieval overview",
            "",
            "A subproduct was counted as **successfully retrieved** when `html_path` was present in the metadata entry.",
            "",
            _markdown_table(retrieval_overview),
            "",
            "## Failed URL overview",
            "",
            "These failures come from the subproduct page scraping manifest and represent URLs that did not produce a cached HTML page.",
            "",
            _markdown_table(failed_overview),
            "",
            "## Field coverage",
            "",
            _markdown_table(field_coverage),
            "",
            "## Core content field statistics",
            "",
            "These figures summarize the shape of the most useful viewer/search fields across retrieved subproducts.",
            "",
            _markdown_table(content_statistics),
            "",
            "## Content richness distribution",
            "",
            "Counts below show how many of the core content fields (`title`, `description`, `authors`, `publisher`, `language`, `image_url`, `tags`, `isbns`, `subtitle`, `series`) each retrieved subproduct contains.",
            "",
            _markdown_table(richness_distribution),
            "",
            "## Top source hosts",
            "",
            _markdown_table(top_hosts),
            "",
            "## Top recovery methods",
            "",
            _markdown_table(top_recovery_methods),
            "",
            "## Top languages",
            "",
            _markdown_table(top_languages),
            "",
            "## Failed domains",
            "",
            _markdown_table(failed_domains),
            "",
            "## Failed error categories",
            "",
            _markdown_table(failed_error_categories),
            "",
            "## Failed URL details",
            "",
            _markdown_table(failed_url_details),
            "",
        ]
    )


def write_subproduct_metadata_markdown_report(
    metadata_path: Path,
    *,
    manifest_path: Path,
    output_markdown: Path,
) -> Path:
    """Analyze metadata and write a markdown report."""

    metadata_file = metadata_path.expanduser().resolve()
    manifest_file = manifest_path.expanduser().resolve()
    output_file = output_markdown.expanduser().resolve()

    if not metadata_file.exists():
        raise FileNotFoundError(f"Metadata file not found: {metadata_file}")
    if not manifest_file.exists():
        raise FileNotFoundError(f"Manifest file not found: {manifest_file}")

    frame = _load_details_frame(metadata_file)
    failed_frame = _load_failed_frame(manifest_file)
    retrieval_overview = build_retrieval_overview(frame)
    failed_overview = build_failed_overview(failed_frame, total=len(frame))
    field_coverage = build_field_coverage(frame)
    content_statistics = build_content_statistics(frame)
    richness_distribution = build_richness_distribution(frame)
    top_hosts = build_top_values(frame, "source_host")
    top_recovery_methods = build_top_values(frame, "recovery_method")
    top_languages = build_top_values(frame, "language")
    failed_domains = build_top_values(
        failed_frame,
        "domain",
        limit=max(len(failed_frame), 1),
    )
    failed_error_categories = build_top_values(
        failed_frame,
        "error_category",
        limit=max(len(failed_frame), 1),
    )
    failed_url_details = build_failed_url_details(failed_frame)

    markdown = render_markdown(
        metadata_file,
        manifest_path=manifest_file,
        retrieval_overview=retrieval_overview,
        failed_overview=failed_overview,
        field_coverage=field_coverage,
        content_statistics=content_statistics,
        richness_distribution=richness_distribution,
        top_hosts=top_hosts,
        top_recovery_methods=top_recovery_methods,
        top_languages=top_languages,
        failed_domains=failed_domains,
        failed_error_categories=failed_error_categories,
        failed_url_details=failed_url_details,
    )

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(markdown, encoding="utf-8")
    return output_file
