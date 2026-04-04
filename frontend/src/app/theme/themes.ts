/**
 * Viewer theme registry and helpers.
 */
export const VIEWER_THEMES = [
  {
    id: "hb-dark",
    label: "HB Dark",
    description: "The original HB Library Viewer dark theme.",
    colorScheme: "dark",
  },
] as const;

export type ViewerThemeId = (typeof VIEWER_THEMES)[number]["id"];

export const DEFAULT_VIEWER_THEME: ViewerThemeId = "hb-dark";
export const VIEWER_THEME_STORAGE_KEY = "humble.viewer.theme";
export const VIEWER_THEME_DATA_ATTRIBUTE = "data-theme";

export const isViewerThemeId = (value: string): value is ViewerThemeId =>
  VIEWER_THEMES.some((theme) => theme.id === value);

export const resolveViewerTheme = (value?: string | null): ViewerThemeId => {
  if (value && isViewerThemeId(value)) {
    return value;
  }

  return DEFAULT_VIEWER_THEME;
};

export const getViewerThemeMeta = (themeId: ViewerThemeId) =>
  VIEWER_THEMES.find((theme) => theme.id === themeId) ?? VIEWER_THEMES[0];
