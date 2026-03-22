"""Unit tests for utility functions (utils.py).

Tests exception hierarchy, sanitize_filename, get_file_extension, and validate_url.
"""

import pytest

from hb_library_viewer.utils import (
    HumbleBundleError,
    ConfigError,
    APIError,
    DownloadError,
    BrowserError,
    sanitize_filename,
    get_file_extension,
    validate_url,
)


class TestExceptionHierarchy:
    """Test custom exception hierarchy."""

    def test_base_exception(self):
        """Test HumbleBundleError is base exception."""
        exc = HumbleBundleError("Test error")
        assert isinstance(exc, Exception)
        assert str(exc) == "Test error"

    def test_config_error_inherits(self):
        """Test ConfigError inherits from HumbleBundleError."""
        exc = ConfigError("Config is invalid")
        assert isinstance(exc, HumbleBundleError)
        assert isinstance(exc, Exception)
        assert str(exc) == "Config is invalid"

    def test_api_error_inherits(self):
        """Test APIError inherits from HumbleBundleError."""
        exc = APIError("API call failed")
        assert isinstance(exc, HumbleBundleError)
        assert str(exc) == "API call failed"

    def test_download_error_inherits(self):
        """Test DownloadError inherits from HumbleBundleError."""
        exc = DownloadError("Download failed")
        assert isinstance(exc, HumbleBundleError)
        assert str(exc) == "Download failed"

    def test_browser_error_inherits(self):
        """Test BrowserError inherits from HumbleBundleError."""
        exc = BrowserError("Browser automation failed")
        assert isinstance(exc, HumbleBundleError)
        assert str(exc) == "Browser automation failed"

    def test_catching_base_exception(self):
        """Test that all custom exceptions can be caught with base class."""
        exceptions = [
            ConfigError("config"),
            APIError("api"),
            DownloadError("download"),
            BrowserError("browser"),
        ]

        for exc in exceptions:
            try:
                raise exc
            except HumbleBundleError as caught:
                assert caught is exc


class TestSanitizeFilename:
    """Test sanitize_filename function."""

    @pytest.mark.parametrize(
        "input_str,expected",
        [
            ("Simple Name", "Simple_Name"),
            ("100 Things to See!", "100_Things_to_See"),
            (
                "A/B Testing (v1.0)",
                "AB_Testing_v1.0",
            ),  # Space becomes _ before / and () removed
            ("file.name.pdf", "file.name.pdf"),
            ("", ""),
            ("   spaces   ", "___spaces___"),
            ("Under_Score", "Under_Score"),
            ("dots.are.ok", "dots.are.ok"),
            ("Mixed-chars@#$%", "Mixed-chars"),
        ],
    )
    def test_sanitization(self, input_str: str, expected: str):
        """Test various filename sanitization cases."""
        assert sanitize_filename(input_str) == expected

    def test_preserves_alphanumeric(self):
        """Test that alphanumeric characters are preserved."""
        result = sanitize_filename("abc123XYZ")
        assert result == "abc123XYZ"

    def test_preserves_underscores(self):
        """Test that underscores are preserved."""
        result = sanitize_filename("test_file_name")
        assert result == "test_file_name"

    def test_preserves_dots(self):
        """Test that dots are preserved."""
        result = sanitize_filename("archive.tar.gz")
        assert result == "archive.tar.gz"

    def test_replaces_spaces_with_underscores(self):
        """Test that spaces become underscores."""
        result = sanitize_filename("my test file")
        assert result == "my_test_file"

    def test_removes_special_characters(self):
        """Test that special characters are removed."""
        result = sanitize_filename("file!@#$%^&*()")
        assert result == "file"

    def test_handles_empty_string(self):
        """Test that empty string returns empty string."""
        result = sanitize_filename("")
        assert result == ""

    def test_handles_unicode_characters(self):
        """Test that Unicode word characters are preserved."""
        result = sanitize_filename("Tëst Fîlé")
        # Python's \w matches Unicode word characters
        # So accented letters may be preserved
        assert "_" in result  # Space becomes underscore
        assert isinstance(result, str)  # Returns valid string


class TestGetFileExtension:
    """Test get_file_extension function."""

    @pytest.mark.parametrize(
        "format_str,expected",
        [
            ("PDF (HQ)", "pdf"),
            ("PDF", "pdf"),
            ("EPUB", "epub"),
            ("MOBI", "mobi"),
            ("ZIP", "zip"),
            ("M4B", "m4b"),
            ("M4B (Audiobook)", "m4b"),
            ("MP3", "mp3"),
            ("AZW3", "azw3"),
            ("AWZ3", "azw3"),
            ("", "bin"),
            ("UNKNOWN_FORMAT", "bin"),
            ("PDF (Very High Quality)", "pdf"),
            ("epub (standard)", "epub"),
        ],
    )
    def test_known_formats(self, format_str: str, expected: str):
        """Test extraction from known format strings."""
        assert get_file_extension(format_str) == expected

    def test_case_insensitive(self):
        """Test that format matching is case-insensitive."""
        assert get_file_extension("pdf") == "pdf"
        assert get_file_extension("PDF") == "pdf"
        assert get_file_extension("Pdf") == "pdf"
        assert get_file_extension("EPUB") == "epub"
        assert get_file_extension("epub") == "epub"

    def test_extracts_from_parenthetical(self):
        """Test extraction when format is in parentheses."""
        assert get_file_extension("PDF (HQ)") == "pdf"
        assert get_file_extension("M4B (Audiobook)") == "m4b"

    def test_unknown_format_returns_bin(self):
        """Test that unknown formats return 'bin'."""
        assert get_file_extension("UNKNOWN") == "bin"
        assert get_file_extension("XYZ123") == "bin"

    def test_empty_string_returns_bin(self):
        """Test that empty string returns 'bin'."""
        assert get_file_extension("") == "bin"

    def test_short_extension_fallback(self):
        """Test fallback to first word if it looks like extension."""
        # First word is short and alphanumeric
        assert get_file_extension("abc") == "abc"
        assert get_file_extension("xyz other stuff") == "xyz"

    def test_long_first_word_returns_bin(self):
        """Test that long first word doesn't become extension."""
        # More than 5 characters
        result = get_file_extension("verylongword")
        assert result == "bin"


class TestValidateUrl:
    """Test validate_url function."""

    @pytest.mark.parametrize(
        "url,valid",
        [
            ("https://example.com/file.pdf", True),
            ("http://example.com/file.pdf", True),
            ("https://cdn.humblebundle.com/downloads/file.zip", True),
            ("http://localhost:8000/test", True),
            ("ftp://example.com/file.pdf", False),
            ("file:///path/to/file", False),
            ("", False),
            ("not a url", False),
            ("//example.com/file", False),
            ("javascript:alert(1)", False),
            ("data:text/html,<h1>test</h1>", False),
        ],
    )
    def test_url_validation(self, url: str, valid: bool):
        """Test URL validation for various cases."""
        assert validate_url(url) == valid

    def test_https_valid(self):
        """Test that HTTPS URLs are valid."""
        assert validate_url("https://example.com/file.pdf") is True

    def test_http_valid(self):
        """Test that HTTP URLs are valid."""
        assert validate_url("http://example.com/file.pdf") is True

    def test_ftp_invalid(self):
        """Test that FTP URLs are invalid."""
        assert validate_url("ftp://example.com/file.pdf") is False

    def test_file_protocol_invalid(self):
        """Test that file:// URLs are invalid."""
        assert validate_url("file:///path/to/file") is False

    def test_empty_string_invalid(self):
        """Test that empty string is invalid."""
        assert validate_url("") is False

    def test_non_url_invalid(self):
        """Test that non-URL strings are invalid."""
        assert validate_url("not a url") is False

    def test_relative_url_invalid(self):
        """Test that relative URLs are invalid."""
        assert validate_url("/path/to/file") is False
        assert validate_url("path/to/file") is False

    def test_protocol_relative_invalid(self):
        """Test that protocol-relative URLs are invalid."""
        assert validate_url("//example.com/file") is False

    def test_javascript_protocol_invalid(self):
        """Test that javascript: URLs are invalid."""
        assert validate_url("javascript:alert(1)") is False

    def test_data_url_invalid(self):
        """Test that data: URLs are invalid."""
        assert validate_url("data:text/html,<h1>test</h1>") is False
