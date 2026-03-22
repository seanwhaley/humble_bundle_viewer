import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import DownloadRouteEmptyState from "../../../src/components/DownloadRouteEmptyState";

describe("DownloadRouteEmptyState", () => {
  it("renders the shared explanation for an empty direct-download route", () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DownloadRouteEmptyState routeLabel="Ebooks" />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("No valid subproducts for this page"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ebooks/)).toBeInTheDocument();
    expect(
      screen.queryByText("Try one of the dedicated download pages instead:"),
    ).not.toBeInTheDocument();
  });

  it("renders suggested follow-up routes as links when provided", () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DownloadRouteEmptyState
          routeLabel="Downloads"
          suggestedRoutes={[
            { label: "Software", to: "/software" },
            { label: "Audiobooks", to: "/audiobooks" },
          ]}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Try one of the dedicated download pages instead:"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Software/i })).toHaveAttribute(
      "href",
      "/software",
    );
    expect(screen.getByRole("link", { name: /Audiobooks/i })).toHaveAttribute(
      "href",
      "/audiobooks",
    );
  });
});
