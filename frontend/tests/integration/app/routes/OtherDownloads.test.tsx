import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/components/FilterBar", () => ({
  default: () => <div>FilterBar</div>,
}));

vi.mock("../../../../src/components/charts/BarChart", () => ({
  default: ({ title, data, onSelect }: any) => (
    <div>
      <span>{title}</span>
      {data.map((item: any) => (
        <button
          key={item.label}
          type="button"
          onClick={() => onSelect?.(item.label)}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../../../src/components/ProductCell", () => ({
  ProductCell: () => <span>Product cell</span>,
}));

vi.mock("../../../../src/components/DownloadRouteEmptyState", () => ({
  default: ({ routeLabel }: { routeLabel: string }) => (
    <div>{`Empty: ${routeLabel}`}</div>
  ),
}));

vi.mock("../../../../src/components/ExpiredLinkDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Expired dialog open</div> : null,
}));

vi.mock("../../../../src/components/DataTable", () => ({
  DataTable: ({ columns, data, searchPlaceholder }: any) => (
    <div>
      <div>{searchPlaceholder}</div>
      {data.map((row: any, rowIndex: number) => (
        <div key={row.id ?? rowIndex}>
          {columns.map((column: any, columnIndex: number) => {
            if (typeof column.cell !== "function") return null;
            const value =
              column.accessorKey ? row[column.accessorKey] : undefined;
            return (
              <div key={column.id ?? column.accessorKey ?? columnIndex}>
                {column.cell({
                  getValue: () => value,
                  row: { original: row, getValue: (key: string) => row[key] },
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("../../../../src/data/api", () => ({
  useLibraryData: vi.fn(),
  useViewerConfig: vi.fn(),
}));

vi.mock("../../../../src/state/filters", () => ({
  useFilters: vi.fn(),
}));

vi.mock("../../../../src/data/selectors", () => ({
  applyProductFilters: vi.fn(),
  flattenDownloads: vi.fn(),
  getFilterOptions: vi.fn(),
  groupSmallValues: vi.fn(),
  isDedicatedContentPlatform: vi.fn(),
}));

vi.mock("../../../../src/utils/downloads", () => ({
  collectDownloadUrls: vi.fn(),
  getLinkStatus: vi.fn(),
  triggerDownloadUrls: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import * as selectors from "../../../../src/data/selectors";
import * as downloadUtils from "../../../../src/utils/downloads";
import * as filtersState from "../../../../src/state/filters";
import OtherDownloads from "../../../../src/app/routes/OtherDownloads";
import {
  PageHeaderProvider,
  usePageHeaderState,
} from "../../../../src/app/layout/PageHeaderContext";

const mockUseLibraryData = vi.mocked(api.useLibraryData);
const mockUseViewerConfig = vi.mocked(api.useViewerConfig);
const mockUseFilters = vi.mocked(filtersState.useFilters);
const mockApplyProductFilters = vi.mocked(selectors.applyProductFilters);
const mockFlattenDownloads = vi.mocked(selectors.flattenDownloads);
const mockGetFilterOptions = vi.mocked(selectors.getFilterOptions);
const mockGroupSmallValues = vi.mocked(selectors.groupSmallValues);
const mockIsDedicatedContentPlatform = vi.mocked(
  selectors.isDedicatedContentPlatform,
);
const mockCollectDownloadUrls = vi.mocked(downloadUtils.collectDownloadUrls);
const mockGetLinkStatus = vi.mocked(downloadUtils.getLinkStatus);
const mockTriggerDownloadUrls = vi.mocked(downloadUtils.triggerDownloadUrls);

function HeaderActionsHost() {
  const { actions } = usePageHeaderState();
  return <div>{actions}</div>;
}

function renderRoute() {
  return render(
    <PageHeaderProvider>
      <HeaderActionsHost />
      <OtherDownloads />
    </PageHeaderProvider>,
  );
}

describe("OtherDownloads", () => {
  beforeEach(() => {
    mockUseViewerConfig.mockReturnValue({
      data: { link_expiry_warning_hours: 24 },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useViewerConfig>);
    mockUseFilters.mockReturnValue({
      filters: {
        search: "",
        startDate: null,
        endDate: null,
        category: null,
        platform: null,
        keyType: null,
        keyPresence: null,
        downloadPresence: null,
      },
      setFilters: vi.fn(),
      clearFilters: vi.fn(),
    } as ReturnType<typeof filtersState.useFilters>);
    mockApplyProductFilters.mockReturnValue([
      { product_name: "Bundle D" },
    ] as any);
    mockFlattenDownloads.mockReturnValue([] as any);
    mockGetFilterOptions.mockReturnValue({
      categories: ["Other"],
      platforms: ["browser"],
      keyTypes: [],
      publishers: [],
    });
    mockGroupSmallValues.mockImplementation((items) => items as any);
    mockIsDedicatedContentPlatform.mockReturnValue(false);
    mockCollectDownloadUrls.mockImplementation((downloads) =>
      downloads.flatMap((download) => (download.url ? [download.url] : [])),
    );
    mockGetLinkStatus.mockReturnValue("valid" as any);
  });

  it("shows a loading spinner while library data is loading", () => {
    mockUseLibraryData.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);

    const { container } = renderRoute();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows an error banner when the library query fails", () => {
    mockUseLibraryData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    } as ReturnType<typeof api.useLibraryData>);

    renderRoute();
    expect(
      screen.getByText("Failed to load library data."),
    ).toBeInTheDocument();
  });

  it("shows the empty state when no direct-download rows remain", () => {
    mockUseLibraryData.mockReturnValue({
      data: { products: [{ product_name: "Bundle D" }] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);
    mockFlattenDownloads.mockReturnValue([] as any);

    renderRoute();
    expect(
      screen.getByText(
        /Review the leftover download inventory that does not belong on the dedicated media pages/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Empty: Other Downloads")).toBeInTheDocument();
  });

  it("renders charts after opening the filters panel and triggers a direct download action", () => {
    const setFilters = vi.fn();
    mockUseFilters.mockReturnValue({
      filters: {
        search: "",
        startDate: null,
        endDate: null,
        category: null,
        platform: null,
        keyType: null,
        keyPresence: null,
        downloadPresence: null,
      },
      setFilters,
      clearFilters: vi.fn(),
    } as ReturnType<typeof filtersState.useFilters>);
    mockUseLibraryData.mockReturnValue({
      data: { products: [{ product_name: "Bundle D" }] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);
    mockFlattenDownloads.mockReturnValue([
      {
        id: "download-1",
        productName: "Patch Notes",
        orderName: "Bundle D",
        dateAcquired: "2026-03-05",
        platform: "browser",
        fileType: "zip",
        sizeBytes: 1024,
        url: "https://example.test/patch-notes.zip",
      },
    ] as any);

    renderRoute();

    expect(
      screen.getByText(
        /Review the leftover download inventory that does not belong on the dedicated media pages/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("FilterBar")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Filters/i }));

    expect(screen.getByText("FilterBar")).toBeInTheDocument();
    expect(screen.getByText("Download platforms")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "browser" }));
    expect(setFilters).toHaveBeenCalledWith({ platform: "browser" });

    fireEvent.click(screen.getByRole("button", { name: /Download/i }));
    expect(mockTriggerDownloadUrls).toHaveBeenCalledWith([
      "https://example.test/patch-notes.zip",
    ]);
  });
});
