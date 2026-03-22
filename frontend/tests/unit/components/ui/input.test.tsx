import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "../../../../src/components/ui/input";

describe("Input", () => {
  it("renders the requested type, value, and custom classes", () => {
    render(
      <Input
        type="email"
        defaultValue="reader@example.test"
        className="tracking-wide"
        aria-label="Email"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveValue("reader@example.test");
    expect(input.className).toContain("tracking-wide");
  });

  it("forwards refs to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>();

    render(<Input ref={ref} aria-label="Title search" />);

    expect(ref.current).toBe(
      screen.getByRole("textbox", { name: "Title search" }),
    );
  });
});
