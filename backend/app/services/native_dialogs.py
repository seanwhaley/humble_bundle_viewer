"""Local native dialog helpers for the viewer web app."""

from __future__ import annotations

from pathlib import Path


def pick_directory(initial_path: str | None = None) -> Path | None:
    """Open a native directory picker and return the selected folder.

    The viewer runs as a local desktop-adjacent service, so opening a native
    folder dialog is acceptable for setup workflows that need an actual OS path
    the backend can write to.
    """

    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:  # pragma: no cover - platform/environment specific
        raise RuntimeError(
            "Native folder selection is not available in this Python environment."
        ) from exc

    root: tk.Tk | None = None
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        root.update()

        chosen = filedialog.askdirectory(
            initialdir=initial_path or None,
            mustexist=False,
            title="Select a folder for library_products.json",
        )
        if not chosen:
            return None
        return Path(chosen).expanduser().resolve()
    except Exception as exc:  # pragma: no cover - platform/environment specific
        raise RuntimeError("Could not open the native folder picker.") from exc
    finally:
        if root is not None:
            root.destroy()
