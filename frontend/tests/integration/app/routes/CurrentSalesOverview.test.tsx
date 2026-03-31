import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/components/charts/LineChart", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../../../../src/components/charts/PieChart", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../../../../src/data/api", () => ({
  useCurrentBundlesStatus: vi.fn(),
  useCurrentBundlesReport: vi.fn(),
  useCurrentChoiceStatus: vi.fn(),
  useCurrentChoiceReport: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import CurrentSalesOverview from "../../../../src/app/routes/CurrentSalesOverview";

const mockBundlesStatusHook = vi.mocked(api.useCurrentBundlesStatus);
const mockBundlesReportHook = vi.mocked(api.useCurrentBundlesReport);
const mockChoiceStatusHook = vi.mocked(api.useCurrentChoiceStatus);
const mockChoiceReportHook = vi.mocked(api.useCurrentChoiceReport);

function renderRoute() {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CurrentSalesOverview />
    </MemoryRouter>,
  );
}

describe("CurrentSalesOverview", () => {
  it("renders decision shortcuts that deep-link to focused bundle routes", () => {
    mockBundlesStatusHook.mockReturnValue({
      data: { report_exists: true },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);
    mockBundlesReportHook.mockReturnValue({
      data: {
        bundles: [
          {
            category: "games",
            title: "Game Bundle Alpha",
            display_title: "Game Bundle Alpha",
            bundle_type: "games",
            display_type: "Game bundle",
            url: "https://example.test/games-alpha",
            top_tier_status: "only_new",
            offer_ends_in_days: 5,
            offer_ends_text: "5 Days Left",
            offer_ends_detail: "5 days remaining",
            items: [],
            tiers: [
              {
                price_value: 12,
                total_items: 6,
                owned_items: 0,
                new_items: 6,
                missing_percent: 100,
                added_titles: [],
                owned_titles: [],
                new_titles: ["A", "B"],
                msrp_total: 120,
                msrp_known_items: 6,
                savings_percent: 90,
                value_multiple: 10,
              },
            ],
          },
          {
            category: "books",
            title: "Book Bundle Beta",
            display_title: "Book Bundle Beta",
            bundle_type: "books",
            display_type: "Book bundle",
            url: "https://example.test/books-beta",
            top_tier_status: "partial_overlap",
            offer_ends_in_days: 12,
            offer_ends_text: "12 Days Left",
            offer_ends_detail: "12 days remaining",
            items: [],
            tiers: [
              {
                price_value: 18,
                total_items: 8,
                owned_items: 3,
                new_items: 5,
                missing_percent: 62.5,
                added_titles: [],
                owned_titles: ["Owned Title"],
                new_titles: ["New Title"],
                msrp_total: 80,
                msrp_known_items: 8,
                savings_percent: 77.5,
                value_multiple: 4.4,
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesReport>);
    mockChoiceStatusHook.mockReturnValue({
      data: { report_exists: true, month_label: "March 2026", game_count: 8 },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);
    mockChoiceReportHook.mockReturnValue({
      data: {
        month_label: "March 2026",
        total_titles: 8,
        owned_titles: 3,
        new_titles: 5,
        new_percent: 62.5,
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceReport>);

    renderRoute();

    expect(screen.getByText("Decision shortcuts")).toBeInTheDocument();
    const gameShortcutHrefs = screen
      .getAllByRole("link", { name: "Review Game bundles" })
      .map((link) => link.getAttribute("href"));
    expect(gameShortcutHrefs).toContain(
      "/venue/bundles/games?focus=all-new",
    );
    expect(gameShortcutHrefs).toContain(
      "/venue/bundles/games?focus=expiring-soon",
    );
    expect(screen.getByRole("link", { name: "Review Book bundles" })).toHaveAttribute(
      "href",
      "/venue/bundles/books?focus=partial-overlap",
    );
    expect(screen.getByText("How to read the charts")).toBeInTheDocument();
  });
});