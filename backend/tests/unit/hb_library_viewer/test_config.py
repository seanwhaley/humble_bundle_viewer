"""Unit tests for configuration module (config.py).

Tests configuration loading, validation, and nested model structures.
Covers BrowserConfig, ProxyConfig, DownloadConfig, and Settings.
"""

# pylint: disable=no-member,missing-function-docstring,too-few-public-methods

import os
from pathlib import Path
from typing import Any, cast
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from hb_library_viewer.config import (
    APIConfig,
    ArtifactsConfig,
    BrowserConfig,
    BrowserCaptureConfig,
    CurrentBundlesConfig,
    CurrentChoiceConfig,
    DEFAULT_ARTIFACTS_DIR,
    DownloadConfig,
    LoggingConfig,
    ProxyConfig,
    REPO_ROOT,
    RuntimeSettings,
    ServerConfig,
    Settings,
    SubproductPageCacheConfig,
    SubproductPageHostPolicy,
    SubproductPageSearchScoringConfig,
    ViewerConfig,
    load_api_config,
    _load_yaml_config,
    load_artifacts_config,
    load_server_config,
    load_browser_config,
    load_current_bundles_config,
    load_current_choice_config,
    load_download_config,
    load_logging_config,
    load_subproduct_page_cache_config,
    load_viewer_config,
)
from hb_library_viewer.utils import ConfigError


class TestBrowserConfig:
    """Test BrowserConfig validation and defaults."""

    def test_defaults(self):
        """Test default values are applied correctly."""
        config = BrowserConfig()
        assert config.headless is True
        assert config.timeout_ms == 60000
        assert "Mozilla" in config.user_agent
        assert config.capture == BrowserCaptureConfig()

    def test_custom_values(self):
        """Test custom values override defaults."""
        config = BrowserConfig(
            headless=False, timeout_ms=30000, user_agent="Custom Agent"
        )
        assert config.headless is False
        assert config.timeout_ms == 30000
        assert config.user_agent == "Custom Agent"

    @pytest.mark.parametrize(
        "timeout,should_pass",
        [
            (1000, True),  # Minimum valid (1 second)
            (60000, True),  # Default
            (300000, True),  # Maximum valid (5 minutes)
            (500, False),  # Too low
            (400000, False),  # Too high
            (-1000, False),  # Negative
            (0, False),  # Zero
        ],
    )
    def test_timeout_validation(self, timeout: int, should_pass: bool):
        """Test timeout_ms validation enforces constraints."""
        if should_pass:
            config = BrowserConfig(timeout_ms=timeout)
            assert config.timeout_ms == timeout
        else:
            with pytest.raises(ValidationError):
                BrowserConfig(timeout_ms=timeout)

    def test_timeout_must_be_positive(self):
        """Test that timeout_ms must be positive integer."""
        with pytest.raises(ValidationError):
            BrowserConfig(timeout_ms=-5000)


class TestProxyConfig:
    """Test ProxyConfig validation and cross-field constraints."""

    def test_defaults(self):
        """Test default proxy configuration (disabled)."""
        config = ProxyConfig()
        assert config.enabled is False
        assert config.url is None
        assert config.username is None
        assert config.password is None

    def test_enabled_requires_url(self):
        """Test that enabled=True requires url to be set."""
        with pytest.raises(ValidationError) as exc_info:
            ProxyConfig(enabled=True)
        assert "proxy.url is required" in str(exc_info.value)

    def test_enabled_with_url_valid(self):
        """Test valid proxy configuration with URL."""
        config = ProxyConfig(enabled=True, url="http://proxy.example.com:8080")
        assert config.enabled is True
        assert config.url == "http://proxy.example.com:8080"

    def test_disabled_without_url_valid(self):
        """Test disabled proxy doesn't require URL."""
        config = ProxyConfig(enabled=False)
        assert config.enabled is False
        assert config.url is None

    def test_proxy_with_auth(self):
        """Test proxy with authentication credentials."""
        config = ProxyConfig(
            enabled=True,
            url="http://proxy.example.com:8080",
            username="user",
            password="pass",
        )
        assert config.username == "user"
        assert config.password == "pass"


class TestDownloadConfig:
    """Test DownloadConfig path expansion and validation."""

    def test_defaults(self):
        """Test default download configuration values."""
        config = DownloadConfig()
        assert config.max_retries == 3
        assert config.retry_delay_seconds == 2
        assert config.rate_limit_delay == 0.5
        assert config.prompt_before_download is True
        assert config.force_individual_file_downloads is None
        assert config.prompt_timeout_seconds == 30
        assert config.stream_timeout_seconds == 300
        assert config.connect_timeout_seconds == 10
        assert config.managed_sync_max_parallel_downloads == 3
        assert config.managed_sync_manifest_history_entries == 5000
        assert "Humble_Library_Downloads" in str(config.base_folder)

    def test_path_expansion_tilde(self, tmp_path: Path):
        """Test that ~ is expanded in paths."""
        with patch("pathlib.Path.expanduser") as mock_expand:
            mock_expand.return_value = tmp_path / "expanded"
            DownloadConfig(
                base_folder="~/Downloads",  # type: ignore[arg-type]
            )
            # expanduser was called during validation
            mock_expand.assert_called()

    def test_path_expansion_relative(self):
        """Test that relative paths are resolved."""
        config = DownloadConfig(
            base_folder="./relative/path",  # type: ignore[arg-type]
        )
        assert config.base_folder.is_absolute()
        assert config.base_folder == (REPO_ROOT / "relative" / "path").resolve()

    def test_path_expansion_relative_is_independent_of_cwd(self, monkeypatch):
        """Relative download paths should not drift when the process cwd changes."""

        monkeypatch.chdir(REPO_ROOT / "frontend")

        config = DownloadConfig(
            base_folder="./relative/path",  # type: ignore[arg-type]
        )

        assert config.base_folder == (REPO_ROOT / "relative" / "path").resolve()

    @pytest.mark.parametrize(
        "retries,should_pass",
        [
            (1, True),  # Minimum
            (3, True),  # Default
            (10, True),  # Maximum
            (0, False),  # Too low
            (11, False),  # Too high
            (-1, False),  # Negative
        ],
    )
    def test_max_retries_validation(self, retries: int, should_pass: bool):
        """Test max_retries validation enforces range 1-10."""
        if should_pass:
            config = DownloadConfig(max_retries=retries)
            assert config.max_retries == retries
        else:
            with pytest.raises(ValidationError):
                DownloadConfig(max_retries=retries)

    def test_rate_limit_minimum(self):
        """Test rate_limit_delay enforces 0.5s minimum."""
        # Valid: exactly 0.5
        config = DownloadConfig(rate_limit_delay=0.5)
        assert config.rate_limit_delay == 0.5

        # Valid: above minimum
        config = DownloadConfig(rate_limit_delay=1.0)
        assert config.rate_limit_delay == 1.0

        # Invalid: below minimum
        with pytest.raises(ValidationError) as exc_info:
            DownloadConfig(rate_limit_delay=0.3)
        # Check validation message mentions 0.5
        error_msg = str(exc_info.value)
        assert "0.5" in error_msg or "greater than or equal" in error_msg.lower()


class TestAPIConfig:
    """Test APIConfig validation."""

    def test_defaults(self):
        """Test default API configuration."""
        config = APIConfig()
        assert config.endpoint == "https://www.humblebundle.com"
        assert config.timeout == 30
        assert config.max_response_batches == 7
        assert config.per_key_max_retries == 2

    def test_custom_endpoint(self):
        """Test custom API endpoint."""
        config = APIConfig(endpoint="https://custom.api.com/")
        assert config.endpoint == "https://custom.api.com"

    def test_build_url_and_library_url(self):
        """Test APIConfig helpers normalize relative Humble URLs."""
        config = APIConfig(endpoint="https://custom.api.com/")

        assert (
            config.build_url("/api/v1/orders") == "https://custom.api.com/api/v1/orders"
        )
        assert (
            config.build_url("api/v1/orders") == "https://custom.api.com/api/v1/orders"
        )
        assert config.build_url("https://cdn.custom.api.com/file.pdf") == (
            "https://cdn.custom.api.com/file.pdf"
        )
        assert config.library_url() == "https://custom.api.com/home/library"


class TestServerConfig:
    """Test backend server/runtime configuration."""

    def test_defaults(self):
        config = ServerConfig()
        assert config.cors_allowed_origins == [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]

    def test_normalizes_and_deduplicates_origins(self):
        config = ServerConfig(
            cors_allowed_origins=[
                " http://localhost:5173/ ",
                "http://localhost:5173",
                "http://127.0.0.1:5173/",
            ]
        )

        assert config.cors_allowed_origins == [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]

    def test_rejects_empty_origin(self):
        with pytest.raises(ValidationError, match="cors_allowed_origins"):
            ServerConfig(cors_allowed_origins=[""])

    def test_custom_per_key_retries(self):
        """Test custom per-key retry configuration."""
        config = APIConfig(per_key_max_retries=4)
        assert config.per_key_max_retries == 4


class TestLoggingConfig:
    """Test LoggingConfig validation."""

    def test_defaults(self):
        """Test default logging configuration."""
        config = LoggingConfig()
        assert config.level == "info"
        assert "asctime" in config.format

    @pytest.mark.parametrize(
        "level,valid",
        [
            ("debug", True),
            ("info", True),
            ("warning", True),
            ("error", True),
            ("critical", True),
            ("DEBUG", True),  # Case insensitive
            ("INFO", True),
            ("invalid", False),
            ("trace", False),
        ],
    )
    def test_log_level_validation(self, level: str, valid: bool):
        """Test log level validation accepts valid levels."""
        if valid:
            config = LoggingConfig(level=level)
            # Should be normalized to lowercase
            assert config.level == level.lower()
        else:
            with pytest.raises(ValidationError):
                LoggingConfig(level=level)


class TestArtifactsConfig:
    """Test ArtifactsConfig defaults."""

    def test_defaults(self):
        config = ArtifactsConfig()
        assert config.base_dir == DEFAULT_ARTIFACTS_DIR
        assert config.base_dir.name == "artifacts"
        assert config.save_api_batches is True
        assert config.save_captured_responses is False
        assert config.save_html_on_failure is True
        assert config.save_gamekeys is False
        assert config.auto_rebuild_order_models is True

    def test_relative_base_dir_uses_repo_root(self, monkeypatch):
        """Relative artifact paths should resolve from the repository root."""

        monkeypatch.chdir(REPO_ROOT / "frontend")

        config = ArtifactsConfig(base_dir=Path("./custom-artifacts"))

        assert config.base_dir == (REPO_ROOT / "custom-artifacts").resolve()


class TestSubproductPageCacheConfig:
    """Test subproduct page cache configuration defaults and helpers."""

    def test_defaults(self):
        config = SubproductPageCacheConfig()
        assert config.base_dir.name == "subproduct_pages"
        assert config.redownload_existing is False
        assert config.request_timeout_seconds == 30
        assert config.connect_timeout_seconds == 10
        assert config.rate_limit_delay == 0.5
        assert config.domain_workers == 4
        assert config.domain_check_timeout_seconds == 3
        assert config.max_failures == 5
        assert config.retry_statuses == [429, 500, 502, 503, 504, 522]
        assert config.retry_backoff_seconds == [5.0, 15.0, 30.0]
        assert config.respect_retry_after is True
        assert config.max_retry_after_seconds == 120
        assert config.retry_transport_failures is True
        assert config.progress_log_every == 25
        assert config.search_scoring == SubproductPageSearchScoringConfig()
        assert config.host_policies == {}
        assert config.log_path is None

    def test_retry_statuses_validation(self):
        with pytest.raises(ValidationError, match="retry_statuses"):
            SubproductPageCacheConfig(retry_statuses=[200])

    def test_retry_backoff_seconds_validation(self):
        with pytest.raises(ValidationError, match="retry_backoff_seconds"):
            SubproductPageCacheConfig(retry_backoff_seconds=[0])

    def test_host_policy_defaults(self):
        policy = SubproductPageHostPolicy()
        assert policy.browser_fallback is False
        assert policy.search_on_404 is False
        assert policy.min_match_confidence == 0.9
        assert policy.browser_timeout_ms is None
        assert policy.rate_limit_delay is None
        assert policy.retry_statuses is None
        assert policy.retry_backoff_seconds is None

    def test_host_policy_validation(self):
        with pytest.raises(ValidationError, match="retry_statuses"):
            SubproductPageHostPolicy(retry_statuses=[200])

    def test_host_policy_keys_are_normalized(self):
        config = SubproductPageCacheConfig(
            host_policies=cast(
                Any,
                {
                    "WWW.WILEY.COM": {
                        "retry_backoff_seconds": [10, 30, 60],
                    }
                },
            )
        )

        assert list(config.host_policies) == ["www.wiley.com"]
        assert config.host_policies["www.wiley.com"].retry_backoff_seconds == [
            10.0,
            30.0,
            60.0,
        ]

    def test_load_subproduct_page_cache_config_defaults(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("", encoding="utf-8")

        config = load_subproduct_page_cache_config(config_yaml)

        assert config.redownload_existing is False
        assert config.base_dir.name == "subproduct_pages"
        assert config.domain_workers == 4
        assert config.max_failures == 5

    def test_load_subproduct_page_cache_config_with_log_path(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "subproduct_pages:",
                    "  log_path: ./logs/subproduct-cache.log",
                    "  connect_timeout_seconds: 7",
                ]
            ),
            encoding="utf-8",
        )

        config = load_subproduct_page_cache_config(config_yaml)

        assert config.connect_timeout_seconds == 7
        assert config.log_path is not None
        assert config.log_path.name == "subproduct-cache.log"

    def test_load_subproduct_page_cache_config_with_host_policies(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "subproduct_pages:",
                    "  host_policies:",
                    "    www.wiley.com:",
                    "      rate_limit_delay: 2",
                    "      retry_backoff_seconds: [10, 30, 60]",
                    "    www.packtpub.com:",
                    "      search_on_404: true",
                    "      min_match_confidence: 0.92",
                ]
            ),
            encoding="utf-8",
        )

        config = load_subproduct_page_cache_config(config_yaml)

        assert config.host_policies["www.wiley.com"].rate_limit_delay == 2
        assert config.host_policies["www.wiley.com"].retry_backoff_seconds == [
            10.0,
            30.0,
            60.0,
        ]
        assert config.host_policies["www.packtpub.com"].search_on_404 is True
        assert config.host_policies["www.packtpub.com"].min_match_confidence == 0.92

    def test_load_subproduct_page_cache_config_invalid_type(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("subproduct_pages: true\n", encoding="utf-8")

        with pytest.raises(
            ConfigError, match="subproduct_pages config must be a mapping"
        ):
            load_subproduct_page_cache_config(config_yaml)

    def test_host_policies_must_be_mapping(self):
        with pytest.raises(ValidationError, match="host_policies"):
            SubproductPageCacheConfig(host_policies=True)  # type: ignore[arg-type]

    def test_load_logging_config_defaults(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("", encoding="utf-8")

        config = load_logging_config(config_yaml)

        assert config.level == "info"
        assert "asctime" in config.format

    def test_load_logging_config_invalid_type(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("logging: true\n", encoding="utf-8")

        with pytest.raises(ConfigError, match="logging config must be a mapping"):
            load_logging_config(config_yaml)

    def test_load_browser_config_defaults(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("", encoding="utf-8")

        config = load_browser_config(config_yaml)

        assert config.headless is True
        assert config.timeout_ms == 60000
        assert config.capture == BrowserCaptureConfig()

    def test_load_browser_config_with_capture_settings(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "browser:",
                    "  capture:",
                    "    load_timeout_ms: 45000",
                    "    api_wait_timeout_seconds: 60",
                ]
            ),
            encoding="utf-8",
        )

        config = load_browser_config(config_yaml)

        assert config.capture.load_timeout_ms == 45000
        assert config.capture.api_wait_timeout_seconds == 60

    def test_load_download_config_with_stream_timeout(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "download:",
                    "  connect_timeout_seconds: 12",
                    "  stream_timeout_seconds: 90",
                    "  managed_sync_max_parallel_downloads: 4",
                    "  managed_sync_manifest_history_entries: 2500",
                ]
            ),
            encoding="utf-8",
        )

        config = load_download_config(config_yaml)

        assert config.connect_timeout_seconds == 12
        assert config.stream_timeout_seconds == 90
        assert config.managed_sync_max_parallel_downloads == 4
        assert config.managed_sync_manifest_history_entries == 2500

    def test_load_api_config_with_endpoint(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "api:",
                    "  endpoint: https://example.humble.local/",
                    "  timeout: 45",
                ]
            ),
            encoding="utf-8",
        )

        config = load_api_config(config_yaml)

        assert config.endpoint == "https://example.humble.local"
        assert config.timeout == 45
        assert config.library_url() == "https://example.humble.local/home/library"

    def test_load_server_config_with_cors_origins(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "server:",
                    "  cors_allowed_origins:",
                    "    - http://localhost:3000/",
                    "    - http://127.0.0.1:4173",
                ]
            ),
            encoding="utf-8",
        )

        config = load_server_config(config_yaml)

        assert config.cors_allowed_origins == [
            "http://localhost:3000",
            "http://127.0.0.1:4173",
        ]

    def test_load_viewer_config_with_library_paths(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "viewer:",
                    "  default_library_dir: ./viewer-output",
                    "  library_path: ./viewer-output/library_products.json",
                ]
            ),
            encoding="utf-8",
        )

        config = load_viewer_config(config_yaml)

        assert isinstance(config, ViewerConfig)
        assert config.default_library_dir is not None
        assert config.default_library_dir.name == "viewer-output"
        assert config.library_path is not None
        assert config.library_path.name == "library_products.json"

    def test_viewer_config_defaults_include_key_reveal_assumptions(self):
        config = ViewerConfig()

        assert config.assume_revealed_keys_redeemed is True
        assert config.ignore_revealed_status_for_expired_keys is True
        assert config.ignore_revealed_status_for_unexpired_keys is False

    def test_load_viewer_config_with_key_reveal_assumptions(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "viewer:",
                    "  assume_revealed_keys_redeemed: true",
                    "  ignore_revealed_status_for_expired_keys: false",
                    "  ignore_revealed_status_for_unexpired_keys: true",
                ]
            ),
            encoding="utf-8",
        )

        config = load_viewer_config(config_yaml)

        assert config.assume_revealed_keys_redeemed is True
        assert config.ignore_revealed_status_for_expired_keys is False
        assert config.ignore_revealed_status_for_unexpired_keys is True

    def test_load_current_bundles_config_with_defaults(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("", encoding="utf-8")

        config = load_current_bundles_config(config_yaml)

        assert isinstance(config, CurrentBundlesConfig)
        assert config.base_dir.name == "current_bundles"
        assert config.bundle_types == ["games", "books", "software"]
        assert config.timeout_seconds == 30

    def test_load_current_bundles_config_with_overrides(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "current_bundles:",
                    "  base_dir: ./artifacts/current-bundles",
                    "  library_path: ./artifacts/library_products.json",
                    "  bundle_types:",
                    "    - books",
                    "    - software",
                    "  timeout_seconds: 45",
                ]
            ),
            encoding="utf-8",
        )

        config = load_current_bundles_config(config_yaml)

        assert config.base_dir.name == "current-bundles"
        assert config.library_path is not None
        assert config.library_path.name == "library_products.json"
        assert config.bundle_types == ["books", "software"]
        assert config.timeout_seconds == 45

    def test_load_current_bundles_config_rejects_invalid_bundle_type(
        self, tmp_path: Path
    ):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "current_bundles:",
                    "  bundle_types:",
                    "    - books",
                    "    - comics",
                ]
            ),
            encoding="utf-8",
        )

        with pytest.raises(ValidationError, match="bundle_types values must be one of"):
            load_current_bundles_config(config_yaml)

    def test_load_current_choice_config_with_defaults(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("", encoding="utf-8")

        config = load_current_choice_config(config_yaml)

        assert isinstance(config, CurrentChoiceConfig)
        assert config.base_dir.name == "current_choice"
        assert config.timeout_seconds == 30

    def test_load_current_choice_config_with_overrides(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "current_choice:",
                    "  base_dir: ./artifacts/current-choice",
                    "  library_path: ./artifacts/library_products.json",
                    "  timeout_seconds: 45",
                ]
            ),
            encoding="utf-8",
        )

        config = load_current_choice_config(config_yaml)

        assert config.base_dir.name == "current-choice"
        assert config.library_path is not None
        assert config.library_path.name == "library_products.json"
        assert config.timeout_seconds == 45

    def test_load_artifacts_config_uses_configured_base_dir(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "artifacts:",
                    "  base_dir: ./custom-artifacts",
                ]
            ),
            encoding="utf-8",
        )

        config = load_artifacts_config(config_yaml)

        assert isinstance(config, ArtifactsConfig)
        assert config.base_dir.name == "custom-artifacts"

    def test_load_browser_config_invalid_type(self, tmp_path: Path):
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("browser: true\n", encoding="utf-8")

        with pytest.raises(ConfigError, match="browser config must be a mapping"):
            load_browser_config(config_yaml)


class TestSettings:
    """Test root Settings model integration."""

    def test_auth_cookie_required(self, monkeypatch):
        """Test that auth_cookie is required and validates."""
        for key in list(os.environ.keys()):
            if key.startswith("HUMBLE_"):
                monkeypatch.delenv(key, raising=False)
        with pytest.raises((ValidationError, ConfigError)):
            Settings(_env_file=None)

    def test_minimal_valid_config(self, tmp_path: Path, monkeypatch):
        """Test Settings with minimal required fields."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie_1234567890")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()
        assert config.auth_cookie == "test_cookie_1234567890"
        assert config.browser.headless is True  # Default

    def test_auth_cookie_too_short(self):
        """Test auth_cookie validation rejects too-short values."""
        with pytest.raises((ValidationError, ConfigError)) as exc_info:
            Settings(auth_cookie="short")
        assert (
            "too short" in str(exc_info.value).lower()
            or "invalid" in str(exc_info.value).lower()
        )

    def test_auth_cookie_empty(self):
        """Test auth_cookie validation rejects empty values."""
        with pytest.raises((ValidationError, ConfigError)) as exc_info:
            Settings(auth_cookie="")
        assert "required" in str(exc_info.value).lower()

    def test_nested_config_defaults(self, tmp_path: Path, monkeypatch):
        """Test that nested configs get defaults."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie_1234567890")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()
        # Browser should use defaults
        assert config.browser.headless is True
        assert config.browser.timeout_ms == 60000
        assert config.browser.capture == BrowserCaptureConfig()
        # API should use defaults
        assert config.api.endpoint == "https://www.humblebundle.com"
        assert config.server.cors_allowed_origins == [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
        # Artifacts should use defaults
        assert config.artifacts.save_api_batches is True
        assert config.artifacts.save_captured_responses is False
        assert config.artifacts.save_html_on_failure is True
        assert config.artifacts.save_gamekeys is False
        assert config.artifacts.auto_rebuild_order_models is True
        assert config.subproduct_pages.redownload_existing is False
        assert config.subproduct_pages.max_failures == 5

    def test_runtime_settings_support_viewer_only_overrides(
        self, tmp_path: Path, monkeypatch
    ):
        """RuntimeSettings should load non-auth viewer config without a cookie."""
        monkeypatch.setenv(
            "HUMBLE_VIEWER__LIBRARY_PATH",
            str(tmp_path / "library_products.json"),
        )
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = RuntimeSettings()

        assert config.viewer.library_path == (tmp_path / "library_products.json")

    def test_runtime_settings_support_current_bundle_overrides(
        self, tmp_path: Path, monkeypatch
    ):
        """RuntimeSettings should load current bundle defaults without auth."""
        monkeypatch.setenv(
            "HUMBLE_CURRENT_BUNDLES__BASE_DIR",
            str(tmp_path / "current-bundles"),
        )
        monkeypatch.setenv(
            "HUMBLE_CURRENT_BUNDLES__BUNDLE_TYPES",
            '["books","software"]',
        )
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = RuntimeSettings()

        assert config.current_bundles.base_dir == (tmp_path / "current-bundles")
        assert config.current_bundles.bundle_types == ["books", "software"]

    def test_nested_config_override(self, tmp_path: Path, monkeypatch):
        """Test overriding nested configuration."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie_1234567890")
        monkeypatch.setenv("HUMBLE_BROWSER__HEADLESS", "false")
        monkeypatch.setenv("HUMBLE_BROWSER__TIMEOUT_MS", "30000")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()
        assert config.browser.headless is False
        assert config.browser.timeout_ms == 30000

    def test_environment_variable_loading(self, monkeypatch, tmp_path: Path):
        """Test loading from environment variables with HUMBLE_ prefix."""
        # Clear any existing HUMBLE_ vars first
        for key in list(os.environ.keys()):
            if key.startswith("HUMBLE_"):
                monkeypatch.delenv(key, raising=False)

        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "env_cookie_1234567890")
        monkeypatch.setenv("HUMBLE_BROWSER__HEADLESS", "false")
        monkeypatch.setenv("HUMBLE_BROWSER__TIMEOUT_MS", "45000")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()
        assert config.auth_cookie == "env_cookie_1234567890"
        assert config.browser.headless is False
        assert config.browser.timeout_ms == 45000

    def test_download_folder_creation(self, tmp_path: Path, monkeypatch):
        """Test that download folder parent is created."""
        download_path = tmp_path / "nested" / "downloads"
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie_1234567890")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(download_path))

        # Should not raise even though parent doesn't exist
        config = Settings()
        # Parent directory should be created
        assert config.download.base_folder.parent.exists()

    def test__load_yaml_config_not_exists(self, tmp_path):
        path = tmp_path / "nonexistent.yaml"
        assert _load_yaml_config(path) == {}

    def test__load_yaml_config_empty_file(self, tmp_path):
        path = tmp_path / "empty.yaml"
        path.write_text("", encoding="utf-8")
        assert _load_yaml_config(path) == {}

    def test__load_yaml_config_not_a_dict(self, tmp_path):
        path = tmp_path / "list.yaml"
        path.write_text("- item1\n- item2", encoding="utf-8")
        with pytest.raises(ConfigError, match="must contain a mapping at root"):
            _load_yaml_config(path)

    def test__load_yaml_config_invalid_syntax(self, tmp_path):
        path = tmp_path / "invalid.yaml"
        path.write_text("{invalid: syntax", encoding="utf-8")
        with pytest.raises(ConfigError, match="Failed to read config YAML"):
            _load_yaml_config(path)

    def test_path_expansion_with_path_object(self, tmp_path: Path):
        """Test that Path objects are also expanded/resolved."""
        config = DownloadConfig(base_folder=tmp_path / "resolve_me")
        assert config.base_folder.is_absolute()

    def test_rate_limit_too_low(self):
        with pytest.raises(ValidationError, match="greater than or equal to 0.5"):
            DownloadConfig(rate_limit_delay=0.1)

    def test_prompt_timeout_too_low(self):
        with pytest.raises(ValidationError, match="greater than or equal to 1"):
            DownloadConfig(prompt_timeout_seconds=0)

    def test_prompt_timeout_too_high(self):
        with pytest.raises(ValidationError, match="less than or equal to 300"):
            DownloadConfig(prompt_timeout_seconds=301)

    def test_download_folder_not_writable(self, monkeypatch):
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie_1234567890")

        def mock_mkdir(*args, **kwargs):
            raise PermissionError("Permission denied")

        monkeypatch.setattr("pathlib.Path.mkdir", mock_mkdir)

        with pytest.raises(ConfigError, match="Cannot write to download folder"):
            Settings()
