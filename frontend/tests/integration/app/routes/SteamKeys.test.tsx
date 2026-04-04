import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/components/FilterBar", () => ({
  default: () => <div>FilterBar</div>,
}));

vi.mock("../../../../src/components/ProductCell", () => ({
  ProductCell: () => <span>Product cell</span>,
}));

vi.mock("../../../../src/components/KeyValueCell", () => ({
  default: ({ value }: { value: string }) => <span>{value || "hidden"}</span>,
}));

vi.mock("../../../../src/components/RedemptionLinksButton", () => ({
  default: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
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
              typeof column.accessorFn === "function" ?
                column.accessorFn(row, rowIndex)
              : column.accessorKey ? row[column.accessorKey]
              : undefined;
            return (
              <div key={column.id ?? column.accessorKey ?? columnIndex}>
                {column.cell({
                  getValue: () => value,
                  row: {
                    original: row,
                    getValue: (key: string) => row[key],
                  },
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
}));

vi.mock("../../../../src/state/filters", () => ({
  useFilters: vi.fn(),
}));

vi.mock("../../../../src/data/selectors", () => ({
  applyProductFilters: vi.fn(),
  buildKeyInventorySummary: vi.fn(),
  filterKeyInventoryByScope: vi.fn(),
  flattenKeys: vi.fn(),
  getFilterOptions: vi.fn(),
  isSteamKeyType: vi.fn(),
  sortKeyInventoryForTriage: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import * as selectors from "../../../../src/data/selectors";
import * as filtersState from "../../../../src/state/filters";
import SteamKeys from "../../../../src/app/routes/SteamKeys";
import {
  PageHeaderProvider,
  usePageHeaderState,
} from "../../../../src/app/layout/PageHeaderContext";

const mockUseLibraryData = vi.mocked(api.useLibraryData);
const mockUseFilters = vi.mocked(filtersState.useFilters);
const mockApplyProductFilters = vi.mocked(selectors.applyProductFilters);
const mockBuildKeyInventorySummary = vi.mocked(
  selectors.buildKeyInventorySummary,
);
const mockFilterKeyInventoryByScope = vi.mocked(
  selectors.filterKeyInventoryByScope,
);
const mockFlattenKeys = vi.mocked(selectors.flattenKeys);
const mockGetFilterOptions = vi.mocked(selectors.getFilterOptions);
const mockIsSteamKeyType = vi.mocked(selectors.isSteamKeyType);
const mockSortKeyInventoryForTriage = vi.mocked(
  selectors.sortKeyInventoryForTriage,
);

function HeaderActionsHost() {
  const { actions } = usePageHeaderState();
  return <div>{actions}</div>;
}

function renderRoute() {
  return render(
    <PageHeaderProvider>
      <HeaderActionsHost />
      <SteamKeys />
    </PageHeaderProvider>,
  );
}

describe("SteamKeys", () => {
  beforeEach(() => {
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
      { product_name: "Bundle A" },
    ] as any);
    mockGetFilterOptions.mockReturnValue({
      categories: ["Games"],
      platforms: [],
      keyTypes: ["steam"],
      publishers: [],
    });
    mockFlattenKeys.mockReturnValue([
      {
        id: "steam-1",
        keyType: "steam",
        keyName: "Alpha",
        productName: "Bundle A",
        dateAcquired: "2026-03-01",
        numDaysUntilExpired: 10,
        keyValue: "AAAA-BBBB",
        redemptionLinks: [
          {
            id: "r1",
            label: "Redeem",
            url: "https://example.test",
            kind: "redeem",
          },
        ],
        status: ["Ready"],
        steamAppId: "123",
      },
      {
        id: "other-1",
        keyType: "gog",
        keyName: "Beta",
        productName: "Bundle B",
        dateAcquired: "2026-03-02",
        redemptionLinks: [],
        status: ["Ready"],
      },
    ] as any);
    mockIsSteamKeyType.mockImplementation((value) => value === "steam");
    mockSortKeyInventoryForTriage.mockImplementation((keys) => keys as any);
    mockFilterKeyInventoryByScope.mockImplementation((keys) => keys as any);
    mockBuildKeyInventorySummary.mockReturnValue({
      total: 1,
      needsReveal: 0,
      revealed: 1,
      redeemable: 1,
      expiring: 1,
      directRedeem: 1,
    } as any);
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

  it("renders the steam key inventory summary and scope controls", () => {
    mockUseLibraryData.mockReturnValue({
      data: { products: [{ product_name: "Bundle A" }] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);

    renderRoute();

    expect(
      screen.getByText(
        "Work through the Steam redemption queue from one focused view",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 Steam key row match the current library filters."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Needs reveal/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Filters$/i }));
    expect(screen.getByText("FilterBar")).toBeInTheDocument();
    expect(
      screen.getByText("Search Steam keys, bundles, status, or Steam IDs"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Revealed/i }));
    expect(mockFilterKeyInventoryByScope).toHaveBeenCalled();
  });
});
