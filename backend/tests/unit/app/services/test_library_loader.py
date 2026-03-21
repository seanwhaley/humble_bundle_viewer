"""Unit tests for viewer library loading and runtime enrichment."""

from __future__ import annotations

# pyright: reportPrivateUsage=false
# pylint: disable=protected-access

import importlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

library_loader = importlib.import_module("app.services.library_loader")
LibraryNotFoundError = library_loader.LibraryNotFoundError
clear_library_path_override = library_loader.clear_library_path_override
default_library_dir = library_loader.default_library_dir
default_download_dir = library_loader.default_download_dir
load_library = library_loader.load_library
resolve_subproduct_metadata_path = library_loader.resolve_subproduct_metadata_path
resolve_library_path = library_loader.resolve_library_path
set_library_path = library_loader.set_library_path


class TestLibraryLoader:
    """Verify library loader runtime joins for separate metadata artifacts."""

    def setup_method(self) -> None:
        """Reset process-local library overrides between tests."""
        clear_library_path_override()

    def test_load_library_joins_subproduct_page_details(self, tmp_path: Path) -> None:
        """Library loads should attach matching extracted page metadata."""
        library_path = tmp_path / "library_products.json"
        library_path.write_text(
            json.dumps(
                {
                    "products": [
                        {
                            "gamekey": "order-1",
                            "product_name": "Sample Bundle",
                            "machine_name": "sample_bundle",
                            "category": "ebook",
                            "downloads": [],
                            "keys": [],
                            "subproducts": [
                                {
                                    "human_name": "Sample Book",
                                    "machine_name": "sample_book",
                                    "url": "https://publisher.example.com/books/sample-book",
                                    "downloads": [],
                                    "keys": [],
                                    "payee": {"human_name": "Sample Publisher"},
                                }
                            ],
                        }
                    ],
                    "total_products": 1,
                    "captured_at": "2026-03-12T12:00:00",
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        metadata_dir = tmp_path / "subproduct_pages"
        metadata_dir.mkdir(parents=True)
        (metadata_dir / "metadata.json").write_text(
            json.dumps(
                {
                    "generated_at": "2026-03-12T12:30:00",
                    "total_entries": 1,
                    "items": [
                        {
                            "url": "https://publisher.example.com/books/sample-book",
                            "details": {
                                "url": "https://publisher.example.com/books/sample-book",
                                "title": "Sample Book",
                                "description": "A sample description.",
                                "authors": ["Ada Lovelace"],
                                "publisher": "Example Press",
                            },
                        }
                    ],
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        set_library_path(library_path)
        library = load_library()

        assert library.products[0].subproducts is not None
        subproduct = library.products[0].subproducts[0]
        assert subproduct.page_details is not None
        assert subproduct.page_details.title == "Sample Book"
        assert subproduct.page_details.authors == ["Ada Lovelace"]
        assert subproduct.page_details.description == "A sample description."

    def test_resolve_library_path_uses_viewer_config(
        self,
        tmp_path: Path,
        monkeypatch,
    ) -> None:
        """Viewer config should supply the default active library path."""
        library_path = tmp_path / "configured-library.json"
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "viewer:",
                    f"  library_path: {library_path.as_posix()}",
                ]
            ),
            encoding="utf-8",
        )

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))

        assert resolve_library_path() == library_path.resolve()

    def test_default_library_dir_uses_viewer_config(
        self,
        tmp_path: Path,
        monkeypatch,
    ) -> None:
        """Viewer config should be able to override the setup page default folder."""
        configured_dir = tmp_path / "viewer-output"
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "viewer:",
                    f"  default_library_dir: {configured_dir.as_posix()}",
                ]
            ),
            encoding="utf-8",
        )

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))

        assert default_library_dir() == configured_dir.resolve()

    def test_resolve_library_path_uses_configured_artifacts_dir(
        self,
        tmp_path: Path,
        monkeypatch,
    ) -> None:
        """Artifacts config should supply the default viewer library path."""
        artifacts_dir = tmp_path / "custom-artifacts"
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "artifacts:",
                    f"  base_dir: {artifacts_dir.as_posix()}",
                ]
            ),
            encoding="utf-8",
        )

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.setattr(library_loader, "_find_repo_library_path", lambda: None)

        assert (
            resolve_library_path() == artifacts_dir.resolve() / "library_products.json"
        )

    def test_default_download_dir_is_alias_for_library_dir(self, monkeypatch) -> None:
        """Download-dir helper should stay aligned with the default library dir."""
        expected = Path.home() / "Downloads"
        monkeypatch.delenv("HUMBLE_CONFIG_YAML", raising=False)

        assert default_download_dir() == expected.resolve()

    def test_resolve_library_path_prefers_process_override(
        self,
        tmp_path: Path,
    ) -> None:
        """Process-local override should beat config/default discovery."""
        override_path = tmp_path / "override-library.json"

        set_library_path(override_path)

        assert resolve_library_path() == override_path

    def test_resolve_subproduct_metadata_path_prefers_neighbor_file(
        self,
        tmp_path: Path,
    ) -> None:
        """Metadata should resolve next to the active library when present."""
        library_path = tmp_path / "library_products.json"
        metadata_dir = tmp_path / "subproduct_pages"
        metadata_dir.mkdir(parents=True)
        metadata_path = metadata_dir / "metadata.json"
        metadata_path.write_text("{}", encoding="utf-8")

        set_library_path(library_path)

        assert resolve_subproduct_metadata_path() == metadata_path

    def test_find_repo_library_path_discovers_parent_artifacts_file(
        self,
        tmp_path: Path,
        monkeypatch,
    ) -> None:
        """Repository discovery should locate a library file in parent data/artifacts."""
        package_root = tmp_path / "backend" / "app" / "services"
        package_root.mkdir(parents=True)
        fake_service_file = package_root / "library_loader.py"
        fake_service_file.write_text("# test", encoding="utf-8")
        discovered_path = (
            tmp_path / "backend" / "data" / "artifacts" / "library_products.json"
        )
        discovered_path.parent.mkdir(parents=True)
        discovered_path.write_text("{}", encoding="utf-8")

        monkeypatch.setattr(library_loader, "__file__", str(fake_service_file))

        assert library_loader._find_repo_library_path() == discovered_path

    def test_resolve_library_path_uses_discovered_repo_file_when_config_missing(
        self,
        tmp_path: Path,
        monkeypatch,
    ) -> None:
        """Repo discovery should be used when there is no override or configured viewer path."""
        discovered_path = tmp_path / "data" / "artifacts" / "library_products.json"
        monkeypatch.setattr(
            library_loader,
            "RuntimeSettings",
            lambda: SimpleNamespace(viewer=SimpleNamespace(library_path=None)),
        )
        monkeypatch.setattr(
            library_loader,
            "_runtime_library_path_defaults",
            lambda: (
                tmp_path / "configured-artifacts" / "library_products.json",
                tmp_path / "configured-cache" / "metadata.json",
            ),
        )
        monkeypatch.setattr(
            library_loader,
            "_find_repo_library_path",
            lambda: discovered_path,
        )

        assert resolve_library_path() == discovered_path

    def test_resolve_library_path_falls_back_to_default_when_nothing_else_exists(
        self,
        tmp_path: Path,
        monkeypatch,
    ) -> None:
        """Default library path should be returned when no override, config, or discovery exists."""
        configured_default_path = (
            tmp_path / "configured-artifacts" / "library_products.json"
        )
        monkeypatch.setattr(
            library_loader,
            "RuntimeSettings",
            lambda: SimpleNamespace(viewer=SimpleNamespace(library_path=None)),
        )
        monkeypatch.setattr(
            library_loader,
            "_runtime_library_path_defaults",
            lambda: (
                configured_default_path,
                tmp_path / "configured-cache" / "metadata.json",
            ),
        )
        monkeypatch.setattr(library_loader, "_find_repo_library_path", lambda: None)

        assert resolve_library_path() == configured_default_path

    def test_resolve_subproduct_metadata_path_uses_default_fallback(
        self,
        tmp_path: Path,
        monkeypatch,
    ) -> None:
        """Metadata resolution should fall back to the default artifacts directory when present."""
        fallback_root = tmp_path / "artifacts"
        fallback_metadata = fallback_root / "subproduct_pages" / "metadata.json"
        fallback_metadata.parent.mkdir(parents=True)
        fallback_metadata.write_text("{}", encoding="utf-8")

        monkeypatch.setattr(
            library_loader,
            "resolve_library_path",
            lambda: tmp_path / "library_products.json",
        )
        monkeypatch.setattr(
            library_loader,
            "_runtime_library_path_defaults",
            lambda: (
                fallback_root / "library_products.json",
                fallback_metadata,
            ),
        )

        assert resolve_subproduct_metadata_path() == fallback_metadata

    def test_resolve_subproduct_metadata_path_uses_configured_cache_dir(
        self,
        tmp_path: Path,
        monkeypatch,
    ) -> None:
        """Subproduct metadata fallback should honor subproduct_pages.base_dir."""
        cache_dir = tmp_path / "custom-subproduct-cache"
        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text(
            "\n".join(
                [
                    "subproduct_pages:",
                    f"  base_dir: {cache_dir.as_posix()}",
                ]
            ),
            encoding="utf-8",
        )

        monkeypatch.setenv("HUMBLE_CONFIG_YAML", str(config_yaml))
        monkeypatch.setattr(
            library_loader,
            "resolve_library_path",
            lambda: tmp_path / "library_products.json",
        )

        assert (
            resolve_subproduct_metadata_path() == cache_dir.resolve() / "metadata.json"
        )

    def test_load_library_raises_when_missing(self, tmp_path: Path) -> None:
        """Missing library JSON should raise the service-specific error."""
        set_library_path(tmp_path / "missing-library.json")

        with pytest.raises(
            LibraryNotFoundError, match="library_products.json not found"
        ):
            load_library()

    def test_load_library_returns_plain_library_when_metadata_missing(
        self,
        tmp_path: Path,
    ) -> None:
        """Library loads should succeed without subproduct metadata artifacts."""
        library_path = tmp_path / "library_products.json"
        library_path.write_text(
            json.dumps(
                {
                    "products": [
                        {
                            "gamekey": "order-1",
                            "product_name": "Sample Bundle",
                            "machine_name": "sample_bundle",
                            "category": "ebook",
                            "downloads": [],
                            "keys": [],
                            "subproducts": [
                                {
                                    "human_name": "Sample Book",
                                    "machine_name": "sample_book",
                                    "url": "https://publisher.example.com/books/sample-book",
                                    "downloads": [],
                                    "keys": [],
                                    "payee": {"human_name": "Sample Publisher"},
                                }
                            ],
                        }
                    ],
                    "total_products": 1,
                    "captured_at": "2026-03-12T12:00:00",
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        set_library_path(library_path)
        library = load_library()

        assert library.products[0].subproducts is not None
        assert library.products[0].subproducts[0].page_details is None

    def test_load_library_normalizes_missing_download_file_types(
        self, tmp_path: Path
    ) -> None:
        """Library loads should populate file_type for older artifacts missing it."""
        library_path = tmp_path / "library_products.json"
        library_path.write_text(
            json.dumps(
                {
                    "products": [
                        {
                            "gamekey": "order-1",
                            "product_name": "Sample Bundle",
                            "machine_name": "sample_bundle",
                            "category": "ebook",
                            "downloads": [
                                {
                                    "platform": "ebook",
                                    "name": "Direct Download",
                                    "url": "https://cdn.example.com/direct-book.pdf",
                                    "size_bytes": 10,
                                    "checksums": {},
                                    "file_type": None,
                                }
                            ],
                            "keys": [],
                            "subproducts": [
                                {
                                    "human_name": "Sample Book",
                                    "machine_name": "sample_book",
                                    "url": "https://publisher.example.com/books/sample-book",
                                    "downloads": [
                                        {
                                            "platform": "ebook",
                                            "name": "Download",
                                            "url": "https://cdn.example.com/sample-book.epub",
                                            "size_bytes": 20,
                                            "checksums": {},
                                            "file_type": None,
                                        }
                                    ],
                                    "keys": [],
                                    "payee": {"human_name": "Sample Publisher"},
                                }
                            ],
                        }
                    ],
                    "total_products": 1,
                    "captured_at": "2026-03-12T12:00:00",
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        set_library_path(library_path)
        library = load_library()

        assert library.products[0].downloads is not None
        assert library.products[0].downloads[0].file_type == "pdf"
        assert library.products[0].downloads[0].display_category == "ebook"
        assert library.products[0].downloads[0].content_label == "PDF"
        assert library.products[0].downloads[0].display_label == "PDF"
        assert library.products[0].subproducts is not None
        assert library.products[0].subproducts[0].downloads is not None
        assert library.products[0].subproducts[0].downloads[0].file_type == "epub"
        assert (
            library.products[0].subproducts[0].downloads[0].display_category == "ebook"
        )
        assert library.products[0].subproducts[0].downloads[0].content_label == "EPUB"
        assert library.products[0].subproducts[0].downloads[0].display_label == "EPUB"
