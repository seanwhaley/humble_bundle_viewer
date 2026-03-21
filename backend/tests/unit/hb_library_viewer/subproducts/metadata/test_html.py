"""Unit tests for subproduct metadata HTML extraction helpers."""

from __future__ import annotations

import pytest

from hb_library_viewer.subproducts.metadata.html import (
    clean_text,
    coerce_keywords,
    extract_details_from_html,
    flatten_json_ld,
    load_json_ld_objects,
    select_best_json_ld_candidate,
)
from hb_library_viewer.subproducts.pages.models import (
    SubproductPageManifestEntry,
    SubproductPageReference,
)


@pytest.mark.unit
class TestSubproductMetadataHtml:
    """Behavior tests for HTML and JSON-LD extraction helpers."""

    def test_clean_text_and_keyword_coercion(self):
        assert clean_text("  <b>Hello</b>\nworld  ") == "Hello world"
        assert coerce_keywords("metadata, testing | books") == [
            "metadata",
            "testing",
            "books",
        ]

    def test_flatten_json_ld_and_select_best_candidate(self):
        objects = flatten_json_ld(
            {
                "@graph": [
                    {"@type": "Thing", "name": "Ignore Me"},
                    {"@type": "Book", "name": "Best Book", "description": "Useful"},
                ]
            }
        )

        candidate = select_best_json_ld_candidate(objects)

        assert len(objects) == 2
        assert candidate is not None
        assert candidate["name"] == "Best Book"

    def test_load_json_ld_objects_ignores_invalid_blocks(self):
        html_text = """
        <html><head>
          <script type='application/ld+json'>{"@type": "Book", "name": "Good"}</script>
          <script type='application/ld+json'>not valid json</script>
        </head></html>
        """

        objects = load_json_ld_objects(
            __import__("bs4").BeautifulSoup(html_text, "html.parser")
        )

        assert len(objects) == 1
        assert objects[0]["name"] == "Good"

    def test_extract_details_from_html_uses_json_ld_and_dom_fallbacks(self):
        entry = SubproductPageManifestEntry(
            url="https://publisher.example.com/books/sample-book",
            final_url="https://publisher.example.com/books/sample-book",
            page_title="Sample Book",
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
        html_text = """
        <html lang='en'>
          <head>
            <title>Sample Book</title>
            <meta property='og:image' content='https://img.example.com/sample.jpg' />
            <script type='application/ld+json'>
              {
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
          <body>
            <h1>Sample Book</h1>
          </body>
        </html>
        """

        details = extract_details_from_html(html_text, entry)

        assert details.title == "Sample Book"
        assert details.authors == ["Ada Lovelace"]
        assert details.publisher == "Example Press"
        assert details.language == "en"
        assert details.image_url == "https://img.example.com/sample.jpg"
        assert details.isbns == ["9781234567890"]
