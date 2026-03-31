import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Software from "../../../../src/app/routes/Software";

const mocks = vi.hoisted(() => ({
  useLibraryData: vi.fn(),
  useViewerConfig: vi.fn(),
  setFilters: vi.fn(),
  useFilters: vi.fn(),
}));

const memoryRouterFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../../../src/data/api", () => ({
  useLibraryData: mocks.useLibraryData,
  useViewerConfig: mocks.useViewerConfig,
}));

vi.mock("../../../../src/state/filters", () => ({
  useFilters: mocks.useFilters,
}));

vi.mock("../../../../src/data/selectors", () => ({
  applyProductFilters: vi.fn((products: unknown[]) => products),
  buildDescriptionSnippet: vi.fn((value: string) => value),
  buildSubproductItems: vi.fn(() => [
    {
      id: "software-1",
      subproductName: "Windows Adventure",
      parentName: "Adventure Bundle",
      publisher: "Night Studio",
      descriptionSnippet: "A compact Windows-first test title.",
      infoUrl: "https://example.test/windows-adventure",
      product: { created_at: "2026-03-01T00:00:00Z" },
      downloads: [
        {
          platform: "windows",
          url: "https://example.test/windows.exe",
          size_bytes: 1024,
          machine_name: "windows-exe",
          download_struct: ["windows", "exe"],
          human_name: "Windows EXE",
        },
      ],
    },
    {
      id: "software-2",
      subproductName: "Mac Mystery",
      parentName: "Adventure Bundle",
      publisher: "Night Studio",
      descriptionSnippet: "A second title used to widen the variant scope.",
      infoUrl: "https://example.test/mac-mystery",
      product: { created_at: "2026-03-02T00:00:00Z" },
      downloads: [
        {
          platform: "mac",
          url: "https://example.test/mac.dmg",
          size_bytes: 2048,
          machine_name: "mac-dmg",
          download_struct: ["mac", "dmg"],
          human_name: "macOS DMG",
        },
      ],
    },
  ]),
  getFilterOptions: vi.fn(() => ({
    categories: ["Software"],
    platforms: ["windows", "mac"],
    keyTypes: [],
  })),
  isSoftwarePlatform: vi.fn((platform: string) =>
    ["windows", "mac", "linux"].includes(platform.toLowerCase()),
  ),
  normalizePlatformLabel: vi.fn((platform: string) => platform),
}));

vi.mock("../../../../src/components/FilterBar", () => ({
  __esModule: true,
  default: () => <div>Software FilterBar</div>,
}));

vi.mock("../../../../src/components/AdvancedManagedSyncPanel", () => ({
  __esModule: true,
  default: () => <div>Managed sync panel</div>,
}));

vi.mock("../../../../src/components/DataTable", () => ({
  DataTable: ({
    data,
    searchPlaceholder,
    onRowSelectionChange,
    getRowId,
  }: {
    data: Array<{ id: string }>;
    searchPlaceholder: string;
    onRowSelectionChange?: (value: Record<string, boolean>) => void;
    getRowId: (row: { id: string }) => string;
  }) => (
    <div>
      <p>{searchPlaceholder}</p>
      <button
        type="button"
        onClick={() =>
          onRowSelectionChange?.({ [getRowId(data[0])]: true })
        }>
        Select first software row
      </button>
      <p>Rendered rows: {data.length}</p>
    </div>
  ),
}));

vi.mock("../../../../src/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../../../../src/components/ExpiredLinkDialog", () => ({
  __esModule: true,
  default: () => null,
}));

function renderRoute() {
  return render(
    <MemoryRouter future={memoryRouterFuture}>
      <Software />
    </MemoryRouter>,
  );
}

describe("Software", () => {
  beforeEach(() => {
    mocks.setFilters.mockReset();
    mocks.useLibraryData.mockReturnValue({
      data: { products: [{ product_machine_name: "demo" }] },
      isLoading: false,
      error: null,
    });
    mocks.useViewerConfig.mockReturnValue({
      data: { link_expiry_warning_hours: 24 },
    });
    mocks.useFilters.mockReturnValue({
      filters: {
        search: "",
        category: null,
        platform: null,
        startDate: null,
        endDate: null,
      },
      setFilters: mocks.setFilters,
    });
  });

  it("reveals filters and managed sync only when the user opens them", () => {
    renderRoute();

    expect(screen.queryByText("Software FilterBar")).not.toBeInTheDocument();
    expect(screen.queryByText("Managed sync panel")).not.toBeInTheDocument();
    expect(screen.getByText("2 software titles are ready to browse.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByText("Software FilterBar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Managed sync" }));
    expect(screen.getByText("Managed sync panel")).toBeInTheDocument();
  });

  it("scopes bulk variant choices to the currently selected rows", () => {
    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "Bulk downloads" }));
    expect(
      screen.getByText(/Select one or more rows in the table to enable bulk downloads/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select first software row" }));

    expect(screen.getByText("Selected titles: 1")).toBeInTheDocument();
    expect(
      screen.getByText(/Variant options are scoped to the currently selected titles/i),
    ).toBeInTheDocument();

    const variantSelect = screen.getByLabelText("Download software variant");
    const optionLabels = within(variantSelect).getAllByRole("option").map((option) => option.textContent);
    expect(optionLabels).toEqual(
      expect.arrayContaining(["Select platform + type", "Windows"]),
    );
    expect(optionLabels).not.toContain("macOS");
  });
});