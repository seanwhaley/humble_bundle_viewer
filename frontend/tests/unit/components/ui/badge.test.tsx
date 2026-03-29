import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "../../../../src/components/ui/badge";

describe("Badge", () => {
  it("defaults to the neutral badge variant", () => {
    render(<Badge>Idle</Badge>);

    const badge = screen.getByText("Idle");
    expect(badge.className).toContain("border-status-neutral");
    expect(badge.className).toContain("text-status-neutral-foreground");
  });

  it("renders semantic status variants", () => {
    render(<Badge variant="success">Fresh</Badge>);

    const badge = screen.getByText("Fresh");
    expect(badge.className).toContain("border-status-success");
    expect(badge.className).toContain("text-status-success-foreground");
  });
});