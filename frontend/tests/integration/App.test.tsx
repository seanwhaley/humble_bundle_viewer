import React from "react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/app/layout/Layout", () => ({
  default: function MockLayout() {
    return (
      <div data-testid="layout-shell">
        <React.Suspense fallback={<div>Loading route</div>}>
          <Outlet />
        </React.Suspense>
      </div>
    );
  },
}));

vi.mock("../../src/app/routes/Overview", () => ({
  default: () => <div>Overview route</div>,
}));

vi.mock("../../src/app/routes/VenueChoice", () => ({
  default: () => <div>VenueChoice route</div>,
}));

vi.mock("../../src/app/routes/CurrentSalesOverview", () => ({
  default: () => <div>CurrentSalesOverview route</div>,
}));

vi.mock("../../src/app/routes/VenueBundlePage", () => ({
  default: ({ bundleType }: { bundleType: string }) => (
    <div>Bundle page: {bundleType}</div>
  ),
}));

import App from "../../src/App";

describe("App", () => {
  it("renders the overview route inside the layout shell", async () => {
    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("layout-shell")).toBeInTheDocument();
    expect(await screen.findByText("Overview route")).toBeInTheDocument();
  });

  it("renders the current choice route", async () => {
    render(
      <MemoryRouter
        initialEntries={["/venue/choice"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText("VenueChoice route")).toBeInTheDocument();
  });

  it("redirects the legacy current bundles route to Sales Overview", async () => {
    render(
      <MemoryRouter
        initialEntries={["/current-bundles"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("CurrentSalesOverview route"),
    ).toBeInTheDocument();
  });
});
