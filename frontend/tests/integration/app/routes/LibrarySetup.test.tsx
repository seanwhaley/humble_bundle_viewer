import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/data/api", () => ({
  useLibraryStatus: vi.fn(),
}));

import * as api from "../../../../src/data/api";
import LibrarySetup from "../../../../src/app/routes/LibrarySetup";

const mockLibraryStatusHook = vi.mocked(api.useLibraryStatus);
const memoryRouterFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function renderRoute() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter future={memoryRouterFuture}>
      <QueryClientProvider client={client}>
        <LibrarySetup />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("LibrarySetup", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    mockLibraryStatusHook.mockReturnValue({
      data: {
        exists: false,
        current_path: "D:/missing/library_products.json",
        default_save_dir: "D:/Downloads",
        default_library_path: "D:/Downloads/library_products.json",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof api.useLibraryStatus>);
  });

  it("validates capture inputs before calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: /Run capture now/i }));

    expect(
      await screen.findByText(
        "Enter your session cookie before running the capture.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toggles to the existing-file workflow and validates the selected path", async () => {
    renderRoute();

    fireEvent.click(screen.getByText("Use existing library file"));
    fireEvent.change(screen.getByLabelText("Library file path"), {
      target: { value: "   " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Load selected library/i }),
    );

    expect(
      await screen.findByText("Provide the path to an existing library file."),
    ).toBeInTheDocument();
  });

  it("reveals the optional download scope controls when file downloads are enabled", () => {
    renderRoute();

    fireEvent.click(screen.getByLabelText(/Download files after capture/i));

    expect(screen.getByText("Optional download scope")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ebook, audio")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("pdf, epub, mp3")).toBeInTheDocument();
    expect(screen.getByLabelText("Size policy")).toBeInTheDocument();
  });

  it("submits a capture request and shows the success message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_path: "D:/Downloads/library_products.json",
        total_products: 3,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    fireEvent.change(screen.getByLabelText("Session Cookie"), {
      target: { value: "cookie-value" },
    });
    fireEvent.change(screen.getByLabelText("Save Folder"), {
      target: { value: "D:/Downloads" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Run capture now/i }));

    expect(
      await screen.findByText(/Loaded 3 products\. Viewer now points to/),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/run",
      expect.objectContaining({ method: "POST" }),
    );
    expect(localStorage.getItem("humble.libraryPath")).toBe(
      "D:/Downloads/library_products.json",
    );
  });
});
