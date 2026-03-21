"""HB Library Viewer - modular, type-safe library.

A Python library for bulk downloading eBooks and audiobooks from your
Humble Bundle library using browser automation and API response interception.

Features:
    - Playwright-based browser automation with response capture
    - Pydantic v2 configuration management
    - File downloads with retry logic and rate limiting
    - Structured, validated data models
    - Comprehensive error handling with custom exceptions
    - Type hints on all public APIs

Quick Start
-----------
>>> from hb_library_viewer.config import Settings  # doctest: +SKIP
>>> from hb_library_viewer.browser.manager import BrowserManager  # doctest: +SKIP
>>> from hb_library_viewer.cli import main  # doctest: +SKIP
>>>
>>> # Option 1: Use CLI entry point
>>> if __name__ == "__main__":  # doctest: +SKIP
...     exit_code = main()
>>>
>>> # Option 2: Use library directly
>>> config = Settings()  # doctest: +SKIP
>>> with BrowserManager(config.browser, config.auth_cookie) as bm:  # doctest: +SKIP
...     result = bm.capture_library_page()

Example with Full Workflow
---------------------------
>>> from hb_library_viewer import (  # doctest: +SKIP
...     Settings, FileDownloader, build_library_json, DownloadTask
... )
>>> from hb_library_viewer.browser.manager import BrowserManager  # doctest: +SKIP
>>> from pathlib import Path  # doctest: +SKIP
>>>
>>> config = Settings()  # doctest: +SKIP
>>> with BrowserManager(config.browser, config.auth_cookie) as bm:  # doctest: +SKIP
...     capture = bm.capture_library_page()
...
>>> model_path = Path("data/artifacts/order_payload_models.py")  # doctest: +SKIP
>>> lib_data = build_library_json(  # doctest: +SKIP
...     capture.api_responses, order_model_path=model_path
... )
>>> downloader = FileDownloader(config.download)  # doctest: +SKIP
>>>
>>> for product in lib_data.products:  # doctest: +SKIP
...     task = DownloadTask(
...         gamekey=product.gamekey,
...         product_name=product.product_name,
...         downloads=product.downloads
...     )
...     result = downloader.download_product(task)

Modules
-------
config : Pydantic v2 configuration models and Settings class
browser : Playwright browser automation with response interception (package)
parsing : Data models (Download, Product, LibraryData) and JSON parsing
download : File download with retry logic and rate limiting
utils : Utility functions and custom exception hierarchy
cli : Command-line entry point orchestrating complete workflow

Custom Exceptions
-----------------
All exceptions inherit from HumbleBundleError (safe for logging - never
expose credentials).

    - HumbleBundleError: Base exception
    - ConfigError: Configuration validation failed
    - APIError: API call failed
    - DownloadError: File download failed
    - BrowserError: Browser automation failed

For more information, see:
    - https://github.com/seanwhaley/humble_bundle_viewer
    - docs/configuration.md for configuration options
"""

__version__ = "1.0.0"
__author__ = "HB Library Viewer Contributors"

# Import key classes and functions for public API
from .config import (  # noqa: F401
    APIConfig,
    BrowserConfig,
    DownloadConfig,
    LoggingConfig,
    ProxyConfig,
    Settings,
)
from .download import (  # noqa: F401
    DownloadResult,
    DownloadTask,
    FileDownloader,
)
from .parsing import (  # noqa: F401
    Download,
    LibraryData,
    Product,
    build_library_json,
)
from .utils import (  # noqa: F401
    APIError,
    BrowserError,
    ConfigError,
    DownloadError,
    HumbleBundleError,
    get_file_extension,
    sanitize_filename,
    validate_url,
)

# Public API - what can be imported with "from hb_library_viewer import X"
__all__ = [
    # CLI
    "Settings",
    "FileDownloader",
    # Data models
    "LibraryData",
    "Product",
    "Download",
    "DownloadTask",
    "DownloadResult",
    # Functions
    "build_library_json",
    "sanitize_filename",
    "get_file_extension",
    "validate_url",
    # Exceptions
    "HumbleBundleError",
    "ConfigError",
    "APIError",
    "BrowserError",
    "DownloadError",
    # Config options
    "BrowserConfig",
    "DownloadConfig",
    "ProxyConfig",
    "APIConfig",
    "LoggingConfig",
]
