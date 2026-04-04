import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: { series: Array<{ data: unknown }> } }) => (
    <div data-testid="schema-chart">
      {JSON.stringify(option.series[0].data)}
    </div>
  ),
}));

vi.mock("../../../../src/components/charts/echarts", () => ({
  echarts: {},
}));

vi.mock("../../../../src/data/api", () => ({
  useLibraryData: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import Schema from "../../../../src/app/routes/Schema";

const mockLibraryDataHook = vi.mocked(api.useLibraryData);
const memoryRouterFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

describe("Schema", () => {
  it("shows a loading spinner while library data is loading", () => {
    mockLibraryDataHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);

    const { container } = render(
      <MemoryRouter future={memoryRouterFuture}>
        <Schema />
      </MemoryRouter>,
    );

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows an error banner when the library query fails", () => {
    mockLibraryDataHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    } as ReturnType<typeof api.useLibraryData>);

    render(
      <MemoryRouter future={memoryRouterFuture}>
        <Schema />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Failed to load data for schema analysis."),
    ).toBeInTheDocument();
  });

  it("renders the blueprint view and lets the user focus a schema branch", () => {
    mockLibraryDataHook.mockReturnValue({
      data: {
        total_products: 1,
        captured_at: "2026-03-21T12:00:00Z",
        products: [
          {
            product_name: "Alpha Bundle",
            human_name: "Alpha Bundle",
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

    render(
      <MemoryRouter future={memoryRouterFuture}>
        <Schema />
      </MemoryRouter>,
    );

    expect(screen.getByText("Explore the viewer schema")).toBeInTheDocument();
    expect(
      screen.getByText("Top-level purchase entries in the active library"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("schema-chart")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Metadata" }));

    expect(screen.getByTestId("schema-chart").textContent).toContain(
      "Metadata",
    );
  });

  it("switches to inspector mode and shows different JSON samples", () => {
    mockLibraryDataHook.mockReturnValue({
      data: {
        total_products: 1,
        captured_at: "2026-03-21T12:00:00Z",
        products: [
          {
            product_name: "Alpha Bundle",
            human_name: "Alpha Bundle",
            subproducts: [
              {
                human_name: "Guidebook",
                downloads: [{ name: "alpha.epub" }],
                keys: [],
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryData>);

    render(
      <MemoryRouter future={memoryRouterFuture}>
        <Schema />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Inspector/i }));

    expect(screen.getByText("First item from 'products'")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sample Subproduct" }));
    expect(
      screen.getByText("First item from 'products[].subproducts'"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Library Metadata" }));
    expect(screen.getByText("Library metadata summary")).toBeInTheDocument();
  });
});
