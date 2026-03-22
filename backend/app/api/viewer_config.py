"""Viewer configuration endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

from hb_library_viewer.config import DownloadConfig, RuntimeSettings, ViewerConfig

router = APIRouter(prefix="/api/viewer", tags=["viewer"])

DEFAULT_VIEWER_CONFIG = ViewerConfig()
DEFAULT_DOWNLOAD_CONFIG = DownloadConfig()


class ViewerConfigResponse(BaseModel):
    """Viewer configuration surfaced to the frontend."""

    link_expiry_warning_hours: int
    assume_revealed_keys_redeemed: bool
    ignore_revealed_status_for_expired_keys: bool
    ignore_revealed_status_for_unexpired_keys: bool
    managed_sync_max_parallel_downloads: int
    managed_sync_manifest_history_entries: int


def _resolved_setting(source: object, key: str, default: object) -> object:
    """Read a config value from a Pydantic model, dict, or test double."""

    if isinstance(source, dict):
        return source.get(key, default)

    model_dump = getattr(source, "model_dump", None)
    if callable(model_dump):
        payload = model_dump()
        if isinstance(payload, dict):
            return payload.get(key, default)

    return getattr(source, key, default)


def _resolved_int_setting(source: object, key: str, default: int) -> int:
    """Read an integer config value from a Pydantic model, dict, or test double."""

    return int(_resolved_setting(source, key, default))


def _resolved_bool_setting(source: object, key: str, default: bool) -> bool:
    """Read a boolean config value from a Pydantic model, dict, or test double."""

    return bool(_resolved_setting(source, key, default))


@router.get("/config", response_model=ViewerConfigResponse)
def get_viewer_config() -> ViewerConfigResponse:
    """Return viewer settings derived from backend/config.yaml and env overrides."""
    runtime_settings = RuntimeSettings()
    viewer_config = getattr(runtime_settings, "viewer", {})
    download_config = getattr(runtime_settings, "download", {})
    return ViewerConfigResponse(
        link_expiry_warning_hours=_resolved_int_setting(
            viewer_config,
            "link_expiry_warning_hours",
            DEFAULT_VIEWER_CONFIG.link_expiry_warning_hours,
        ),
        assume_revealed_keys_redeemed=_resolved_bool_setting(
            viewer_config,
            "assume_revealed_keys_redeemed",
            DEFAULT_VIEWER_CONFIG.assume_revealed_keys_redeemed,
        ),
        ignore_revealed_status_for_expired_keys=_resolved_bool_setting(
            viewer_config,
            "ignore_revealed_status_for_expired_keys",
            DEFAULT_VIEWER_CONFIG.ignore_revealed_status_for_expired_keys,
        ),
        ignore_revealed_status_for_unexpired_keys=_resolved_bool_setting(
            viewer_config,
            "ignore_revealed_status_for_unexpired_keys",
            DEFAULT_VIEWER_CONFIG.ignore_revealed_status_for_unexpired_keys,
        ),
        managed_sync_max_parallel_downloads=(
            _resolved_int_setting(
                download_config,
                "managed_sync_max_parallel_downloads",
                DEFAULT_DOWNLOAD_CONFIG.managed_sync_max_parallel_downloads,
            )
        ),
        managed_sync_manifest_history_entries=(
            _resolved_int_setting(
                download_config,
                "managed_sync_manifest_history_entries",
                DEFAULT_DOWNLOAD_CONFIG.managed_sync_manifest_history_entries,
            )
        ),
    )
