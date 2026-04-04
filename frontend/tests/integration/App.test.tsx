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

vi.mock("../../src/app/routes/Home", () => ({
  default: () => <div>Home route</div>,
}));

vi.mock("../../src/app/routes/CurrentChoice", () => ({
  default: () => <div>CurrentChoice route</div>,
}));

vi.mock("../../src/app/routes/SalesOverview", () => ({
  default: () => <div>SalesOverview route</div>,
}));

vi.mock("../../src/app/routes/SalesBundlePage", () => ({
  default: ({ bundleType }: { bundleType: string }) => (
    <div>Bundle page: {bundleType}</div>
  ),
}));

import App from "../../src/App";

describe("App", () => {
  it("renders the home route inside the layout shell", async () => {
    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("layout-shell")).toBeInTheDocument();
    expect(await screen.findByText("Home route")).toBeInTheDocument();
  });

  it("renders the current choice route", async () => {
    render(
      <MemoryRouter
        initialEntries={["/sales/choice"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText("CurrentChoice route")).toBeInTheDocument();
  });

  it("renders the sales overview route", async () => {
    render(
      <MemoryRouter
        initialEntries={["/sales"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("SalesOverview route"),
    ).toBeInTheDocument();
  });
});
