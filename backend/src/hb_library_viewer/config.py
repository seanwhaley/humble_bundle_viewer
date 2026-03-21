"""Configuration management with Pydantic v2.

This module provides:
- Nested Pydantic models for configuration sections
- BaseSettings with environment variable + YAML file + defaults
- Custom validators for all constraints
- ConfigError exceptions with helpful messages

Configuration loading priority:
1. Environment variables (HUMBLE_* prefix, supports nesting with __)
2. backend/.env file (secrets only)
3. backend/config.yaml (non-secrets)
4. Default values

Examples
--------
Load configuration from all sources:

    >>> from hb_library_viewer.config import Settings  # doctest: +SKIP
    >>> config = Settings()  # doctest: +SKIP
    >>> print(config.auth_cookie)  # doctest: +SKIP
    session_cookie_value_here

Load from specific file:

    >>> from hb_library_viewer.config import Settings  # doctest: +SKIP
    >>> config = Settings(_env_file=".env.local")  # doctest: +SKIP
    >>> print(config.browser.timeout_ms)  # doctest: +SKIP
    60000
"""

# pylint: disable=no-member,too-many-lines

import os
from pathlib import Path
from typing import Annotated, Any, Optional, TYPE_CHECKING, TypeVar, cast
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)
import yaml

from .utils import ConfigError


BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
DEFAULT_ENV_PATH = BACKEND_ROOT / ".env"
DEFAULT_CONFIG_PATH = BACKEND_ROOT / "config.yaml"
DEFAULT_ARTIFACTS_DIR = REPO_ROOT / "data" / "artifacts"
DEFAULT_SUBPRODUCT_PAGES_DIR = DEFAULT_ARTIFACTS_DIR / "subproduct_pages"
DEFAULT_VIEWER_SCHEMA_OUTPUT = (
    REPO_ROOT / "docs" / "tools" / "library-products-schema.json"
)
DEFAULT_CURRENT_BUNDLES_DIR = DEFAULT_ARTIFACTS_DIR / "current_bundles"
DEFAULT_CURRENT_CHOICE_DIR = DEFAULT_ARTIFACTS_DIR / "current_choice"
CURRENT_BUNDLE_TYPES = ("games", "books", "software")


# =============== CONSTRAINED TYPES ===============
# Reusable constrained type for positive integers
PositiveInt = Annotated[int, Field(gt=0, description="Must be positive")]
PositiveFloat = Annotated[float, Field(gt=0, description="Must be positive")]

ConfigSectionModelT = TypeVar("ConfigSectionModelT", bound=BaseModel)


def _normalize_retry_statuses(v: list[int] | None) -> list[int] | None:
    """Ensure retryable statuses are valid HTTP error codes."""
    if v is None:
        return None

    normalized: list[int] = []
    seen: set[int] = set()
    for status in v:
        if status < 400 or status > 599:
            raise ValueError(
                "retry_statuses values must be HTTP status codes between 400 and 599"
            )
        if status not in seen:
            seen.add(status)
            normalized.append(status)
    return normalized


def _normalize_retry_backoff_seconds(v: list[float] | None) -> list[float] | None:
    """Ensure retry backoff delays are positive."""
    if v is None:
        return None

    normalized: list[float] = []
    for delay in v:
        if delay <= 0:
            raise ValueError("retry_backoff_seconds values must be greater than 0")
        normalized.append(float(delay))
    return normalized


def _normalize_current_bundle_types(v: list[str] | None) -> list[str]:
    """Normalize, validate, and deduplicate configured current bundle types."""
    raw_values = v or list(CURRENT_BUNDLE_TYPES)

    normalized: list[str] = []
    seen: set[str] = set()
    for value in raw_values:
        cleaned = str(value).strip().lower()
        if cleaned not in CURRENT_BUNDLE_TYPES:
            raise ValueError(
                "bundle_types values must be one of: " + ", ".join(CURRENT_BUNDLE_TYPES)
            )
        if cleaned not in seen:
            seen.add(cleaned)
            normalized.append(cleaned)

    if not normalized:
        raise ValueError("bundle_types must include at least one bundle type")

    return normalized


def _load_yaml_config(config_path: Path) -> dict[str, Any]:
    """Load configuration values from a YAML file.

    Parameters
    ----------
    config_path : Path
        Path to a YAML configuration file.

    Returns
    -------
    dict[str, Any]
        Parsed configuration dictionary (empty if file not found).

    Raises
    ------
    ConfigError
        If the YAML file is invalid or cannot be parsed.
    """
    if not config_path.exists():
        return {}

    try:
        data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigError(f"Failed to read config YAML '{config_path}': {exc}") from exc

    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ConfigError(
            f"Config YAML '{config_path}' must contain a mapping at root."
        )
    return data


def _expand_config_path(value: str | Path | None) -> Path | None:
    """Expand an optional config path relative to the repository root."""
    if value is None:
        return None

    path = value.expanduser() if isinstance(value, Path) else Path(value).expanduser()
    if not path.is_absolute():
        path = (REPO_ROOT / path).resolve()
    else:
        path = path.resolve()
    return path


def resolve_config_path(config_path: Path | None = None) -> Path:
    """Resolve the active config YAML path."""
    if config_path is not None:
        return config_path.expanduser().resolve()

    config_env = os.getenv("HUMBLE_CONFIG_YAML")
    if config_env:
        return Path(config_env).expanduser().resolve()

    return DEFAULT_CONFIG_PATH


def default_api_responses_dir(artifacts_dir: Path | None = None) -> Path:
    """Return the default API-response snapshot directory for an artifacts root."""

    return (artifacts_dir or DEFAULT_ARTIFACTS_DIR) / "api_responses"


def default_library_products_path(artifacts_dir: Path | None = None) -> Path:
    """Return the default library_products.json path for an artifacts root."""

    return (artifacts_dir or DEFAULT_ARTIFACTS_DIR) / "library_products.json"


def default_order_model_path(artifacts_dir: Path | None = None) -> Path:
    """Return the default generated order-model path for an artifacts root."""

    return (artifacts_dir or DEFAULT_ARTIFACTS_DIR) / "order_payload_models.py"


def default_subproduct_metadata_path(cache_dir: Path | None = None) -> Path:
    """Return the default extracted subproduct metadata path for a cache root."""

    return (cache_dir or DEFAULT_SUBPRODUCT_PAGES_DIR) / "metadata.json"


def _load_config_section(
    section_name: str,
    model_cls: type[ConfigSectionModelT],
    config_path: Path | None = None,
) -> ConfigSectionModelT:
    """Load and validate a single top-level config section from YAML."""
    resolved_path = resolve_config_path(config_path)
    yaml_data = _load_yaml_config(resolved_path)
    raw_section = yaml_data.get(section_name, {})
    if raw_section is None:
        raw_section = {}
    if not isinstance(raw_section, dict):
        raise ConfigError(f"{section_name} config must be a mapping")
    return model_cls.model_validate(raw_section)


class BrowserCaptureConfig(BaseModel):
    """Timing controls for library page capture waits and polling."""

    load_timeout_ms: PositiveInt = Field(
        default=30000,
        description="Timeout for the page load state after initial navigation",
    )
    network_idle_timeout_ms: PositiveInt = Field(
        default=30000,
        description="Timeout for the network-idle wait used before capture validation",
    )
    javascript_settle_seconds: PositiveFloat = Field(
        default=5.0,
        description="Delay after load-state waits so page JavaScript can settle",
    )
    scroll_settle_seconds: PositiveFloat = Field(
        default=2.0,
        description="Delay after scroll-based lazy-load triggers",
    )
    api_wait_timeout_seconds: PositiveFloat = Field(
        default=45.0,
        description="Maximum time to wait for API responses to appear",
    )
    api_poll_interval_seconds: PositiveFloat = Field(
        default=3.0,
        description="Polling interval while waiting for API responses",
    )
    api_progress_log_interval_seconds: PositiveFloat = Field(
        default=15.0,
        description="Progress-log cadence while waiting for API responses",
    )
    post_first_batch_delay_seconds: PositiveFloat = Field(
        default=8.0,
        description="Extra delay after the first API batch is captured",
    )
    post_capture_delay_seconds: PositiveFloat = Field(
        default=10.0,
        description="Final grace period for additional API batches after capture succeeds",
    )


# =============== NESTED CONFIGURATION MODELS ===============
class BrowserConfig(BaseModel):
    """Browser automation settings.

    Parameters
    ----------
    headless : bool
        Run browser without visible window (default: True)
    timeout_ms : int
        Page load timeout in milliseconds (default: 60000, must be > 0)
    user_agent : str, optional
        Custom browser user agent string (default: Chrome user agent)

    Examples
    --------
    >>> config = BrowserConfig(headless=True, timeout_ms=60000)
    >>> config.timeout_ms
    60000
    """

    headless: bool = Field(default=True, description="Run browser headless")
    timeout_ms: PositiveInt = Field(
        default=60000, description="Page load timeout in milliseconds"
    )
    user_agent: str = Field(
        default="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        description="Custom browser user agent (optional)",
    )
    capture: BrowserCaptureConfig = Field(
        default_factory=BrowserCaptureConfig,
        description="Capture-specific timing controls for library page automation",
    )

    @field_validator("timeout_ms")
    @classmethod
    def validate_timeout(cls, v: int) -> int:
        """Ensure timeout is reasonable (between 1ms and 5 minutes)."""
        if v < 1000:
            raise ValueError("timeout_ms must be at least 1000 (1 second)")
        if v > 300000:
            raise ValueError("timeout_ms must not exceed 300000 (5 minutes)")
        return v


class ProxyConfig(BaseModel):
    """Proxy configuration for HTTP requests.

    Parameters
    ----------
    enabled : bool
        Whether to use proxy (default: False)
    url : str, optional
        Proxy URL (e.g., "http://proxy.example.com:8080")
    username : str, optional
        Proxy username
    password : str, optional
        Proxy password (prefer HUMBLE_PROXY__PASSWORD in backend/.env)

    Examples
    --------
    >>> config = ProxyConfig(enabled=False)
    >>> config.enabled
    False

    >>> config = ProxyConfig(  # doctest: +SKIP
    ...     enabled=True,
    ...     url="http://proxy.example.com:8080",
    ...     username="user"
    ... )
    """

    enabled: bool = Field(default=False, description="Enable proxy")
    url: Optional[str] = Field(default=None, description="Proxy URL")
    username: Optional[str] = Field(default=None, description="Proxy username")
    password: Optional[str] = Field(default=None, description="Proxy password")

    @model_validator(mode="after")
    def check_enabled_requires_url(self) -> "ProxyConfig":
        """If proxy enabled, URL is required."""
        if self.enabled and not self.url:
            raise ValueError("proxy.url is required when proxy.enabled is True")
        return self


class DownloadConfig(BaseModel):
    """Download and file handling settings.

    Parameters
    ----------
    base_folder : Path
        Directory to save downloaded files (supports ~ and relative paths)
    max_retries : int
        Maximum retry attempts for failed downloads (default: 3)
    retry_delay_seconds : PositiveInt
        Delay between retry attempts in seconds (default: 2)
    rate_limit_delay : float
        Minimum delay between HTTP requests in seconds (default: 0.5)
        IMPORTANT: Never set below 0.5 to respect server resources
    prompt_before_download : bool
        Require confirmation before downloading files (default: True)
    force_individual_file_downloads : Optional[bool]
        Force download decision (True=download, False=skip, None=prompt)
    prompt_timeout_seconds : PositiveInt
        Seconds to wait for confirmation before skipping downloads (default: 30)
    managed_sync_max_parallel_downloads : int
        Maximum browser-managed sync files to process concurrently (default: 3)
    managed_sync_manifest_history_entries : PositiveInt
        Maximum managed-sync history entries to retain in the manifest (default: 5000)

    Examples
    --------
    >>> config = DownloadConfig(base_folder="./Downloads")  # doctest: +SKIP
    >>> config.base_folder  # doctest: +SKIP
    Path('Downloads')

    >>> config = DownloadConfig(
    ...     base_folder="~/Humble_Library",
    ...     max_retries=5
    ... )  # doctest: +SKIP
    """

    base_folder: Path = Field(
        default=Path("./Humble_Library_Downloads"),
        description="Directory for downloaded files",
    )
    max_retries: int = Field(
        default=3, ge=1, le=10, description="Maximum retry attempts"
    )
    retry_delay_seconds: PositiveInt = Field(
        default=2, description="Delay between retries (seconds)"
    )
    rate_limit_delay: float = Field(
        default=0.5,
        ge=0.5,
        description="Minimum delay between requests (seconds, min 0.5)",
    )
    prompt_before_download: bool = Field(
        default=True,
        description="Require confirmation before downloading files",
    )
    force_individual_file_downloads: Optional[bool] = Field(
        default=None,
        description="Force download decision (True=download, False=skip, None=prompt)",
    )
    prompt_timeout_seconds: PositiveInt = Field(
        default=30,
        ge=1,
        le=300,
        description="Seconds to wait for download confirmation",
    )
    stream_timeout_seconds: PositiveInt = Field(
        default=300,
        description="Timeout for streaming download requests in seconds",
    )
    connect_timeout_seconds: PositiveInt = Field(
        default=10,
        description="Timeout for opening download streams in seconds",
    )
    managed_sync_max_parallel_downloads: int = Field(
        default=3,
        ge=1,
        le=8,
        description=(
            "Maximum number of browser-managed sync files to process concurrently"
        ),
    )
    managed_sync_manifest_history_entries: PositiveInt = Field(
        default=5000,
        le=50000,
        description="Maximum managed-sync history entries to retain in the manifest",
    )

    @field_validator("base_folder", mode="before")
    @classmethod
    def expand_path(cls, v):
        """Convert download folder paths to absolute paths rooted at the repo."""

        return _expand_config_path(v)


class APIConfig(BaseModel):
    """API configuration.

    Parameters
    ----------
    endpoint : str
        Humble Bundle API endpoint (default: https://www.humblebundle.com)
    timeout : int
        API request timeout in seconds (default: 30)
    max_response_batches : int
        Maximum API batch responses to capture (default: 7)
    per_key_max_retries : int
        Retries per missing gamekey (default: 2)

    Examples
    --------
    >>> config = APIConfig()
    >>> config.endpoint
    'https://www.humblebundle.com'
    """

    endpoint: str = Field(
        default="https://www.humblebundle.com",
        description="API endpoint URL",
    )
    timeout: PositiveInt = Field(default=30, description="Request timeout in seconds")
    max_response_batches: PositiveInt = Field(
        default=7, description="Maximum batches to capture"
    )
    per_key_max_retries: PositiveInt = Field(
        default=2, description="Retries per missing gamekey"
    )

    @field_validator("endpoint")
    @classmethod
    def normalize_endpoint(cls, v: str) -> str:
        """Normalize the configured Humble base URL."""
        normalized = (v or "").strip().rstrip("/")
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("endpoint must be an absolute http(s) URL")
        return f"{parsed.scheme}://{parsed.netloc}"

    def build_url(self, path_or_url: str) -> str:
        """Return an absolute URL using the configured site endpoint."""
        normalized = (path_or_url or "").strip()
        if not normalized:
            return self.endpoint
        if normalized.startswith(("http://", "https://")):
            return normalized
        if normalized.startswith("/"):
            return f"{self.endpoint}{normalized}"
        return f"{self.endpoint}/{normalized}"

    def library_url(self) -> str:
        """Return the configured library page URL."""
        return self.build_url("/home/library")


class ServerConfig(BaseModel):
    """Backend runtime settings for local viewer/server behavior."""

    cors_allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        description="Origins allowed to call the local viewer backend",
    )

    @field_validator("cors_allowed_origins")
    @classmethod
    def normalize_cors_allowed_origins(cls, v: list[str]) -> list[str]:
        """Normalize and deduplicate configured CORS origins."""
        normalized: list[str] = []
        seen: set[str] = set()
        for origin in v:
            cleaned = str(origin).strip().rstrip("/")
            if not cleaned:
                raise ValueError("cors_allowed_origins entries must be non-empty")
            if cleaned not in seen:
                seen.add(cleaned)
                normalized.append(cleaned)
        return normalized


class LoggingConfig(BaseModel):
    """Logging configuration.

    Parameters
    ----------
    level : str
        Log level: "debug", "info", "warning", "error" (default: "info")
    format : str
        Log message format string (default: "%(asctime)s - %(name)s - %(levelname)s - %(message)s")

    Examples
    --------
    >>> config = LoggingConfig(level="debug")
    >>> config.level
    'debug'
    """

    level: str = Field(default="info", description="Log level")
    format: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        description="Log format",
    )

    @field_validator("level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Ensure log level is valid."""
        valid_levels = {"debug", "info", "warning", "error", "critical"}
        v_lower = v.lower()
        if v_lower not in valid_levels:
            raise ValueError(f"level must be one of {valid_levels}, got '{v}'")
        return v_lower


class ViewerConfig(BaseModel):
    """Viewer-specific settings for the web UI.

    Parameters
    ----------
    link_expiry_warning_hours : PositiveInt
        Number of hours before expiry to mark links as expiring.
    assume_revealed_keys_redeemed : bool
        Treat revealed keys as already redeemed/handled by default.
    ignore_revealed_status_for_expired_keys : bool
        Continue surfacing expired rows even when their keys were revealed.
    ignore_revealed_status_for_unexpired_keys : bool
        Keep revealed unexpired rows in open-window review scopes.
    """

    link_expiry_warning_hours: PositiveInt = Field(
        default=24,
        description="Hours before expiry to warn about download links",
    )
    default_library_dir: Path | None = Field(
        default=None,
        description=(
            "Optional default folder shown by the viewer setup flow when "
            "saving or selecting library_products.json"
        ),
    )
    library_path: Path | None = Field(
        default=None,
        description=(
            "Optional default library_products.json path used by the viewer "
            "backend when no runtime override has been selected"
        ),
    )
    assume_revealed_keys_redeemed: bool = Field(
        default=True,
        description=(
            "Treat revealed keys as already redeemed/handled in viewer key triage"
        ),
    )
    ignore_revealed_status_for_expired_keys: bool = Field(
        default=True,
        description=(
            "Ignore reveal status for expired keys so expired rows remain visible "
            "as reference items"
        ),
    )
    ignore_revealed_status_for_unexpired_keys: bool = Field(
        default=False,
        description=(
            "Ignore reveal status for unexpired keys so revealed keys stay in "
            "open-window review queues"
        ),
    )

    @field_validator("default_library_dir", "library_path", mode="before")
    @classmethod
    def expand_optional_paths(cls, v: str | Path | None) -> Path | None:
        """Expand optional viewer paths relative to the backend root."""
        return _expand_config_path(v)


class CurrentBundlesConfig(BaseModel):
    """Current-bundle overlap analysis settings."""

    base_dir: Path = Field(
        default=DEFAULT_CURRENT_BUNDLES_DIR,
        description="Base directory for current bundle overlap artifacts",
    )
    library_path: Path | None = Field(
        default=None,
        description=(
            "Optional library_products.json path used for current bundle overlap "
            "analysis when no explicit override is provided"
        ),
    )
    bundle_types: list[str] = Field(
        default_factory=lambda: list(CURRENT_BUNDLE_TYPES),
        description="Current bundle categories to analyze",
    )
    timeout_seconds: PositiveInt = Field(
        default=30,
        description="Timeout for current bundle index and page requests in seconds",
    )

    @field_validator("base_dir", "library_path", mode="before")
    @classmethod
    def expand_optional_paths(cls, v: str | Path | None) -> Path | None:
        """Expand current-bundle paths relative to the repository root."""
        return _expand_config_path(v)

    @field_validator("bundle_types")
    @classmethod
    def validate_bundle_types(cls, v: list[str]) -> list[str]:
        """Normalize configured current bundle types."""
        return _normalize_current_bundle_types(v)


class CurrentChoiceConfig(BaseModel):
    """Current Humble Choice overlap analysis settings."""

    base_dir: Path = Field(
        default=DEFAULT_CURRENT_CHOICE_DIR,
        description="Base directory for current Humble Choice overlap artifacts",
    )
    library_path: Path | None = Field(
        default=None,
        description=(
            "Optional library_products.json path used for current Humble Choice "
            "overlap analysis when no explicit override is provided"
        ),
    )
    timeout_seconds: PositiveInt = Field(
        default=30,
        description="Timeout for current Humble Choice page requests in seconds",
    )

    @field_validator("base_dir", "library_path", mode="before")
    @classmethod
    def expand_optional_paths(cls, v: str | Path | None) -> Path | None:
        """Expand current-choice paths relative to the repository root."""
        return _expand_config_path(v)


class SubproductPageSearchScoringConfig(BaseModel):
    """Advanced heuristics for host-specific subproduct page recovery scoring."""

    query_subset_score: float = Field(
        default=0.96,
        ge=0.0,
        le=1.0,
        description=(
            "Score assigned when all query tokens are present in a candidate " "title"
        ),
    )
    candidate_subset_score: float = Field(
        default=0.93,
        ge=0.0,
        le=1.0,
        description=(
            "Score assigned when all candidate-title tokens are present in the " "query"
        ),
    )
    matching_format_bonus: float = Field(
        default=0.05,
        ge=0.0,
        le=1.0,
        description=(
            "Bonus added when a candidate format matches the expected media " "type"
        ),
    )
    mismatched_format_penalty: float = Field(
        default=0.25,
        ge=0.0,
        le=1.0,
        description=(
            "Penalty applied when a candidate format conflicts with the "
            "expected media type"
        ),
    )


class ArtifactsConfig(BaseModel):
    """Artifact output settings.

    Parameters
    ----------
    base_dir : Path
        Base directory for all artifact outputs
        (default: data/artifacts)
    save_api_batches : bool
        Persist /api/v1/orders batch responses (default: True)
    save_captured_responses : bool
        Persist raw captured responses (library HTML + API responses)
        (default: False)
    save_html_on_failure : bool
        Persist the library HTML only when capture fails (no API responses or
        missing batches)
        (default: True)
    save_gamekeys : bool
        Persist extracted gamekeys to data/artifacts/gamekeys.json (default: False)
    auto_rebuild_order_models : bool
        Automatically rebuild order payload models when new fields are detected
        (default: True)

    Examples
    --------
    >>> config = ArtifactsConfig(save_captured_responses=False)
    >>> config.save_api_batches
    True
    """

    base_dir: Path = Field(
        default=DEFAULT_ARTIFACTS_DIR,
        description="Base directory for artifact outputs",
    )

    save_api_batches: bool = Field(
        default=True,
        description="Save /api/v1/orders batches to data/artifacts/api_responses",
    )
    save_captured_responses: bool = Field(
        default=False,
        description="Save raw captured responses to data/artifacts/captured_responses",
    )
    save_html_on_failure: bool = Field(
        default=True,
        description=(
            "Save library HTML only when capture fails (no API responses or missing batches)"
        ),
    )
    save_gamekeys: bool = Field(
        default=False,
        description="Save extracted gamekeys to data/artifacts/gamekeys.json",
    )
    auto_rebuild_order_models: bool = Field(
        default=True,
        description=(
            "Automatically rebuild order payload models when new fields are detected"
        ),
    )

    @field_validator("base_dir", mode="before")
    @classmethod
    def expand_base_dir(cls, v):
        """Convert artifact base dir to an absolute Path rooted at the repo."""

        return _expand_config_path(v)


class SubproductPageHostPolicy(BaseModel):
    """Optional per-host overrides for subproduct page fetch behavior."""

    browser_fallback: bool = Field(
        default=False,
        description="Attempt a Playwright browser fetch after direct-request failures for this host",
    )
    search_on_404: bool = Field(
        default=False,
        description="Attempt a host-specific site search after a direct 404 for this host",
    )
    min_match_confidence: float = Field(
        default=0.9,
        ge=0.0,
        le=1.0,
        description="Minimum confidence required to accept a host-specific site-search replacement",
    )
    browser_timeout_ms: PositiveInt | None = Field(
        default=None,
        description="Optional Playwright page timeout override for browser fallback on this host",
    )
    rate_limit_delay: float | None = Field(
        default=None,
        ge=0.5,
        description="Override minimum delay between requests for this host (seconds)",
    )
    retry_statuses: list[int] | None = Field(
        default=None,
        description="Override retryable HTTP status codes for this host",
    )
    retry_backoff_seconds: list[float] | None = Field(
        default=None,
        description="Override retry backoff schedule for this host",
    )
    respect_retry_after: bool | None = Field(
        default=None,
        description="Override whether Retry-After headers are honored for this host",
    )
    max_retry_after_seconds: PositiveInt | None = Field(
        default=None,
        description="Override the maximum Retry-After delay honored for this host",
    )
    retry_transport_failures: bool | None = Field(
        default=None,
        description="Override whether transient transport failures are retried for this host",
    )

    @field_validator("retry_statuses")
    @classmethod
    def validate_retry_statuses(cls, v: list[int] | None) -> list[int] | None:
        """Ensure retryable statuses are valid when provided."""
        return _normalize_retry_statuses(v)

    @field_validator("retry_backoff_seconds")
    @classmethod
    def validate_retry_backoff_seconds(
        cls, v: list[float] | None
    ) -> list[float] | None:
        """Ensure retry backoff delays are positive when provided."""
        return _normalize_retry_backoff_seconds(v)


class SubproductPageCacheConfig(BaseModel):
    """Caching settings for external subproduct info pages."""

    base_dir: Path = Field(
        default=DEFAULT_SUBPRODUCT_PAGES_DIR,
        description="Base directory for cached subproduct page artifacts",
    )
    redownload_existing: bool = Field(
        default=False,
        description="Re-fetch pages even when a cached HTML copy already exists",
    )
    request_timeout_seconds: PositiveInt = Field(
        default=30,
        description="Timeout for external page requests in seconds",
    )
    connect_timeout_seconds: PositiveInt = Field(
        default=10,
        description="Connect timeout for external page requests in seconds",
    )
    rate_limit_delay: float = Field(
        default=0.5,
        ge=0.5,
        description="Minimum delay between external page requests (seconds)",
    )
    domain_workers: PositiveInt = Field(
        default=4,
        description=(
            "Maximum number of domains to process concurrently; each domain remains serial and rate-limited"
        ),
    )
    domain_check_timeout_seconds: PositiveInt = Field(
        default=3,
        description=(
            "Timeout for DNS/TCP/TLS domain diagnostics after unresolved transport failures"
        ),
    )
    max_failures: PositiveInt | None = Field(
        default=5,
        description=(
            "Abort a cache run after this many consecutive non-HTTP page fetch failures; set to null to never abort early"
        ),
    )
    retry_statuses: list[int] = Field(
        default_factory=lambda: [429, 500, 502, 503, 504, 522],
        description="HTTP status codes that should be retried before recording a failure",
    )
    retry_backoff_seconds: list[float] = Field(
        default_factory=lambda: [5.0, 15.0, 30.0],
        description="Retry backoff schedule for transient subproduct page fetch failures",
    )
    respect_retry_after: bool = Field(
        default=True,
        description="Honor Retry-After headers for retryable HTTP responses when present",
    )
    max_retry_after_seconds: PositiveInt = Field(
        default=120,
        description="Maximum Retry-After delay to honor for a single retry attempt",
    )
    retry_transport_failures: bool = Field(
        default=True,
        description="Retry transient transport failures such as timeouts and connection resets",
    )
    progress_log_every: PositiveInt = Field(
        default=25,
        description=(
            "Log cache progress after this many processed URLs during long runs"
        ),
    )
    search_scoring: SubproductPageSearchScoringConfig = Field(
        default_factory=SubproductPageSearchScoringConfig,
        description="Advanced scoring heuristics for site-search replacement matching",
    )
    host_policies: dict[str, SubproductPageHostPolicy] = Field(
        default_factory=dict,
        description="Optional per-host overrides for retry pacing and retry behavior",
    )
    log_path: Path | None = Field(
        default=None,
        description="Optional plain-text log path for cache runs; defaults to <base_dir>/cache_run.log in the CLI",
    )
    user_agent: str = Field(
        default="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        description="User agent for external page requests",
    )

    @field_validator("host_policies", mode="before")
    @classmethod
    def normalize_host_policies(cls, v):
        """Normalize host policy keys to lowercase host names."""
        if v is None:
            return {}
        if not isinstance(v, dict):
            raise ValueError("host_policies must be a mapping")
        return {str(key).strip().lower(): value for key, value in v.items()}

    @field_validator("retry_statuses")
    @classmethod
    def validate_retry_statuses(cls, v: list[int]) -> list[int]:
        """Ensure retryable statuses are valid HTTP error codes."""
        return _normalize_retry_statuses(v) or []

    @field_validator("retry_backoff_seconds")
    @classmethod
    def validate_retry_backoff_seconds(cls, v: list[float]) -> list[float]:
        """Ensure retry backoff delays are positive."""
        return _normalize_retry_backoff_seconds(v) or []

    @field_validator("base_dir", mode="before")
    @classmethod
    def expand_base_dir(cls, v):
        """Convert cache base dir to an absolute Path."""
        return _expand_config_path(v)

    @field_validator("log_path", mode="before")
    @classmethod
    def expand_log_path(cls, v):
        """Convert optional log path to an absolute Path."""
        return _expand_config_path(v)


# =============== ROOT SETTINGS MODEL ===============
class Settings(BaseSettings):
    """Root configuration combining all subsystems.

    Loads configuration from multiple sources in priority order:
    1. Environment variables (HUMBLE_* prefix)
    2. backend/.env file
    3. backend/config.yaml
    4. Default values

    All settings are validated at initialization time with helpful
    error messages. Missing required fields raise ConfigError.

    Attributes
    ----------
    auth_cookie : str
        Humble Bundle session cookie (_simpleauth_sess)
        NEVER log or print this value
    browser : BrowserConfig
        Browser automation settings
    proxy : ProxyConfig
        Proxy configuration (optional)
    download : DownloadConfig
        Download and file handling settings
    api : APIConfig
        API configuration
    server : ServerConfig
        Backend runtime settings
    logging : LoggingConfig
        Logging settings
    artifacts : ArtifactsConfig
        Artifact output settings
    viewer : ViewerConfig
        Viewer UI settings
    current_bundles : CurrentBundlesConfig
        Current-bundle overlap analysis settings
    current_choice : CurrentChoiceConfig
        Current Humble Choice overlap analysis settings
    subproduct_pages : SubproductPageCacheConfig
        Cached external page settings for subproduct info URLs

    Examples
    --------
    Load from all sources (env vars, backend/.env file, config.yaml):

        >>> config = Settings()  # doctest: +SKIP
        >>> config.auth_cookie  # doctest: +SKIP
        'session_cookie_value'

    Load from specific .env file:

        >>> config = Settings(_env_file=".env.local")  # doctest: +SKIP

    Raises
    ------
    ConfigError
        If validation fails or required fields are missing

    Notes
    -----
    The auth_cookie is ALWAYS required and must not be None.
    If missing, a ConfigError is raised at initialization.
    Never expose this value in logs or error messages.
    """

    model_config = SettingsConfigDict(
        env_prefix="HUMBLE_",
        env_file=str(DEFAULT_ENV_PATH),
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
        extra="ignore",
    )

    if TYPE_CHECKING:

        def __init__(  # pylint: disable=super-init-not-called,unused-argument
            self,
            **data: Any,
        ) -> None: ...

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[
        PydanticBaseSettingsSource, ...
    ]:  # pylint: disable=too-many-arguments,too-many-positional-arguments,unused-argument
        """Inject YAML config source with correct priority."""
        yaml_source = cast(PydanticBaseSettingsSource, cls._yaml_config_settings_source)
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            yaml_source,
            file_secret_settings,
        )

    @classmethod
    def _yaml_config_settings_source(cls) -> dict[str, Any]:
        config_path = resolve_config_path()
        return _load_yaml_config(config_path)

    app_name: str = Field(default="HB Library Viewer", description="Application name")
    version: str = Field(default="1.0.0", description="Application version")

    # Required: authentication cookie
    auth_cookie: str = Field(
        ..., description="Humble Bundle _simpleauth_sess cookie (REQUIRED)"
    )

    platforms: list[str] = Field(
        default_factory=lambda: ["ebook", "audio"],
        description="Target platforms to download",
    )

    # Nested configuration models
    browser: BrowserConfig = Field(default_factory=BrowserConfig)
    proxy: ProxyConfig = Field(default_factory=ProxyConfig)
    download: DownloadConfig = Field(default_factory=DownloadConfig)
    api: APIConfig = Field(default_factory=APIConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    artifacts: ArtifactsConfig = Field(default_factory=ArtifactsConfig)
    viewer: ViewerConfig = Field(default_factory=ViewerConfig)
    current_bundles: CurrentBundlesConfig = Field(default_factory=CurrentBundlesConfig)
    current_choice: CurrentChoiceConfig = Field(default_factory=CurrentChoiceConfig)
    subproduct_pages: SubproductPageCacheConfig = Field(
        default_factory=SubproductPageCacheConfig
    )

    @field_validator("auth_cookie")
    @classmethod
    def validate_auth_cookie(cls, v: str) -> str:
        """Ensure auth_cookie is provided and has valid format."""
        if not v or not isinstance(v, str):
            raise ConfigError(
                "auth_cookie is required. Set HUMBLE_AUTH_COOKIE environment "
                "variable or AUTH_COOKIE in backend/.env file."
            )
        if len(v) < 10:
            raise ConfigError(
                "auth_cookie appears invalid (too short). "
                "Extract fresh _simpleauth_sess from browser."
            )
        return v

    @model_validator(mode="after")
    def check_download_folder_writable(self) -> "Settings":
        """Ensure download folder can be created."""
        try:
            # Try to create parent if needed
            self.download.base_folder.parent.mkdir(parents=True, exist_ok=True)
        except (OSError, PermissionError) as e:
            raise ConfigError(
                f"Cannot write to download folder '{self.download.base_folder}': {e}"
            ) from e
        return self


class RuntimeSettings(BaseSettings):
    """Configuration access for runtime surfaces that do not require auth.

    This model mirrors the non-secret operational settings used by viewer and
    API endpoints that should honor `backend/config.yaml`, `.env`, and
    `HUMBLE_*` overrides without requiring an auth cookie.
    """

    model_config = SettingsConfigDict(
        env_prefix="HUMBLE_",
        env_file=str(DEFAULT_ENV_PATH),
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
        extra="ignore",
    )

    if TYPE_CHECKING:

        def __init__(  # pylint: disable=super-init-not-called,unused-argument
            self,
            **data: Any,
        ) -> None: ...

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[
        PydanticBaseSettingsSource, ...
    ]:  # pylint: disable=too-many-arguments,too-many-positional-arguments,unused-argument
        """Inject YAML config source with correct priority."""
        yaml_source = cast(PydanticBaseSettingsSource, cls._yaml_config_settings_source)
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            yaml_source,
            file_secret_settings,
        )

    @classmethod
    def _yaml_config_settings_source(cls) -> dict[str, Any]:
        config_path = resolve_config_path()
        return _load_yaml_config(config_path)

    app_name: str = Field(default="HB Library Viewer", description="Application name")
    version: str = Field(default="1.0.0", description="Application version")
    platforms: list[str] = Field(
        default_factory=lambda: ["ebook", "audio"],
        description="Target platforms to download",
    )
    browser: BrowserConfig = Field(default_factory=BrowserConfig)
    proxy: ProxyConfig = Field(default_factory=ProxyConfig)
    download: DownloadConfig = Field(default_factory=DownloadConfig)
    api: APIConfig = Field(default_factory=APIConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    artifacts: ArtifactsConfig = Field(default_factory=ArtifactsConfig)
    viewer: ViewerConfig = Field(default_factory=ViewerConfig)
    current_bundles: CurrentBundlesConfig = Field(default_factory=CurrentBundlesConfig)
    current_choice: CurrentChoiceConfig = Field(default_factory=CurrentChoiceConfig)
    subproduct_pages: SubproductPageCacheConfig = Field(
        default_factory=SubproductPageCacheConfig
    )


def load_subproduct_page_cache_config(
    config_path: Path | None = None,
) -> SubproductPageCacheConfig:
    """Load subproduct page cache settings from config.yaml only.

    This helper allows cache workflows to use config defaults without requiring
    a Humble auth cookie.
    """
    return _load_config_section(
        "subproduct_pages",
        SubproductPageCacheConfig,
        config_path,
    )


def load_browser_config(config_path: Path | None = None) -> BrowserConfig:
    """Load browser settings from config.yaml only.

    This helper allows standalone CLI subcommands to honor repository browser
    settings without requiring a full authenticated Settings load.
    """
    return _load_config_section("browser", BrowserConfig, config_path)


def load_download_config(config_path: Path | None = None) -> DownloadConfig:
    """Load download settings from config.yaml only."""
    return _load_config_section("download", DownloadConfig, config_path)


def load_api_config(config_path: Path | None = None) -> APIConfig:
    """Load API settings from config.yaml only."""
    return _load_config_section("api", APIConfig, config_path)


def load_server_config(config_path: Path | None = None) -> ServerConfig:
    """Load server settings from config.yaml only."""
    return _load_config_section("server", ServerConfig, config_path)


def load_viewer_config(config_path: Path | None = None) -> ViewerConfig:
    """Load viewer settings from config.yaml only."""
    return _load_config_section("viewer", ViewerConfig, config_path)


def load_current_bundles_config(
    config_path: Path | None = None,
) -> CurrentBundlesConfig:
    """Load current bundle overlap settings from config.yaml only."""
    return _load_config_section(
        "current_bundles",
        CurrentBundlesConfig,
        config_path,
    )


def load_current_choice_config(
    config_path: Path | None = None,
) -> CurrentChoiceConfig:
    """Load current Humble Choice overlap settings from config.yaml only."""
    return _load_config_section(
        "current_choice",
        CurrentChoiceConfig,
        config_path,
    )


def load_artifacts_config(config_path: Path | None = None) -> ArtifactsConfig:
    """Load artifact output settings from config.yaml only."""
    return _load_config_section("artifacts", ArtifactsConfig, config_path)


def load_logging_config(config_path: Path | None = None) -> LoggingConfig:
    """Load logging settings from config.yaml only.

    This helper allows standalone CLI subcommands to honor repository logging
    settings without requiring a full authenticated Settings load.
    """
    return _load_config_section("logging", LoggingConfig, config_path)
