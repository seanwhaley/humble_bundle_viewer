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
  default: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

vi.mock("../../../../src/components/DataTable", () => ({
  DataTable: ({ columns, data, searchPlaceholder }: any) => (
    <div>
      <div>{searchPlaceholder}</div>
      <div>{`Rendered rows: ${data.length}`}</div>
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
  useViewerConfig: vi.fn(),
}));

vi.mock("../../../../src/state/filters", () => ({
  useFilters: vi.fn(),
}));

vi.mock("../../../../src/data/selectors", () => ({
  applyProductFilters: vi.fn(),
  buildExpiringKeyActionSummary: vi.fn(),
  buildExpiringKeyScopeCounts: vi.fn(),
  buildKeyInventorySummary: vi.fn(),
  filterExpiringKeysByScope: vi.fn(),
  flattenKeys: vi.fn(),
  getFilterOptions: vi.fn(),
  getKeyRedemptionActionLabel: vi.fn(),
  shouldShowExpiringKeyAction: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import * as selectors from "../../../../src/data/selectors";
import * as filtersState from "../../../../src/state/filters";
import ExpiringKeys from "../../../../src/app/routes/ExpiringKeys";
import {
  PageHeaderProvider,
  usePageHeaderState,
} from "../../../../src/app/layout/PageHeaderContext";

const mockUseLibraryData = vi.mocked(api.useLibraryData);
const mockUseViewerConfig = vi.mocked(api.useViewerConfig);
const mockUseFilters = vi.mocked(filtersState.useFilters);
const mockApplyProductFilters = vi.mocked(selectors.applyProductFilters);
const mockBuildExpiringKeyActionSummary = vi.mocked(
  selectors.buildExpiringKeyActionSummary,
);
const mockBuildExpiringKeyScopeCounts = vi.mocked(
  selectors.buildExpiringKeyScopeCounts,
);
const mockBuildKeyInventorySummary = vi.mocked(
  selectors.buildKeyInventorySummary,
);
const mockFilterExpiringKeysByScope = vi.mocked(
  selectors.filterExpiringKeysByScope,
);
const mockFlattenKeys = vi.mocked(selectors.flattenKeys);
const mockGetFilterOptions = vi.mocked(selectors.getFilterOptions);
const mockGetKeyRedemptionActionLabel = vi.mocked(
  selectors.getKeyRedemptionActionLabel,
);
const mockShouldShowExpiringKeyAction = vi.mocked(
  selectors.shouldShowExpiringKeyAction,
);

function HeaderActionsHost() {
  const { actions } = usePageHeaderState();
  return <div>{actions}</div>;
}

function renderRoute() {
  return render(
    <PageHeaderProvider>
      <HeaderActionsHost />
      <ExpiringKeys />
    </PageHeaderProvider>,
  );
}

describe("ExpiringKeys", () => {
  const keys = [
    {
      id: "key-expiring",
      keyName: "Game Alpha",
      productName: "Bundle One",
      dateAcquired: "2026-03-01",
      numDaysUntilExpired: 5,
      keyType: "steam",
      keyValue: "AAAA-BBBB",
      redemptionLinks: [{ id: "r1", label: "Redeem", url: "https://example.test" }],
      status: ["Ready"],
    },
    {
      id: "key-expired",
      keyName: "Game Beta",
      productName: "Bundle Two",
      dateAcquired: "2026-02-15",
      numDaysUntilExpired: 0,
      keyType: "steam",
      keyValue: "",
      redemptionLinks: [],
      status: ["Expired"],
    },
  ] as any;

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

    mockUseLibraryData.mockReturnValue({
      data: { products: [{ product_name: "Bundle One" }] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);

    mockUseViewerConfig.mockReturnValue({
      data: {
        assume_revealed_keys_redeemed: false,
        ignore_revealed_status_for_expired_keys: false,
        ignore_revealed_status_for_unexpired_keys: false,
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useViewerConfig>);

    mockApplyProductFilters.mockReturnValue([{ product_name: "Bundle One" }] as any);
    mockFlattenKeys.mockReturnValue(keys);
    mockGetFilterOptions.mockReturnValue({
      categories: ["Games"],
      platforms: [],
      keyTypes: ["steam"],
    } as any);
    mockBuildExpiringKeyScopeCounts.mockReturnValue({
      all: 2,
      needs_action: 1,
      expired: 1,
      next_7_days: 1,
      next_30_days: 1,
      needs_reveal: 0,
    } as any);
    mockBuildKeyInventorySummary.mockReturnValue({
      total: 2,
      revealed: 1,
    } as any);
    mockBuildExpiringKeyActionSummary.mockReturnValue({
      openActionCount: 1,
      nextExpiringDaysRemaining: 5,
      expiredReferenceCount: 1,
    } as any);
    mockFilterExpiringKeysByScope.mockImplementation((allKeys, scope) => {
      if (scope === "needs_action") return [keys[0]] as any;
      if (scope === "expired") return [keys[1]] as any;
      return allKeys as any;
    });
    mockShouldShowExpiringKeyAction.mockImplementation(
      (key) => !key.status.includes("Expired"),
    );
    mockGetKeyRedemptionActionLabel.mockReturnValue("Redeem now");
  });

  it("renders the urgent triage summary, filter card, and triage table", () => {
    renderRoute();

    expect(
      screen.getByText("Prioritize the keys that still have a redemption window"),
    ).toBeInTheDocument();
    expect(screen.getByText("Active redemption window")).toBeInTheDocument();
    expect(
      screen.getByText("2 expired or dated key rows in the current filter scope."),
    ).toBeInTheDocument();
    expect(screen.queryByText("FilterBar")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Filters$/i }));

    expect(screen.getByText("FilterBar")).toBeInTheDocument();
    expect(
      screen.getByText("Search expiring keys, bundles, or statuses"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rendered rows: 2")).toBeInTheDocument();
  });

  it("switches triage scope when the user focuses open actions", () => {
    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: /Focus open actions/i }));

    const lastCall = mockFilterExpiringKeysByScope.mock.lastCall;

    expect(lastCall?.[0]).toEqual(expect.arrayContaining(keys));
    expect(lastCall?.[0]).toHaveLength(keys.length);
    expect(lastCall?.[1]).toBe("needs_action");
    expect(lastCall?.[2]).toEqual(expect.any(Object));
    expect(screen.getByText("Rendered rows: 1")).toBeInTheDocument();
  });
});