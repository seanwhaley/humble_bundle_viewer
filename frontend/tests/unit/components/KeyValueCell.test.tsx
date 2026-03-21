import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KeyValueCell from "../../../src/components/KeyValueCell";

describe("KeyValueCell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn() },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a placeholder when there is no key value", () => {
    render(<KeyValueCell />);

    expect(screen.getByText("–")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reveals and copies the key value", () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });

    render(<KeyValueCell value="ABC-123" revealLabel="Show key" />);

    fireEvent.click(screen.getByRole("button", { name: /Show key/i }));
    expect(
      screen.getByRole("button", { name: /ABC-123/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Copy key"));
    expect(writeText).toHaveBeenCalledWith("ABC-123");
    expect(screen.getByTitle("Copied!")).toBeInTheDocument();
  });
});
