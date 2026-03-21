"""Unit tests for runtime status helpers."""

from __future__ import annotations

import pytest

from hb_library_viewer.runtime_status import estimate_eta_seconds, format_hms


@pytest.mark.unit
class TestRuntimeStatus:
    """Verify stable duration formatting and ETA estimation."""

    @pytest.mark.parametrize(
        ("seconds", "expected"),
        [
            (None, "00:00:00"),
            (-5, "00:00:00"),
            (0, "00:00:00"),
            (59.6, "00:01:00"),
            (3661, "01:01:01"),
        ],
    )
    def test_format_hms_normalizes_values(
        self,
        seconds: float | int | None,
        expected: str,
    ) -> None:
        assert format_hms(seconds) == expected

    @pytest.mark.parametrize(
        ("elapsed_seconds", "completed_items", "total_items", "expected"),
        [
            (10.0, 2, 5, 15.0),
            (0.0, 1, 2, 0.0),
            (10.0, 0, 5, None),
            (-1.0, 1, 5, None),
            (10.0, 5, 5, None),
            (10.0, 6, 5, None),
        ],
    )
    def test_estimate_eta_seconds_handles_linear_progress(
        self,
        elapsed_seconds: float,
        completed_items: int,
        total_items: int,
        expected: float | None,
    ) -> None:
        assert (
            estimate_eta_seconds(
                elapsed_seconds=elapsed_seconds,
                completed_items=completed_items,
                total_items=total_items,
            )
            == expected
        )