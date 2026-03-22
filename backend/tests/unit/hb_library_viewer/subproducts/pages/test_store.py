"""Unit tests for subproduct page manifest and reference helpers."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from hb_library_viewer.subproducts.pages.models import (
    SubproductPageManifest,
    SubproductPageManifestEntry,
)
from hb_library_viewer.subproducts.pages.store import (
    build_html_relative_path,
    collect_subproduct_page_references,
    filter_subproduct_page_references,
    load_subproduct_page_manifest,
    write_manifest,
)


@pytest.mark.unit
class TestSubproductPageStore:
    """Behavior tests for subproduct cache storage helpers."""

    def test_collect_subproduct_page_references_dedupes_and_skips_invalid_urls(self):
        library = SimpleNamespace(
            products=[
                SimpleNamespace(
                    gamekey="game-1",
                    product_name="Product One",
                    machine_name="product-one",
                    subproducts=[
                        SimpleNamespace(
                            human_name="First Book",
                            machine_name="first-book",
                            url="https://example.com/books/first-book",
                            payee=SimpleNamespace(human_name="Publisher"),
                        ),
                        SimpleNamespace(
                            human_name="First Book",
                            machine_name="first-book",
                            url="https://example.com/books/first-book",
                            payee=SimpleNamespace(human_name="Publisher"),
                        ),
                        SimpleNamespace(
                            human_name="Ignored",
                            machine_name="ignored",
                            url="mailto:test@example.com",
                            payee=None,
                        ),
                    ],
                )
            ]
        )

        references = collect_subproduct_page_references(library)

        assert list(references) == ["https://example.com/books/first-book"]
        assert len(references["https://example.com/books/first-book"]) == 1
        assert (
            references["https://example.com/books/first-book"][0].payee_name
            == "Publisher"
        )

    def test_filter_subproduct_page_references_matches_query_and_limit(self):
        references = {
            "https://example.com/one": [
                SimpleNamespace(
                    product_name="Bundle One",
                    product_machine_name="bundle-one",
                    subproduct_name="First Title",
                    subproduct_machine_name="first-title",
                    payee_name="Packt",
                )
            ],
            "https://example.com/two": [
                SimpleNamespace(
                    product_name="Bundle Two",
                    product_machine_name="bundle-two",
                    subproduct_name="Second Title",
                    subproduct_machine_name="second-title",
                    payee_name="Black Library",
                )
            ],
        }

        filtered = filter_subproduct_page_references(
            references,
            subproduct_query="title",
            limit=1,
        )

        assert list(filtered) == ["https://example.com/one"]

    def test_load_subproduct_page_manifest_handles_missing_and_invalid_files(
        self,
        tmp_path: Path,
    ):
        missing_manifest = load_subproduct_page_manifest(tmp_path)
        assert missing_manifest.total_entries == 0

        (tmp_path / "index.json").write_text("not-json", encoding="utf-8")
        invalid_manifest = load_subproduct_page_manifest(tmp_path)
        assert invalid_manifest.total_entries == 0

    def test_build_html_relative_path_reuses_existing_entry(self):
        existing = SubproductPageManifestEntry(
            url="https://example.com/books/first-book",
            html_path="pages/existing.html",
        )

        html_path = build_html_relative_path(
            "https://example.com/books/first-book",
            references=[],
            existing_entry=existing,
        )

        assert html_path.as_posix() == "pages/existing.html"

    def test_build_html_relative_path_generates_stable_slugged_name(self):
        html_path = build_html_relative_path(
            "https://example.com/books/first-book",
            references=[
                SimpleNamespace(
                    subproduct_machine_name="first-book",
                    subproduct_name="First Book",
                    product_machine_name="bundle",
                    product_name="Bundle",
                )
            ],
            existing_entry=None,
        )

        assert html_path.as_posix().startswith("pages/example-com-first-book-")
        assert html_path.suffix == ".html"

    def test_write_manifest_round_trips(self, tmp_path: Path):
        manifest = SubproductPageManifest(
            generated_at="2026-01-31T00:00:00",
            total_entries=1,
            items=[
                SubproductPageManifestEntry(
                    url="https://example.com/books/first-book",
                    html_path="pages/first-book.html",
                )
            ],
        )

        manifest_path = write_manifest(tmp_path, manifest)
        reloaded = json.loads(manifest_path.read_text(encoding="utf-8"))

        assert manifest_path == tmp_path / "index.json"
        assert reloaded["total_entries"] == 1
        assert reloaded["items"][0]["html_path"] == "pages/first-book.html"
