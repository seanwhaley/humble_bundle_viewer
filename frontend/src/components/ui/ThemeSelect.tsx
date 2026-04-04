/**
 * Global theme selector for the viewer shell.
 */
import { Palette } from "lucide-react";

import { useTheme } from "../../app/theme/ThemeProvider";
import { COMPACT_FORM_SELECT_CLASS } from "../../styles/roles";

export default function ThemeSelect() {
  const { theme, themes, setTheme } = useTheme();

  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-overlay px-2.5 py-1.5 text-xs text-muted-foreground">
      <Palette className="h-3.5 w-3.5" />
      <span className="hidden md:inline">Theme</span>
      <select
        aria-label="Viewer theme"
        className={COMPACT_FORM_SELECT_CLASS}
        value={theme}
        onChange={(event) =>
          setTheme(event.target.value as (typeof themes)[number]["id"])
        }>
        {themes.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
