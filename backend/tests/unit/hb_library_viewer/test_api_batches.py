"""Unit tests for typed API batch helpers."""

from __future__ import annotations

import pytest

from hb_library_viewer.api_batches import ApiBatchRecord, coerce_api_batch_record


@pytest.mark.unit
class TestApiBatchRecord:
    """Verify dict-like compatibility helpers for API batch records."""

    def test_get_returns_declared_values_and_default_for_none(self) -> None:
        record = ApiBatchRecord(
            data="{}", url="https://example.test/orders", status=None
        )

        assert record.get("url") == "https://example.test/orders"
        assert record.get("status", "unknown") == "unknown"

    def test_get_returns_extra_fields_and_missing_defaults(self) -> None:
        record = ApiBatchRecord.model_validate({"data": "{}", "trace_id": "abc123"})

        assert record.get("trace_id") == "abc123"
        assert record.get("missing", "fallback") == "fallback"

    def test_getitem_raises_key_error_for_unknown_keys(self) -> None:
        record = ApiBatchRecord(data="{}")

        with pytest.raises(KeyError, match="missing"):
            _ = record["missing"]


@pytest.mark.unit
class TestCoerceApiBatchRecord:
    """Verify safe normalization of batch-like objects."""

    def test_returns_existing_model_instance(self) -> None:
        record = ApiBatchRecord(data='{"orders": []}', status=200)

        assert coerce_api_batch_record(record) is record

    def test_non_mapping_input_becomes_empty_record(self) -> None:
        record = coerce_api_batch_record(["not", "a", "mapping"])

        assert isinstance(record, ApiBatchRecord)
        assert record.data == ""

    def test_missing_or_non_string_data_is_coerced_to_empty_string(self) -> None:
        numeric_data = coerce_api_batch_record({"data": 42, "status": 201})
        missing_data = coerce_api_batch_record({"url": "https://example.test/orders"})

        assert numeric_data.data == ""
        assert numeric_data.status == 201
        assert missing_data.data == ""
        assert missing_data.url == "https://example.test/orders"
