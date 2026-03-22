import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sheet } from "../../../../src/components/ui/sheet";

describe("Sheet", () => {
  afterEach(() => {
    document.body.style.overflow = "unset";
  });

  it("renders nothing while closed and leaves body scrolling enabled", () => {
    const { container } = render(
      <Sheet isOpen={false} onClose={() => {}} title="Order details">
        <p>Hidden content</p>
      </Sheet>,
    );

    expect(container.firstChild).toBeNull();
    expect(document.body.style.overflow).toBe("unset");
  });

  it("renders the title and content while open, and closes from button or backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Sheet isOpen={true} onClose={onClose} title="Order details">
        <p>Line items</p>
      </Sheet>,
    );

    expect(screen.getByText("Order details")).toBeInTheDocument();
    expect(screen.getByText("Line items")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button"));
    const backdrop = container.querySelector(".absolute.inset-0");
    expect(backdrop).not.toBeNull();
    if (!backdrop) {
      throw new Error("Sheet backdrop was not rendered.");
    }
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("restores body scrolling when closed after being open", () => {
    const { rerender, unmount } = render(
      <Sheet isOpen={true} onClose={() => {}} title="Order details">
        <p>Line items</p>
      </Sheet>,
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Sheet isOpen={false} onClose={() => {}} title="Order details">
        <p>Line items</p>
      </Sheet>,
    );

    expect(document.body.style.overflow).toBe("unset");

    unmount();
    expect(document.body.style.overflow).toBe("unset");
  });
});
