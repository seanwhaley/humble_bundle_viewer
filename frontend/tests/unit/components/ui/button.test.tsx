import type { Ref } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../../../../src/components/ui/button";

describe("Button", () => {
  it("renders as a native button by default", () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("applies button styling to its child when asChild is enabled", () => {
    render(
      <Button asChild variant="outline">
        <a href="/docs">Docs</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Docs" });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
    expect(link.className).toContain("border-border");
    expect(document.querySelector("button a")).toBeNull();
  });

  it("applies variant, size, and custom classes to native buttons", () => {
    render(
      <Button variant="secondary" size="lg" className="tracking-wide">
        Launch
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Launch" });
    expect(button.className).toContain("bg-secondary");
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("tracking-wide");
  });

  it("forwards refs to the child element when asChild is enabled", () => {
    let renderedNode: Element | null = null;
    const ref = ((value: HTMLButtonElement | null) => {
      renderedNode = value as unknown as Element | null;
    }) as Ref<HTMLButtonElement>;

    render(
      <Button asChild ref={ref}>
        <a href="/docs">Docs</a>
      </Button>,
    );

    expect(renderedNode).toBe(screen.getByRole("link", { name: "Docs" }));
  });
});
