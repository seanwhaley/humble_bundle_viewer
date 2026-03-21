/**
 * Global filter state shared across dashboard routes.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type KeyPresence = "has_keys" | "no_keys";
export type DownloadPresence = "has_downloads" | "no_downloads";

export interface FilterState {
  search: string;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
  platform: string | null;
  keyType: string | null;
  keyPresence: KeyPresence | null;
  downloadPresence: DownloadPresence | null;
}

const defaultFilters: FilterState = {
  search: "",
  startDate: null,
  endDate: null,
  category: null,
  platform: null,
  keyType: null,
  keyPresence: null,
  downloadPresence: null,
};

interface FilterContextValue {
  filters: FilterState;
  setFilters: (next: Partial<FilterState>) => void;
  clearFilters: () => void;
}

const FilterContext = createContext<FilterContextValue | undefined>(undefined);

/**
 * Provider that owns the filter state for the viewer.
 */
export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilterState] = useState<FilterState>(defaultFilters);

  const setFilters = useCallback((next: Partial<FilterState>) => {
    setFilterState((prev) => {
      const merged = { ...prev, ...next };
      const changed = (Object.keys(next) as Array<keyof FilterState>).some(
        (key) => prev[key] !== merged[key]
      );

      return changed ? merged : prev;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilterState((prev) => {
      const changed = (Object.keys(defaultFilters) as Array<keyof FilterState>).some(
        (key) => prev[key] !== defaultFilters[key]
      );

      return changed ? defaultFilters : prev;
    });
  }, []);

  const value = useMemo(
    () => ({
      filters,
      setFilters,
      clearFilters,
    }),
    [clearFilters, filters, setFilters]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

/**
 * Accessor hook for the filter context.
 */
export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilters must be used inside FilterProvider");
  }
  return context;
}
