import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import ExpiredLinkDialog from "../../../src/components/ExpiredLinkDialog";

describe("ExpiredLinkDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ExpiredLinkDialog isOpen={false} onClose={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("supports dismissing and navigating to downloads", () => {
    const onClose = vi.fn();
    render(<ExpiredLinkDialog isOpen onClose={onClose} />);

    expect(screen.getByText("Link expired")).toBeInTheDocument();

    fireEvent.click(screen.getByText("OK"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Go to downloads"));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(navigateMock).toHaveBeenCalledWith("/downloads");
  });
});
