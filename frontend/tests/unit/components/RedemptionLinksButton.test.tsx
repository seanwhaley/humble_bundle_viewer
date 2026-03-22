import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RedemptionLink } from "../../../src/data/types";
import RedemptionLinksButton from "../../../src/components/RedemptionLinksButton";

const sampleLinks: RedemptionLink[] = [
  {
    id: "redeem-1",
    label: "Redeem on Steam",
    url: "https://example.test/redeem",
    kind: "redeem",
    region: "Global",
  },
  {
    id: "instructions-1",
    label: "Manual Instructions",
    url: "https://example.test/instructions",
    kind: "instructions",
  },
];

describe("RedemptionLinksButton", () => {
  it("renders a placeholder when there are no links", () => {
    render(<RedemptionLinksButton />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a direct link when there is exactly one redemption link", () => {
    render(<RedemptionLinksButton links={[sampleLinks[0]]} compact />);

    const link = screen.getByRole("link", { name: /Redeem on Steam/i });
    expect(link).toHaveAttribute("href", "https://example.test/redeem");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("renders a dropdown with all links when multiple redemption links exist", () => {
    render(<RedemptionLinksButton links={sampleLinks} label="Redeem" />);

    expect(screen.getByText("Redemption links")).toBeInTheDocument();
    expect(screen.getAllByRole("link").length).toBe(2);
    expect(screen.getByText("Global")).toBeInTheDocument();
    expect(screen.getByText("Instructions")).toBeInTheDocument();
  });
});
