import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tooltip } from "../../../../src/components/ui/tooltip";

describe("Tooltip", () => {
  it("shows a portal tooltip on hover and clears it on mouse leave", async () => {
    render(
      <Tooltip content="Helpful detail">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const wrapper = screen.getByRole("button", { name: "Hover me" }).parentElement;
    if (!wrapper) {
      throw new Error("Expected tooltip wrapper to exist.");
    }

    wrapper.getBoundingClientRect = () =>
      ({
        width: 40,
        height: 20,
        top: 10,
        left: 20,
        bottom: 30,
        right: 60,
        x: 20,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.mouseEnter(wrapper);

    expect(await screen.findByText("Helpful detail")).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--tooltip-top")).toBe(
      "10px",
    );
    expect(document.documentElement.style.getPropertyValue("--tooltip-left")).toBe(
      "40px",
    );

    fireEvent.mouseLeave(wrapper);

    await waitFor(() => {
      expect(screen.queryByText("Helpful detail")).not.toBeInTheDocument();
    });
  });

  it("keeps the trigger wrapper stable when no tooltip content is provided", () => {
    render(
      <Tooltip content={null} className="custom-wrapper">
        <span>Anchor</span>
      </Tooltip>,
    );

    expect(screen.getByText("Anchor").parentElement?.className).toContain(
      "custom-wrapper",
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});