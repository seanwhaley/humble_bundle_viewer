import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/data/api", () => ({
  useCurrentBundlesStatus: vi.fn(),
  useCurrentBundlesReport: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import VenueBundlePage from "../../../../src/app/routes/VenueBundlePage";

const mockStatusHook = vi.mocked(api.useCurrentBundlesStatus);
const mockReportHook = vi.mocked(api.useCurrentBundlesReport);

function renderRoute(initialEntry = "/venue/bundles/games?focus=all-new") {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="/venue/bundles/games"
          element={<VenueBundlePage bundleType="games" />}
        />
        <Route path="/venue/overview" element={<div>Sales Overview destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VenueBundlePage", () => {
  it("applies the quick-focus filter and lets the user return to all bundles", () => {
    mockStatusHook.mockReturnValue({
      data: { report_exists: true },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);
    mockReportHook.mockReturnValue({
      data: {
        bundles: [
          {
            category: "games",
            title: "Alpha Games Bundle",
            display_title: "Alpha Games Bundle",
            bundle_type: "games",
            display_type: "Game bundle",
            url: "https://example.test/alpha",
            top_tier_status: "only_new",
            offer_ends_in_days: 4,
            offer_ends_text: "4 Days Left",
            offer_ends_detail: "4 days remaining",
            items: [],
            tiers: [
              {
                price_value: 12,
                total_items: 5,
                owned_items: 0,
                new_items: 5,
                missing_percent: 100,
                added_titles: [],
                owned_titles: [],
                new_titles: ["One"],
                msrp_total: 120,
                msrp_known_items: 5,
                savings_percent: 91,
                value_multiple: 10,
              },
            ],
          },
          {
            category: "games",
            title: "Beta Games Bundle",
            display_title: "Beta Games Bundle",
            bundle_type: "games",
            display_type: "Game bundle",
            url: "https://example.test/beta",
            top_tier_status: "partial_overlap",
            offer_ends_in_days: 11,
            offer_ends_text: "11 Days Left",
            offer_ends_detail: "11 days remaining",
            items: [],
            tiers: [
              {
                price_value: 15,
                total_items: 6,
                owned_items: 3,
                new_items: 3,
                missing_percent: 50,
                added_titles: [],
                owned_titles: ["Owned"],
                new_titles: ["New"],
                msrp_total: 60,
                msrp_known_items: 6,
                savings_percent: 70,
                value_multiple: 4,
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesReport>);

    renderRoute();

    expect(screen.getByText(/Current quick view: All-new/i)).toBeInTheDocument();
    expect(screen.getByText("Alpha Games Bundle")).toBeInTheDocument();
    expect(screen.queryByText("Beta Games Bundle")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /All bundles \(2\)/i }));

    expect(screen.getByText("Beta Games Bundle")).toBeInTheDocument();
  });
});