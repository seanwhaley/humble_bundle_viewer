import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/components/charts/BarChart", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../../../../src/data/api", () => ({
  useLibraryStatus: vi.fn(),
  useOptionalLibraryData: vi.fn(),
  useViewerConfig: vi.fn(),
  useCurrentBundlesStatus: vi.fn(),
  useCurrentBundlesReport: vi.fn(),
  useCurrentChoiceStatus: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import Home from "../../../../src/app/routes/Home";
import {
  PageHeaderProvider,
  usePageHeaderState,
} from "../../../../src/app/layout/PageHeaderContext";
import { FilterProvider } from "../../../../src/state/filters";

const mockLibraryStatusHook = vi.mocked(api.useLibraryStatus);
const mockOptionalLibraryDataHook = vi.mocked(api.useOptionalLibraryData);
const mockViewerConfigHook = vi.mocked(api.useViewerConfig);
const mockCurrentBundlesStatusHook = vi.mocked(api.useCurrentBundlesStatus);
const mockCurrentBundlesReportHook = vi.mocked(api.useCurrentBundlesReport);
const mockCurrentChoiceStatusHook = vi.mocked(api.useCurrentChoiceStatus);

const memoryRouterFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function HeaderActionsMirror() {
  const { actions } = usePageHeaderState();
  return <div>{actions}</div>;
}

function renderRoute() {
  return render(
    <MemoryRouter future={memoryRouterFuture}>
      <PageHeaderProvider>
        <HeaderActionsMirror />
        <FilterProvider>
          <Home />
        </FilterProvider>
      </PageHeaderProvider>
    </MemoryRouter>,
  );
}

describe("Home", () => {
  it("shows a loading spinner while library data is loading", () => {
    mockLibraryStatusHook.mockReturnValue({
      data: {
        exists: true,
        current_path: "D:/artifacts/library_products.json",
        default_save_dir: "D:/Downloads",
        default_library_path: "D:/Downloads/library_products.json",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryStatus>);
    mockOptionalLibraryDataHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof api.useOptionalLibraryData>);
    mockViewerConfigHook.mockReturnValue({
      data: {
        link_expiry_warning_hours: 6,
      },
    } as ReturnType<typeof api.useViewerConfig>);
    mockCurrentBundlesStatusHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);
    mockCurrentBundlesReportHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesReport>);
    mockCurrentChoiceStatusHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    const { container } = renderRoute();

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders the home dashboard sections for loaded data", () => {
    mockLibraryStatusHook.mockReturnValue({
      data: {
        exists: true,
        current_path: "D:/artifacts/library_products.json",
        default_save_dir: "D:/Downloads",
        default_library_path: "D:/Downloads/library_products.json",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryStatus>);
    mockOptionalLibraryDataHook.mockReturnValue({
      data: {
        total_products: 1,
        captured_at: "2026-03-29T12:00:00Z",
        products: [
          {
            product_name: "Alpha Bundle",
            category: "ebook",
            amount_spent: 12,
            created_at: "2026-03-01T12:00:00Z",
            downloads: [
              {
                platform: "ebook",
                name: "alpha.pdf",
                size_bytes: 1024,
                file_type: "pdf",
              },
            ],
            keys: [],
            subproducts: [
              {
                human_name: "Guidebook",
                downloads: [],
                keys: [],
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useOptionalLibraryData>);
    mockViewerConfigHook.mockReturnValue({
      data: {
        link_expiry_warning_hours: 6,
      },
    } as ReturnType<typeof api.useViewerConfig>);
    mockCurrentBundlesStatusHook.mockReturnValue({
      data: {
        output_dir: "data/artifacts/current_bundles",
        report_json_path: "report.json",
        report_markdown_path: "report.md",
        library_path: "data/artifacts/library_products.json",
        bundle_types: ["games", "books", "software"],
        report_exists: true,
        markdown_exists: true,
        generated_at: "2026-03-29T12:00:00Z",
        bundle_count: 7,
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);
    mockCurrentBundlesReportHook.mockReturnValue({
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
            offer_ends_in_days: 4,
            offer_ends_text: "4 Days Left",
            offer_ends_detail: "4 days, 11 hours left",
            items: [],
            tiers: [],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesReport>);
    mockCurrentChoiceStatusHook.mockReturnValue({
      data: {
        output_dir: "data/artifacts/current_choice",
        page_html_path: "choice.html",
        snapshot_json_path: "choice.json",
        report_json_path: "choice-report.json",
        report_markdown_path: "choice-report.md",
        library_path: "data/artifacts/library_products.json",
        report_exists: true,
        markdown_exists: true,
        generated_at: "2026-03-29T12:00:00Z",
        month_label: "March 2026",
        game_count: 8,
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    renderRoute();

    expect(
      screen.getByText("Start with the library currently in view"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Check live bundles and this month’s Choice before you branch out",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Show deeper analytics/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("See how the current scope breaks down"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Browse by category")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Show deeper analytics/i }),
    );

    expect(
      screen.getByText("See how the current scope breaks down"),
    ).toBeInTheDocument();
    expect(screen.getByText("Browse by category")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ebook" })).toHaveAttribute(
      "href",
      "/library/category/ebook",
    );
  });

  it("renders the real homepage experience and exposes route-owned filters", async () => {
    const now = new Date();
    const currentChoiceMonth = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(now);

    mockLibraryStatusHook.mockReturnValue({
      data: {
        exists: true,
        current_path: "D:/artifacts/library_products.json",
        default_save_dir: "D:/Downloads",
        default_library_path: "D:/Downloads/library_products.json",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryStatus>);
    mockOptionalLibraryDataHook.mockReturnValue({
      data: {
        total_products: 2,
        captured_at: now.toISOString(),
        products: [
          {
            product_name: "Alpha Bundle",
            machine_name: "alpha-bundle",
            gamekey: "alpha-key",
            category: "ebook",
            amount_spent: 12,
            created_at: "2026-03-01T12:00:00Z",
            downloads: [
              {
                platform: "ebook",
                name: "alpha.pdf",
                size_bytes: 1024,
                file_type: "pdf",
                url: "https://example.test/download?exp=1700000000",
              },
            ],
            keys: [],
            subproducts: [
              {
                human_name: "Guidebook",
                downloads: [],
                keys: [],
              },
            ],
          },
          {
            product_name: "Beta Bundle",
            machine_name: "beta-bundle",
            gamekey: "beta-key",
            category: "software",
            amount_spent: 18,
            created_at: "2026-03-12T12:00:00Z",
            downloads: [
              {
                platform: "windows",
                name: "beta-installer.exe",
                size_bytes: 4096,
                file_type: "exe",
                url: "https://example.test/installer?exp=1700000000",
              },
            ],
            keys: [
              {
                key_type: "steam",
                redeemed_key_val: "ABCDE-FGHIJ-KLMNO",
              },
            ],
            subproducts: [
              {
                human_name: "Beta App",
                downloads: [],
                keys: [],
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useOptionalLibraryData>);
    mockViewerConfigHook.mockReturnValue({
      data: {
        link_expiry_warning_hours: 24,
        assume_revealed_keys_redeemed: false,
        ignore_revealed_status_for_expired_keys: false,
        ignore_revealed_status_for_unexpired_keys: false,
        managed_sync_max_parallel_downloads: 2,
        managed_sync_manifest_history_entries: 10,
      },
    } as ReturnType<typeof api.useViewerConfig>);
    mockCurrentBundlesStatusHook.mockReturnValue({
      data: {
        report_exists: true,
        generated_at: now.toISOString(),
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);
    mockCurrentBundlesReportHook.mockReturnValue({
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
            offer_ends_in_days: 4,
            offer_ends_text: "4 Days Left",
            offer_ends_detail: "4 days, 11 hours left",
            items: [],
            tiers: [],
          },
          {
            category: "books",
            title: "Book Bundle Beta",
            display_title: "Book Bundle Beta",
            bundle_type: "books",
            display_type: "Book bundle",
            url: "https://example.test/books-beta",
            top_tier_status: "partial_overlap",
            offer_ends_in_days: 9,
            offer_ends_text: "9 Days Left",
            offer_ends_detail: "9 days left",
            items: [],
            tiers: [],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesReport>);
    mockCurrentChoiceStatusHook.mockReturnValue({
      data: {
        report_exists: true,
        month_label: currentChoiceMonth,
        game_count: 8,
        generated_at: now.toISOString(),
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    renderRoute();

    expect(
      await screen.findByRole("button", { name: /Filters/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Download size")).toBeInTheDocument();
    expect(screen.getByText("Estimated spend")).toBeInTheDocument();
    expect(screen.getByText("Direct download links")).toBeInTheDocument();
    expect(screen.getByText("External redemption titles")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /Games 1 available offer 4 Days Left until 1 package expires/i,
      }),
    ).toHaveAttribute("href", "/sales/games");
    expect(
      screen.getByRole("link", {
        name: /Books 1 available offer 9 Days Left until 1 package expires/i,
      }),
    ).toHaveAttribute("href", "/sales/books");
    expect(
      screen.getByRole("link", {
        name: /Software 0 available offers/i,
      }),
    ).toHaveAttribute("href", "/sales/software");
    expect(
      screen.getByRole("link", {
        name: new RegExp(
          `Current Choice 8 games for ${currentChoiceMonth.split(" ")[0]}`,
          "i",
        ),
      }),
    ).toHaveAttribute("href", "/sales/choice");

    fireEvent.click(screen.getByRole("button", { name: /Filters/i }));

    expect(await screen.findByPlaceholderText("Search...")).toBeInTheDocument();
    expect(screen.getByTitle("Category")).toBeInTheDocument();
    expect(screen.getByTitle("Platform")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Only show purchases with keys/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Games Show the games card/i }),
    ).toBeChecked();
  });

  it("shows a live-only homepage mode when no library is selected", async () => {
    mockLibraryStatusHook.mockReturnValue({
      data: {
        exists: false,
        current_path: "D:/missing/library_products.json",
        default_save_dir: "D:/Downloads",
        default_library_path: "D:/Downloads/library_products.json",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryStatus>);
    mockOptionalLibraryDataHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useOptionalLibraryData>);
    mockViewerConfigHook.mockReturnValue({
      data: {
        link_expiry_warning_hours: 24,
      },
    } as ReturnType<typeof api.useViewerConfig>);
    mockCurrentBundlesStatusHook.mockReturnValue({
      data: {
        report_exists: true,
        generated_at: "2026-03-29T12:00:00Z",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);
    mockCurrentBundlesReportHook.mockReturnValue({
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
            offer_ends_in_days: 4,
            offer_ends_text: "4 Days Left",
            offer_ends_detail: "4 days, 11 hours left",
            items: [],
            tiers: [],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesReport>);
    mockCurrentChoiceStatusHook.mockReturnValue({
      data: {
        report_exists: true,
        month_label: "March 2026",
        game_count: 8,
        generated_at: "2026-03-29T12:00:00Z",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    renderRoute();

    expect(screen.getByText("No library is selected yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open setup" })).toHaveAttribute(
      "href",
      "/setup",
    );
    expect(
      screen.getByText(
        /Live bundles and Current Choice still load without a selected library/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Start with the library currently in view"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Filters/i }));

    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("checkbox", {
        name: /Games Show the games card/i,
      }),
    ).toBeChecked();
  });
});
