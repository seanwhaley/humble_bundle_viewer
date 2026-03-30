import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Card,
  CardContent,
  CardHeader,
} from "../../../../src/components/ui/card";

describe("Card", () => {
  it("renders the shared card shell with header and content sections", () => {
    const { container } = render(
      <Card className="border-dashed">
        <CardHeader className="pb-1">Heading</CardHeader>
        <CardContent className="pt-2">Body copy</CardContent>
      </Card>,
    );

    expect(screen.getByText("Heading").className).toContain("pb-1");
    expect(screen.getByText("Body copy").className).toContain("pt-2");
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.firstElementChild?.className).toContain("border-dashed");
  });
});