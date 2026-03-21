"""Unit tests for current bundle fetching and overlap reporting helpers."""

from __future__ import annotations

import importlib
from pathlib import Path
from types import SimpleNamespace

from bs4 import BeautifulSoup
import pytest

from hb_library_viewer.current_bundles import (
    BundleLink,
    BundleCatalogSnapshot,
    BundleItem,
    BundleOverlapBundle,
    BundleOverlapReport,
    BundlePageSnapshot,
    BundleTier,
    BundleTierOverlap,
    build_bundle_links,
    build_bundle_overlap_report,
    load_bundle_overlap_report,
    normalize_bundle_types,
    parse_bundle_page_html,
    render_bundle_overlap_markdown,
)
from hb_library_viewer.parsing import LibraryData, Product, Subproduct

current_bundles_module = importlib.import_module("hb_library_viewer.current_bundles")


@pytest.mark.unit
class TestCurrentBundles:
    """Verify bundle link parsing, tier reconstruction, and overlap reporting."""

    def test_build_bundle_links_filters_non_bundle_paths(self) -> None:
        html = """
        <html>
          <body>
            <a href="/games/alpha-bundle" aria-label="Alpha Bundle">
              <span>Pay What You Want</span>
              <strong>Some very noisy tile copy that should not become the title</strong>
              <div class="js-simple-countdown-timer js-countdown-timer active" aria-label="13 days, 22 hours left">
                <span class="js-days">13</span>
                <span class="countdown-label">Days Left</span>
              </div>
            </a>
            <a href="https://www.humblebundle.com/books/beta-books">Beta Books</a>
            <a href="/software/gamma-software">Gamma Software</a>
            <a href="/store/not-a-bundle">Store link</a>
            <a href="/games/alpha-bundle">Duplicate</a>
          </body>
        </html>
        """

        links = build_bundle_links(html)

        assert [link.url for link in links] == [
            "https://www.humblebundle.com/games/alpha-bundle",
            "https://www.humblebundle.com/books/beta-books",
            "https://www.humblebundle.com/software/gamma-software",
        ]
        assert [link.title for link in links] == [
            "Alpha Bundle",
            "Beta Books",
            "Gamma Software",
        ]
        assert links[0].offer_ends_text == "13 Days Left"
        assert links[0].offer_ends_in_days == 13
        assert links[0].offer_ends_detail == "13 days, 22 hours left"

    def test_build_bundle_links_falls_back_to_generated_countdown_label(self) -> None:
        html = """
        <html>
          <body>
            <a href="/books/quick-read-bundle" aria-label="Quick Read Bundle">
              <div class="js-simple-countdown-timer js-countdown-timer active" aria-label="1 days, 2 hours left">
                <span class="js-days">01</span>
              </div>
            </a>
          </body>
        </html>
        """

        links = build_bundle_links(html)

        assert len(links) == 1
        assert links[0].offer_ends_text == "1 Day Left"
        assert links[0].offer_ends_in_days == 1

    def test_normalize_bundle_types_validates_and_deduplicates(self) -> None:
        assert normalize_bundle_types(["Books", "games", "books"]) == [
            "books",
            "games",
        ]

        with pytest.raises(ValueError, match="bundle_types values must be one of"):
            normalize_bundle_types(["books", "comics"])

    def test_parse_bundle_page_html_reconstructs_cumulative_tiers(
        self,
        tmp_path: Path,
    ) -> None:
        html = """
        <html>
          <head><title>Sample Bundle (pay what you want and help charity)</title></head>
          <body>
            <div>Book Bundle</div>
            <h4>Bundle Filters</h4>
            <div>Entire 5 Item Bundle</div>
            <div>3 Item Bundle</div>
            <div>1 Item Bundle</div>
            <section><h2>Alpha</h2><p>Pay at least $1 to get this item</p></section>
            <section><h2>Beta</h2><p>Pay at least $3 to get this item</p></section>
            <section><h2>Gamma</h2><p>Pay at least $3 to get this item</p></section>
            <section><h2>Delta</h2><p>Pay at least $5 to get this item</p></section>
            <section><h2>Epsilon</h2><p>Pay at least $5 to get this item</p></section>
          </body>
        </html>
        """

        snapshot = parse_bundle_page_html(
            html,
            url="https://www.humblebundle.com/books/sample-bundle",
            fetched_at="2026-03-18T00:00:00+00:00",
            html_path=tmp_path / "sample-bundle.html",
        )

        assert snapshot.title == "Sample Bundle"
        assert snapshot.bundle_type == "Book Bundle"
        assert snapshot.filter_labels == [
            "Entire 5 Item Bundle",
            "3 Item Bundle",
            "1 Item Bundle",
        ]
        assert [item.title for item in snapshot.items] == [
            "Alpha",
            "Beta",
            "Gamma",
            "Delta",
            "Epsilon",
        ]
        assert [(tier.label, tier.item_count) for tier in snapshot.tiers] == [
            ("1 Item Bundle", 1),
            ("3 Item Bundle", 3),
            ("Entire 5 Item Bundle", 5),
        ]

    def test_parse_bundle_page_html_extracts_item_msrp_and_description(
        self,
        tmp_path: Path,
    ) -> None:
        html = """
        <html>
          <head><title>Sample Bundle (pay what you want and help charity)</title></head>
          <body>
            <div>Game Bundle</div>
            <div class="tier-item-view">
              <span class="item-title">Alpha</span>
              <span class="item-flavor-text fine-print">Steam Deck Verified</span>
            </div>
            <div class="tier-item-view">
              <span class="item-title">Beta</span>
              <span class="item-flavor-text fine-print"><div class="accolades">MSRP: $15</div></span>
              <span class="extra-info fine-print">Coupon</span>
            </div>
            <section><h2>Alpha</h2><p>Pay at least $1 to get this item</p></section>
            <section><h2>Beta</h2><p>Pay at least $5 to get this item</p></section>
            <div class="tier-item-details-view">
              <section class="header-area">
                <h2>Alpha</h2>
                <s class="msrp">Retail: $19.99</s>
                <span class="tier-price">Pay at least $1 to get this item</span>
              </section>
              <section class="description">
                Alpha explores a clockwork city.
              </section>
            </div>
            <div class="tier-item-details-view">
              <section class="header-area">
                <h2>Beta</h2>
                <span class="tier-price">Pay at least $5 to get this item</span>
              </section>
              <section class="description">
                Beta unlocks bonus missions.
              </section>
            </div>
          </body>
        </html>
        """

        snapshot = parse_bundle_page_html(
            html,
            url="https://www.humblebundle.com/games/sample-bundle",
            fetched_at="2026-03-18T00:00:00+00:00",
            html_path=tmp_path / "sample-bundle.html",
        )

        alpha = next(item for item in snapshot.items if item.title == "Alpha")
        beta = next(item for item in snapshot.items if item.title == "Beta")

        assert alpha.msrp_label == "Retail: $19.99"
        assert alpha.msrp_value == 19.99
        assert alpha.flavor_text == "Steam Deck Verified"
        assert alpha.description == "Alpha explores a clockwork city."
        assert beta.msrp_label == "MSRP: $15"
        assert beta.msrp_value == 15.0
        assert beta.flavor_text == "Coupon"
        assert beta.description == "Beta unlocks bonus missions."

    def test_build_bundle_overlap_report_splits_owned_and_new_titles(
        self,
        tmp_path: Path,
    ) -> None:
        library = LibraryData(
            products=[
                Product(
                    gamekey="owned-alpha",
                    product_name="Alpha",
                    machine_name="alpha",
                    category="ebook",
                    subproducts=[
                        Subproduct(
                            human_name="Gamma",
                            machine_name="gamma",
                        )
                    ],
                )
            ],
            total_products=1,
            captured_at="2026-03-18T00:00:00+00:00",
        )
        library_path = tmp_path / "library_products.json"
        library_path.write_text(library.model_dump_json(indent=2), encoding="utf-8")

        catalog = BundleCatalogSnapshot(
            fetched_at="2026-03-18T00:00:00+00:00",
            index_url="https://www.humblebundle.com/bundles",
            index_html_path=str(tmp_path / "bundles_index.html"),
            bundle_links_path=str(tmp_path / "bundle_links.json"),
            catalog_json_path=str(tmp_path / "bundle_catalog.json"),
            bundles=[
                BundlePageSnapshot(
                    title="Synthetic Bundle",
                    bundle_type="Book Bundle",
                    category="books",
                    url="https://www.humblebundle.com/books/synthetic-bundle",
                    slug="synthetic-bundle",
                    fetched_at="2026-03-18T00:00:00+00:00",
                    html_path=str(tmp_path / "synthetic-bundle.html"),
                    offer_ends_text="9 Days Left",
                    offer_ends_in_days=9,
                    offer_ends_detail="9 days, 4 hours left",
                    items=[
                        BundleItem(
                            title="Alpha",
                            price_label="Pay at least $1",
                            price_value=1.0,
                            price_kind="at least",
                            msrp_label="Retail: $10",
                            msrp_value=10.0,
                            description="Alpha description",
                        ),
                        BundleItem(
                            title="Beta",
                            price_label="Pay at least $5",
                            price_value=5.0,
                            price_kind="at least",
                            msrp_label="Retail: $20",
                            msrp_value=20.0,
                            description="Beta description",
                        ),
                        BundleItem(
                            title="Gamma",
                            price_label="Pay at least $10",
                            price_value=10.0,
                            price_kind="at least",
                            msrp_label="Retail: $30",
                            msrp_value=30.0,
                            description="Gamma description",
                        ),
                    ],
                    tiers=[
                        BundleTier(
                            label="1 Item Bundle",
                            price_label="Pay at least $1",
                            price_value=1.0,
                            item_count=1,
                            titles=["Alpha"],
                        ),
                        BundleTier(
                            label="2 Item Bundle",
                            price_label="Pay at least $5",
                            price_value=5.0,
                            item_count=2,
                            titles=["Alpha", "Beta"],
                        ),
                        BundleTier(
                            label="Entire 3 Item Bundle",
                            price_label="Pay at least $10",
                            price_value=10.0,
                            item_count=3,
                            titles=["Alpha", "Beta", "Gamma"],
                        ),
                    ],
                )
            ],
        )

        report = build_bundle_overlap_report(
            catalog,
            library_path=library_path,
            output_dir=tmp_path,
        )

        assert report.bundle_count == 1
        assert report.bundle_types == ["games", "books", "software"]
        bundle = report.bundles[0]
        assert bundle.top_tier_status == "partial_overlap"
        assert bundle.display_title == "Synthetic Bundle"
        assert bundle.display_type == "Book"
        assert bundle.offer_ends_text == "9 Days Left"
        assert bundle.offer_ends_in_days == 9
        assert bundle.offer_ends_detail == "9 days, 4 hours left"
        assert [item.title for item in bundle.items] == ["Alpha", "Beta", "Gamma"]
        assert bundle.items[0].msrp_value == 10.0
        assert (
            bundle.progression_summary
            == "$1+ include 1 owned item; $5 only adds new; $10+ include 2 owned items"
        )
        assert [(tier.owned_items, tier.new_items) for tier in bundle.tiers] == [
            (1, 0),
            (1, 1),
            (2, 1),
        ]
        assert [(tier.msrp_total, tier.msrp_known_items) for tier in bundle.tiers] == [
            (10.0, 1),
            (30.0, 2),
            (60.0, 3),
        ]
        assert [tier.savings_percent for tier in bundle.tiers] == [90.0, 83.3, 83.3]
        assert [tier.value_multiple for tier in bundle.tiers] == [10.0, 6.0, 6.0]
        assert [
            (tier.added_owned_items, tier.added_new_items) for tier in bundle.tiers
        ] == [
            (1, 0),
            (0, 1),
            (1, 0),
        ]
        markdown = Path(report.report_markdown_path).read_text(encoding="utf-8")
        assert "## Books" in markdown
        assert "### Tier progression summary" in markdown
        assert "### Tier value table" in markdown
        assert (
            "Tier columns run from lowest pledge to highest pledge for each bundle."
            in markdown
        )
        assert (
            "Tier cells use four lines: pledge amount, owned count, new item count, and new-content percentage."
            in markdown
        )
        assert '<table style="width: 100%; table-layout: fixed;">' in markdown
        assert '<th align="left">Tier 1</th>' in markdown
        assert '<th align="left">Tier 2</th>' in markdown
        assert '<th align="left">Tier 3</th>' in markdown
        assert (
            '<td style="vertical-align: top;"><div>$1</div><div>1 already owned</div><div>0 new items</div><div>0% new content</div></td>'
            in markdown
        )
        assert (
            '<td style="vertical-align: top;"><div>$5</div><div>1 already owned</div><div>1 new item</div><div>50% new content</div></td>'
            in markdown
        )
        assert (
            '<td style="vertical-align: top;"><div>$10</div><div>2 already owned</div><div>1 new item</div><div>33.3% new content</div></td>'
            in markdown
        )
        assert "<br>" not in markdown
        assert (
            "- Synthetic Bundle — $1+ include 1 owned item; $5 only adds new; $10+ include 2 owned items"
            in markdown
        )
        assert Path(report.report_json_path).exists()
        assert Path(report.report_markdown_path).exists()

        loaded_report = load_bundle_overlap_report(Path(report.report_json_path))
        assert loaded_report.bundles[0].display_type == "Book"
        assert (
            loaded_report.bundles[0].progression_summary
            == "$1+ include 1 owned item; $5 only adds new; $10+ include 2 owned items"
        )

    def test_build_bundle_overlap_report_honors_selected_bundle_types(
        self,
        tmp_path: Path,
    ) -> None:
        library = LibraryData(
            products=[],
            total_products=0,
            captured_at="2026-03-18T00:00:00+00:00",
        )
        library_path = tmp_path / "library_products.json"
        library_path.write_text(library.model_dump_json(indent=2), encoding="utf-8")

        catalog = BundleCatalogSnapshot(
            fetched_at="2026-03-18T00:00:00+00:00",
            index_url="https://www.humblebundle.com/bundles",
            index_html_path=str(tmp_path / "bundles_index.html"),
            bundle_links_path=str(tmp_path / "bundle_links.json"),
            catalog_json_path=str(tmp_path / "bundle_catalog.json"),
            bundles=[],
        )

        report = build_bundle_overlap_report(
            catalog,
            library_path=library_path,
            output_dir=tmp_path,
            bundle_types=["books"],
        )

        assert report.bundle_types == ["books"]

    def test_render_bundle_overlap_markdown_groups_tables_by_category(self) -> None:
        report = BundleOverlapReport(
            generated_at="2026-03-18T00:00:00+00:00",
            library_path="library_products.json",
            bundle_count=2,
            report_json_path="report.json",
            report_markdown_path="report.md",
            bundles=[
                BundleOverlapBundle(
                    title="Game Bundle",
                    bundle_type="Game Bundle",
                    category="games",
                    url="https://example.test/games/game-bundle",
                    top_tier_status="only_new",
                    tiers=[
                        BundleTierOverlap(
                            label="3 Item Bundle",
                            price_label="Pay at least $6",
                            price_value=6.0,
                            total_items=3,
                            owned_items=1,
                            new_items=2,
                            owned_percent=33.3,
                            missing_percent=66.7,
                            added_items=3,
                            added_owned_items=1,
                            added_new_items=2,
                            added_owned_percent=33.3,
                            added_new_percent=66.7,
                            added_titles=["Owned Game", "New Game A", "New Game B"],
                            added_owned_titles=["Owned Game"],
                            added_new_titles=["New Game A", "New Game B"],
                            owned_titles=["Owned Game"],
                            new_titles=["New Game A", "New Game B"],
                        ),
                        BundleTierOverlap(
                            label="Entire 5 Item Bundle",
                            price_label="Pay at least $12",
                            price_value=12.0,
                            total_items=5,
                            owned_items=1,
                            new_items=4,
                            owned_percent=20.0,
                            missing_percent=80.0,
                            added_items=2,
                            added_owned_items=0,
                            added_new_items=2,
                            added_owned_percent=0.0,
                            added_new_percent=100.0,
                            added_titles=["New Game C", "New Game D"],
                            added_owned_titles=[],
                            added_new_titles=["New Game C", "New Game D"],
                            owned_titles=["Owned Game"],
                            new_titles=[
                                "New Game A",
                                "New Game B",
                                "New Game C",
                                "New Game D",
                            ],
                        ),
                    ],
                ),
                BundleOverlapBundle(
                    title="Humble Comic Bundle: Dive into Sample Stories",
                    bundle_type="Book Bundle",
                    category="books",
                    url="https://example.test/books/book-bundle",
                    top_tier_status="partial_overlap",
                    tiers=[
                        BundleTierOverlap(
                            label="2 Item Bundle",
                            price_label="Pay at least $5",
                            price_value=5.0,
                            total_items=2,
                            owned_items=0,
                            new_items=2,
                            owned_percent=0.0,
                            missing_percent=100.0,
                            added_items=2,
                            added_owned_items=0,
                            added_new_items=2,
                            added_owned_percent=0.0,
                            added_new_percent=100.0,
                            added_titles=["Book A", "Book B"],
                            added_owned_titles=[],
                            added_new_titles=["Book A", "Book B"],
                            owned_titles=[],
                            new_titles=["Book A", "Book B"],
                        ),
                        BundleTierOverlap(
                            label="Entire 4 Item Bundle",
                            price_label="Pay at least $18",
                            price_value=18.0,
                            total_items=4,
                            owned_items=1,
                            new_items=3,
                            owned_percent=25.0,
                            missing_percent=75.0,
                            added_items=2,
                            added_owned_items=1,
                            added_new_items=1,
                            added_owned_percent=50.0,
                            added_new_percent=50.0,
                            added_titles=["Book Owned", "Book C"],
                            added_owned_titles=["Book Owned"],
                            added_new_titles=["Book C"],
                            owned_titles=["Book Owned"],
                            new_titles=["Book A", "Book B", "Book C"],
                        ),
                    ],
                ),
                BundleOverlapBundle(
                    title="Humble Book Bundle: Dread & Darkness: A Horror Megabundle by Open Road Media",
                    bundle_type="Book Bundle",
                    category="books",
                    url="https://example.test/books/dread-darkness",
                    top_tier_status="only_new",
                    tiers=[
                        BundleTierOverlap(
                            label="12 Item Bundle",
                            price_label="Pay at least $10",
                            price_value=10.0,
                            total_items=12,
                            owned_items=0,
                            new_items=12,
                            owned_percent=0.0,
                            missing_percent=100.0,
                            added_items=12,
                            added_owned_items=0,
                            added_new_items=12,
                            added_owned_percent=0.0,
                            added_new_percent=100.0,
                            added_titles=["Story A"],
                            added_owned_titles=[],
                            added_new_titles=["Story A"],
                            owned_titles=[],
                            new_titles=["Story A"],
                        ),
                    ],
                ),
                BundleOverlapBundle(
                    title="Humble Book Bundle: Visual Design & Branding Mastery by Quarto",
                    bundle_type="Book Bundle",
                    category="books",
                    url="https://example.test/books/visual-design-branding",
                    top_tier_status="only_new",
                    tiers=[
                        BundleTierOverlap(
                            label="2 Item Bundle",
                            price_label="Pay at least $3",
                            price_value=3.0,
                            total_items=2,
                            owned_items=0,
                            new_items=2,
                            owned_percent=0.0,
                            missing_percent=100.0,
                            added_items=2,
                            added_owned_items=0,
                            added_new_items=2,
                            added_owned_percent=0.0,
                            added_new_percent=100.0,
                            added_titles=["Design A", "Design B"],
                            added_owned_titles=[],
                            added_new_titles=["Design A", "Design B"],
                            owned_titles=[],
                            new_titles=["Design A", "Design B"],
                        ),
                    ],
                ),
            ],
        )

        markdown = render_bundle_overlap_markdown(report)

        assert "## Games" in markdown
        assert "## Books" in markdown
        games_section = markdown.split("## Games", maxsplit=1)[1].split(
            "## Books", maxsplit=1
        )[0]
        books_section = markdown.split("## Books", maxsplit=1)[1]
        assert (
            "Tier columns run from lowest pledge to highest pledge for each bundle."
            in markdown
        )
        assert '<th align="left">Tier 1</th>' in games_section
        assert '<th align="left">Tier 2</th>' in games_section
        assert "$5" not in games_section
        assert (
            '<td style="vertical-align: top;"><div>$6</div><div>1 already owned</div><div>2 new items</div><div>66.7% new content</div></td>'
            in games_section
        )
        assert (
            '<td style="vertical-align: top;"><div>$12</div><div>1 already owned</div><div>4 new items</div><div>80% new content</div></td>'
            in games_section
        )
        assert '<th align="left">Tier 1</th>' in books_section
        assert '<th align="left">Tier 2</th>' in books_section
        assert "$12" not in books_section
        assert (
            '<td style="vertical-align: top;"><div>$5</div><div>0 already owned</div><div>2 new items</div><div>100% new content</div></td>'
            in books_section
        )
        assert (
            '<td style="vertical-align: top;"><div>$18</div><div>1 already owned</div><div>3 new items</div><div>75% new content</div></td>'
            in books_section
        )
        assert "<div>Dive into Sample Stories</div>" in books_section
        assert '<td style="vertical-align: top;">Comic</td>' in books_section
        assert (
            "<div>A Horror Megabundle by Open</div><div>Road Media</div>"
            in books_section
        )
        assert (
            '<td style="vertical-align: top;">Dread &amp; Darkness</td>'
            in books_section
        )
        assert (
            "<div>Visual Design &amp; Branding</div><div>Mastery by Quarto</div>"
            in books_section
        )
        assert (
            '<td style="vertical-align: top;">Visual Design &amp; Branding Mastery</td>'
            in books_section
        )
        assert (
            "- Game Bundle — $6+ include 1 owned item; $12 only adds new"
            in games_section
        )
        assert (
            "- Humble Comic Bundle: Dive into Sample Stories — only new through $5; $18+ include 1 owned item"
            in books_section
        )
        assert (
            "- Humble Book Bundle: Dread & Darkness: A Horror Megabundle by Open Road Media — all tiers are new"
            in books_section
        )
        assert (
            "- Humble Book Bundle: Visual Design & Branding Mastery by Quarto — all tiers are new"
            in books_section
        )
        assert "<br>" not in markdown

    def test_build_cumulative_tiers_dedupes_titles_and_matches_filter_counts(
        self,
    ) -> None:
        tiers = current_bundles_module._build_cumulative_tiers(
            ["2 Item Bundle", "Entire 3 Item Bundle"],
            [
                BundleItem(
                    title="Alpha",
                    price_label="Pay at least $5",
                    price_value=5.0,
                    price_kind="at least",
                ),
                BundleItem(
                    title="Beta",
                    price_label="Pay at least $5",
                    price_value=5.0,
                    price_kind="at least",
                ),
                BundleItem(
                    title="Alpha",
                    price_label="Pay at least $5",
                    price_value=5.0,
                    price_kind="at least",
                ),
                BundleItem(
                    title="Gamma",
                    price_label="Pay at least $10",
                    price_value=10.0,
                    price_kind="at least",
                ),
            ],
        )

        assert [(tier.label, tier.titles) for tier in tiers] == [
            ("2 Item Bundle", ["Alpha", "Beta"]),
            ("Entire 3 Item Bundle", ["Alpha", "Beta", "Gamma"]),
        ]

    def test_bundle_helper_functions_cover_metadata_matching_and_msrp(self) -> None:
        soup = BeautifulSoup(
            """
            <html>
              <head>
                <meta property="og:title" content="OG Bundle Title" />
                <meta name="twitter:title" content="Twitter Bundle Title" />
                <title>Fallback Bundle Title</title>
              </head>
              <body></body>
            </html>
            """,
            "html.parser",
        )

        assert (
            current_bundles_module._extract_bundle_title(
                soup,
                "https://www.humblebundle.com/books/sample-bundle",
            )
            == "OG Bundle Title"
        )
        assert current_bundles_module._parse_filter_item_count("2 Item Bundle") == 2
        assert current_bundles_module._parse_filter_item_count("Not a bundle") is None

        library = LibraryData(
            products=[
                Product(
                    gamekey="owned-alpha",
                    product_name="Alpha",
                    machine_name="alpha",
                    category="ebook",
                )
            ],
            total_products=1,
            captured_at="2026-03-18T00:00:00+00:00",
        )
        library_variants = current_bundles_module._build_library_variant_set(library)
        assert current_bundles_module._library_contains_title("Alpha", library_variants)
        assert not current_bundles_module._library_contains_title(
            "Gamma",
            library_variants,
        )

        total, known_items = current_bundles_module._sum_msrp_for_titles(
            ["Alpha", "Beta", "Gamma"],
            {
                current_bundles_module._title_key("Alpha"): BundleItem(
                    title="Alpha",
                    price_label="Pay at least $1",
                    price_value=1.0,
                    price_kind="at least",
                    msrp_label="Retail: $10",
                    msrp_value=10.0,
                ),
                current_bundles_module._title_key("Beta"): BundleItem(
                    title="Beta",
                    price_label="Pay at least $5",
                    price_value=5.0,
                    price_kind="at least",
                    msrp_label=None,
                    msrp_value=None,
                ),
            },
        )

        assert total == 10.0
        assert known_items == 1

    def test_fetch_current_bundle_catalog_uses_rendered_fallbacks(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        output_dir = tmp_path / "bundles"
        index_html = "<html><body>raw index</body></html>"
        bundle_html = "<html><body>raw bundle</body></html>"
        rendered_index_html = "<html><body>rendered index</body></html>"
        rendered_bundle_html = "<html><body>rendered bundle</body></html>"

        class StubResponse:
            def __init__(self, text: str) -> None:
                self.text = text

            def raise_for_status(self) -> None:
                return None

        class StubSession:
            def __init__(self) -> None:
                self.headers: dict[str, str] = {}

            def get(self, url: str, *, timeout: int) -> StubResponse:
                assert timeout == 20
                if url == current_bundles_module.BUNDLES_INDEX_URL:
                    return StubResponse(index_html)
                return StubResponse(bundle_html)

        bundle_link = BundleLink(
            title="Rendered Books",
            url="https://www.humblebundle.com/books/rendered-books",
            offer_ends_text="7 Days Left",
            offer_ends_in_days=7,
            offer_ends_detail="7 days left",
        )
        build_calls: list[str] = []
        parse_calls: list[str] = []

        def build_links_stub(html: str) -> list[BundleLink]:
            build_calls.append(html)
            return [] if html == index_html else [bundle_link]

        def parse_stub(html: str, *, url: str, fetched_at: str, html_path: Path):
            parse_calls.append(html)
            if html == bundle_html:
                return BundlePageSnapshot(
                    title="Rendered Books",
                    bundle_type="Book Bundle",
                    category="books",
                    url=url,
                    slug="rendered-books",
                    fetched_at=fetched_at,
                    html_path=str(html_path),
                    filter_labels=[],
                    items=[],
                    tiers=[],
                )
            return BundlePageSnapshot(
                title="Rendered Books",
                bundle_type="Book Bundle",
                category="books",
                url=url,
                slug="rendered-books",
                fetched_at=fetched_at,
                html_path=str(html_path),
                filter_labels=["1 Item Bundle"],
                items=[
                    BundleItem(
                        title="Alpha",
                        price_label="Pay at least $1",
                        price_value=1.0,
                        price_kind="at least",
                    )
                ],
                tiers=[
                    BundleTier(
                        label="1 Item Bundle",
                        price_label="Pay at least $1",
                        price_value=1.0,
                        item_count=1,
                        titles=["Alpha"],
                    )
                ],
            )

        monkeypatch.setattr(current_bundles_module.requests, "Session", StubSession)
        monkeypatch.setattr(
            current_bundles_module, "build_bundle_links", build_links_stub
        )
        monkeypatch.setattr(
            current_bundles_module, "parse_bundle_page_html", parse_stub
        )
        monkeypatch.setattr(
            current_bundles_module,
            "_fetch_rendered_htmls",
            lambda urls, *, timeout_seconds: {
                current_bundles_module.BUNDLES_INDEX_URL: rendered_index_html,
                bundle_link.url: rendered_bundle_html,
            },
        )

        catalog = current_bundles_module.fetch_current_bundle_catalog(
            output_dir=output_dir,
            bundle_types=["books"],
            timeout_seconds=20,
        )

        assert build_calls == [index_html, rendered_index_html]
        assert parse_calls == [bundle_html, rendered_bundle_html]
        assert len(catalog.bundles) == 1
        assert catalog.bundles[0].offer_ends_text == "7 Days Left"
        assert (
            Path(catalog.index_html_path).read_text(encoding="utf-8")
            == rendered_index_html
        )

    def test_capture_and_report_current_bundles_returns_workflow_paths(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        output_dir = tmp_path / "bundles"
        library_path = tmp_path / "library_products.json"

        monkeypatch.setattr(
            current_bundles_module,
            "fetch_current_bundle_catalog",
            lambda *, output_dir, bundle_types, timeout_seconds: BundleCatalogSnapshot(
                fetched_at="2026-03-18T00:00:00+00:00",
                index_url=current_bundles_module.BUNDLES_INDEX_URL,
                index_html_path=str(output_dir / "bundles_index.html"),
                bundle_links_path=str(output_dir / "bundle_links.json"),
                catalog_json_path=str(output_dir / "bundle_catalog.json"),
                bundles=[],
            ),
        )
        monkeypatch.setattr(
            current_bundles_module,
            "build_bundle_overlap_report",
            lambda _catalog, *, library_path, output_dir, bundle_types: BundleOverlapReport(
                generated_at="2026-03-18T00:00:00+00:00",
                library_path=str(library_path),
                bundle_types=bundle_types or [],
                bundle_count=0,
                report_json_path=str(output_dir / "bundle_overlap_report.json"),
                report_markdown_path=str(output_dir / "bundle_overlap_report.md"),
                bundles=[],
            ),
        )

        artifacts = current_bundles_module.capture_and_report_current_bundles(
            output_dir=output_dir,
            library_path=library_path,
            bundle_types=["books"],
            timeout_seconds=20,
        )

        assert artifacts.output_dir == str(output_dir.expanduser().resolve())
        assert artifacts.bundle_types == ["books"]
        assert artifacts.bundle_count == 0

        def test_extract_bundle_link_title_and_type_helpers_cover_fallbacks(
            self,
        ) -> None:
            anchor = BeautifulSoup(
                "<a href='/books/sample'><img alt='Image Bundle Title' /></a>",
                "html.parser",
            ).find("a")
            assert anchor is not None

            title = current_bundles_module._extract_bundle_link_title(
                anchor,
                "https://www.humblebundle.com/books/sample",
            )
            bundle_type = current_bundles_module._extract_bundle_type(
                BeautifulSoup(
                    "<html><body>No explicit type</body></html>", "html.parser"
                ),
                "https://www.humblebundle.com/software/sample",
            )

            assert title == "Image Bundle Title"
            assert bundle_type == "Software Bundle"

        def test_extract_filter_labels_and_item_entries_handle_sparse_markup(
            self,
        ) -> None:
            soup = BeautifulSoup(
                """
                        <html>
                            <body>
                                <div>Bundle Filters</div>
                                <div>Entire 4 Item Bundle</div>
                                <div class="tier-item-view">
                                    <span class="item-title">Alpha</span>
                                    <span class="item-flavor-text">MSRP: $12</span>
                                    <span class="extra-info">Bonus Soundtrack</span>
                                </div>
                                <div class="tier-item-details-view">
                                    <section class="header-area">
                                        <h2>Alpha</h2>
                                        <s class="msrp">Retail: $12</s>
                                    </section>
                                    <section class="description">Alpha description</section>
                                </div>
                                <p>Pay at least $1 to get this item</p>
                                <section><h2>Alpha</h2><p>Pay at least $1 to get this item</p></section>
                            </body>
                        </html>
                        """,
                "html.parser",
            )

            labels = current_bundles_module._extract_filter_labels(soup)
            items = current_bundles_module._extract_item_entries(
                soup, "Synthetic Bundle"
            )

            assert labels == ["Entire 4 Item Bundle"]
            assert len(items) == 1
            assert items[0].title == "Alpha"
            assert items[0].msrp_value == 12.0
            assert items[0].flavor_text == "Bonus Soundtrack"
            assert items[0].description == "Alpha description"

        def test_bundle_helper_formatters_cover_small_branches(self) -> None:
            assert current_bundles_module._extract_msrp_value(None) == (None, None)
            assert current_bundles_module._format_price_value(5.0) == "$5"
            assert current_bundles_module._format_price_value(5.5) == "$5.5"
            assert current_bundles_module._format_percent(50.0) == "50%"
            assert current_bundles_module._format_percent(33.3) == "33.3%"
            assert current_bundles_module._short_bundle_type("Book Bundle") == "Book"
            assert current_bundles_module._wrap_bundle_title_lines(
                "A very long bundle title for wrapping",
                target_length=10,
            ) == ["A very", "long", "bundle", "title for", "wrapping"]

        def test_bundle_helpers_cover_price_url_and_countdown_edge_cases(self) -> None:
            average_match = current_bundles_module._TIER_HEADING_RE.search(
                "Pay more than the average of $12.50 for these 8 items",
            )
            assert average_match is not None

            label, price_value, kind = current_bundles_module._parse_price_match(
                average_match,
            )
            countdown_anchor = BeautifulSoup(
                """
                <a href="/games/sample">
                  <div class="js-countdown-timer" aria-label="3 days, 1 hour left"></div>
                </a>
                """,
                "html.parser",
            ).find("a")
            assert countdown_anchor is not None

            offer_text, offer_days, offer_detail = (
                current_bundles_module._extract_offer_countdown(
                    countdown_anchor,
                )
            )

            assert label == "Pay more than the average of $12.50"
            assert price_value == 12.5
            assert kind == "more than the average of"
            assert current_bundles_module._is_bundle_url(
                "https://www.humblebundle.com/games/sample",
            )
            assert not current_bundles_module._is_bundle_url(
                "https://www.humblebundle.com/store/sample",
            )
            assert offer_text == "3 Days Left"
            assert offer_days == 3
            assert offer_detail == "3 days, 1 hour left"

        @pytest.mark.parametrize(
            ("text", "bundle_title", "expected"),
            [
                ("", "Bundle", False),
                ("preview trailer", "Bundle", False),
                ("Previous item", "Bundle", False),
                ("$4.99", "Bundle", False),
                ("Bundle", "Bundle", False),
                ("Alpha", "Bundle", True),
            ],
        )
        def test_is_item_title_candidate_filters_noise(
            self,
            text: str,
            bundle_title: str,
            expected: bool,
        ) -> None:
            assert (
                current_bundles_module._is_item_title_candidate(text, bundle_title)
                is expected
            )

        def test_bundle_url_helpers_and_enrichment_merge_cover_fallbacks(self) -> None:
            target = {
                "msrp_label": None,
                "msrp_value": None,
                "flavor_text": "existing",
                "description": None,
            }

            current_bundles_module._merge_item_enrichment(
                target,
                {
                    "msrp_label": "Retail: $10",
                    "msrp_value": 10.0,
                    "flavor_text": "",
                    "description": "Sample description",
                },
            )

            assert (
                current_bundles_module._bundle_category_from_url(
                    "https://www.humblebundle.com/games/sample-bundle",
                )
                == "games"
            )
            assert (
                current_bundles_module._bundle_category_from_url(
                    "https://www.humblebundle.com",
                )
                == "unknown"
            )
            assert (
                current_bundles_module._bundle_slug(
                    "https://www.humblebundle.com/books/sample-bundle/",
                )
                == "sample-bundle"
            )
            assert (
                current_bundles_module._bundle_slug("https://www.humblebundle.com/")
                == "bundle"
            )
            assert target == {
                "msrp_label": "Retail: $10",
                "msrp_value": 10.0,
                "flavor_text": "existing",
                "description": "Sample description",
            }
