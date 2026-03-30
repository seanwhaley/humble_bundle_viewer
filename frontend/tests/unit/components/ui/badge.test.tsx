import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

  it("does not forward interactive props to the rendered badge", () => {
    const handleClick = vi.fn();
    const unsafeProps = {
      onClick: handleClick,
    } as unknown as React.ComponentProps<typeof Badge>;

    render(<Badge {...unsafeProps}>Idle</Badge>);

    fireEvent.click(screen.getByText("Idle"));
    expect(handleClick).not.toHaveBeenCalled();
  });
});