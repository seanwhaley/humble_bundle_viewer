import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "../../../../src/components/ui/button";

describe("Button", () => {
  it("renders a clickable button with the requested variant and size classes", () => {
    const onClick = vi.fn();

    render(
      <Button variant="secondary" size="sm" onClick={onClick}>
        Save changes
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button.className).toContain("bg-slate-800");
    expect(button.className).toContain("h-8");

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forwards refs to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();

    render(<Button ref={ref}>Open details</Button>);

    expect(ref.current).toBe(
      screen.getByRole("button", { name: "Open details" }),
    );
  });

  it("exposes variant helpers for shared styling callers", () => {
    expect(buttonVariants({ variant: "link", size: "icon" })).toContain(
      "underline-offset-4",
    );
    expect(buttonVariants({ variant: "link", size: "icon" })).toContain("h-9");
  });
});
