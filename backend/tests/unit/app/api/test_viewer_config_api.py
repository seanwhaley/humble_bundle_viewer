"""Unit tests for viewer configuration routes."""

from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest

viewer_config_api = importlib.import_module("app.api.viewer_config")


class _ModelDumpConfig:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    def model_dump(self) -> dict[str, object]:
        return dict(self._payload)


@pytest.mark.unit
def test_resolved_setting_supports_dict_model_dump_and_attribute_sources() -> None:
    assert viewer_config_api._resolved_setting({"value": 1}, "value", 0) == 1
    assert (
        viewer_config_api._resolved_setting(
            _ModelDumpConfig({"value": 2}),
            "value",
            0,
        )
        == 2
    )
    assert (
        viewer_config_api._resolved_setting(
            SimpleNamespace(value=3),
            "value",
            0,
        )
        == 3
    )
    assert viewer_config_api._resolved_setting(object(), "missing", 7) == 7


@pytest.mark.unit
def test_get_viewer_config_uses_defaults_for_missing_values(
    api_client_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        viewer_config_api,
        "RuntimeSettings",
        lambda: SimpleNamespace(viewer={}, download={}),
    )
    client = api_client_factory(viewer_config_api.router)

    response = client.get("/api/viewer/config")

    assert response.status_code == 200
    assert response.json() == {
        "link_expiry_warning_hours": (
            viewer_config_api.DEFAULT_VIEWER_CONFIG.link_expiry_warning_hours
        ),
        "assume_revealed_keys_redeemed": (
            viewer_config_api.DEFAULT_VIEWER_CONFIG.assume_revealed_keys_redeemed
        ),
        "ignore_revealed_status_for_expired_keys": (
            viewer_config_api.DEFAULT_VIEWER_CONFIG.ignore_revealed_status_for_expired_keys
        ),
        "ignore_revealed_status_for_unexpired_keys": (
            viewer_config_api.DEFAULT_VIEWER_CONFIG.ignore_revealed_status_for_unexpired_keys
        ),
        "managed_sync_max_parallel_downloads": (
            viewer_config_api.DEFAULT_DOWNLOAD_CONFIG.managed_sync_max_parallel_downloads
        ),
        "managed_sync_manifest_history_entries": (
            viewer_config_api.DEFAULT_DOWNLOAD_CONFIG.managed_sync_manifest_history_entries
        ),
    }


@pytest.mark.unit
def test_get_viewer_config_returns_runtime_settings(
    api_client_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        viewer_config_api,
        "RuntimeSettings",
        lambda: SimpleNamespace(
            viewer=SimpleNamespace(
                link_expiry_warning_hours=72,
                assume_revealed_keys_redeemed=True,
                ignore_revealed_status_for_expired_keys=True,
                ignore_revealed_status_for_unexpired_keys=False,
            ),
            download=SimpleNamespace(
                managed_sync_max_parallel_downloads=4,
                managed_sync_manifest_history_entries=1200,
            ),
        ),
    )
    client = api_client_factory(viewer_config_api.router)

    response = client.get("/api/viewer/config")

    assert response.status_code == 200
    assert response.json() == {
        "link_expiry_warning_hours": 72,
        "assume_revealed_keys_redeemed": True,
        "ignore_revealed_status_for_expired_keys": True,
        "ignore_revealed_status_for_unexpired_keys": False,
        "managed_sync_max_parallel_downloads": 4,
        "managed_sync_manifest_history_entries": 1200,
    }
