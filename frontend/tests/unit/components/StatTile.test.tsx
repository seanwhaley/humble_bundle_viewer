import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StatTile from "../../../src/components/StatTile";

describe("StatTile", () => {
  it("renders a non-interactive metric card when onClick is omitted", () => {
    const { container } = render(
      <StatTile
        label="Owned titles"
        value="42"
        subtitle="Across all products"
      />,
    );

    expect(screen.getByText("Owned titles")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Across all products")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Owned titles/i }),
    ).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("bg-surface-inset");
    expect(container.firstElementChild).toHaveClass("shadow-none");
  });

  it("renders a button and calls onClick when interactive", () => {
    const onClick = vi.fn();

    render(<StatTile label="New titles" value="12" onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: /New titles/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("allows callers to opt into a different shared surface", () => {
    const { container } = render(
      <StatTile label="Downloads" value="128" surface="panel" shadow="default" />,
    );

    expect(container.firstElementChild).toHaveClass("bg-surface-panel");
    expect(container.firstElementChild).toHaveClass("shadow-sm");
  });
});
