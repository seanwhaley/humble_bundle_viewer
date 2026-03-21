"""Unit tests for subproduct metadata storage helpers."""

from __future__ import annotations

from pathlib import Path

import pytest

from hb_library_viewer.subproducts.metadata.models import (
    SubproductPageDetails,
    SubproductPageMetadataEntry,
    SubproductPageMetadataStore,
)
from hb_library_viewer.subproducts.metadata.store import (
    fallback_details_for_entry,
    load_subproduct_page_metadata,
    metadata_path,
    write_subproduct_page_metadata,
)
from hb_library_viewer.subproducts.pages.models import (
    SubproductPageManifestEntry,
    SubproductPageReference,
)


@pytest.mark.unit
class TestSubproductMetadataStore:
    """Behavior tests for metadata storage and fallback helpers."""

    def test_metadata_path_and_write_round_trip(self, tmp_path: Path):
        store = SubproductPageMetadataStore(
            generated_at="2026-03-12T00:00:00",
            total_entries=1,
            items=[
                SubproductPageMetadataEntry(
                    url="https://publisher.example.com/books/sample-book",
                    details=SubproductPageDetails(
                        url="https://publisher.example.com/books/sample-book",
                        title="Sample Book",
                    ),
                )
            ],
        )

        written_path = write_subproduct_page_metadata(tmp_path, store)
        loaded_store = load_subproduct_page_metadata(tmp_path)

        assert written_path == metadata_path(tmp_path)
        assert loaded_store.total_entries == 1
        assert loaded_store.items[0].details.title == "Sample Book"

    def test_load_subproduct_page_metadata_returns_empty_store_for_invalid_json(
        self,
        tmp_path: Path,
    ):
        metadata_path(tmp_path).write_text("not-json", encoding="utf-8")

        store = load_subproduct_page_metadata(tmp_path)

        assert store.total_entries == 0
        assert store.items == []

    def test_fallback_details_for_entry_prefers_reference_title_and_publisher(self):
        entry = SubproductPageManifestEntry(
            url="https://publisher.example.com/books/sample-book",
            final_url="https://publisher.example.com/books/sample-book",
            page_title="Page Title",
            status_code=200,
            content_type="text/html",
            html_path="pages/sample-book.html",
            recovery_method="direct_fetch",
            references=[
                SubproductPageReference(
                    subproduct_name="Sample Book",
                    payee_name="Sample Publisher",
                )
            ],
        )

        details = fallback_details_for_entry(entry)

        assert details.title == "Sample Book"
        assert details.publisher == "Sample Publisher"
        assert details.source_host == "publisher.example.com"
