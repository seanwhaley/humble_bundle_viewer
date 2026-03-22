"""Unit tests for API model generation utilities."""

import json
from pathlib import Path
from typing import Any

import pytest

from hb_library_viewer.api_batches import ApiBatchRecord
from hb_library_viewer.model_generation import (
    _collect_schema_paths,
    _path_allowed_by_open_prefix,
    _resolve_schema_ref,
    extract_order_payloads_from_batches,
    find_missing_order_payload_paths,
    find_unknown_payload_paths,
    generate_order_models,
    iter_payload_paths,
    load_generated_order_model,
    load_order_payloads,
)


def write_batch_file(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_load_order_payloads(tmp_path: Path) -> None:
    batch_path = tmp_path / "orders_batch_1.json"
    write_batch_file(
        batch_path,
        {
            "gamekey1": {"product": {"human_name": "Book"}, "subproducts": []},
            "gamekey2": "not-a-dict",
        },
    )

    orders = load_order_payloads([batch_path])
    assert len(orders) == 1
    assert orders[0]["product"]["human_name"] == "Book"


def test_load_order_payloads_skips_invalid_json(tmp_path: Path, caplog) -> None:
    batch_path = tmp_path / "orders_batch_1.json"
    batch_path.write_text("{not json", encoding="utf-8")

    with caplog.at_level("WARNING"):
        orders = load_order_payloads([batch_path])

    assert orders == []
    assert "Failed to read" in caplog.text


def test_load_order_payloads_skips_non_dict_batch(tmp_path: Path, caplog) -> None:
    batch_path = tmp_path / "orders_batch_1.json"
    batch_path.write_text(json.dumps(["not-dict"]), encoding="utf-8")

    with caplog.at_level("DEBUG"):
        orders = load_order_payloads([batch_path])

    assert orders == []
    assert "Skipping non-dict batch" in caplog.text


def test_extract_order_payloads_from_batches() -> None:
    batches = [
        ApiBatchRecord(data=json.dumps({"key1": {"product": {"human_name": "Book"}}}))
    ]
    payloads = extract_order_payloads_from_batches(batches)
    assert payloads[0]["product"]["human_name"] == "Book"


def test_extract_order_payloads_from_batches_skips_invalid() -> None:
    batches = [
        {"data": ""},
        {"data": "not json"},
        {"data": json.dumps(["not-dict"])},
    ]

    assert extract_order_payloads_from_batches(batches) == []


def test_generate_order_models(tmp_path: Path) -> None:
    pytest.importorskip("datamodel_code_generator")

    payloads: list[dict[str, Any]] = [
        {
            "gamekey": "abc123",
            "product": {"human_name": "Sample"},
            "subproducts": [],
            "tpkd_dict": {"all_tpks": []},
        }
    ]

    output_path = tmp_path / "order_payload_models.py"
    generate_order_models(payloads, output_path, class_name="OrderPayloadList")

    generated = output_path.read_text(encoding="utf-8")
    assert "OrderPayloadList" in generated


def test_load_generated_order_model(tmp_path: Path) -> None:
    model_path = tmp_path / "order_payload_models.py"
    model_path.write_text(
        "from pydantic import BaseModel, RootModel, ConfigDict\n"
        "class OrderPayloadItem(BaseModel):\n"
        "    model_config = ConfigDict(extra='allow')\n"
        "class OrderPayloadList(RootModel[list[OrderPayloadItem]]):\n"
        "    root: list[OrderPayloadItem]\n",
        encoding="utf-8",
    )

    model_cls = load_generated_order_model(model_path)
    assert model_cls is not None


def test_load_generated_order_model_missing_file(tmp_path: Path) -> None:
    assert load_generated_order_model(tmp_path / "missing.py") is None


def test_load_generated_order_model_missing_class(tmp_path: Path) -> None:
    model_path = tmp_path / "order_payload_models.py"
    model_path.write_text("class OtherModel: pass\n", encoding="utf-8")

    assert load_generated_order_model(model_path, class_name="OrderPayloadList") is None


def test_load_generated_order_model_calls_rebuild(tmp_path: Path) -> None:
    model_path = tmp_path / "order_payload_models.py"
    model_path.write_text(
        "class OrderPayloadList:\n"
        "    rebuilt = False\n"
        "    @classmethod\n"
        "    def model_rebuild(cls, *args, **kwargs):\n"
        "        cls.rebuilt = True\n",
        encoding="utf-8",
    )

    model_cls = load_generated_order_model(model_path)
    assert model_cls is not None
    assert getattr(model_cls, "rebuilt", False) is True


def test_load_generated_order_model_missing_spec(monkeypatch, tmp_path: Path) -> None:
    model_path = tmp_path / "order_payload_models.py"
    model_path.write_text("class OrderPayloadList: pass\n", encoding="utf-8")

    monkeypatch.setattr(
        "hb_library_viewer.model_generation.importlib.util.spec_from_file_location",
        lambda *_args, **_kwargs: None,
    )

    assert load_generated_order_model(model_path) is None


def test_find_unknown_payload_paths_respects_open_dicts() -> None:
    from pydantic import BaseModel

    class ProductPayload(BaseModel):
        known: str
        meta: dict[str, Any]

    class Payload(BaseModel):
        product: ProductPayload
        tags: list[str]

    payloads = [
        {
            "product": {"known": "x", "meta": {"new": "y"}, "extra": 1},
            "tags": ["a"],
            "extra_top": 2,
        }
    ]

    missing = find_unknown_payload_paths(payloads, Payload)
    assert "extra_top" in missing
    assert "product.extra" in missing
    assert "product.meta.new" not in missing


def test_iter_payload_paths_handles_lists() -> None:
    payload = {"items": [{"name": "A"}]}
    paths = set(iter_payload_paths(payload))
    assert "items" in paths
    assert "items[]" in paths
    assert "items[].name" in paths


def test_resolve_schema_ref_invalid_and_non_dict() -> None:
    assert _resolve_schema_ref({}, "not-a-ref") == {}

    schema = {"definitions": ["bad"]}
    assert _resolve_schema_ref(schema, "#/definitions/0") == {}


def test_collect_schema_paths_handles_refs_arrays_and_additional() -> None:
    root_schema = {
        "definitions": {
            "Item": {
                "type": "object",
                "properties": {"name": {"type": "string"}},
            }
        },
        "anyOf": [{"$ref": "#/definitions/Item"}],
    }
    paths: set[str] = set()
    open_prefixes: set[str] = set()

    _collect_schema_paths(root_schema, root_schema, "", paths, open_prefixes)

    assert "name" in paths

    array_schema = {
        "type": "array",
        "items": {"type": "object", "additionalProperties": True},
    }
    array_paths: set[str] = set()
    array_open: set[str] = set()

    _collect_schema_paths(array_schema, array_schema, "", array_paths, array_open)

    assert "[]" in array_paths
    assert "[]" in array_open


def test_path_allowed_by_open_prefix() -> None:
    assert _path_allowed_by_open_prefix("anything", {""}) is True
    assert _path_allowed_by_open_prefix("root", {"root"}) is True
    assert _path_allowed_by_open_prefix("root.child", {"root"}) is True
    assert _path_allowed_by_open_prefix("other", {"root"}) is False


def test_find_missing_order_payload_paths_returns_empty(
    tmp_path: Path, monkeypatch
) -> None:
    model_path = tmp_path / "order_payload_models.py"
    model_path.write_text("class OrderPayloadList: pass\n", encoding="utf-8")

    monkeypatch.setattr(
        "hb_library_viewer.model_generation.load_generated_order_model",
        lambda *_args, **_kwargs: None,
    )

    assert find_missing_order_payload_paths([], model_path) == set()
