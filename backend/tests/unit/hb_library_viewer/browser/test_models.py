"""Unit tests for browser capture result models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from hb_library_viewer.browser.models import BrowserCaptureResult


@pytest.mark.unit
class TestBrowserModels:
    """Verify BrowserCaptureResult validation and defaults."""

    def test_browser_capture_result_defaults_are_independent(self) -> None:
        first = BrowserCaptureResult()
        second = BrowserCaptureResult()

        first.gamekeys.append("order-1")
        first.api_responses.append({"batch": 1})

        assert second.gamekeys == []
        assert second.api_responses == []

    def test_browser_capture_result_accepts_response_payloads(self) -> None:
        result = BrowserCaptureResult(
            captured_responses=3,
            api_batches=1,
            gamekeys=["order-1"],
            api_responses=[{"data": "payload"}],
        )

        assert result.captured_responses == 3
        assert result.api_batches == 1
        assert result.api_responses[0]["data"] == "payload"

    def test_browser_capture_result_rejects_negative_counts(self) -> None:
        with pytest.raises(ValidationError):
            BrowserCaptureResult(captured_responses=-1)