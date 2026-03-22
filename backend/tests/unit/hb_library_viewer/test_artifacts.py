"""Unit tests for artifacts helpers."""

import json
from pathlib import Path

from hb_library_viewer.artifacts import load_api_response_batches


def test_load_api_response_batches(tmp_path: Path) -> None:
    api_dir = tmp_path / "api_responses"
    api_dir.mkdir()
    batch_path = api_dir / "orders_batch_1.json"
    raw_json = json.dumps({"gamekey1": {"product": {"human_name": "Book"}}})
    batch_path.write_text(raw_json, encoding="utf-8")

    batches = load_api_response_batches(api_dir)
    assert len(batches) == 1
    assert batches[0].data
    assert batches[0].data == raw_json
    assert batches[0].model_dump()["data"]
    payload = json.loads(batches[0]["data"])
    assert payload["gamekey1"]["product"]["human_name"] == "Book"


def test_load_api_response_batches_returns_empty_for_missing_directory(
    tmp_path: Path,
    caplog,
) -> None:
    api_dir = tmp_path / "missing_api_responses"

    with caplog.at_level("DEBUG"):
        batches = load_api_response_batches(api_dir)

    assert batches == []
    assert "API artifact directory does not exist" in caplog.text


def test_load_api_response_batches_skips_invalid_json(tmp_path: Path, caplog) -> None:
    api_dir = tmp_path / "api_responses"
    api_dir.mkdir()
    batch_path = api_dir / "orders_batch_1.json"
    batch_path.write_text("{not json", encoding="utf-8")

    with caplog.at_level("WARNING"):
        batches = load_api_response_batches(api_dir)

    assert batches == []
    assert "Failed to read API batch" in caplog.text


def test_load_api_response_batches_skips_non_dict(tmp_path: Path, caplog) -> None:
    api_dir = tmp_path / "api_responses"
    api_dir.mkdir()
    batch_path = api_dir / "orders_batch_1.json"
    batch_path.write_text(json.dumps(["value"]), encoding="utf-8")

    with caplog.at_level("DEBUG"):
        batches = load_api_response_batches(api_dir)

    assert batches == []
    assert "Skipping non-dict API batch" in caplog.text
