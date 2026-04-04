/**
 * Application-wide theme provider and runtime theme switching support.
 */
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type PropsWithChildren,
} from "react";

import { usePersistentState } from "../../hooks/usePersistentState";
import {
  DEFAULT_VIEWER_THEME,
  getViewerThemeMeta,
  resolveViewerTheme,
  VIEWER_THEMES,
  VIEWER_THEME_DATA_ATTRIBUTE,
  VIEWER_THEME_STORAGE_KEY,
  type ViewerThemeId,
} from "./themes";

type ThemeContextValue = {
  theme: ViewerThemeId;
  themes: typeof VIEWER_THEMES;
  setTheme: (theme: ViewerThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [storedTheme, setStoredTheme] = usePersistentState<string>(
    VIEWER_THEME_STORAGE_KEY,
    DEFAULT_VIEWER_THEME,
  );
  const theme = resolveViewerTheme(storedTheme);

  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const { colorScheme } = getViewerThemeMeta(theme);

    root.setAttribute(VIEWER_THEME_DATA_ATTRIBUTE, theme);
    root.style.colorScheme = colorScheme;
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themes: VIEWER_THEMES,
      setTheme: setStoredTheme as (theme: ViewerThemeId) => void,
    }),
    [setStoredTheme, theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
