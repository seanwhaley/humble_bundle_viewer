import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/components/charts/BarChart", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../../../../src/components/charts/WordCloudChart", () => ({
  default: () => <div>Theme cloud</div>,
}));

vi.mock("../../../../src/data/api", () => ({
  useLibraryData: vi.fn(),
  useCurrentBundlesStatus: vi.fn(),
  useCurrentChoiceStatus: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import Overview from "../../../../src/app/routes/Overview";
import { FilterProvider } from "../../../../src/state/filters";

const mockLibraryDataHook = vi.mocked(api.useLibraryData);
const mockCurrentBundlesStatusHook = vi.mocked(api.useCurrentBundlesStatus);
const mockCurrentChoiceStatusHook = vi.mocked(api.useCurrentChoiceStatus);

const memoryRouterFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function renderRoute() {
  return render(
    <MemoryRouter future={memoryRouterFuture}>
      <FilterProvider>
        <Overview />
      </FilterProvider>
    </MemoryRouter>,
  );
}

describe("Overview", () => {
  it("shows a loading spinner while library data is loading", () => {
    mockLibraryDataHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);
    mockCurrentBundlesStatusHook.mockReturnValue({
      data: undefined,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);
    mockCurrentChoiceStatusHook.mockReturnValue({
      data: undefined,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    const { container } = renderRoute();

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders the overview dashboard sections for loaded data", () => {
    mockLibraryDataHook.mockReturnValue({
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
    } as ReturnType<typeof api.useLibraryData>);
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
    } as ReturnType<typeof api.useCurrentBundlesStatus>);
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
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    renderRoute();

    expect(screen.getByText("Current scope")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Track live bundles and this month’s Choice against what you already own/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Browse by category")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ebook" })).toHaveAttribute(
      "href",
      "/category/ebook",
    );
  });
});