"""Unit tests for shared download selection helpers."""

from __future__ import annotations

import pytest

from hb_library_viewer.download_selection import (
    collect_downloads,
    download_file_type,
    filter_downloads_by_file_types,
    filter_downloads_by_platforms,
    normalize_file_types,
    prepare_downloads_for_product,
    select_downloads_by_size,
)
from hb_library_viewer.parsing import Download, Product


@pytest.mark.unit
class TestDownloadSelection:
    """Behavior tests for download selection utilities."""

    def test_normalize_file_types_trims_and_lowercases(self):
        assert normalize_file_types(None) is None
        assert normalize_file_types([" PDF ", "", "EPUB"]) == ["pdf", "epub"]

    def test_download_file_type_prefers_explicit_value(self):
        download = Download(
            platform="ebook",
            name="Book.bin",
            url="https://example.com/book.bin",
            size_bytes=10,
            checksums={},
            file_type="PDF",
        )

        assert download_file_type(download) == "pdf"

    def test_download_file_type_uses_name_then_url(self):
        named = Download(
            platform="ebook",
            name="Book.epub",
            url="https://example.com/download",
            size_bytes=10,
            checksums={},
        )
        unnamed = Download(
            platform="ebook",
            name="download",
            url="https://example.com/files/book.pdf",
            size_bytes=10,
            checksums={},
            file_type=None,
        )

        assert download_file_type(named) == "epub"
        assert download_file_type(unnamed) == "pdf"

    def test_filter_downloads_by_platforms(self, sample_download: Download):
        audio = Download(
            platform="audio",
            name="Book.m4b",
            url="https://example.com/book.m4b",
            size_bytes=20,
            checksums={},
        )

        filtered = filter_downloads_by_platforms([sample_download, audio], ["ebook"])
        assert filtered == [sample_download]

    def test_filter_downloads_by_file_types(self):
        pdf = Download(
            platform="ebook",
            name="Book.pdf",
            url="https://example.com/book.pdf",
            size_bytes=10,
            checksums={},
            file_type=None,
        )
        epub = Download(
            platform="ebook",
            name="Book.epub",
            url="https://example.com/book.epub",
            size_bytes=20,
            checksums={},
            file_type=None,
        )

        filtered = filter_downloads_by_file_types([pdf, epub], ["epub"])
        assert filtered == [epub]

    def test_select_downloads_by_size(self):
        small = Download(
            platform="ebook",
            name="A.pdf",
            url="https://example.com/a.pdf",
            size_bytes=1,
            checksums={},
        )
        large = Download(
            platform="ebook",
            name="B.pdf",
            url="https://example.com/b.pdf",
            size_bytes=3,
            checksums={},
        )
        downloads = [large, small]

        assert select_downloads_by_size(downloads, "all") == downloads
        assert select_downloads_by_size(downloads, "smallest") == [small]
        assert select_downloads_by_size(downloads, "largest") == [large]

    def test_select_downloads_by_size_treats_missing_sizes_as_zero(self):
        unknown = Download(
            platform="ebook",
            name="Unknown.pdf",
            url="https://example.com/unknown.pdf",
            checksums={},
        )
        known = Download(
            platform="ebook",
            name="Known.pdf",
            url="https://example.com/known.pdf",
            size_bytes=10,
            checksums={},
        )

        smallest = select_downloads_by_size([known, unknown], "smallest")

        assert smallest == [unknown]

    def test_prepare_downloads_for_product_applies_all_filters(self):
        pdf = Download(
            platform="ebook",
            name="Book.pdf",
            url="https://example.com/book.pdf",
            size_bytes=100,
            checksums={},
            file_type=None,
        )
        epub = Download(
            platform="ebook",
            name="Book.epub",
            url="https://example.com/book.epub",
            size_bytes=50,
            checksums={},
            file_type=None,
        )
        audio = Download(
            platform="audio",
            name="Book.m4b",
            url="https://example.com/book.m4b",
            size_bytes=500,
            checksums={},
            file_type=None,
        )

        selected = prepare_downloads_for_product(
            [pdf, epub, audio],
            platforms=["ebook"],
            file_types=["pdf", "epub"],
            size_policy="smallest",
        )

        assert selected == [epub]

    def test_collect_downloads_across_products(self):
        pdf = Download(
            platform="ebook",
            name="Book.pdf",
            url="https://example.com/book.pdf",
            size_bytes=100,
            checksums={},
            file_type=None,
        )
        epub = Download(
            platform="ebook",
            name="Book.epub",
            url="https://example.com/book.epub",
            size_bytes=50,
            checksums={},
            file_type=None,
        )
        first = Product(
            gamekey="g1",
            product_name="First",
            machine_name="first",
            category="ebook",
            downloads=[pdf, epub],
            amount_spent=1.0,
        )
        second = Product(
            gamekey="g2",
            product_name="Second",
            machine_name="second",
            category="ebook",
            downloads=[epub],
            amount_spent=1.0,
        )

        selected = collect_downloads(
            [first, second],
            platforms=["ebook"],
            file_types=["epub"],
            size_policy="all",
        )

        assert selected == [epub, epub]
