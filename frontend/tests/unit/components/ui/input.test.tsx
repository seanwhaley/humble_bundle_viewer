import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "../../../../src/components/ui/input";

describe("Input", () => {
  it("renders with forwarded props, ref, and custom classes", () => {
    const ref = createRef<HTMLInputElement>();

    render(
      <Input
        ref={ref}
        type="email"
        placeholder="Email address"
        className="tracking-wide"
        disabled
      />,
    );

    const input = screen.getByPlaceholderText("Email address");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toBeDisabled();
    expect(input.className).toContain("border-input");
    expect(input.className).toContain("tracking-wide");
    expect(ref.current).toBe(input);
  });
});