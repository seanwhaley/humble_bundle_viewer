"""Unit tests for viewer library API models."""

from __future__ import annotations

import importlib

import pytest

LibraryData = importlib.import_module("app.models.library").LibraryData


@pytest.mark.unit
class TestLibraryModels:
    """Verify nested viewer payload validation."""

    def test_library_data_validates_nested_payload(
        self, sample_viewer_library_payload
    ) -> None:
        library = LibraryData.model_validate(sample_viewer_library_payload)

        assert library.total_products == 1
        assert library.products[0].downloads[0].file_type == "pdf"
        assert library.products[0].downloads[0].display_label == "PDF"
        assert library.products[0].downloads[0].content_label == "PDF"
        assert library.products[0].subproducts[0].page_details is not None
        assert library.products[0].subproducts[0].page_details.title == "Sample Book"

    def test_library_models_allow_extra_fields(
        self, sample_viewer_library_payload
    ) -> None:
        sample_viewer_library_payload["products"][0]["unexpected"] = "still-here"

        library = LibraryData.model_validate(sample_viewer_library_payload)

        dumped = library.model_dump()
        assert dumped["products"][0]["unexpected"] == "still-here"
