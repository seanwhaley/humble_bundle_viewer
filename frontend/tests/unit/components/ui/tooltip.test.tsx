import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Tooltip } from "../../../../src/components/ui/tooltip";

describe("Tooltip", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--tooltip-top");
    document.documentElement.style.removeProperty("--tooltip-left");
  });

  it("shows portal content on hover and records anchor coordinates", () => {
    render(
      <Tooltip content="Exact bundle title" className="custom-wrapper">
        <button type="button">Hover target</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", {
      name: "Hover target",
    }).parentElement;
    expect(trigger).not.toBeNull();
    if (!trigger) {
      throw new Error("Tooltip trigger wrapper was not rendered.");
    }

    trigger.getBoundingClientRect = () =>
      ({
        top: 10,
        left: 20,
        width: 40,
        height: 12,
        bottom: 22,
        right: 60,
        x: 20,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.mouseEnter(trigger);

    expect(screen.getByText("Exact bundle title")).toBeInTheDocument();
    expect(
      document.documentElement.style.getPropertyValue("--tooltip-top"),
    ).toBe("10px");
    expect(
      document.documentElement.style.getPropertyValue("--tooltip-left"),
    ).toBe("40px");

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByText("Exact bundle title")).not.toBeInTheDocument();
  });

  it("does not render portal content when no tooltip content is provided", () => {
    render(
      <Tooltip content={null}>
        <span>Hover target</span>
      </Tooltip>,
    );

    const trigger = screen.getByText("Hover target").parentElement;
    expect(trigger).not.toBeNull();
    if (!trigger) {
      throw new Error("Tooltip trigger wrapper was not rendered.");
    }

    trigger.getBoundingClientRect = () =>
      ({
        top: 5,
        left: 15,
        width: 10,
        height: 8,
        bottom: 13,
        right: 25,
        x: 15,
        y: 5,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.mouseEnter(trigger);

    expect(
      document.body.querySelector(".tooltip-portal"),
    ).not.toBeInTheDocument();
  });
});
