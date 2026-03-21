"""Unit tests for shared artifact workflow helpers."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hb_library_viewer import artifact_workflows


@pytest.mark.unit
class TestArtifactWorkflows:
    """Behavior tests for artifact workflow helpers."""

    def test_write_json_file_creates_parent_directories(self, tmp_path: Path):
        output_path = tmp_path / "nested" / "payload.json"

        artifact_workflows.write_json_file(output_path, {"status": "ok"})

        assert json.loads(output_path.read_text(encoding="utf-8")) == {"status": "ok"}

    def test_summarize_missing_paths_limits_output(self):
        assert artifact_workflows.summarize_missing_paths(set()) == ""
        assert artifact_workflows.summarize_missing_paths({"b", "a"}, limit=5) == "a, b"
        assert (
            artifact_workflows.summarize_missing_paths({"a", "b", "c"}, limit=2)
            == "a, b (+1 more)"
        )

    def test_rebuild_order_models_from_artifacts_requires_api_dir(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError):
            artifact_workflows.rebuild_order_models_from_artifacts(
                artifacts_dir=tmp_path
            )

    def test_rebuild_order_models_from_artifacts_returns_counts_and_missing_paths(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()
        model_path = tmp_path / "models.py"

        batches = [{"payload": 1}, {"payload": 2}]
        payloads = [{"id": 1}, {"id": 2}, {"id": 3}]

        monkeypatch.setattr(
            artifact_workflows,
            "load_api_response_batches",
            lambda *_args, **_kwargs: batches,
        )
        monkeypatch.setattr(
            artifact_workflows,
            "extract_order_payloads_from_batches",
            lambda *_args, **_kwargs: payloads,
        )

        def writer(*_args, model_path: Path | None = None, **_kwargs):
            assert model_path is not None
            model_path.write_text("class OrderPayloadList: ...\n", encoding="utf-8")

        monkeypatch.setattr(artifact_workflows, "write_order_model_artifacts", writer)
        monkeypatch.setattr(
            artifact_workflows,
            "find_missing_order_payload_paths",
            lambda *_args, **_kwargs: {"product.machine_name"},
        )

        result = artifact_workflows.rebuild_order_models_from_artifacts(
            artifacts_dir=tmp_path,
            order_model_path=model_path,
        )

        assert result.output_path == model_path
        assert result.payload_count == 3
        assert result.missing_paths == ["product.machine_name"]
        assert result.model_dump(mode="json")["output_path"] == str(model_path)

    def test_generate_order_models_from_api_dir_backs_up_existing_file(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()
        (api_dir / "orders_batch_001.json").write_text("{}", encoding="utf-8")
        output_models = tmp_path / "order_payload_models.py"
        output_models.write_text("old model", encoding="utf-8")

        generated: dict[str, object] = {}
        monkeypatch.setattr(
            artifact_workflows,
            "load_order_payloads",
            lambda _paths: [{"id": 1}, {"id": 2}],
        )

        def generate_stub(*, payloads, output_path: Path, class_name: str):
            generated["payloads"] = payloads
            generated["class_name"] = class_name
            output_path.write_text("new model", encoding="utf-8")

        monkeypatch.setattr(artifact_workflows, "generate_order_models", generate_stub)

        result = artifact_workflows.generate_order_models_from_api_dir(
            api_dir=api_dir,
            output_models=output_models,
            class_name="GeneratedOrders",
        )

        backup_path = tmp_path / "order_payload_models.previous.py"
        assert backup_path.exists()
        assert result.output_path == output_models
        assert result.payload_count == 2
        assert result.missing_paths == []
        assert generated["class_name"] == "GeneratedOrders"

    def test_rebuild_library_artifacts_from_api_dir_writes_library_json(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        sample_library_data,
    ):
        api_dir = tmp_path / "api_responses"
        api_dir.mkdir()
        order_model_path = tmp_path / "order_payload_models.py"
        order_model_path.write_text("class OrderPayloadList: ...\n", encoding="utf-8")
        output_products = tmp_path / "library_products.json"

        monkeypatch.setattr(
            artifact_workflows,
            "load_api_response_batches",
            lambda *_args, **_kwargs: [{"payload": 1}],
        )
        monkeypatch.setattr(
            artifact_workflows,
            "build_library_json",
            lambda *_args, **_kwargs: sample_library_data,
        )

        result = artifact_workflows.rebuild_library_artifacts_from_api_dir(
            api_dir=api_dir,
            output_products=output_products,
            order_model_path=order_model_path,
        )

        assert result.output_path == output_products
        assert result.library == sample_library_data
        payload = json.loads(output_products.read_text(encoding="utf-8"))
        assert payload["total_products"] == sample_library_data.total_products

    def test_write_viewer_schema_writes_schema_file(self, tmp_path: Path):
        schema_result = artifact_workflows.write_viewer_schema(tmp_path / "schema.json")

        payload = json.loads(schema_result.output_path.read_text(encoding="utf-8"))
        assert schema_result.output_path.name == "schema.json"
        assert schema_result.model_dump(mode="json")["output_path"] == str(
            tmp_path / "schema.json"
        )
        assert payload["title"] == "LibraryData"
