"""Pydantic models for browser capture results."""

from __future__ import annotations

from pydantic import BaseModel, Field

from ..api_batches import ApiBatchRecord


class BrowserCaptureResult(BaseModel):
    """Result of browser library page capture operation.

    Attributes
    ----------
    captured_responses : int
        Total number of HTTP responses captured
    api_batches : int
        Number of /api/v1/orders API batch responses
    gamekeys : list[str]
        List of gamekeys extracted from page
    api_responses : list[ApiBatchRecord]
        Typed API batch response records for further processing
    """

    captured_responses: int = Field(default=0, ge=0, description="Total responses")
    api_batches: int = Field(default=0, ge=0, description="API batch responses")
    gamekeys: list[str] = Field(default_factory=list, description="Gamekeys found")
    api_responses: list[ApiBatchRecord] = Field(
        default_factory=list, description="Raw API batch data"
    )
