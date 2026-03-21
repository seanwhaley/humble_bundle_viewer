import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import KeyInventorySummaryStrip from "../../../src/components/KeyInventorySummaryStrip";

describe("KeyInventorySummaryStrip", () => {
  it("renders each summary item label, value, and hint", () => {
    render(
      <KeyInventorySummaryStrip
        items={[
          { label: "Owned", value: 12, hint: "Visible in inventory" },
          { label: "Redeemed", value: 7, hint: "Already claimed" },
        ]}
      />,
    );

    expect(screen.getByText("Owned")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Visible in inventory")).toBeInTheDocument();
    expect(screen.getByText("Redeemed")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Already claimed")).toBeInTheDocument();
  });

  it("preserves the provided item order", () => {
    render(
      <KeyInventorySummaryStrip
        items={[
          { label: "Expiring", value: 2, hint: "Claim soon" },
          { label: "Unrevealed", value: 5, hint: "Still hidden" },
          { label: "Redeemed", value: 7, hint: "Already claimed" },
        ]}
      />,
    );

    const expiring = screen.getByText("Expiring");
    const unrevealed = screen.getByText("Unrevealed");
    const redeemed = screen.getByText("Redeemed");

    expect(expiring.compareDocumentPosition(unrevealed)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(unrevealed.compareDocumentPosition(redeemed)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
