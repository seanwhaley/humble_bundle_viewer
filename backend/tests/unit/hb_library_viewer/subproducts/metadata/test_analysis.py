"""Unit tests for subproduct metadata analysis helpers."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from hb_library_viewer.subproducts.metadata.analysis import (
    build_failed_overview,
    build_retrieval_overview,
    build_top_values,
    metadata_analysis_markdown_path,
    write_subproduct_metadata_markdown_report,
)


@pytest.mark.unit
class TestSubproductMetadataAnalysis:
    """Behavior tests for metadata analysis/report helpers."""

    def test_build_retrieval_and_failed_overview(self):
        frame = pd.DataFrame(
            [
                {"retrieved": True},
                {"retrieved": False},
                {"retrieved": True},
            ]
        )
        failed_frame = pd.DataFrame(
            [
                {"domain": "a.example.com", "status_code": 404},
                {"domain": "b.example.com", "status_code": None},
            ]
        )

        retrieval = build_retrieval_overview(frame)
        failed = build_failed_overview(failed_frame, total=len(frame))

        assert retrieval.iloc[0]["Count"] == 3
        assert retrieval.iloc[1]["Count"] == 2
        assert failed.iloc[0]["Count"] == 2
        assert failed.iloc[1]["Count"] == 2

    def test_build_top_values_and_markdown_report(self, tmp_path: Path):
        assert metadata_analysis_markdown_path(tmp_path).suffix == ".md"

        metadata_payload = {
            "generated_at": "2026-03-12T00:00:00",
            "total_entries": 2,
            "items": [
                {
                    "url": "https://publisher.example.com/books/sample-book",
                    "details": {
                        "url": "https://publisher.example.com/books/sample-book",
                        "final_url": "https://publisher.example.com/books/sample-book",
                        "replacement_url": None,
                        "page_title": "Sample Book",
                        "title": "Sample Book",
                        "subtitle": None,
                        "description": "A practical guide to metadata extraction.",
                        "authors": ["Ada Lovelace"],
                        "publisher": "Example Press",
                        "series": None,
                        "language": "en",
                        "image_url": "https://img.example.com/sample.jpg",
                        "source_host": "publisher.example.com",
                        "status_code": 200,
                        "content_type": "text/html",
                        "html_path": "pages/sample-book.html",
                        "recovery_method": "direct_fetch",
                        "extracted_at": "2026-03-12T00:00:00",
                        "tags": ["metadata"],
                        "isbns": ["9781234567890"],
                    },
                },
                {
                    "url": "https://publisher.example.com/books/missing-book",
                    "details": {
                        "url": "https://publisher.example.com/books/missing-book",
                        "final_url": None,
                        "replacement_url": None,
                        "page_title": "Missing Book",
                        "title": "Missing Book",
                        "subtitle": None,
                        "description": None,
                        "source_host": "publisher.example.com",
                        "publisher": None,
                        "series": None,
                        "language": None,
                        "image_url": None,
                        "status_code": 404,
                        "content_type": None,
                        "html_path": None,
                        "recovery_method": "http_error",
                        "extracted_at": "2026-03-12T00:00:00",
                        "authors": [],
                        "tags": [],
                        "isbns": [],
                    },
                },
            ],
        }
        manifest_payload = {
            "generated_at": "2026-03-12T00:00:00",
            "total_entries": 2,
            "items": [
                {
                    "url": "https://publisher.example.com/books/sample-book",
                    "final_url": "https://publisher.example.com/books/sample-book",
                    "html_path": "pages/sample-book.html",
                    "status_code": 200,
                    "recovery_method": "direct_fetch",
                    "error": None,
                },
                {
                    "url": "https://publisher.example.com/books/missing-book",
                    "final_url": None,
                    "html_path": None,
                    "status_code": 404,
                    "recovery_method": "http_error",
                    "error": "HTTP 404",
                },
            ],
        }
        metadata_file = tmp_path / "metadata.json"
        manifest_file = tmp_path / "index.json"
        report_file = tmp_path / "report.md"
        metadata_file.write_text(json.dumps(metadata_payload), encoding="utf-8")
        manifest_file.write_text(json.dumps(manifest_payload), encoding="utf-8")

        top_hosts = build_top_values(
            pd.DataFrame(
                [
                    {"retrieved": True, "source_host": "publisher.example.com"},
                    {"retrieved": True, "source_host": "publisher.example.com"},
                ]
            ),
            "source_host",
        )
        report_path = write_subproduct_metadata_markdown_report(
            metadata_file,
            manifest_path=manifest_file,
            output_markdown=report_file,
        )

        report_text = report_path.read_text(encoding="utf-8")
        assert top_hosts.iloc[0]["Value"] == "publisher.example.com"
        assert report_path == report_file
        assert "## Retrieval overview" in report_text
        assert "## Failed URL details" in report_text
