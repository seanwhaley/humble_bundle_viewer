/**
 * Persist and restore the viewer's active library selection across reloads.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import type { LibraryStatus } from "./api";

export const LIBRARY_PATH_STORAGE_KEY = "humble.libraryPath";

const getLocalStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const normalizeStoredLibraryPath = (
  value: string | null | undefined,
) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

export const readStoredLibraryPath = () => {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    return normalizeStoredLibraryPath(
      storage.getItem(LIBRARY_PATH_STORAGE_KEY),
    );
  } catch {
    return null;
  }
};

export const writeStoredLibraryPath = (value: string | null) => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  const normalized = normalizeStoredLibraryPath(value);

  try {
    if (normalized) {
      storage.setItem(LIBRARY_PATH_STORAGE_KEY, normalized);
      return;
    }

    storage.removeItem(LIBRARY_PATH_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the in-memory flow working.
  }
};

export class LibrarySelectionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LibrarySelectionError";
    this.status = status;
  }
}

export const selectLibraryPath = async (libraryPath: string) => {
  const response = await fetch("/api/library/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ library_path: libraryPath }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new LibrarySelectionError(
      payload?.detail || "Failed to select the saved library file.",
      response.status,
    );
  }

  return response.json() as Promise<{
    output_path: string;
    total_products: number;
  }>;
};

/**
 * Re-apply the last viewer-selected library path after a reload or service restart.
 */
export function useRestoreStoredLibraryPath(
  libraryStatus: LibraryStatus | undefined,
) {
  const queryClient = useQueryClient();
  const storedLibraryPath = useMemo(readStoredLibraryPath, []);
  const completedPathRef = useRef<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (!libraryStatus) {
      return;
    }

    if (!storedLibraryPath) {
      const currentPath = normalizeStoredLibraryPath(
        libraryStatus.current_path,
      );
      if (libraryStatus.exists && currentPath) {
        writeStoredLibraryPath(currentPath);
      }

      setIsRestoring(false);
      return;
    }

    const currentPath = normalizeStoredLibraryPath(libraryStatus.current_path);

    if (libraryStatus.exists && currentPath === storedLibraryPath) {
      completedPathRef.current = storedLibraryPath;
      setIsRestoring(false);
      return;
    }

    if (completedPathRef.current === storedLibraryPath) {
      return;
    }

    let cancelled = false;
    setIsRestoring(true);

    void selectLibraryPath(storedLibraryPath)
      .then(() => {
        if (cancelled) {
          return;
        }

        completedPathRef.current = storedLibraryPath;
        queryClient.invalidateQueries({ queryKey: ["library-status"] });
        queryClient.invalidateQueries({ queryKey: ["library"] });
        setIsRestoring(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        if (
          error instanceof LibrarySelectionError &&
          (error.status === 400 || error.status === 404)
        ) {
          writeStoredLibraryPath(null);
        }

        completedPathRef.current = storedLibraryPath;
        setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, [libraryStatus, queryClient, storedLibraryPath]);

  return {
    isRestoring,
    storedLibraryPath,
  };
}
