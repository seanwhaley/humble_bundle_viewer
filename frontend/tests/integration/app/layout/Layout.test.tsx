import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Layout from "../../../../src/app/layout/Layout";

const memoryRouterFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../../../src/data/api", () => ({
  useLibraryStatus: vi.fn(),
  useOptionalLibraryData: vi.fn(),
  useViewerConfig: vi.fn(),
}));

vi.mock("../../../../src/data/librarySelection", () => ({
  useRestoreStoredLibraryPath: vi.fn(),
}));

vi.mock("../../../../src/data/selectors", () => ({
  buildExpiringKeyActionSummary: vi.fn(),
  collectProductDownloads: vi.fn(() => []),
  computeLibraryTotals: vi.fn(),
  getDownloadRouteVisibility: vi.fn(),
}));

vi.mock("../../../../src/utils/downloads", () => ({
  getLinkExpirationSummary: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import * as librarySelection from "../../../../src/data/librarySelection";
import * as selectors from "../../../../src/data/selectors";
import * as downloadUtils from "../../../../src/utils/downloads";

const mockUseLibraryStatus = vi.mocked(api.useLibraryStatus);
const mockUseOptionalLibraryData = vi.mocked(api.useOptionalLibraryData);
const mockUseViewerConfig = vi.mocked(api.useViewerConfig);
const mockUseRestoreStoredLibraryPath = vi.mocked(
  librarySelection.useRestoreStoredLibraryPath,
);
const mockBuildExpiringKeyActionSummary = vi.mocked(
  selectors.buildExpiringKeyActionSummary,
);
const mockComputeLibraryTotals = vi.mocked(selectors.computeLibraryTotals);
const mockGetDownloadRouteVisibility = vi.mocked(
  selectors.getDownloadRouteVisibility,
);
const mockGetLinkExpirationSummary = vi.mocked(
  downloadUtils.getLinkExpirationSummary,
);

function renderLayout(initialEntry: string, outletLabel: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]} future={memoryRouterFuture}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div>{outletLabel}</div>} />
          <Route
            path="library/other-downloads"
            element={<div>{outletLabel}</div>}
          />
          <Route path="library/steam-keys" element={<div>{outletLabel}</div>} />
          <Route path="command-center" element={<div>{outletLabel}</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
    });
    mockUseLibraryStatus.mockReturnValue({
      data: {
        exists: true,
        current_path: "D:/Libraries/library_products.json",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryStatus>);
    mockUseOptionalLibraryData.mockReturnValue({
      data: {
        captured_at: "2026-03-01T00:00:00Z",
        products: [{ machine_name: "demo" }],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useOptionalLibraryData>);
    mockUseViewerConfig.mockReturnValue({
      data: {
        link_expiry_warning_hours: 24,
        assume_revealed_keys_redeemed: false,
        ignore_revealed_status_for_expired_keys: false,
        ignore_revealed_status_for_unexpired_keys: false,
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useViewerConfig>);
    mockUseRestoreStoredLibraryPath.mockReturnValue({
      isRestoring: false,
    } as ReturnType<typeof librarySelection.useRestoreStoredLibraryPath>);
    mockGetDownloadRouteVisibility.mockReturnValue({
      downloads: true,
      software: true,
      videos: true,
      ebooks: true,
      audiobooks: true,
    });
    mockComputeLibraryTotals.mockReturnValue({
      totalProducts: 12,
      totalSubproducts: 24,
      totalFiles: 48,
      totalKeys: 6,
    } as ReturnType<typeof selectors.computeLibraryTotals>);
    mockBuildExpiringKeyActionSummary.mockReturnValue({
      openActionCount: 0,
      thresholdDays: 30,
      nextExpiringDaysRemaining: null,
      expiredReferenceCount: 0,
    } as ReturnType<typeof selectors.buildExpiringKeyActionSummary>);
    mockGetLinkExpirationSummary.mockReturnValue({
      state: "upcoming",
    } as ReturnType<typeof downloadUtils.getLinkExpirationSummary>);
  });

  it("hides the shared active-library pane on downloads routes", () => {
    renderLayout("/library/other-downloads", "Downloads outlet");

    expect(screen.getByText("Downloads outlet")).toBeInTheDocument();
    expect(screen.queryByText(/Active library/i)).not.toBeInTheDocument();
  });

  it("still shows the shared active-library pane on routes that keep shell context", () => {
    renderLayout("/command-center", "Commands outlet");

    expect(screen.getByText("Commands outlet")).toBeInTheDocument();
    expect(screen.getByText(/Active library/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Other Keys/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Non-Steam$/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the urgent key banner on Home even when the shared library context is hidden", () => {
    mockBuildExpiringKeyActionSummary.mockReturnValue({
      openActionCount: 3,
      thresholdDays: 30,
      nextExpiringDaysRemaining: 5,
      expiredReferenceCount: 1,
    } as ReturnType<typeof selectors.buildExpiringKeyActionSummary>);

    renderLayout("/", "Home outlet");

    expect(screen.getByText("Home outlet")).toBeInTheDocument();
    expect(screen.queryByText(/Active library/i)).not.toBeInTheDocument();
    expect(screen.getByText("Expiring key warning")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Review expiring keys/i }),
    ).toHaveAttribute("href", "/library/expiring-keys");
  });
});
