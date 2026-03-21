"""Utility functions and custom exceptions for HB Library Viewer.

This module provides:
- Exception hierarchy for consistent error handling
- Helper functions for filename sanitization, file extensions, and URL validation
- All exceptions are safe for logging (never expose credentials)

Examples
--------
>>> from hb_library_viewer.utils import sanitize_filename  # doctest: +SKIP
>>> sanitize_filename("100 Things to See!")  # doctest: +SKIP
'100_Things_to_See'

>>> from hb_library_viewer.utils import get_file_extension  # doctest: +SKIP
>>> get_file_extension("PDF (HQ)")  # doctest: +SKIP
'pdf'

>>> from hb_library_viewer.utils import validate_url  # doctest: +SKIP
>>> validate_url("https://example.com/file.pdf")  # doctest: +SKIP
True
"""

from __future__ import annotations

import re


# =============== CUSTOM EXCEPTION HIERARCHY ===============
class HumbleBundleError(Exception):
    """Base exception for all HB Library Viewer errors.

    This exception is safe for logging at any level as it never exposes
    authentication credentials in its message.

    Examples
    --------
    >>> try:
    ...     raise HumbleBundleError("Configuration missing")
    ... except HumbleBundleError as e:
    ...     print(f"Error: {e}")  # doctest: +SKIP
    Error: Configuration missing
    """


class ConfigError(HumbleBundleError):
    """Configuration validation failed.

    Raised when configuration is missing, invalid, or inconsistent.
    This includes:
    - Missing required settings
    - Invalid path formats
    - Type validation failures
    - Cross-field constraint violations

    Examples
    --------
    >>> raise ConfigError("auth_cookie must be a non-empty string")  # doctest: +SKIP
    ConfigError: auth_cookie must be a non-empty string
    """


class APIError(HumbleBundleError):
    """API call failed.

    Raised when an API request fails, either due to network issues or
    server errors. The error message never includes response body
    (credentials risk).

    Examples
    --------
    >>> raise APIError("Failed to fetch library: HTTP 503")  # doctest: +SKIP
    APIError: Failed to fetch library: HTTP 503
    """


class DownloadError(HumbleBundleError):
    """File download failed.

    Raised when a file download fails permanently or after all retry
    attempts are exhausted.

    Examples
    --------
    >>> raise DownloadError("Failed after 3 retries")  # doctest: +SKIP
    DownloadError: Failed after 3 retries
    """


class BrowserError(HumbleBundleError):
    """Browser automation failed.

    Raised when Playwright operations fail (page navigation, response capture,
    JavaScript execution).

    Examples
    --------
    >>> raise BrowserError("Page did not load within timeout")  # doctest: +SKIP
    BrowserError: Page did not load within timeout
    """


# =============== UTILITY FUNCTIONS ===============


def sanitize_filename(name: str) -> str:
    """Convert a string into a safe filename for cross-platform compatibility.

    Transforms filename by:
    - Replacing spaces with underscores (avoid leading/trailing whitespace)
    - Removing special characters except underscores and dots
    - Preserving Unicode word characters

    Parameters
    ----------
    name : str
        The filename string to sanitize

    Returns
    -------
    str
        Safe filename string suitable for use across all filesystems

    Examples
    --------
    >>> sanitize_filename("100 Things to See!")
    '100_Things_to_See'

    >>> sanitize_filename("A/B Testing (v1.0)")
    'AB_Testing_v1.0'

    >>> sanitize_filename("Café ☕")
    'Café_'

    >>> sanitize_filename("file.name.pdf")
    'file.name.pdf'

    Notes
    -----
    Non-alphanumeric characters are removed except dots and underscores.
    If all characters are removed, an empty string is returned.
    """
    name = name.replace(" ", "_")
    name = re.sub(r"[^\w\.-]", "", name)
    return name


def get_file_extension(format_str: str) -> str:
    """Extract and normalize file extension from format string.

    Maps format descriptions from the API to standardized file extensions.
    Handles various format representations (e.g., "PDF (HQ)", "M4B", "EPUB").

    The function applies a two-tier matching strategy:
    1. Exact keyword match against known format map
    2. Fallback to first word if it looks like an extension (<=5 chars, alphanumeric)
    3. Default to "bin" for unknown formats

    Parameters
    ----------
    format_str : str
        The format string from API (e.g., "PDF", "PDF (HQ)", "EPUB")

    Returns
    -------
    str
        File extension string without the dot (e.g., "pdf", "epub", "zip")

    Examples
    --------
    >>> get_file_extension("PDF (HQ)")
    'pdf'

    >>> get_file_extension("EPUB")
    'epub'

    >>> get_file_extension("M4B (Audiobook)")
    'm4b'

    >>> get_file_extension("")
    'bin'

    >>> get_file_extension("UNKNOWN_FORMAT")
    'bin'

    Notes
    -----
    Known formats: PDF, EPUB, MOBI, ZIP, M4B, MP3, AZW3, AWZ3
    """
    if not format_str:
        return "bin"

    format_lower: str = format_str.lower().strip()

    format_map: dict[str, str] = {
        "pdf": "pdf",
        "epub": "epub",
        "mobi": "mobi",
        "zip": "zip",
        "m4b": "m4b",
        "mp3": "mp3",
        "awz3": "awz3",
        "azw3": "azw3",
    }

    for key, ext in format_map.items():
        if key in format_lower:
            return ext

    first_word: str = format_lower.split()[0]
    if len(first_word) <= 5 and first_word.replace("_", "").isalnum():
        return first_word

    return "bin"


def validate_url(url: str) -> bool:
    """Validate URL format before attempting download or API call.

    Performs basic sanity checks to prevent:
    - Downloading from non-HTTP(S) URLs (avoid protocols like FTP, file://)
    - Processing empty or malformed URLs

    This is a lightweight validation; actual URL accessibility is checked
    during the download/request attempt.

    Parameters
    ----------
    url : str
        URL string to validate

    Returns
    -------
    bool
        True if URL appears valid (http:// or https://), False otherwise

    Examples
    --------
    >>> validate_url("https://example.com/file.pdf")
    True

    >>> validate_url("http://example.com/file.pdf")
    True

    >>> validate_url("ftp://example.com/file.pdf")
    False

    >>> validate_url("")
    False

    >>> validate_url("not a url")
    False
    """
    if not url:
        return False
    if not url.startswith(("http://", "https://")):
        return False
    return True
