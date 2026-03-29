import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LibrarySetup from "../../../src/app/routes/LibrarySetup";

const mocks = vi.hoisted(() => ({
  useLibraryStatus: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

vi.mock("../../../src/data/api", () => ({
  useLibraryStatus: mocks.useLibraryStatus,
}));

const renderRoute = () =>
  render(
    <MemoryRouter>
      <LibrarySetup />
    </MemoryRouter>,
  );

describe("LibrarySetup", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.useLibraryStatus.mockReset();

    mocks.useLibraryStatus.mockReturnValue({
      data: {
        current_path: "C:\\missing\\library_products.json",
        exists: false,
        default_save_dir: "C:\\Downloads",
        default_library_path: "C:\\Saved\\library_products.json",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("submits the capture workflow with parsed filters and shows follow-up actions", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output_path: "C:\\Captured\\library_products.json",
        total_products: 42,
      }),
    });

    renderRoute();

    expect(
      await screen.findByText(/No library file was found at/i),
    ).toBeInTheDocument();
    expect(await screen.findByDisplayValue("C:\\Downloads")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Session Cookie"), {
      target: { value: " session-cookie " },
    });
    fireEvent.click(screen.getByLabelText(/Download files after capture/i));
    fireEvent.change(screen.getByPlaceholderText("ebook, audio"), {
      target: { value: "ebook, audio, " },
    });
    fireEvent.change(screen.getByPlaceholderText("pdf, epub, mp3"), {
      target: { value: "pdf, epub,, " },
    });
    fireEvent.change(screen.getByLabelText("Size policy"), {
      target: { value: "largest" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Run capture now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("/api/library/run");
    expect(JSON.parse(options.body as string)).toEqual({
      auth_cookie: "session-cookie",
      output_path: "C:\\Downloads",
      download_files: true,
      platforms: ["ebook", "audio"],
      file_types: ["pdf", "epub"],
      size_policy: "largest",
    });

    expect(
      await screen.findByText("Continue with maintenance or inspection"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Command Center" })).toHaveAttribute(
      "href",
      "/commands",
    );
    expect(screen.getByText(/Redirecting to overview in 5s/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));

    expect(screen.getByText("Automatic redirect paused.")).toBeInTheDocument();
    expect(screen.getByLabelText("Session Cookie")).toHaveValue("");
    expect(window.localStorage.getItem("humble.libraryPath")).toBe(
      "C:\\Captured\\library_products.json",
    );
    expect(window.localStorage.getItem("humble.setup.platforms")).toBe(
      JSON.stringify("ebook, audio, "),
    );
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["library"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["library-status"],
    });
  });

  it("validates required fields and supports selecting an existing library file", async () => {
    mocks.useLibraryStatus.mockReturnValue({
      data: {
        current_path: "C:\\missing\\library_products.json",
        exists: false,
        default_save_dir: "C:\\Downloads",
        default_library_path: "",
      },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output_path: "C:\\Saved\\library_products.json",
        total_products: 11,
      }),
    });

    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "Run capture now" }));

    expect(
      await screen.findByText("Enter your session cookie before running the capture."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /Use existing library file/i }));
    expect(window.localStorage.getItem("humble.setup.mode")).toBe(
      JSON.stringify("existing"),
    );

    const existingInput = await screen.findByLabelText("Library file path");
    fireEvent.click(screen.getByRole("button", { name: "Load selected library" }));

    expect(
      await screen.findByText("Provide the path to an existing library file."),
    ).toBeInTheDocument();

    fireEvent.change(existingInput, {
      target: { value: " C:\\Imports\\library_products.json " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load selected library" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("/api/library/select");
    expect(JSON.parse(options.body as string)).toEqual({
      library_path: "C:\\Imports\\library_products.json",
    });

    expect(
      await screen.findByText(/Loaded 11 products\. Viewer now points to/i),
    ).toBeInTheDocument();
  });
});