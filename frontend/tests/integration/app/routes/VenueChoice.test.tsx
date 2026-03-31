import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/data/api", () => ({
  useCurrentChoiceStatus: vi.fn(),
  useCurrentChoiceReport: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import VenueChoice from "../../../../src/app/routes/VenueChoice";

const mockStatusHook = vi.mocked(api.useCurrentChoiceStatus);
const mockReportHook = vi.mocked(api.useCurrentChoiceReport);

describe("VenueChoice", () => {
  it("shows a loading spinner while the status request is pending", () => {
    mockStatusHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);
    mockReportHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceReport>);

    const { container } = render(<VenueChoice />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows an error when the status query fails", () => {
    mockStatusHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("status failed"),
    } as ReturnType<typeof api.useCurrentChoiceStatus>);
    mockReportHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceReport>);

    render(<VenueChoice />);

    expect(
      screen.getByText("Failed to load current Choice status."),
    ).toBeInTheDocument();
  });

  it("shows the no-report guidance when no saved report exists", () => {
    mockStatusHook.mockReturnValue({
      data: {
        report_exists: false,
        month_label: "March 2026",
        game_count: 8,
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);
    mockReportHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceReport>);

    render(<VenueChoice />);

    expect(
      screen.getByText("No current Choice report yet"),
    ).toBeInTheDocument();
    expect(screen.getByText("March 2026")).toBeInTheDocument();
  });

  it("renders the current report summary table when data is available", () => {
    mockStatusHook.mockReturnValue({
      data: {
        report_exists: true,
        month_label: "March 2026",
        game_count: 8,
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceStatus>);
    mockReportHook.mockReturnValue({
      data: {
        month_label: "March 2026",
        total_titles: 8,
        new_titles: 5,
        new_percent: 62.5,
        price_label: "$11.99",
        page_url: "https://example.test/choice",
        games: [
          {
            title: "Game One",
            owned: true,
            matched_library_titles: ["Game One Deluxe"],
          },
          {
            title: "Game Two",
            owned: false,
            matched_library_titles: [],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useCurrentChoiceReport>);

    render(<VenueChoice />);

    expect(screen.getByText("March 2026 Choice lineup")).toBeInTheDocument();
    expect(screen.getByText("Game One")).toBeInTheDocument();
    expect(screen.getByText("Already owned")).toBeInTheDocument();
    expect(screen.getByText("New this month")).toBeInTheDocument();
    expect(screen.getByText("Game One Deluxe")).toBeInTheDocument();
    expect(screen.getByText("Open Choice page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /New to you \(1\)/i }));
    expect(screen.queryByText("Game One")).not.toBeInTheDocument();
    expect(screen.getByText("Game Two")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Already owned \(1\)/i }),
    );
    expect(screen.getByText("Game One")).toBeInTheDocument();
    expect(screen.queryByText("Game Two")).not.toBeInTheDocument();
  });
});
