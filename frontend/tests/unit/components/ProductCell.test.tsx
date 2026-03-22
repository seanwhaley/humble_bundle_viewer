import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductCell } from "../../../src/components/ProductCell";

describe("ProductCell", () => {
  it("renders a placeholder when the value is empty", () => {
    render(<ProductCell getValue={() => undefined} />);

    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("renders abbreviated bundle names using the compact bundle selector", () => {
    render(
      <ProductCell
        getValue={() => "Humble Book Bundle: Python Testing Mastery"}
      />,
    );

    expect(screen.getByText("HBB")).toBeInTheDocument();
    expect(screen.getByText("Python Testing Mastery")).toBeInTheDocument();
  });

  it("shows a tooltip for truncated non-abbreviated values on hover", () => {
    render(<ProductCell getValue={() => "Standalone Product Name"} />);

    const value = screen.getByText("Standalone Product Name");
    Object.defineProperty(value, "scrollWidth", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(value, "clientWidth", {
      configurable: true,
      value: 100,
    });

    fireEvent.mouseEnter(value);

    expect(
      screen.getAllByText("Standalone Product Name").length,
    ).toBeGreaterThan(1);
  });
});
