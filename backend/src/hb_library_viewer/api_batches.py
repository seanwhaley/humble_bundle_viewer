"""Typed models for captured Humble orders API batch responses.

These records flow between browser capture, artifact workflows, model generation,
and parsing. Keeping them explicit makes the Python/shared boundary easier to
reuse from both the CLI and the viewer backend.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApiBatchRecord(BaseModel):
    """Captured or reconstructed API batch response metadata.

    The ``data`` field stores the raw JSON body text so existing downstream
    parsing and model-generation helpers can continue to validate and decode it.
    Optional metadata fields are present when the record came from live browser
    capture instead of a reconstructed artifact file.
    """

    model_config = ConfigDict(extra="allow")

    data: str = Field(..., description="Raw response body text for the batch")
    url: str | None = None
    status: int | None = None
    content_type: str | None = None
    size: int | None = Field(default=None, ge=0)
    is_json: bool | None = None
    saved_path: str | None = None
    api_saved_path: str | None = None
    json_error: str | None = None
    json_valid: bool | None = None

    def get(self, key: str, default: Any = None) -> Any:
        """Provide dict-like access for gradual migration of call sites."""

        if hasattr(self, key):
            value = getattr(self, key)
            return default if value is None else value

        extra = self.model_extra or {}
        return extra.get(key, default)

    def __getitem__(self, key: str) -> Any:
        """Support legacy subscription-style access in tests/helpers."""

        sentinel = object()
        value = self.get(key, sentinel)
        if value is sentinel:
            raise KeyError(key)
        return value


ApiBatchLike = ApiBatchRecord | dict[str, Any]


def coerce_api_batch_record(batch: ApiBatchLike) -> ApiBatchRecord:
    """Normalize a dict-like batch into ``ApiBatchRecord`` safely.

    Historical tests and recovery paths may pass partially malformed batch
    shapes. Those should remain non-fatal so higher-level parsing can skip them
    gracefully, just as it did when the batch representation was a raw dict.
    """

    if isinstance(batch, ApiBatchRecord):
        return batch

    if not isinstance(batch, dict):
        return ApiBatchRecord(data="")

    payload = dict(batch)
    data = payload.get("data")
    payload["data"] = data if isinstance(data, str) else ""
    return ApiBatchRecord.model_validate(payload)
