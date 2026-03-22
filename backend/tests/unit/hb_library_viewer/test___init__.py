"""Unit tests for the public hb_library_viewer package exports."""

from __future__ import annotations

import pytest

import hb_library_viewer


@pytest.mark.unit
class TestPackageInit:
    """Verify version metadata and public exports from package init."""

    def test_public_api_exports_expected_symbols(self) -> None:
        exported = set(hb_library_viewer.__all__)

        assert "Settings" in exported
        assert "FileDownloader" in exported
        assert "build_library_json" in exported
        assert hb_library_viewer.Settings is not None
        assert hb_library_viewer.FileDownloader is not None

    def test_package_metadata_is_available(self) -> None:
        assert hb_library_viewer.__version__ == "1.0.0"
        assert "Contributors" in hb_library_viewer.__author__