"""Utilities to build Pydantic models from stored API responses.

This module reads raw orders batch responses, extracts order payloads,
and can generate Pydantic v2 models using `datamodel-code-generator`.
"""

from __future__ import annotations

import importlib.util
import json
import logging
from pathlib import Path
from tempfile import TemporaryDirectory
from collections.abc import Callable
from typing import Any, Iterable, cast

from .api_batches import ApiBatchLike, coerce_api_batch_record

logger = logging.getLogger(__name__)


def load_generated_order_model(
    model_path: Path,
    class_name: str = "OrderPayloadList",
) -> type | None:
    """Load a generated order payload model class from a Python file.

    Parameters
    ----------
    model_path : Path
        Path to the generated model file.
    class_name : str
        Class name to load from the generated module.

    Returns
    -------
    type | None
        Loaded model class or None if not found.
    """
    model_path = Path(model_path)
    if not model_path.exists():
        return None

    spec = importlib.util.spec_from_file_location("order_payload_models", model_path)
    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    model_cls = getattr(module, class_name, None)
    if model_cls is None:
        return None
    rebuild = getattr(model_cls, "model_rebuild", None)
    if callable(rebuild):
        rebuild_fn = cast(Callable[..., Any], rebuild)
        # pylint cannot prove callability through getattr + callable + cast here.
        # pylint: disable-next=not-callable
        rebuild_fn(force=True, _types_namespace=module.__dict__)
    return model_cls


def load_order_payloads(api_response_paths: Iterable[Path]) -> list[dict[str, Any]]:
    """Load order payloads from stored API response files.

    Parameters
    ----------
    api_response_paths : Iterable[Path]
        Iterable of paths to orders batch JSON files.

    Returns
    -------
    list[dict[str, Any]]
        List of order payload dictionaries.
    """
    orders: list[dict[str, Any]] = []
    for path in api_response_paths:
        try:
            raw_text = path.read_text(encoding="utf-8")
            batch_data = json.loads(raw_text)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Failed to read %s: %s", path, exc)
            continue

        if not isinstance(batch_data, dict):
            logger.debug("Skipping non-dict batch %s", path)
            continue

        for gamekey, order in cast(dict[str, Any], batch_data).items():
            if not isinstance(order, dict):
                logger.debug("Skipping non-dict order %s", gamekey)
                continue
            orders.append(cast(dict[str, Any], order))

    return orders


def extract_order_payloads_from_batches(
    api_batches: Iterable[ApiBatchLike],
) -> list[dict[str, Any]]:
    """Extract order payloads from captured API batches.

    Parameters
    ----------
    api_batches : Iterable[ApiBatchLike]
        Typed or dict-like API batch records with a JSON string in ``data``.

    Returns
    -------
    list[dict[str, Any]]
        List of order payload dictionaries.
    """
    orders: list[dict[str, Any]] = []
    for batch in api_batches:
        batch_record = coerce_api_batch_record(batch)
        batch_data_str = batch_record.data
        if not batch_data_str:
            continue
        try:
            parsed = json.loads(batch_data_str)
        except json.JSONDecodeError as exc:
            logger.warning("Failed to parse API batch JSON: %s", exc)
            continue
        if not isinstance(parsed, dict):
            continue
        for _gamekey, order in cast(dict[str, Any], parsed).items():
            if isinstance(order, dict):
                orders.append(cast(dict[str, Any], order))
    return orders


def iter_payload_paths(value: Any, prefix: str = "") -> Iterable[str]:
    """Yield dotted-path strings describing nested payload structure."""
    if isinstance(value, dict):
        for key, child in cast(dict[str, Any], value).items():
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            yield next_prefix
            yield from iter_payload_paths(child, next_prefix)
    elif isinstance(value, list):
        list_prefix = f"{prefix}[]" if prefix else "[]"
        yield list_prefix
        for item in cast(list[Any], value):
            yield from iter_payload_paths(item, list_prefix)


def _resolve_schema_ref(schema: dict[str, Any], ref: str) -> dict[str, Any]:
    if not ref.startswith("#/"):
        return {}
    parts = ref.lstrip("#/").split("/")
    node: Any = schema
    for part in parts:
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict):
            return {}
        node = node.get(part)
        if node is None:
            return {}
    return cast(dict[str, Any], node)


# pylint: disable=too-many-branches
def _collect_schema_paths(
    schema_node: dict[str, Any],
    root_schema: dict[str, Any],
    prefix: str,
    paths: set[str],
    open_prefixes: set[str],
) -> None:
    if not isinstance(schema_node, dict):
        return

    if "$ref" in schema_node:
        resolved = _resolve_schema_ref(root_schema, schema_node["$ref"])
        if resolved:
            _collect_schema_paths(resolved, root_schema, prefix, paths, open_prefixes)
        return

    for key in ("anyOf", "oneOf", "allOf"):
        if key in schema_node:
            for option in schema_node.get(key, []):
                _collect_schema_paths(
                    cast(dict[str, Any], option),
                    root_schema,
                    prefix,
                    paths,
                    open_prefixes,
                )
            return

    if schema_node.get("type") == "array" or "items" in schema_node:
        list_prefix = f"{prefix}[]" if prefix else "[]"
        paths.add(list_prefix)
        items_schema = schema_node.get("items", {})
        if isinstance(items_schema, dict):
            _collect_schema_paths(
                items_schema,
                root_schema,
                list_prefix,
                paths,
                open_prefixes,
            )
        return

    properties = schema_node.get("properties")
    additional = schema_node.get("additionalProperties")
    if properties or schema_node.get("type") == "object" or additional is not None:
        if not properties:
            open_prefixes.add(prefix)
            return

        for prop_name, prop_schema in properties.items():
            next_prefix = f"{prefix}.{prop_name}" if prefix else str(prop_name)
            paths.add(next_prefix)
            if isinstance(prop_schema, dict):
                _collect_schema_paths(
                    prop_schema,
                    root_schema,
                    next_prefix,
                    paths,
                    open_prefixes,
                )

        if additional:
            open_prefixes.add(prefix)

    # pylint: enable=too-many-branches


def _collect_model_paths(model_cls: type) -> tuple[set[str], set[str]]:
    schema = cast(dict[str, Any], model_cls.model_json_schema())
    root_schema = schema
    if schema.get("type") == "array" and isinstance(schema.get("items"), dict):
        schema = cast(dict[str, Any], schema["items"])

    paths: set[str] = set()
    open_prefixes: set[str] = set()
    _collect_schema_paths(schema, root_schema, "", paths, open_prefixes)
    return paths, open_prefixes


def _path_allowed_by_open_prefix(path: str, open_prefixes: set[str]) -> bool:
    for prefix in open_prefixes:
        if prefix == "":
            return True
        if path == prefix:
            return True
        if path.startswith(f"{prefix}."):
            return True
    return False


def find_unknown_payload_paths(
    payloads: Iterable[dict[str, Any]],
    model_cls: type,
) -> set[str]:
    """Identify payload paths not represented in a Pydantic model schema."""
    payload_paths: set[str] = set()
    for payload in payloads:
        payload_paths.update(iter_payload_paths(payload))

    schema_paths, open_prefixes = _collect_model_paths(model_cls)
    return {
        path
        for path in payload_paths
        if path not in schema_paths
        and not _path_allowed_by_open_prefix(path, open_prefixes)
    }


def find_missing_order_payload_paths(
    api_batches: Iterable[ApiBatchLike],
    model_path: Path,
    class_name: str = "OrderPayloadList",
) -> set[str]:
    """Compare API payloads with a generated order model and return missing paths."""
    model_cls = load_generated_order_model(model_path, class_name)
    if model_cls is None:
        return set()

    payloads = extract_order_payloads_from_batches(api_batches)
    if not payloads:
        return set()

    return find_unknown_payload_paths(payloads, model_cls)


def generate_order_models(
    payloads: list[dict[str, Any]],
    output_path: Path,
    class_name: str = "OrderPayloadList",
) -> None:
    """Generate Pydantic v2 models from order payload samples.

    Parameters
    ----------
    payloads : list[dict[str, Any]]
        Order payload samples (one per game key).
    output_path : Path
        Output file path for generated models.
    class_name : str
        Root class name for the generated models.
    """
    if not payloads:
        raise ValueError("No order payloads provided for model generation")

    try:
        # pylint: disable=import-outside-toplevel
        from datamodel_code_generator import (  # type: ignore[import-not-found]
            InputFileType,
            generate,
        )
        from datamodel_code_generator.enums import (  # type: ignore[import-not-found]
            DataModelType,
        )
        from datamodel_code_generator.format import (  # type: ignore[import-not-found]
            Formatter,
        )
    except ImportError as exc:  # pragma: no cover - handled in tests
        raise RuntimeError(
            "datamodel-code-generator is required. Install it from requirements-dev.txt."
        ) from exc

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with TemporaryDirectory() as tmp_dir:
        sample_path = Path(tmp_dir) / "order_payload_samples.json"
        sample_path.write_text(
            json.dumps(payloads, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        data_model_type = cast(Any, DataModelType)
        input_file_type = cast(Any, InputFileType)
        output_model_type = getattr(
            data_model_type,
            "PydanticV2BaseModel",
            data_model_type.PydanticBaseModel,
        )

        generate(
            input_=sample_path,
            input_file_type=input_file_type.Json,
            output=output_path,
            output_model_type=output_model_type,
            class_name=class_name,
            formatters=[Formatter.BLACK, Formatter.ISORT],
        )
