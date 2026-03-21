import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FilterProvider, useFilters } from "../../../src/state/filters";

function FilterHarness() {
  const { filters, setFilters, clearFilters } = useFilters();

  return (
    <div>
      <output data-testid="filters">{JSON.stringify(filters)}</output>
      <button
        onClick={() => setFilters({ search: "python", category: "books" })}>
        set filters
      </button>
      <button
        onClick={() => setFilters({ search: "python", category: "books" })}>
        set same filters
      </button>
      <button onClick={clearFilters}>clear filters</button>
    </div>
  );
}

describe("FilterProvider", () => {
  it("throws when the hook is used outside the provider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      expect(() => render(<FilterHarness />)).toThrow(
        "useFilters must be used inside FilterProvider",
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("stores partial filter updates and can clear back to defaults", () => {
    render(
      <FilterProvider>
        <FilterHarness />
      </FilterProvider>,
    );

    expect(screen.getByTestId("filters")).toHaveTextContent('"search":""');

    fireEvent.click(screen.getByText("set filters"));

    expect(screen.getByTestId("filters")).toHaveTextContent(
      '"search":"python"',
    );
    expect(screen.getByTestId("filters")).toHaveTextContent(
      '"category":"books"',
    );

    fireEvent.click(screen.getByText("clear filters"));

    expect(screen.getByTestId("filters")).toHaveTextContent('"search":""');
    expect(screen.getByTestId("filters")).toHaveTextContent('"category":null');
  });
});
