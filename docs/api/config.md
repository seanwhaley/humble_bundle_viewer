# Configuration API

This module provides `Settings`, `RuntimeSettings`, and the nested configuration models.

## Settings

`Settings` loads values from defaults, `backend/config.yaml`, `backend/.env`, and environment variables.

Key fields:

- `auth_cookie` (required)
- `platforms`
- `browser`
- `proxy`
- `download`
- `api`
- `server`
- `logging`
- `artifacts`
- `viewer`
- `subproduct_pages`

`RuntimeSettings` exposes the same non-auth operational sections for viewer and
API surfaces that should honor configuration without requiring a session cookie.

## Browser settings

Class: `BrowserConfig`

- `headless`
- `timeout_ms`
- `user_agent`
- `capture`

## Proxy settings

Class: `ProxyConfig`

- `enabled`
- `url`
- `username`
- `password`

## Download settings

Class: `DownloadConfig`

- `base_folder`
- `max_retries`
- `retry_delay_seconds`
- `rate_limit_delay`
- `prompt_before_download`
- `force_individual_file_downloads`
- `prompt_timeout_seconds`
- `connect_timeout_seconds`
- `stream_timeout_seconds`

## API settings

Class: `APIConfig`

- `endpoint`
- `timeout`
- `max_response_batches`
- `per_key_max_retries`

`APIConfig` also provides helper methods used internally to build absolute
Humble URLs consistently from the configured endpoint, including the library
page URL and expansion of relative download links.

## Server settings

Class: `ServerConfig`

- `cors_allowed_origins`

## Logging settings

Class: `LoggingConfig`

- `level`
- `format`

## Artifact settings

Class: `ArtifactsConfig`

- `save_api_batches`
- `save_captured_responses`
- `save_html_on_failure`
- `save_gamekeys`

## Viewer settings

Class: `ViewerConfig`

- `link_expiry_warning_hours`
- `default_library_dir`
- `library_path`
