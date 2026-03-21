"""Unit tests for current Humble Choice fetching and overlap reporting helpers."""

from __future__ import annotations

# pyright: reportPrivateUsage=false
# pylint: disable=protected-access,unused-argument,unused-variable

import importlib
from pathlib import Path
from types import SimpleNamespace

from bs4 import BeautifulSoup
import pytest

from hb_library_viewer.current_choice import (
    CurrentChoiceGame,
    CurrentChoicePageSnapshot,
    CurrentChoiceReport,
    build_current_choice_report,
    load_current_choice_report,
    parse_current_choice_page_html,
    render_current_choice_markdown,
)
from hb_library_viewer.parsing import LibraryData, Product

current_choice_module = importlib.import_module("hb_library_viewer.current_choice")


@pytest.mark.unit
class TestCurrentChoice:
    """Verify Humble Choice month parsing and overlap reporting."""

    def test_parse_current_choice_page_html_extracts_month_price_and_titles(
        self,
        tmp_path: Path,
    ) -> None:
        html = """
        <html>
          <body>
            <p>Get great games every month with Humble Choice for only $14.99</p>
            <a>Get March's Games</a>
            <h2>This Month's Games</h2>
            <img alt="Tempest Rising" />
            <h3>Tempest Rising</h3>
            <div>Action, Strategy, Fan Favorite</div>
            <img alt="Chants of Sennaar" />
            <h3>Chants of Sennaar</h3>
            <div>Adventure, Puzzle, Fan Favorite</div>
            <h2>Get Rewarded For Being a Member</h2>
          </body>
        </html>
        """

        snapshot = parse_current_choice_page_html(
            html,
            url="https://www.humblebundle.com/membership",
            fetched_at="2026-03-19T00:00:00+00:00",
            page_html_path=tmp_path / "membership.html",
            snapshot_json_path=tmp_path / "choice_snapshot.json",
        )

        assert snapshot.month_label == "March"
        assert snapshot.price_label == "$14.99/month"
        assert snapshot.price_value == 14.99
        assert snapshot.titles == ["Tempest Rising", "Chants of Sennaar"]

    def test_parse_current_choice_page_html_uses_choice_section_and_embedded_titles(
        self,
        tmp_path: Path,
    ) -> None:
        html = """
            <html>
                <body>
                    <button aria-label="Dismiss Banner"></button>
                    <a aria-label="Menu"></a>
                    <div aria-label="Search"></div>
                    <a aria-label="Home"><img alt="Humble Bundle logo" /></a>
                    <p>Get great games every month with Humble Choice for only $14.99</p>
                    <a>Get March's Games</a>
                    <section class="marketing-your-games grid">
                        <h2>This Month's Games</h2>
                        <div class="discover-game">
                            <div class="human-name">Tempest Rising</div>
                            <button
                                data-content-choice-data='{"tempestrising":{"title":"Tempest Rising","delivery_methods":["steam"],"platforms":["windows"],"genres":["Action"]},"chantsofsennaar":{"title":"Chants of Sennaar","delivery_methods":["steam"],"platforms":["windows"],"genres":["Adventure"]},"ignplus_choicecoupon_2025":{"title":"Get One Month of IGN Plus","delivery_methods":["other-key"],"platforms":[],"genres":[]}}'
                                data-display-order='["tempestrising","chantsofsennaar","ignplus_choicecoupon_2025"]'
                            ></button>
                        </div>
                        <div class="discover-game">
                            <div class="human-name">Chants of Sennaar</div>
                        </div>
                    </section>
                    <h2>Get Rewarded For Being a Member</h2>
                </body>
            </html>
            """

        snapshot = parse_current_choice_page_html(
            html,
            url="https://www.humblebundle.com/membership",
            fetched_at="2026-03-19T00:00:00+00:00",
            page_html_path=tmp_path / "membership.html",
            snapshot_json_path=tmp_path / "choice_snapshot.json",
        )

        assert snapshot.month_label == "March"
        assert snapshot.price_label == "$14.99/month"
        assert snapshot.titles == ["Tempest Rising", "Chants of Sennaar"]

    def test_build_current_choice_report_marks_owned_and_new_titles(
        self,
        tmp_path: Path,
    ) -> None:
        library = LibraryData(
            products=[
                Product(
                    gamekey="owned-tempest",
                    product_name="Tempest Rising",
                    machine_name="tempest_rising",
                    category="game",
                )
            ],
            total_products=1,
            captured_at="2026-03-19T00:00:00+00:00",
        )
        library_path = tmp_path / "library_products.json"
        library_path.write_text(library.model_dump_json(indent=2), encoding="utf-8")

        snapshot = CurrentChoicePageSnapshot(
            fetched_at="2026-03-19T00:00:00+00:00",
            page_url="https://www.humblebundle.com/membership",
            page_html_path=str(tmp_path / "membership.html"),
            snapshot_json_path=str(tmp_path / "choice_snapshot.json"),
            month_label="March",
            price_label="$14.99/month",
            price_value=14.99,
            titles=["Tempest Rising", "Chants of Sennaar"],
        )

        report = build_current_choice_report(
            snapshot,
            library_path=library_path,
            output_dir=tmp_path,
        )

        assert report.month_label == "March"
        assert report.total_titles == 2
        assert report.owned_titles == 1
        assert report.new_titles == 1
        assert report.new_percent == 50.0
        assert report.games[0].owned is True
        assert report.games[0].matched_library_titles == ["Tempest Rising"]
        assert report.games[1].owned is False
        markdown = Path(report.report_markdown_path).read_text(encoding="utf-8")
        assert "## Current month table" in markdown
        assert '<td style="vertical-align: top;">Tempest Rising</td>' in markdown
        assert '<td style="vertical-align: top;">Already owned</td>' in markdown
        assert '<td style="vertical-align: top;">New this month</td>' in markdown

        loaded_report = load_current_choice_report(Path(report.report_json_path))
        assert loaded_report.games[0].matched_library_titles == ["Tempest Rising"]

    def test_render_current_choice_markdown_includes_counts(self) -> None:
        report = CurrentChoiceReport(
            generated_at="2026-03-19T00:00:00+00:00",
            month_label="March",
            page_url="https://www.humblebundle.com/membership",
            page_html_path="membership.html",
            snapshot_json_path="choice_snapshot.json",
            library_path="library_products.json",
            price_label="$14.99/month",
            price_value=14.99,
            total_titles=2,
            owned_titles=1,
            new_titles=1,
            owned_percent=50.0,
            new_percent=50.0,
            report_json_path="choice_overlap_report.json",
            report_markdown_path="choice_overlap_report.md",
            games=[
                CurrentChoiceGame(
                    title="Tempest Rising",
                    owned=True,
                    matched_library_titles=["Tempest Rising"],
                ),
                CurrentChoiceGame(
                    title="Chants of Sennaar",
                    owned=False,
                    matched_library_titles=[],
                ),
            ],
        )

        markdown = render_current_choice_markdown(report)

        assert "Games analyzed: 2" in markdown
        assert "New this month: 1 (50%)" in markdown
        assert "Tempest Rising" in markdown
        assert "Chants of Sennaar" in markdown

    def test_extract_choice_helpers_support_fallback_patterns(self) -> None:
        html = (
            "<html><body>March's Humble Choice is live for only $11.99/month"
            "</body></html>"
        )
        soup = BeautifulSoup(html, "html.parser")

        month = current_choice_module._extract_choice_month_label(html, soup)
        price_label, price_value = current_choice_module._extract_choice_price(
            html,
            soup,
        )

        assert month == "March"
        assert price_label == "$11.99/month"
        assert price_value == 11.99

    def test_extract_choice_titles_from_embedded_data_filters_promotions(self) -> None:
        section = BeautifulSoup(
            """
            <section>
              <button
                data-content-choice-data='{"alpha":{"title":"Alpha","delivery_methods":["steam"],"platforms":["windows"],"genres":["Action"]},"promo":{"title":"Join Choice Today","delivery_methods":["other-key"],"platforms":[],"genres":[]},"beta":{"title":"Beta","delivery_methods":["steam"],"platforms":["windows"],"genres":["Adventure"]}}'
                data-display-order='["alpha","promo","beta"]'
              ></button>
            </section>
            """,
            "html.parser",
        )

        titles = current_choice_module._extract_choice_titles_from_embedded_data(
            section
        )

        assert titles == ["Alpha", "Beta"]

    def test_collect_choice_titles_falls_back_to_images_and_headings(self) -> None:
        section = BeautifulSoup(
            """
            <section>
              <h2>This Month's Games</h2>
              <img alt="Alpha" />
              <h3>Alpha</h3>
              <div>Action, Strategy, Fan Favorite</div>
              <img alt="Beta" />
              <h3>Beta</h3>
              <div>Get Rewarded For Being a Member</div>
            </section>
            """,
            "html.parser",
        )

        titles = current_choice_module._collect_choice_titles(section)

        assert titles == ["Alpha", "Beta"]

    def test_matching_library_titles_dedupes_variant_matches(self) -> None:
        library = LibraryData(
            products=[
                Product(
                    gamekey="alpha-owned",
                    product_name="Alpha",
                    machine_name="alpha",
                    category="game",
                )
            ],
            total_products=1,
            captured_at="2026-03-19T00:00:00+00:00",
        )

        variant_map = current_choice_module._build_library_variant_map(library)
        matches = current_choice_module._matching_library_titles("Alpha", variant_map)

        assert matches == ["Alpha"]

    def test_capture_and_report_current_choice_retries_with_rendered_html(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        output_dir = tmp_path / "choice"
        library_path = tmp_path / "library_products.json"
        initial_html = "<html><body>raw</body></html>"
        rendered_html = "<html><body>rendered</body></html>"
        parse_calls: list[str] = []

        class StubResponse:
            def __init__(self, text: str) -> None:
                self.text = text

            def raise_for_status(self) -> None:
                return None

        class StubSession:
            def __init__(self) -> None:
                self.headers: dict[str, str] = {}

            def get(self, _url: str, *, timeout: int) -> StubResponse:
                assert timeout == 15
                return StubResponse(initial_html)

        snapshot = CurrentChoicePageSnapshot(
            fetched_at="2026-03-19T01:00:00+00:00",
            page_url=current_choice_module.CURRENT_CHOICE_URL,
            page_html_path=str(output_dir / "membership.html"),
            snapshot_json_path=str(output_dir / "choice_snapshot.json"),
            month_label="March",
            price_label="$14.99/month",
            price_value=14.99,
            titles=["Alpha", "Beta"],
        )

        monkeypatch.setattr(current_choice_module.requests, "Session", StubSession)

        def parse_stub(
            html_text: str,
            **_kwargs,
        ) -> CurrentChoicePageSnapshot:
            parse_calls.append(html_text)
            if len(parse_calls) == 1:
                raise ValueError("needs rendered HTML")
            return snapshot

        monkeypatch.setattr(
            current_choice_module,
            "parse_current_choice_page_html",
            parse_stub,
        )
        monkeypatch.setattr(
            current_choice_module,
            "_fetch_rendered_htmls",
            lambda urls, *, timeout_seconds: {
                urls[0]: rendered_html,
            },
        )
        monkeypatch.setattr(
            current_choice_module,
            "build_current_choice_report",
            lambda _snapshot, *, library_path, output_dir: SimpleNamespace(
                report_json_path=str(output_dir / "choice_overlap_report.json"),
                report_markdown_path=str(output_dir / "choice_overlap_report.md"),
                month_label="March",
                total_titles=2,
            ),
        )

        artifacts = current_choice_module.capture_and_report_current_choice(
            output_dir=output_dir,
            library_path=library_path,
            timeout_seconds=15,
        )

        assert parse_calls == [initial_html, rendered_html]
        assert artifacts.month_label == "March"
        assert artifacts.game_count == 2
        assert (
            Path(artifacts.page_html_path).read_text(encoding="utf-8") == rendered_html
        )

    def test_choice_section_helpers_find_and_slice_choice_content(self) -> None:
        html = """
        <div>
          <div class="choice-wrapper">
            <h2>This Month's Games</h2>
            <div class="discover-game"><div class="human-name">Alpha</div></div>
          </div>
          <h2>Get Rewarded For Being a Member</h2>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")

        section = current_choice_module._find_choice_section(soup)
        sliced = current_choice_module._slice_choice_section_html(html)

        assert section is not None
        assert "discover-game" in str(section)
        assert sliced is not None
        assert "Alpha" in sliced
        assert "Get Rewarded For Being a Member" not in sliced

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("Action, Strategy, Fan Favorite", False),
            ("Join Choice Today", False),
            ("$14.99/month", False),
            ("Positive recommendation", False),
            ("Supporting charity in everything we do", False),
            ("A" * 121, False),
            ("Alpha", True),
        ],
    )
    def test_is_choice_title_candidate_filters_noise(
        self,
        value: str,
        expected: bool,
    ) -> None:
        assert current_choice_module._is_choice_title_candidate(value) is expected

    def test_extract_choice_titles_from_embedded_data_returns_empty_for_invalid_json(
        self,
    ) -> None:
        section = BeautifulSoup(
            """
            <section>
              <button
                data-content-choice-data='{"alpha":'
                data-display-order='not-json'
              ></button>
            </section>
            """,
            "html.parser",
        )

        assert (
            current_choice_module._extract_choice_titles_from_embedded_data(section)
            == []
        )

    def test_parse_current_choice_page_html_raises_when_no_titles_are_found(
        self,
        tmp_path: Path,
    ) -> None:
        html = "<html><body><h2>About</h2><p>Join Choice Today</p></body></html>"

        with pytest.raises(
            ValueError,
            match="Unable to extract current Humble Choice titles",
        ):
            parse_current_choice_page_html(
                html,
                url="https://www.humblebundle.com/membership",
                fetched_at="2026-03-19T00:00:00+00:00",
                page_html_path=tmp_path / "membership.html",
                snapshot_json_path=tmp_path / "choice_snapshot.json",
            )

    def test_choice_helpers_cover_default_month_price_and_formatting(self) -> None:
        html = (
            "<html><body><section class='marketing-your-games'></section></body></html>"
        )
        soup = BeautifulSoup(html, "html.parser")

        section = current_choice_module._find_choice_section(soup)
        price_label, price_value = current_choice_module._extract_choice_price(
            html,
            soup,
        )

        assert section is not None
        assert (
            current_choice_module._extract_choice_month_label(html, soup) == "Current"
        )
        assert price_label is None
        assert price_value is None
        assert current_choice_module._percent(0, 0) == 0.0
        assert current_choice_module._format_percent(50.0) == "50%"
        assert current_choice_module._format_percent(33.3) == "33.3%"

    def test_find_casefold_index_supports_offsets_and_missing_values(self) -> None:
        value = "Intro THIS MONTH'S GAMES middle this month's games end"

        first = current_choice_module._find_casefold_index(value, "this month's games")
        second = current_choice_module._find_casefold_index(
            value,
            "this month's games",
            start=first + 1,
        )
        missing = current_choice_module._find_casefold_index(value, "not present")

        assert first == 6
        assert second > first
        assert missing == -1
