import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Audiobooks from "../../../../src/app/routes/Audiobooks";

const mocks = vi.hoisted(() => ({
  useLibraryData: vi.fn(),
  useViewerConfig: vi.fn(),
  setFilters: vi.fn(),
  useFilters: vi.fn(),
  buildDownloadPlan: vi.fn(),
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

vi.mock("../../../../src/data/downloadPlanning", () => ({
  buildDownloadPlan: mocks.buildDownloadPlan,
}));

vi.mock("../../../../src/data/selectors", () => ({
  applyProductFilters: vi.fn((products: unknown[]) => products),
  buildDescriptionSnippet: vi.fn((value: string) => value),
  buildSuborders: vi.fn(() => [
    {
      id: "audio-1",
      subproductName: "Audio One",
      parentName: "Audio Bundle",
      infoUrl: "https://example.test/audio-1",
      authorSummary: "Narrator One",
      publisher: "Publisher One",
      descriptionSnippet: "First audiobook.",
      product: { created_at: "2026-03-01T00:00:00Z" },
      downloads: [
        {
          platform: "audio",
          url: "https://example.test/audio-1.mp3",
          size_bytes: 1000,
          contentLabel: "MP3",
        },
      ],
    },
    {
      id: "audio-2",
      subproductName: "Audio Two",
      parentName: "Audio Bundle",
      infoUrl: "https://example.test/audio-2",
      authorSummary: "Narrator Two",
      publisher: "Publisher Two",
      descriptionSnippet: "Second audiobook.",
      product: { created_at: "2026-03-02T00:00:00Z" },
      downloads: [
        {
          platform: "audio",
          url: "https://example.test/audio-2.flac",
          size_bytes: 2000,
          contentLabel: "FLAC",
        },
      ],
    },
  ]),
  getFilterOptions: vi.fn(() => ({
    categories: ["Audio"],
    platforms: ["audio"],
    keyTypes: [],
  })),
}));

vi.mock("../../../../src/utils/downloads", () => ({
  collectDownloadUrls: vi.fn(() => []),
  filterDownloadsByLabel: vi.fn((downloads: Array<{ contentLabel?: string }>, label: string) =>
    downloads.filter((download) => download.contentLabel === label),
  ),
  getDownloadLabel: vi.fn((download: { contentLabel?: string }) => download.contentLabel ?? "Unknown"),
  getLinkStatus: vi.fn(() => "valid"),
  hasExpiredLinks: vi.fn(() => false),
  hasExpiringSoonLinks: vi.fn(() => false),
  triggerDownloadUrls: vi.fn(),
}));

vi.mock("../../../../src/components/FilterBar", () => ({
  __esModule: true,
  default: () => <div>Audiobook FilterBar</div>,
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
        onClick={() => onRowSelectionChange?.({ [getRowId(data[0])]: true })}>
        Select first audiobook row
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
      <Audiobooks />
    </MemoryRouter>,
  );
}

describe("Audiobooks", () => {
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

    expect(screen.queryByText("Audiobook FilterBar")).not.toBeInTheDocument();
    expect(screen.queryByText("Managed sync panel")).not.toBeInTheDocument();
    expect(screen.getByText("2 audiobooks in the current view.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Filters$/ }));
    expect(screen.getByText("Audiobook FilterBar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Advanced local sync/i }));
    expect(screen.getByText("Managed sync panel")).toBeInTheDocument();
  });

  it("scopes bulk format choices to the currently selected rows", () => {
    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: /Bulk browser downloads/i }));
    expect(
      screen.getByText(/Select one or more rows in the table to enable bulk downloads/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select first audiobook row" }));

    expect(screen.getByText("Selected titles: 1")).toBeInTheDocument();
    expect(
      screen.getByText(/Format choices are scoped to the currently selected titles/i),
    ).toBeInTheDocument();

    const formatSelect = screen.getByLabelText("Download format");
    const optionLabels = within(formatSelect).getAllByRole("option").map((option) => option.textContent);
    expect(optionLabels).toEqual(expect.arrayContaining(["Select format", "MP3"]));
    expect(optionLabels).not.toContain("FLAC");
  });
});
