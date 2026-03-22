"""Helpers for consistent runtime status output."""

from __future__ import annotations


def format_hms(seconds: float | int | None) -> str:
    """Format a duration as ``HH:MM:SS``.

    Negative and missing values are normalized to ``00:00:00`` so status output
    stays stable even when estimates are unavailable.
    """

    if seconds is None:
        total_seconds = 0
    else:
        total_seconds = max(0, int(round(float(seconds))))

    hours, remainder = divmod(total_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def estimate_eta_seconds(
    *,
    elapsed_seconds: float,
    completed_items: int,
    total_items: int,
) -> float | None:
    """Estimate remaining duration for linear-progress workloads."""

    if completed_items <= 0 or total_items <= completed_items or elapsed_seconds < 0:
        return None

    average_seconds_per_item = elapsed_seconds / completed_items
    remaining_items = total_items - completed_items
    return max(0.0, average_seconds_per_item * remaining_items)
