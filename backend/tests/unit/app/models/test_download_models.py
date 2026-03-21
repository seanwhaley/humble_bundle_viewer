"""Unit tests for download-related API models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.downloads import (
    ManagedDownloadPlanDownload,
    ManagedDownloadPlanItemRequest,
    ManagedDownloadPlanRequest,
    ManagedDownloadStreamRequest,
)


@pytest.mark.unit
class TestDownloadModels:
    """Verify request-model validation for managed download streaming."""

    def test_managed_download_stream_request_accepts_filename(self) -> None:
        request = ManagedDownloadStreamRequest(
            url="https://cdn.example.com/book.epub",
            suggested_filename="book.epub",
        )

        assert request.url.endswith("book.epub")
        assert request.suggested_filename == "book.epub"

    def test_managed_download_stream_request_rejects_empty_url(self) -> None:
        with pytest.raises(ValidationError):
            ManagedDownloadStreamRequest(url="")

    def test_managed_download_plan_download_rejects_negative_sizes(self) -> None:
        with pytest.raises(ValidationError):
            ManagedDownloadPlanDownload(
                url="https://cdn.example.com/book.epub",
                size_bytes=-1,
            )

    @pytest.mark.parametrize("field_name", ["title_id", "title", "source_bundle"])
    def test_managed_download_plan_item_request_requires_non_empty_identity_fields(
        self, field_name: str
    ) -> None:
        payload = {
            "title_id": "alpha-ebook",
            "title": "Alpha",
            "source_bundle": "Bundle A",
            "downloads": [{"url": "https://cdn.example.com/book.epub"}],
        }
        payload[field_name] = ""

        with pytest.raises(ValidationError):
            ManagedDownloadPlanItemRequest.model_validate(payload)

    def test_managed_download_plan_item_request_parses_nested_download_models(
        self,
    ) -> None:
        item = ManagedDownloadPlanItemRequest.model_validate(
            {
                "title_id": "alpha-ebook",
                "title": "Alpha",
                "source_bundle": "Bundle A",
                "downloads": [
                    {
                        "platform": "ebook",
                        "name": "EPUB",
                        "url": "https://cdn.example.com/book.epub",
                        "size_bytes": 123,
                        "checksums": {"sha256": "abc"},
                        "file_type": "epub",
                    }
                ],
            }
        )

        assert len(item.downloads) == 1
        assert item.downloads[0].url.endswith("book.epub")
        assert item.downloads[0].checksums == {"sha256": "abc"}

    def test_managed_download_plan_request_restricts_size_policy(self) -> None:
        with pytest.raises(ValidationError):
            ManagedDownloadPlanRequest(size_policy="fastest")

    def test_managed_download_plan_request_accepts_supported_size_policy(self) -> None:
        request = ManagedDownloadPlanRequest(size_policy="largest")

        assert request.size_policy == "largest"
        assert request.items == []
