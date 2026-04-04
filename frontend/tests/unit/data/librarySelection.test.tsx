import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  LIBRARY_PATH_STORAGE_KEY,
  readStoredLibraryPath,
  useRestoreStoredLibraryPath,
} from "../../../src/data/librarySelection";

const createWrapper = (client: QueryClient) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
};

describe("librarySelection", () => {
  it("reads and trims the stored library path", () => {
    window.localStorage.setItem(
      LIBRARY_PATH_STORAGE_KEY,
      "  D:/Saved/library_products.json  ",
    );

    expect(readStoredLibraryPath()).toBe("D:/Saved/library_products.json");
  });

  it("restores the saved library path on startup and invalidates viewer queries", async () => {
    window.localStorage.setItem(
      LIBRARY_PATH_STORAGE_KEY,
      "D:/Saved/library_products.json",
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_path: "D:/Saved/library_products.json",
        total_products: 3,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    renderHook(
      () =>
        useRestoreStoredLibraryPath({
          current_path: "D:/missing/library_products.json",
          exists: false,
          default_save_dir: "D:/Downloads",
          default_library_path: "D:/Downloads/library_products.json",
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/library/select",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["library-status"],
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["library"] });
  });

  it("clears an invalid saved path when restore returns 404", async () => {
    window.localStorage.setItem(
      LIBRARY_PATH_STORAGE_KEY,
      "D:/Missing/library_products.json",
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        detail: "library_products.json not found",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(
      () =>
        useRestoreStoredLibraryPath({
          current_path: "D:/missing/library_products.json",
          exists: false,
          default_save_dir: "D:/Downloads",
          default_library_path: "D:/Downloads/library_products.json",
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => {
      expect(window.localStorage.getItem(LIBRARY_PATH_STORAGE_KEY)).toBeNull();
    });
  });
});
