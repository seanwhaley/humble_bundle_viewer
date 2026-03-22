"""Unit tests for cached subproduct metadata extraction."""

from __future__ import annotations

import json
from pathlib import Path

from hb_library_viewer.subproducts.metadata.service import (
    build_subproduct_metadata_analysis_report,
    build_subproduct_page_metadata,
)
from hb_library_viewer.subproducts.metadata.store import (
    load_subproduct_page_metadata,
)


def _write_manifest(
    base_dir: Path, html_name: str, *, page_title: str | None = None
) -> None:
    payload = {
        "generated_at": "2026-03-12T12:00:00",
        "total_entries": 1,
        "items": [
            {
                "url": "https://publisher.example.com/books/sample-book",
                "final_url": "https://publisher.example.com/books/sample-book",
                "replacement_url": None,
                "page_title": page_title,
                "status_code": 200,
                "content_type": "text/html; charset=utf-8",
                "content_length_bytes": 1234,
                "fetched_at": "2026-03-12T12:00:00",
                "html_path": f"pages/{html_name}",
                "recovery_method": "direct_fetch",
                "recovery_confidence": None,
                "search_query": None,
                "attempt_count": 1,
                "host_policy_applied": None,
                "references": [
                    {
                        "product_gamekey": "order-1",
                        "product_name": "Sample Bundle",
                        "product_machine_name": "sample_bundle",
                        "subproduct_name": "Sample Book",
                        "subproduct_machine_name": "sample_book",
                        "payee_name": "Sample Publisher",
                    }
                ],
                "error": None,
            }
        ],
    }
    (base_dir / "index.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )


class TestSubproductMetadataExtraction:
    """Verify metadata extraction from cached HTML pages."""

    def test_extracts_json_ld_book_metadata(self, tmp_path: Path) -> None:
        base_dir = tmp_path / "subproduct_pages"
        pages_dir = base_dir / "pages"
        pages_dir.mkdir(parents=True)
        _write_manifest(base_dir, "sample.html")
        (pages_dir / "sample.html").write_text(
            """
            <html>
              <head>
                <title>Sample Book</title>
                <script type="application/ld+json">
                  {
                    "@context": "https://schema.org",
                    "@type": "Book",
                    "name": "Sample Book",
                    "description": "A practical guide to metadata extraction.",
                    "author": [{"@type": "Person", "name": "Ada Lovelace"}],
                    "publisher": {"@type": "Organization", "name": "Example Press"},
                    "isbn": "9781234567890",
                    "keywords": ["metadata", "testing"]
                  }
                </script>
              </head>
              <body><h1>Sample Book</h1></body>
            </html>
            """,
            encoding="utf-8",
        )

        summary = build_subproduct_page_metadata(base_dir)
        store = load_subproduct_page_metadata(base_dir)

        assert summary.processed_entries == 1
        assert summary.extracted_entries == 1
        assert summary.failed_entries == 0
        assert summary.fallback_only_entries == 0
        assert summary.model_dump(mode="json")["output_path"] == str(
            base_dir / "metadata.json"
        )
        assert store.total_entries == 1
        details = store.items[0].details
        assert details.title == "Sample Book"
        assert details.authors == ["Ada Lovelace"]
        assert details.publisher == "Example Press"
        assert details.description == "A practical guide to metadata extraction."
        assert details.isbns == ["9781234567890"]
        assert details.tags == ["metadata", "testing"]

    def test_extracts_dom_fallback_description(self, tmp_path: Path) -> None:
        base_dir = tmp_path / "subproduct_pages"
        pages_dir = base_dir / "pages"
        pages_dir.mkdir(parents=True)
        _write_manifest(
            base_dir, "blacklibrary.html", page_title="The Beasts of Cartha"
        )
        (pages_dir / "blacklibrary.html").write_text(
            """
            <html>
              <head>
                <title>The Beasts of Cartha</title>
                <meta name="author" content="Jordan Ellinger" />
              </head>
              <body>
                <h1>The Beasts of Cartha</h1>
                <div id="long-description">
                  A brutal mission sends the cast into the deadliest corners of the realm.
                </div>
              </body>
            </html>
            """,
            encoding="utf-8",
        )

        build_subproduct_page_metadata(base_dir)
        store = load_subproduct_page_metadata(base_dir)

        details = store.items[0].details
        assert details.title == "The Beasts of Cartha"
        assert details.authors == ["Jordan Ellinger"]
        assert details.description == (
            "A brutal mission sends the cast into the deadliest corners of the realm."
        )
        assert details.publisher == "Sample Publisher"

    def test_tracks_fallback_entries_when_html_is_missing(self, tmp_path: Path) -> None:
        base_dir = tmp_path / "subproduct_pages"
        base_dir.mkdir(parents=True)
        _write_manifest(base_dir, "missing.html", page_title="Missing Page")

        summary = build_subproduct_page_metadata(base_dir)
        store = load_subproduct_page_metadata(base_dir)

        assert summary.processed_entries == 1
        assert summary.extracted_entries == 0
        assert summary.fallback_only_entries == 1
        assert summary.failed_entries == 1
        assert summary.html_read_failures == 0
        assert store.items[0].details.title == "Sample Book"

    def test_builds_markdown_report_from_generated_metadata(
        self, tmp_path: Path
    ) -> None:
        base_dir = tmp_path / "subproduct_pages"
        pages_dir = base_dir / "pages"
        pages_dir.mkdir(parents=True)
        _write_manifest(base_dir, "sample.html")
        (pages_dir / "sample.html").write_text(
            """
            <html>
              <head><title>Sample Book</title></head>
              <body><h1>Sample Book</h1></body>
            </html>
            """,
            encoding="utf-8",
        )

        build_subproduct_page_metadata(base_dir)
        report_path = build_subproduct_metadata_analysis_report(
            base_dir,
            output_path=base_dir / "report.md",
        )

        report_text = report_path.read_text(encoding="utf-8")
        assert report_path.exists()
        assert "# Subproduct Metadata Coverage Summary" in report_text
        assert "## Retrieval overview" in report_text
