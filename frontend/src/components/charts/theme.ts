/**
 * Shared chart theme helpers that resolve semantic CSS tokens into concrete colors.
 */

const FALLBACKS = {
  surface: "hsl(222 47% 11%)",
  surfaceMuted: "hsl(222 41% 13.5%)",
  surfaceSoft: "hsl(222 38% 14%)",
  border: "hsl(217.2 32.6% 17.5%)",
  borderSoft: "rgba(148, 163, 184, 0.12)",
  foreground: "hsl(210 40% 98%)",
  mutedForeground: "hsl(215 20.2% 65.1%)",
  accent: "hsl(217.2 91.2% 59.8%)",
  accentSoft: "rgba(56, 189, 248, 0.18)",
  infoForeground: "hsl(205 85% 88%)",
  successForeground: "hsl(152 60% 85%)",
  warningForeground: "hsl(38 90% 90%)",
  backdrop: "rgba(15, 23, 42, 0.65)",
} as const;

const resolveCssVar = (name: string, fallback: string) => {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value ? `hsl(${value})` : fallback;
};

const resolveCssVarAlpha = (name: string, alpha: number, fallback: string) => {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value ? `hsl(${value} / ${alpha})` : fallback;
};

export const getChartTheme = () => ({
  surface: resolveCssVar("--surface-panel", FALLBACKS.surface),
  surfaceMuted: resolveCssVar("--surface-panel-strong", FALLBACKS.surfaceMuted),
  surfaceSoft: resolveCssVar("--surface-overlay", FALLBACKS.surfaceSoft),
  border: resolveCssVar("--border", FALLBACKS.border),
  borderSoft: resolveCssVarAlpha("--border", 0.12, FALLBACKS.borderSoft),
  foreground: resolveCssVar("--foreground", FALLBACKS.foreground),
  mutedForeground: resolveCssVar(
    "--muted-foreground",
    FALLBACKS.mutedForeground,
  ),
  accent: resolveCssVar("--sidebar-ring", FALLBACKS.accent),
  accentSoft: resolveCssVarAlpha("--sidebar-ring", 0.18, FALLBACKS.accentSoft),
  infoForeground: resolveCssVar(
    "--status-info-foreground",
    FALLBACKS.infoForeground,
  ),
  successForeground: resolveCssVar(
    "--status-success-foreground",
    FALLBACKS.successForeground,
  ),
  warningForeground: resolveCssVar(
    "--status-warning-foreground",
    FALLBACKS.warningForeground,
  ),
  backdrop: resolveCssVarAlpha("--background", 0.65, FALLBACKS.backdrop),
});
