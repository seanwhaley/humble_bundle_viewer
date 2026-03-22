"""Integration tests for configuration loading from multiple sources.

Tests the priority order: Environment variables > .env file > config.yaml > defaults.
"""

# pylint: disable=no-member

import os
from pathlib import Path

import pytest

from hb_library_viewer.config import DownloadConfig, RuntimeSettings, Settings


@pytest.mark.integration
class TestConfigLoadingFromEnv:
    """Test loading configuration from .env file."""

    def test_load_from_env_file(self, test_env_file: Path, tmp_path: Path, monkeypatch):
        """Test loading configuration from .env file."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie_from_env")
        config = Settings(
            _env_file=str(test_env_file),
            download__base_folder=str(tmp_path / "downloads"),
        )

        # Values should come from .env file
        assert config.auth_cookie == "test_cookie_from_env"
        assert config.browser.headless is True
        assert config.browser.timeout_ms == 45000

    def test_missing_env_file_uses_defaults(self, tmp_path: Path):
        """Test that missing .env file falls back to defaults."""
        non_existent = tmp_path / "nonexistent.env"

        # Should use defaults when env file doesn't exist
        # Note: auth_cookie is required, so we pass it directly
        config = Settings(
            auth_cookie="direct_cookie_12345",
            _env_file=str(non_existent),
            download__base_folder=str(tmp_path / "downloads"),
        )

        # Should use default values
        assert config.browser.headless is True
        assert config.browser.timeout_ms == 60000  # Default


@pytest.mark.integration
class TestConfigLoadingFromYaml:
    """Test loading configuration from YAML file."""

    def test_load_from_config_yaml(
        self, test_config_yaml: Path, monkeypatch, tmp_path: Path
    ):
        """Test loading configuration from config.yaml file."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "yaml_test_cookie")
        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(test_config_yaml))
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()

        assert config.browser.headless is False
        assert config.browser.timeout_ms == 60000
        assert config.download.max_retries == 5
        assert config.logging.level == "debug"

    @pytest.mark.parametrize(
        "yaml_value,expected",
        [
            ("null", None),
            ("true", True),
            ("false", False),
        ],
    )
    def test_force_downloads_from_yaml(
        self, yaml_value: str, expected: bool | None, monkeypatch, tmp_path: Path
    ):
        """Test force_individual_file_downloads parsing from YAML."""
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            f"""
download:
  force_individual_file_downloads: {yaml_value}
""",
            encoding="utf-8",
        )

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "yaml_test_cookie")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()
        assert config.download.force_individual_file_downloads is expected

    def test_artifacts_from_yaml(self, monkeypatch, tmp_path: Path):
        """Test artifacts configuration parsing from YAML."""
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            """
artifacts:
  save_api_batches: false
  save_captured_responses: true
  save_html_on_failure: false
  save_gamekeys: true
""",
            encoding="utf-8",
        )

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "yaml_test_cookie")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()
        assert config.artifacts.save_api_batches is False
        assert config.artifacts.save_captured_responses is True
        assert config.artifacts.save_html_on_failure is False
        assert config.artifacts.save_gamekeys is True

    def test_server_and_download_timeouts_from_yaml(self, monkeypatch, tmp_path: Path):
        """Test server CORS and stream connect timeout parsing from YAML."""
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            """
server:
  cors_allowed_origins:
    - http://localhost:3000/
    - http://127.0.0.1:4173
download:
  connect_timeout_seconds: 12
  stream_timeout_seconds: 75
""",
            encoding="utf-8",
        )

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "yaml_test_cookie")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()

        assert config.server.cors_allowed_origins == [
            "http://localhost:3000",
            "http://127.0.0.1:4173",
        ]
        assert config.download.connect_timeout_seconds == 12
        assert config.download.stream_timeout_seconds == 75

    def test_subproduct_page_cache_from_yaml(self, monkeypatch, tmp_path: Path):
        """Test subproduct page cache configuration parsing from YAML."""
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            """
subproduct_pages:
    base_dir: ./cached-pages
    redownload_existing: true
    request_timeout_seconds: 45
    rate_limit_delay: 0.75
    max_failures: 2
""",
            encoding="utf-8",
        )

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "yaml_test_cookie")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()
        assert config.subproduct_pages.redownload_existing is True
        assert config.subproduct_pages.request_timeout_seconds == 45
        assert config.subproduct_pages.rate_limit_delay == 0.75
        assert config.subproduct_pages.max_failures == 2
        assert config.subproduct_pages.base_dir.name == "cached-pages"

    def test_environment_overrides_yaml_for_nested_fields(
        self, monkeypatch, tmp_path: Path
    ):
        """Environment values should override YAML values for the same nested fields."""
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            """
browser:
  headless: true
  timeout_ms: 60000
download:
  max_retries: 2
""",
            encoding="utf-8",
        )

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "yaml_test_cookie")
        monkeypatch.setenv("HUMBLE_BROWSER__HEADLESS", "false")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__MAX_RETRIES", "7")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))

        config = Settings()

        assert config.browser.headless is False
        assert config.browser.timeout_ms == 60000
        assert config.download.max_retries == 7

    def test_runtime_settings_loads_viewer_yaml_without_auth_cookie(
        self, monkeypatch, tmp_path: Path
    ):
        """RuntimeSettings should consume viewer settings without requiring auth."""
        library_path = tmp_path / "viewer-output" / "library_products.json"
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "viewer:",
                    f"  library_path: {library_path.as_posix()}",
                    "  assume_revealed_keys_redeemed: true",
                    "  ignore_revealed_status_for_expired_keys: true",
                    "  ignore_revealed_status_for_unexpired_keys: false",
                ]
            ),
            encoding="utf-8",
        )
        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.delenv("HUMBLE_AUTH_COOKIE", raising=False)

        config = RuntimeSettings()

        assert config.viewer.library_path == library_path.resolve()
        assert config.viewer.assume_revealed_keys_redeemed is True
        assert config.viewer.ignore_revealed_status_for_expired_keys is True
        assert config.viewer.ignore_revealed_status_for_unexpired_keys is False

    def test_runtime_settings_loads_server_env_override_without_auth_cookie(
        self, monkeypatch, tmp_path: Path
    ):
        """RuntimeSettings should load server config without requiring auth."""
        monkeypatch.setenv(
            "HUMBLE_SERVER__CORS_ALLOWED_ORIGINS",
            '["http://localhost:3000/", "http://127.0.0.1:4173"]',
        )
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))
        monkeypatch.delenv("HUMBLE_AUTH_COOKIE", raising=False)

        config = RuntimeSettings()

        assert config.server.cors_allowed_origins == [
            "http://localhost:3000",
            "http://127.0.0.1:4173",
        ]


@pytest.mark.integration
class TestConfigLoadingPriority:
    """Test configuration loading priority order."""

    def test_env_var_overrides_env_file(
        self, monkeypatch, test_env_file: Path, tmp_path: Path
    ):
        """Test that environment variables override .env file values."""
        # .env file has: HUMBLE_AUTH_COOKIE=test_cookie_from_env
        # Environment variable should take priority
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "env_var_cookie_override")

        config = Settings(
            _env_file=str(test_env_file),
            download=DownloadConfig(base_folder=tmp_path / "downloads"),
        )

        # Environment variable should win
        assert config.auth_cookie == "env_var_cookie_override"

    def test_env_var_overrides_defaults(self, monkeypatch, tmp_path: Path):
        """Test that environment variables override default values."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "env_var_cookie_12345")
        monkeypatch.setenv("HUMBLE_BROWSER__HEADLESS", "false")
        monkeypatch.setenv("HUMBLE_BROWSER__TIMEOUT_MS", "90000")

        config = Settings(download__base_folder=str(tmp_path / "downloads"))

        assert config.auth_cookie == "env_var_cookie_12345"
        assert config.browser.headless is False
        assert config.browser.timeout_ms == 90000

    def test_nested_config_from_env_vars(self, monkeypatch, tmp_path: Path):
        """Test nested configuration loading from environment variables."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "nested_test_cookie")
        monkeypatch.setenv("HUMBLE_BROWSER__HEADLESS", "true")
        monkeypatch.setenv("HUMBLE_BROWSER__TIMEOUT_MS", "45000")
        monkeypatch.setenv("HUMBLE_BROWSER__USER_AGENT", "Custom Agent")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))
        monkeypatch.setenv("HUMBLE_DOWNLOAD__MAX_RETRIES", "5")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__RETRY_DELAY_SECONDS", "3")

        config = Settings()

        # All nested values should be loaded
        assert config.browser.headless is True
        assert config.browser.timeout_ms == 45000
        assert config.browser.user_agent == "Custom Agent"
        assert config.download.max_retries == 5
        assert config.download.retry_delay_seconds == 3


@pytest.mark.integration
class TestConfigDefaults:
    """Test default values when no configuration files present."""

    def test_defaults_when_files_missing(self, tmp_path: Path, monkeypatch):
        """Test that defaults are used when no config files exist."""
        # Clear any HUMBLE_ environment variables
        for key in list(os.environ.keys()):
            if key.startswith("HUMBLE_"):
                monkeypatch.delenv(key, raising=False)

        # Create config with minimal required fields
        config = Settings(
            auth_cookie="test_cookie_defaults",
            download__base_folder=str(tmp_path / "downloads"),
        )

        # All should be defaults
        assert config.browser.headless is True
        assert config.browser.timeout_ms == 60000
        assert config.download.max_retries == 3
        assert config.download.retry_delay_seconds == 2
        assert config.api.endpoint == "https://www.humblebundle.com"
        assert config.logging.level == "info"

    def test_partial_config_uses_remaining_defaults(self, monkeypatch, tmp_path: Path):
        """Test that unspecified values use defaults."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "partial_cookie")
        monkeypatch.setenv("HUMBLE_BROWSER__HEADLESS", "false")
        # Don't set timeout_ms - should use default

        config = Settings(download=DownloadConfig(base_folder=tmp_path / "downloads"))

        # Specified value
        assert config.browser.headless is False
        # Default value (not specified)
        assert config.browser.timeout_ms == 60000


@pytest.mark.integration
class TestConfigValidationIntegration:
    """Test validation across multiple configuration sources."""

    def test_invalid_value_from_env_var_raises(self, monkeypatch, tmp_path: Path):
        """Test that invalid values from env vars raise validation errors."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie_12345")
        monkeypatch.setenv("HUMBLE_BROWSER__TIMEOUT_MS", "100")  # Too low

        with pytest.raises(Exception):  # ValidationError or ConfigError
            Settings(download__base_folder=str(tmp_path / "downloads"))

    def test_cross_field_validation_from_env_vars(self, monkeypatch, tmp_path: Path):
        """Test cross-field validation with env var configuration."""
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie_12345")
        monkeypatch.setenv("HUMBLE_PROXY__ENABLED", "true")
        # Missing proxy URL should fail validation

        with pytest.raises(Exception):  # ValidationError
            Settings(download__base_folder=str(tmp_path / "downloads"))

    def test_proxy_config_cross_source_validation(self, monkeypatch, tmp_path: Path):
        """Test proxy config where enabled comes from YAML and URL from env."""
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("proxy:\n  enabled: true", encoding="utf-8")

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path))

        # Missing URL should raise Exception (ValidationError)
        with pytest.raises(Exception):
            Settings()

        # Providing URL via env should pass
        monkeypatch.setenv("HUMBLE_PROXY__URL", "http://localhost:8080")
        config = Settings()
        assert config.proxy.enabled is True
        assert config.proxy.url == "http://localhost:8080"

    def test_empty_yaml_loading(self, monkeypatch, tmp_path: Path):
        """Test loading where YAML exists but is empty."""
        config_yaml = tmp_path / "empty.yaml"
        config_yaml.write_text("", encoding="utf-8")

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_cookie")
        monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path))

        # Should fall back to defaults without error
        config = Settings()
        assert config.auth_cookie == "test_cookie"
        assert config.browser.headless is True
