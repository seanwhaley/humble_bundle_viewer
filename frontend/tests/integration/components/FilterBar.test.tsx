import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { FilterProvider, useFilters } from "../../../src/state/filters";
import FilterBar from "../../../src/components/FilterBar";

function PrimeFilters() {
  const { setFilters } = useFilters();

  useEffect(() => {
    setFilters({
      search: "python",
      category: "books",
      platform: "windows",
      keyType: "steam",
      startDate: "2026-03-01",
      endDate: "2026-03-21",
    });
  }, [setFilters]);

  return null;
}

function renderFilterBar(ui: ReactElement, prime = false) {
  return render(
    <FilterProvider>
      {prime ?
        <PrimeFilters />
      : null}
      {ui}
    </FilterProvider>,
  );
}

describe("FilterBar", () => {
  it("uses a real button to toggle the collapsed filter disclosure", () => {
    renderFilterBar(
      <FilterBar
        categories={["books", "games"]}
        platforms={["windows", "linux"]}
        keyTypes={["steam", "gog"]}
      />,
      true,
    );

    const toggle = screen.getByRole("button", { name: /filters/i });
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("shows compact summary badges while collapsed", () => {
    renderFilterBar(
      <FilterBar
        categories={["books", "games"]}
        platforms={["windows", "linux"]}
        keyTypes={["steam", "gog"]}
      />,
      true,
    );

    expect(screen.getByText("Search: python")).toBeInTheDocument();
    expect(screen.getByText("Category: books")).toBeInTheDocument();
    expect(screen.getByText("+3 more")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
  });

  it("renders selected fields when expanded and clears filters", () => {
    const onClear = vi.fn();

    renderFilterBar(
      <FilterBar
        categories={["books", "games"]}
        platforms={["windows", "linux"]}
        keyTypes={["steam", "gog"]}
        fields={["search", "category", "dateRange"]}
        isExpanded
        extraContent={<div>Extra panel</div>}
        onClear={onClear}
      />,
      true,
    );

    expect(screen.getByPlaceholderText("Search...")).toHaveValue("python");
    expect(screen.getByTitle("Category")).toHaveValue("books");
    expect(screen.queryByTitle("Platform")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Key type")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-03-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-03-21")).toBeInTheDocument();
    expect(screen.getByText("Extra panel")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "rust" },
    });
    expect(screen.getByPlaceholderText("Search...")).toHaveValue("rust");

    fireEvent.click(screen.getByRole("button", { name: /Clear filters/i }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText("Search...")).toHaveValue("");
    expect(screen.getByTitle("Category")).toHaveValue("");
    expect(screen.queryByDisplayValue("2026-03-01")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("2026-03-21")).not.toBeInTheDocument();
  });
});
