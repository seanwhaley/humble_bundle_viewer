import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Purchases from "../../../../src/app/routes/Purchases";
import {
  PageHeaderProvider,
  usePageHeaderState,
} from "../../../../src/app/layout/PageHeaderContext";

const mocks = vi.hoisted(() => ({
  useLibraryData: vi.fn(),
  useFilters: vi.fn(),
  setFilters: vi.fn(),
}));

const memoryRouterFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../../../src/components/FilterBar", () => ({
  __esModule: true,
  default: () => <div>Purchases FilterBar</div>,
}));

vi.mock("../../../../src/components/OrderDetailPanel", () => ({
  __esModule: true,
  default: ({ product }: { product: { product_name?: string } }) => (
    <div>{`Order detail: ${product.product_name ?? "Unknown purchase"}`}</div>
  ),
}));

vi.mock("../../../../src/components/ProductCell", () => ({
  ProductCell: ({ getValue }: { getValue: () => string }) => (
    <span>{getValue()}</span>
  ),
}));

vi.mock("../../../../src/components/SubproductInfoLink", () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <span>{label}</span>,
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

vi.mock("../../../../src/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../../../../src/data/api", () => ({
  useLibraryData: mocks.useLibraryData,
}));

vi.mock("../../../../src/state/filters", () => ({
  useFilters: mocks.useFilters,
}));

vi.mock("../../../../src/data/selectors", () => ({
  applyProductFilters: vi.fn((products: unknown[]) => products),
  buildDescriptionSnippet: vi.fn((value: string) => value),
  buildSuborders: vi.fn(() => [
    {
      id: "item-1",
      parentGamekey: "bundle-1",
      parentName: "Bundle One",
      parentCategory: "books",
      subproductName: "Book Alpha",
      infoUrl: "https://example.test/book-alpha",
      authorSummary: "Author Alpha",
      publisher: "Publisher Alpha",
      descriptionSnippet: "Included item description.",
      platformSummary: "pdf, epub",
      downloads: [{ size_bytes: 1024 }],
      totalBytes: 1024,
      keys: [{ key_type: "steam" }],
      product: { created_at: "2026-03-01T00:00:00Z", machine_name: "bundle-1" },
    },
  ]),
  collectProductDownloads: vi.fn((product: any) => product.mockDownloads ?? []),
  computeStats: vi.fn(() => ({
    totalProducts: 2,
    totalContainedItems: 3,
  })),
  countContainedItems: vi.fn((product: any) => product.subproducts?.length ?? 0),
  getFilterOptions: vi.fn(() => ({
    categories: ["Books", "Games"],
    platforms: ["pdf", "windows"],
    keyTypes: ["steam"],
  })),
  getCompactBundleName: vi.fn((name: string) => ({ display: name, full: name })),
  isSteamKeyType: vi.fn((value: string | undefined) => value === "steam"),
  summarizeAuthors: vi.fn((authors: string[]) => authors.join(", ")),
  normalizeCategoryLabel: vi.fn((value: string | undefined) => value || "Other"),
  normalizePlatformLabel: vi.fn((value: string | undefined) => value || "Unknown"),
}));

function renderRoute() {
  return render(
    <MemoryRouter future={memoryRouterFuture}>
      <PageHeaderProvider>
        <HeaderActionsHost />
        <Purchases />
      </PageHeaderProvider>
    </MemoryRouter>,
  );
}

function HeaderActionsHost() {
  const { actions } = usePageHeaderState();
  return <div>{actions}</div>;
}

describe("Purchases", () => {
  beforeEach(() => {
    mocks.setFilters.mockReset();
    mocks.useLibraryData.mockReturnValue({
      data: {
        products: [
          {
            gamekey: "bundle-1",
            machine_name: "bundle-1",
            product_name: "Bundle One",
            category: "books",
            amount_spent: 25,
            created_at: "2026-03-01T00:00:00Z",
            keys: [{ key_type: "steam" }],
            mockDownloads: [
              { platform: "pdf", size_bytes: 1024 },
              { platform: "epub", size_bytes: 2048 },
            ],
            subproducts: [
              {
                page_details: {
                  authors: ["Author Alpha"],
                  publisher: "Publisher Alpha",
                  description: "Bundle One description.",
                },
                keys: [{ key_type: "steam" }],
              },
            ],
          },
          {
            gamekey: "bundle-2",
            machine_name: "bundle-2",
            product_name: "Bundle Two",
            category: "games",
            amount_spent: 15,
            created_at: "2026-03-05T00:00:00Z",
            keys: [],
            mockDownloads: [{ platform: "windows", size_bytes: 4096 }],
            subproducts: [
              {
                page_details: {
                  authors: ["Author Beta"],
                  publisher: "Publisher Beta",
                  description: "Bundle Two description.",
                },
                keys: [],
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    mocks.useFilters.mockReturnValue({
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
      setFilters: mocks.setFilters,
      clearFilters: vi.fn(),
    });
  });

  it("reveals header-owned filters and switches into included-item analysis", () => {
    renderRoute();

    expect(screen.getByText("Purchases workspace")).toBeInTheDocument();
    const downloadOnlyHeading = screen.getByText("Download-only purchases");
    const downloadOnlyCard = downloadOnlyHeading.parentElement;
    expect(downloadOnlyCard).not.toBeNull();
    expect(
      within(downloadOnlyCard as HTMLElement).getByText(
        "Download inventory without redemption keys",
      ),
    ).toBeInTheDocument();
    expect(
      within(downloadOnlyCard as HTMLElement).getByText("1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rendered rows: 2")).toBeInTheDocument();
    expect(screen.queryByText("Purchases FilterBar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/i }));
    expect(screen.getByText("Purchases FilterBar")).toBeInTheDocument();
    expect(
      screen.getByText("Search purchases, categories, access, or dates"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Included items/i }));

    expect(
      screen.getByText(/Included-item analysis is a secondary deep-inspection mode/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Rendered rows: 1")).toBeInTheDocument();
    expect(
      screen.getByText("Search included items, purchases, media, or dates"),
    ).toBeInTheDocument();
  });

  it("opens a purchase detail view and returns to the purchases table", () => {
    renderRoute();

    fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]);

    expect(screen.getByText("Purchase detail")).toBeInTheDocument();
    expect(screen.getByText("Order detail: Bundle One")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Back to purchases/i }));

    expect(screen.getByText("Purchases workspace")).toBeInTheDocument();
    expect(screen.queryByText("Order detail: Bundle One")).not.toBeInTheDocument();
  });
});