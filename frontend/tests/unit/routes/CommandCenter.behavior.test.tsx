import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandCenter from "../../../src/app/routes/CommandCenter";

const mocks = vi.hoisted(() => ({
  useLibraryStatus: vi.fn(),
  useCurrentBundlesStatus: vi.fn(),
  useCurrentChoiceStatus: vi.fn(),
  postMaintenanceCommand: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

vi.mock("../../../src/data/api", () => ({
  useLibraryStatus: mocks.useLibraryStatus,
  useCurrentBundlesStatus: mocks.useCurrentBundlesStatus,
  useCurrentChoiceStatus: mocks.useCurrentChoiceStatus,
}));

vi.mock("../../../src/data/maintenance", async () => {
  const actual = await vi.importActual<typeof import("../../../src/data/maintenance")>(
    "../../../src/data/maintenance",
  );

  return {
    ...actual,
    postMaintenanceCommand: mocks.postMaintenanceCommand,
  };
});

const renderRoute = () =>
  render(
    <MemoryRouter>
      <CommandCenter />
    </MemoryRouter>,
  );

const getFormForButton = (name: string) => {
  const button = screen.getByRole("button", { name });
  const form = button.closest("form");
  if (!form) {
    throw new Error(`Expected form for button \"${name}\".`);
  }
  return form;
};

describe("CommandCenter", () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockReset();
    mocks.postMaintenanceCommand.mockReset();
    mocks.useLibraryStatus.mockReset();
    mocks.useCurrentBundlesStatus.mockReset();
    mocks.useCurrentChoiceStatus.mockReset();

    mocks.useLibraryStatus.mockReturnValue({
      data: {
        current_path: "C:\\Captured\\library_products.json",
        exists: true,
        default_save_dir: "C:\\Downloads",
        default_library_path: "C:\\Captured\\library_products.json",
      },
    });
    mocks.useCurrentBundlesStatus.mockReturnValue({
      data: {
        output_dir: "data/artifacts/current_bundles",
        report_json_path: "report.json",
        report_markdown_path: "report.md",
        library_path: "data/artifacts/library_products.json",
        bundle_types: ["games", "books", "software"],
        report_exists: true,
        markdown_exists: true,
        generated_at: new Date().toISOString(),
        bundle_count: 7,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    mocks.useCurrentChoiceStatus.mockReturnValue({
      data: {
        output_dir: "data/artifacts/current_choice",
        page_html_path: "choice.html",
        snapshot_json_path: "choice.json",
        report_json_path: "choice-report.json",
        report_markdown_path: "choice-report.md",
        library_path: "data/artifacts/library_products.json",
        report_exists: false,
        markdown_exists: false,
        generated_at: null,
        month_label: null,
        game_count: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders saved report summaries and the inline setup shortcut", () => {
    renderRoute();

    expect(screen.getByRole("link", { name: "Open Setup" })).toHaveAttribute(
      "href",
      "/setup",
    );
    expect(screen.getByText("Fresh")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Bundle types: games, books, software")).toBeInTheDocument();
    expect(screen.getByText("Saved bundles: 7")).toBeInTheDocument();
    expect(screen.getByText("Month: Not captured yet")).toBeInTheDocument();
  });

  it("renders loading, stale, and unavailable report states", () => {
    mocks.useCurrentBundlesStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    mocks.useCurrentChoiceStatus.mockReturnValue({
      data: {
        output_dir: "data/artifacts/current_choice",
        page_html_path: "choice.html",
        snapshot_json_path: "choice.json",
        report_json_path: "choice-report.json",
        report_markdown_path: "choice-report.md",
        library_path: "data/artifacts/library_products.json",
        report_exists: true,
        markdown_exists: true,
        generated_at: "not-a-date",
        month_label: "March 2026",
        game_count: 8,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderRoute();

    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.getByText(/Checking the latest saved current-sales bundle analysis/i)).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/timestamp could not be parsed/i),
    ).toBeInTheDocument();
  });

  it("renders stale summaries when saved reports are older than the freshness window", () => {
    mocks.useCurrentBundlesStatus.mockReturnValue({
      data: {
        output_dir: "data/artifacts/current_bundles",
        report_json_path: "report.json",
        report_markdown_path: "report.md",
        library_path: "data/artifacts/library_products.json",
        bundle_types: ["games"],
        report_exists: true,
        markdown_exists: true,
        generated_at: "2000-01-01T00:00:00Z",
        bundle_count: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderRoute();

    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("runs the current bundles refresh workflow and renders success actions", async () => {
    let resolvePromise:
      | ((value: {
          command: string;
          status: "success";
          message: string;
          details: {
            output_dir: string;
            index_html_path: string;
            bundle_links_path: string;
            catalog_json_path: string;
            report_json_path: string;
            report_markdown_path: string;
            bundle_types: string[];
            bundle_count: number;
            library_path: string;
            generated_at: string;
          };
        }) => void)
      | null = null;

    mocks.postMaintenanceCommand.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "Analyze current bundles" }));

    expect(mocks.postMaintenanceCommand).toHaveBeenCalledWith(
      "/api/maintenance/analyze-current-bundles",
      { bundle_types: ["games", "books", "software"] },
    );
    expect(
      screen.getByText(/Refreshing current bundle analysis for games, books, and software/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze current bundles" })).toBeDisabled();

    resolvePromise?.({
      command: "analyze-current-bundles",
      status: "success",
      message: "Bundle refresh complete.",
      details: {
        output_dir: "data/artifacts/current_bundles",
        index_html_path: "index.html",
        bundle_links_path: "links.json",
        catalog_json_path: "catalog.json",
        report_json_path: "report.json",
        report_markdown_path: "report.md",
        bundle_types: ["games", "books", "software"],
        bundle_count: 3,
        library_path: "data/artifacts/library_products.json",
        generated_at: "2026-01-02T12:00:00Z",
      },
    });

    expect(await screen.findByText("Bundle refresh complete.")).toBeInTheDocument();
    expect(screen.getByText("Bundle index HTML: index.html")).toBeInTheDocument();
    expect(screen.getByText("Bundles captured: 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Sales Overview" })).toHaveAttribute(
      "href",
      "/venue/overview",
    );
    expect(document.querySelector("button a")).toBeNull();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["current-bundles-status"],
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["current-bundles"],
    });
  });

  it("resets persisted generate-order-model options back to defaults", async () => {
    window.localStorage.setItem(
      "humble.commands.generateApiDir",
      JSON.stringify("custom/api"),
    );
    window.localStorage.setItem(
      "humble.commands.generatePattern",
      JSON.stringify("custom_*.json"),
    );
    window.localStorage.setItem(
      "humble.commands.generateOutputModels",
      JSON.stringify("custom/models.py"),
    );
    window.localStorage.setItem(
      "humble.commands.generateClassName",
      JSON.stringify("CustomOrderList"),
    );

    renderRoute();

    const form = getFormForButton("Generate order models");
    expect(within(form).getByDisplayValue("custom/api")).toBeInTheDocument();
    expect(within(form).getByDisplayValue("custom_*.json")).toBeInTheDocument();
    expect(within(form).getByDisplayValue("custom/models.py")).toBeInTheDocument();
    expect(within(form).getByDisplayValue("CustomOrderList")).toBeInTheDocument();

    fireEvent.click(within(form).getByRole("button", { name: "Reset to defaults" }));

    await waitFor(() => {
      expect(
        within(form).getByDisplayValue("data/artifacts/api_responses"),
      ).toBeInTheDocument();
    });

    expect(within(form).getByDisplayValue("orders_batch_*.json")).toBeInTheDocument();
    expect(
      within(form).getByDisplayValue("data/artifacts/order_payload_models.py"),
    ).toBeInTheDocument();
    expect(within(form).getByDisplayValue("OrderPayloadList")).toBeInTheDocument();
    expect(window.localStorage.getItem("humble.commands.generateApiDir")).toBeNull();
    expect(window.localStorage.getItem("humble.commands.generatePattern")).toBeNull();
    expect(window.localStorage.getItem("humble.commands.generateOutputModels")).toBeNull();
    expect(window.localStorage.getItem("humble.commands.generateClassName")).toBeNull();
  });

  it("persists advanced option open state for the current browser session", async () => {
    const storageKey = "humble.session.advancedOptions.generateOrderModels";
    const { unmount } = renderRoute();

    const summary = screen.getByText("Advanced input and output paths");
    const details = summary.closest("details");
    if (!details) {
      throw new Error("Expected the advanced options details element.");
    }

    expect(details).not.toHaveAttribute("open");

    fireEvent.click(summary);

    await waitFor(() => {
      expect(details).toHaveAttribute("open");
    });

    expect(window.sessionStorage.getItem(storageKey)).toBe(JSON.stringify(true));

    unmount();
    renderRoute();

    const restoredDetails = screen
      .getByText("Advanced input and output paths")
      .closest("details");
    if (!restoredDetails) {
      throw new Error("Expected the restored advanced options details element.");
    }

    expect(restoredDetails).toHaveAttribute("open");
  });

  it("falls back to default command inputs when browser storage is unavailable", () => {
    const localStorageGetter = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new Error("localStorage blocked");
      });
    const sessionStorageGetter = vi
      .spyOn(window, "sessionStorage", "get")
      .mockImplementation(() => {
        throw new Error("sessionStorage blocked");
      });

    try {
      renderRoute();

      const generateForm = getFormForButton("Generate order models");
      expect(
        within(generateForm).getByDisplayValue("data/artifacts/api_responses"),
      ).toBeInTheDocument();
      expect(
        within(generateForm).getByDisplayValue("orders_batch_*.json"),
      ).toBeInTheDocument();
      expect(
        within(generateForm).getByDisplayValue(
          "data/artifacts/order_payload_models.py",
        ),
      ).toBeInTheDocument();
      expect(within(generateForm).getByDisplayValue("OrderPayloadList")).toBeInTheDocument();

      const schemaForm = getFormForButton("Build viewer schema");
      expect(
        within(schemaForm).getByDisplayValue(
          "docs/assets/tools/library-products-schema.json",
        ),
      ).toBeInTheDocument();
    } finally {
      localStorageGetter.mockRestore();
      sessionStorageGetter.mockRestore();
    }
  });

  it("submits cache-page filters with trimmed optional values and shows command errors", async () => {
    mocks.postMaintenanceCommand
      .mockResolvedValueOnce({
        command: "cache-subproduct-pages",
        status: "success",
        message: "Page cache refreshed.",
        details: {
          requested_urls: 10,
          processed_urls: 8,
          fetched_pages: 6,
          reused_pages: 2,
          failed_pages: 0,
          skipped_pages: 2,
          failure_limit: null,
          aborted: false,
          manifest_path: "cache-manifest.json",
          elapsed_seconds: 1,
          failure_breakdown: {},
          domain_summaries: [],
        },
      })
      .mockRejectedValueOnce(new Error("Choice refresh failed."));

    renderRoute();

    const cacheForm = getFormForButton("Cache subproduct pages");
    fireEvent.change(within(cacheForm).getByPlaceholderText("Optional title or publisher filter"), {
      target: { value: "  discworld  " },
    });
    fireEvent.change(within(cacheForm).getByPlaceholderText("Optional exact URL override"), {
      target: { value: "   " },
    });
    fireEvent.change(within(cacheForm).getByPlaceholderText("Limit"), {
      target: { value: "5" },
    });
    fireEvent.change(within(cacheForm).getByPlaceholderText("Max failures"), {
      target: { value: "2" },
    });
    fireEvent.change(within(cacheForm).getByPlaceholderText("Domain workers"), {
      target: { value: "" },
    });

    fireEvent.click(within(cacheForm).getByRole("button", { name: "Cache subproduct pages" }));

    await waitFor(() => {
      expect(mocks.postMaintenanceCommand).toHaveBeenCalledWith(
        "/api/maintenance/cache-subproduct-pages",
        {
          library_file: "data/artifacts/library_products.json",
          cache_dir: "data/artifacts/subproduct_pages",
          subproduct_query: "discworld",
          url: null,
          limit: 5,
          max_failures: 2,
          domain_workers: null,
        },
      );
    });

    expect(await screen.findByText("Page cache refreshed.")).toBeInTheDocument();
    expect(screen.getByText("Manifest: cache-manifest.json")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Analyze current Choice" }));

    expect(await screen.findByText("Choice refresh failed.")).toBeInTheDocument();
  });

  it("submits the remaining command workflows and renders their success details", async () => {
    mocks.postMaintenanceCommand
      .mockResolvedValueOnce({
        command: "analyze-current-choice",
        status: "success",
        message: "Choice refresh complete.",
        details: {
          output_dir: "data/artifacts/current_choice",
          page_html_path: "choice.html",
          snapshot_json_path: "choice.json",
          report_json_path: "choice-report.json",
          report_markdown_path: "choice-report.md",
          month_label: "March 2026",
          game_count: 8,
          library_path: "data/artifacts/library_products.json",
          generated_at: "2026-03-01T00:00:00Z",
        },
      })
      .mockResolvedValueOnce({
        command: "build-viewer-assets",
        status: "success",
        message: "",
        details: {
          output_path: "docs/assets/tools/custom-schema.json",
        },
      })
      .mockResolvedValueOnce({
        command: "rebuild-order-models",
        status: "success",
        message: "Order models rebuilt.",
        details: {
          output_path: "data/artifacts/order_payload_models.py",
          payload_count: 4,
          missing_paths: ["missing-batch.json"],
        },
      })
      .mockResolvedValueOnce({
        command: "rebuild-library-artifacts",
        status: "success",
        message: "Library artifacts rebuilt.",
        details: {
          output_path: "data/artifacts/library_products.json",
          total_products: 99,
        },
      })
      .mockResolvedValueOnce({
        command: "extract-subproduct-metadata",
        status: "success",
        message: "Metadata extraction finished.",
        details: {
          processed_entries: 20,
          extracted_entries: 15,
          fallback_only_entries: 5,
          html_read_failures: 1,
          output_path: "data/artifacts/subproduct_metadata.json",
          elapsed_seconds: 1,
          report_path: "data/artifacts/subproduct_metadata.md",
        },
      });

    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "Analyze current Choice" }));
    expect(await screen.findByText("Choice refresh complete.")).toBeInTheDocument();
    expect(screen.getByText("Games captured: 8")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Current Choice" })).toHaveAttribute(
      "href",
      "/venue/choice",
    );

    const schemaForm = getFormForButton("Build viewer schema");
    fireEvent.change(within(schemaForm).getByPlaceholderText("Schema output path"), {
      target: { value: "docs/assets/tools/custom-schema.json" },
    });
    fireEvent.click(within(schemaForm).getByRole("button", { name: "Build viewer schema" }));
    expect(
      await within(schemaForm).findByText("Command completed successfully."),
    ).toBeInTheDocument();
    expect(within(schemaForm).getByText("Schema: docs/assets/tools/custom-schema.json")).toBeInTheDocument();

    const rebuildOrderForm = getFormForButton("Rebuild order models");
    fireEvent.click(within(rebuildOrderForm).getByRole("button", { name: "Rebuild order models" }));
    expect(await within(rebuildOrderForm).findByText("Order models rebuilt.")).toBeInTheDocument();
    expect(within(rebuildOrderForm).getByText("Missing paths: missing-batch.json")).toBeInTheDocument();

    const rebuildLibraryForm = getFormForButton("Rebuild library artifacts");
    fireEvent.click(
      within(rebuildLibraryForm).getByRole("button", { name: "Rebuild library artifacts" }),
    );
    expect(
      await within(rebuildLibraryForm).findByText("Library artifacts rebuilt."),
    ).toBeInTheDocument();
    expect(within(rebuildLibraryForm).getByText("Products: 99")).toBeInTheDocument();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["library"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["library-status"],
    });

    const metadataForm = getFormForButton("Extract metadata");
    fireEvent.click(within(metadataForm).getByRole("button", { name: "Extract metadata" }));
    expect(
      await within(metadataForm).findByText("Metadata extraction finished."),
    ).toBeInTheDocument();
    expect(
      within(metadataForm).getByText("Metadata: data/artifacts/subproduct_metadata.json"),
    ).toBeInTheDocument();
    expect(
      within(metadataForm).getByText("Report: data/artifacts/subproduct_metadata.md"),
    ).toBeInTheDocument();
  });
});