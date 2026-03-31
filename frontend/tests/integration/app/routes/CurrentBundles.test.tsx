import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CurrentBundles from "../../../../src/app/routes/CurrentBundles";

describe("CurrentBundles", () => {
  it("redirects legacy traffic to the sales overview page", async () => {
    render(
      <MemoryRouter
        initialEntries={["/current-bundles"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/current-bundles" element={<CurrentBundles />} />
          <Route
            path="/venue/overview"
            element={<div>Sales Overview destination</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sales Overview destination")).toBeInTheDocument();
  });
});
