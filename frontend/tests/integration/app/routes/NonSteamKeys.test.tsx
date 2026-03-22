import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/components/FilterBar", () => ({
  default: () => <div>FilterBar</div>,
}));

vi.mock("../../../../src/components/KeyInventorySummaryStrip", () => ({
  default: ({ items }: { items: Array<{ label: string; value: number }> }) => (
    <div>
      {items.map((item) => (
        <span key={item.label}>{`${item.label}: ${item.value}`}</span>
      ))}
    </div>
  ),
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

vi.mock("../../../../src/components/charts/BarChart", () => ({
  default: ({ title, data, onSelect }: any) => (
    <div>
      <span>{title}</span>
      {data.map((item: any) => (
        <button
          key={item.id ?? item.label}
          type="button"
          onClick={() => onSelect?.(item.id ?? item.label)}>
          {item.label}
        </button>
      ))}
    </div>
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
  groupSmallValues: vi.fn(),
  isSteamKeyType: vi.fn(),
  normalizeKeyTypeLabel: vi.fn(),
  normalizeKeyTypeValue: vi.fn(),
  sortKeyInventoryForTriage: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import * as selectors from "../../../../src/data/selectors";
import * as filtersState from "../../../../src/state/filters";
import NonSteamKeys from "../../../../src/app/routes/NonSteamKeys";

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
const mockGroupSmallValues = vi.mocked(selectors.groupSmallValues);
const mockIsSteamKeyType = vi.mocked(selectors.isSteamKeyType);
const mockNormalizeKeyTypeLabel = vi.mocked(selectors.normalizeKeyTypeLabel);
const mockNormalizeKeyTypeValue = vi.mocked(selectors.normalizeKeyTypeValue);
const mockSortKeyInventoryForTriage = vi.mocked(
  selectors.sortKeyInventoryForTriage,
);

describe("NonSteamKeys", () => {
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
      { product_name: "Bundle B" },
    ] as any);
    mockGetFilterOptions.mockReturnValue({
      categories: ["Games"],
      platforms: [],
      keyTypes: ["steam", "gog"],
      publishers: [],
    });
    mockFlattenKeys.mockReturnValue([
      {
        id: "gog-1",
        keyType: "gog",
        keyName: "Gamma",
        productName: "Bundle B",
        dateAcquired: "2026-03-02",
        numDaysUntilExpired: 15,
        keyValue: "XXXX-YYYY",
        redemptionLinks: [
          {
            id: "r1",
            label: "Redeem",
            url: "https://example.test",
            kind: "redeem",
          },
        ],
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
      instructions: 0,
      expiring: 1,
    } as any);
    mockNormalizeKeyTypeValue.mockImplementation((value) => value || "unknown");
    mockNormalizeKeyTypeLabel.mockImplementation((value) =>
      String(value).toUpperCase(),
    );
    mockGroupSmallValues.mockImplementation((items) => items as any);
  });

  it("shows a loading spinner while library data is loading", () => {
    mockUseLibraryData.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);

    const { container } = render(<NonSteamKeys />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows an error banner when the library query fails", () => {
    mockUseLibraryData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    } as ReturnType<typeof api.useLibraryData>);

    render(<NonSteamKeys />);
    expect(
      screen.getByText("Failed to load library data."),
    ).toBeInTheDocument();
  });

  it("renders the non-steam summary and allows key-type chart selection", () => {
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
      data: { products: [{ product_name: "Bundle B" }] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);

    render(<NonSteamKeys />);

    expect(screen.getByText("Non-Steam Keys")).toBeInTheDocument();
    expect(screen.getByText("Keys in inventory: 1")).toBeInTheDocument();
    expect(screen.getByText("Key types")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "GOG" }));
    expect(setFilters).toHaveBeenCalledWith({ keyType: "gog" });
  });
});
