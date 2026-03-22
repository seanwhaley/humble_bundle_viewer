import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SubproductInfoLink from "../../../src/components/SubproductInfoLink";

describe("SubproductInfoLink", () => {
  it("renders a placeholder dash when there is no URL", () => {
    render(<SubproductInfoLink />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an external link with the optional button label", () => {
    render(
      <SubproductInfoLink
        url="https://example.test/subproduct"
        label="Open the product page"
        buttonLabel="Open page"
        showLabel
      />,
    );

    const link = screen.getByRole("link", { name: /Open the product page/i });
    expect(link).toHaveAttribute("href", "https://example.test/subproduct");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByText("Open page")).toBeInTheDocument();
  });
});
