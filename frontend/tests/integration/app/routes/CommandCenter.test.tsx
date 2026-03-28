import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/data/api", () => ({
  useLibraryStatus: vi.fn(),
  useCurrentBundlesStatus: vi.fn(),
  useCurrentChoiceStatus: vi.fn(),
}));

vi.mock("../../../../src/data/maintenance", async () => {
  const actual = await vi.importActual<typeof import("../../../../src/data/maintenance")>(
    "../../../../src/data/maintenance",
  );
  return {
    ...actual,
    postMaintenanceCommand: vi.fn(),
  };
});

import * as api from "../../../../src/data/api";
import * as maintenance from "../../../../src/data/maintenance";
import CommandCenter from "../../../../src/app/routes/CommandCenter";

const memoryRouterFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const mockLibraryStatusHook = vi.mocked(api.useLibraryStatus);
const mockCurrentBundlesStatusHook = vi.mocked(api.useCurrentBundlesStatus);
const mockCurrentChoiceStatusHook = vi.mocked(api.useCurrentChoiceStatus);
const mockPostMaintenanceCommand = vi.mocked(maintenance.postMaintenanceCommand);

function renderRoute() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter future={memoryRouterFuture}>
      <QueryClientProvider client={client}>
        <CommandCenter />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("CommandCenter", () => {
  beforeEach(() => {
    mockLibraryStatusHook.mockReturnValue({
      data: {
        exists: true,
        current_path: "D:/Demo/library_products.json",
        default_save_dir: "D:/Demo",
        default_library_path: "D:/Demo/library_products.json",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryStatus>);

    mockCurrentBundlesStatusHook.mockReturnValue({
      data: {
        output_dir: "D:/Demo/current_bundles",
        report_json_path: "D:/Demo/current_bundles/report.json",
        report_markdown_path: "D:/Demo/current_bundles/report.md",
        library_path: "D:/Demo/library_products.json",
        bundle_types: ["games", "books", "software"],
        report_exists: false,
        markdown_exists: false,
        generated_at: null,
        bundle_count: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);

    mockCurrentChoiceStatusHook.mockReturnValue({
      data: {
        output_dir: "D:/Demo/current_choice",
        page_html_path: "D:/Demo/current_choice/page.html",
        snapshot_json_path: "D:/Demo/current_choice/snapshot.json",
        report_json_path: "D:/Demo/current_choice/report.json",
        report_markdown_path: "D:/Demo/current_choice/report.md",
        library_path: "D:/Demo/library_products.json",
        report_exists: false,
        markdown_exists: false,
        generated_at: null,
        month_label: null,
        game_count: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    mockPostMaintenanceCommand.mockReset();
  });

  it("renders loading summaries while current-sales status queries are still fetching", () => {
    mockCurrentBundlesStatusHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);

    mockCurrentChoiceStatusHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    renderRoute();

    expect(screen.getAllByText("Loading")).toHaveLength(2);
    expect(
      screen.getByText(/Checking the latest saved current-sales bundle analysis/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Checking the latest saved current Humble Choice analysis/i),
    ).toBeInTheDocument();
  });

  it("shows unavailable summaries and query error details when the status lookups fail", () => {
    mockCurrentBundlesStatusHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to load current bundle status."),
    } as ReturnType<typeof api.useCurrentBundlesStatus>);

    mockCurrentChoiceStatusHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to load current Choice status."),
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    renderRoute();

    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(
      screen.getByText(/Unable to load saved bundle report status right now/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Unable to load the latest saved current Humble Choice analysis/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Failed to load current bundle status."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Failed to load current Choice status."),
    ).toBeInTheDocument();
  });

  it("distinguishes missing reports from saved reports with unavailable timestamp metadata", () => {
    mockCurrentBundlesStatusHook.mockReturnValue({
      data: {
        output_dir: "D:/Demo/current_bundles",
        report_json_path: "D:/Demo/current_bundles/report.json",
        report_markdown_path: "D:/Demo/current_bundles/report.md",
        library_path: "D:/Demo/library_products.json",
        bundle_types: ["games", "books", "software"],
        report_exists: false,
        markdown_exists: false,
        generated_at: null,
        bundle_count: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof api.useCurrentBundlesStatus>);

    mockCurrentChoiceStatusHook.mockReturnValue({
      data: {
        output_dir: "D:/Demo/current_choice",
        page_html_path: "D:/Demo/current_choice/page.html",
        snapshot_json_path: "D:/Demo/current_choice/snapshot.json",
        report_json_path: "D:/Demo/current_choice/report.json",
        report_markdown_path: "D:/Demo/current_choice/report.md",
        library_path: "D:/Demo/library_products.json",
        report_exists: true,
        markdown_exists: true,
        generated_at: null,
        month_label: "March 2026",
        game_count: 8,
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);

    renderRoute();

    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(
      screen.getByText(/No saved report yet\. Run the refresh to create one\./i),
    ).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/A saved report exists, but its generated timestamp is unavailable\./i),
    ).toBeInTheDocument();
  });

  it("shows quick-link actions after a successful current bundle analysis run", async () => {
    mockPostMaintenanceCommand.mockResolvedValue({
      command: "analyze-current-bundles",
      status: "success",
      message: "Current bundle report refreshed.",
      details: {
        output_dir: "D:/Demo/current_bundles",
        index_html_path: "D:/Demo/current_bundles/index.html",
        bundle_links_path: "D:/Demo/current_bundles/links.json",
        catalog_json_path: "D:/Demo/current_bundles/catalog.json",
        report_json_path: "D:/Demo/current_bundles/report.json",
        report_markdown_path: "D:/Demo/current_bundles/report.md",
        bundle_types: ["games", "books", "software"],
        bundle_count: 12,
        library_path: "D:/Demo/library_products.json",
        generated_at: "2026-03-27T12:00:00Z",
      },
    });

    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: /Analyze current bundles/i }));

    expect(await screen.findByText("Current bundle report refreshed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Sales Overview" })).toHaveAttribute(
      "href",
      "/venue/overview",
    );
    expect(screen.getByRole("link", { name: "Open Game Bundles" })).toHaveAttribute(
      "href",
      "/venue/bundles/games",
    );
  });
});