"""Unit tests for parsing module (parsing.py).

Tests Download, Product, and LibraryData models and build_library_json function.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, cast

import pytest
from pydantic import ValidationError

from hb_library_viewer.config import APIConfig
from hb_library_viewer.parsing import (
    Download,
    Product,
    LibraryData,
    _parse_download_groups,
    _parse_simple_downloads,
    build_library_json,
)


class TestDownloadModel:
    """Test Download model creation, validation, and serialization."""

    def test_creation_with_all_fields(self):
        """Test creating Download with all fields."""
        download = Download(
            platform="ebook",
            name="Test_Book.pdf",
            url="https://cdn.humblebundle.com/test.pdf",
            size_bytes=2048000,
            checksums={"md5": "abc123", "sha1": "def456"},
        )
        assert download.platform == "ebook"
        assert download.name == "Test_Book.pdf"
        assert download.url == "https://cdn.humblebundle.com/test.pdf"
        assert download.size_bytes == 2048000
        assert download.checksums == {"md5": "abc123", "sha1": "def456"}

    def test_required_fields(self):
        """Test that required fields (platform, name, url) must be provided."""
        with pytest.raises(ValidationError):
            Download()  # type: ignore[call-arg]

        with pytest.raises(ValidationError):
            Download(  # type: ignore[call-arg]
                platform="ebook", name="test.pdf"
            )  # Missing url

    def test_optional_fields_defaults(self):
        """Test optional fields have sensible defaults."""
        download = Download(
            platform="ebook", name="test.pdf", url="https://example.com/test.pdf"
        )
        assert download.size_bytes == 0  # Default
        assert download.checksums == {}  # Default empty dict

    def test_size_bytes_non_negative(self):
        """Test size_bytes must be non-negative."""
        with pytest.raises(ValidationError):
            Download(
                platform="ebook",
                name="test.pdf",
                url="https://example.com/test.pdf",
                size_bytes=-100,
            )

    def test_serialization(self):
        """Test Download can be serialized to dict and JSON."""
        download = Download(
            platform="audio",
            name="Book.m4b",
            url="https://example.com/book.m4b",
            size_bytes=50000000,
            checksums={"md5": "xyz789"},
        )
        # Test model_dump
        data = download.model_dump()
        assert data["platform"] == "audio"
        assert data["name"] == "Book.m4b"

        # Test model_dump_json
        json_str = download.model_dump_json()
        parsed = json.loads(json_str)
        assert parsed["platform"] == "audio"

    @pytest.mark.parametrize(
        "platform",
        ["ebook", "audio", "video", "android", "windows", "mac", "linux"],
    )
    def test_various_platforms(self, platform: str):
        """Test Download accepts various platform types."""
        download = Download(
            platform=platform, name="file.bin", url="https://example.com/file.bin"
        )
        assert download.platform == platform


class TestProductModel:
    """Test Product model with download aggregation."""

    def test_creation_with_downloads(self, sample_download: Download):
        """Test creating Product with downloads list."""
        product = Product(
            gamekey="key123",
            product_name="Test Product",
            machine_name="test_product",
            category="ebook",
            downloads=[sample_download],
            amount_spent=12.99,
        )
        assert product.gamekey == "key123"
        assert product.product_name == "Test Product"
        assert len(product.downloads) == 1
        assert product.amount_spent == 12.99

    def test_required_fields(self):
        """Test Product required fields."""
        with pytest.raises(ValidationError):
            Product()  # type: ignore[call-arg]

        # Missing gamekey
        with pytest.raises(ValidationError):
            Product(
                product_name="Test",
                machine_name="test",
                category="ebook",
            )  # type: ignore[call-arg]

    def test_optional_fields_defaults(self):
        """Test Product optional field defaults."""
        product = Product(
            gamekey="key456",
            product_name="Minimal Product",
            machine_name="minimal",
            category="ebook",
        )
        assert product.downloads == []  # Default empty list
        assert product.subproducts == []  # Default empty list
        assert product.amount_spent == 0.0  # Default

    def test_multiple_downloads(self):
        """Test Product with multiple downloads."""
        downloads = [
            Download(
                platform="ebook",
                name="book.pdf",
                url="https://example.com/book.pdf",
            ),
            Download(
                platform="ebook",
                name="book.epub",
                url="https://example.com/book.epub",
            ),
            Download(
                platform="audio",
                name="book.m4b",
                url="https://example.com/book.m4b",
            ),
        ]
        product = Product(
            gamekey="multi123",
            product_name="Multi-Format Book",
            machine_name="multi_format",
            category="ebook",
            downloads=downloads,
        )
        assert len(product.downloads) == 3
        assert product.downloads[0].platform == "ebook"
        assert product.downloads[2].platform == "audio"

    def test_amount_spent_non_negative(self):
        """Test amount_spent must be non-negative."""
        with pytest.raises(ValidationError):
            Product(
                gamekey="key789",
                product_name="Test",
                machine_name="test",
                category="ebook",
                amount_spent=-5.0,
            )

    def test_serialization(self):
        """Test Product serialization includes nested downloads."""
        product = Product(
            gamekey="serial123",
            product_name="Serialization Test",
            machine_name="serialization_test",
            category="ebook",
            downloads=[
                Download(
                    platform="ebook",
                    name="test.pdf",
                    url="https://example.com/test.pdf",
                )
            ],
        )
        data = product.model_dump()
        assert data["gamekey"] == "serial123"
        assert len(data["downloads"]) == 1
        assert data["downloads"][0]["name"] == "test.pdf"

    @pytest.mark.parametrize(
        "category", ["ebook", "audiobook", "video", "game", "software"]
    )
    def test_various_categories(self, category: str):
        """Test Product accepts various categories."""
        product = Product(
            gamekey=f"key_{category}",
            product_name=f"Test {category}",
            machine_name=f"test_{category}",
            category=category,
        )
        assert product.category == category


class TestLibraryData:
    """Test LibraryData model, aggregation, and serialization."""

    def test_creation_with_products(self, sample_product: Product):
        """Test creating LibraryData with products."""
        lib_data = LibraryData(
            products=[sample_product],
            total_products=1,
            captured_at="2026-01-30T12:00:00",
        )
        assert len(lib_data.products) == 1
        assert lib_data.total_products == 1
        assert lib_data.captured_at == "2026-01-30T12:00:00"

    def test_empty_library(self):
        """Test LibraryData with empty products list."""
        lib_data = LibraryData(
            products=[], total_products=0, captured_at="2026-01-30T12:00:00"
        )
        assert lib_data.products == []
        assert lib_data.total_products == 0

    def test_required_fields(self):
        """Test LibraryData required field (captured_at)."""
        with pytest.raises(ValidationError):
            LibraryData(products=[], total_products=0)  # type: ignore[call-arg]

    def test_defaults(self):
        """Test LibraryData optional field defaults."""
        lib_data = LibraryData(captured_at="2026-01-30T12:00:00")
        assert lib_data.products == []
        assert lib_data.total_products == 0

    def test_json_serialization(self, sample_product: Product):
        """Test LibraryData serialization to JSON."""
        lib_data = LibraryData(
            products=[sample_product],
            total_products=1,
            captured_at="2026-01-30T12:00:00",
        )
        json_str = lib_data.model_dump_json(indent=2)
        parsed = json.loads(json_str)

        assert parsed["total_products"] == 1
        assert len(parsed["products"]) == 1
        assert parsed["products"][0]["gamekey"] == sample_product.gamekey

    def test_json_deserialization(self):
        """Test creating LibraryData from JSON."""
        json_data = {
            "products": [
                {
                    "gamekey": "deser123",
                    "product_name": "Deserialized Product",
                    "machine_name": "deserialized",
                    "category": "ebook",
                    "downloads": [],
                    "amount_spent": 5.0,
                }
            ],
            "total_products": 1,
            "captured_at": "2026-01-30T12:00:00",
        }
        lib_data = LibraryData(**json_data)
        assert lib_data.total_products == 1
        assert lib_data.products[0].gamekey == "deser123"

    def test_total_products_non_negative(self):
        """Test total_products must be non-negative."""
        with pytest.raises(ValidationError):
            LibraryData(
                products=[], total_products=-1, captured_at="2026-01-30T12:00:00"
            )


class TestParseHelpers:
    """Test parsing helper functions for download extraction."""

    def test_parse_download_groups_edge_cases(self):
        downloads = _parse_download_groups(
            [
                "not-a-dict",
                {"platform": "ebook", "download_struct": "not-list"},
                {
                    "platform": "ebook",
                    "download_struct": [
                        "not-a-dict",
                        {"name": "file", "url": "not-a-dict"},
                    ],
                },
                {
                    "platform": "ebook",
                    "download_struct": [
                        {
                            "name": "book",
                            "url": {"web": "https://example.com/book.epub"},
                        }
                    ],
                },
            ],
            "Product",
            APIConfig(),
        )

        assert len(downloads) == 1
        assert downloads[0].file_type == "epub"

    def test_parse_simple_downloads_edge_cases(self):
        downloads = _parse_simple_downloads(
            cast(
                Any,
                [
                    "not-a-dict",
                    {"name": "missing-url"},
                    {"name": "file", "url": "https://example.com/file.pdf"},
                ],
            )
        )

        assert len(downloads) == 1
        assert downloads[0].file_type == "pdf"


class TestBuildLibraryJson:
    """Test build_library_json function for parsing API batches."""

    def test_missing_order_model_raises(self, sample_api_response: Dict[str, Any]):
        missing_path = Path("missing_order_model.py")
        with pytest.raises(ValueError):
            build_library_json([sample_api_response], order_model_path=missing_path)

    def test_missing_order_model_class_raises(self, tmp_path: Path):
        model_path = tmp_path / "order_payload_models.py"
        model_path.write_text("class OtherModel: pass\n", encoding="utf-8")

        with pytest.raises(ValueError):
            build_library_json([], order_model_path=model_path)

    def test_orders_data_not_dict_skipped(self, order_model_path: Any):
        batch = {"data": json.dumps(["not-a-dict"])}
        lib_data = build_library_json([batch], order_model_path=order_model_path)

        assert lib_data.total_products == 0

    def test_single_batch_parsing(
        self, sample_api_response: Dict[str, Any], order_model_path: Any
    ):
        """Test parsing single API batch."""
        lib_data = build_library_json(
            [sample_api_response], order_model_path=order_model_path
        )

        assert lib_data.total_products == 1
        assert len(lib_data.products) == 1

        product = lib_data.products[0]
        assert product.gamekey == "gamekey123"
        assert product.product_name == "The Sample Book"
        assert product.category == "ebook"
        assert product.created_at == "2026-01-01T00:00:00"
        assert len(product.downloads) == 2  # PDF and EPUB
        assert product.downloads[0].file_type == "pdf"
        assert len(product.subproducts) == 1
        assert (
            product.subproducts[0].url
            == "https://publisher.example.com/books/the-sample-book"
        )
        assert len(product.subproducts[0].downloads) == 2
        assert len(product.keys) == 1
        assert product.keys[0].key_type == "steam"

    def test_generated_model_validation(
        self, tmp_path: Any, sample_api_response: Dict[str, Any]
    ):
        """Test optional validation against a generated order model file."""
        model_path = tmp_path / "order_payload_models.py"
        model_path.write_text(
            "from pydantic import BaseModel, RootModel, ConfigDict\n"
            "class OrderPayloadItem(BaseModel):\n"
            "    model_config = ConfigDict(extra='allow')\n"
            "class OrderPayloadList(RootModel[list[OrderPayloadItem]]):\n"
            "    root: list[OrderPayloadItem]\n",
            encoding="utf-8",
        )

        lib_data = build_library_json(
            [sample_api_response],
            order_model_path=model_path,
        )

        assert lib_data.total_products == 1

    def test_keys_only_bundle(
        self, sample_api_response_keys_only: Dict[str, Any], order_model_path: Any
    ):
        """Test parsing tpkd_dict entries when no subproducts exist."""
        lib_data = build_library_json(
            [sample_api_response_keys_only], order_model_path=order_model_path
        )

        assert lib_data.total_products == 1
        product = lib_data.products[0]
        assert product.product_name == "Key Bundle"
        assert product.downloads == []
        assert len(product.keys) == 2
        assert {entry.key_type for entry in product.keys} == {
            "epic",
            "external_key",
        }

    def test_multiple_batches(
        self, sample_api_batch_multiple: List[Dict[str, Any]], order_model_path: Any
    ):
        """Test parsing multiple API batches."""
        lib_data = build_library_json(
            sample_api_batch_multiple, order_model_path=order_model_path
        )

        assert lib_data.total_products == 2
        assert len(lib_data.products) == 2

        # Verify first product
        assert lib_data.products[0].product_name == "Book One"
        assert lib_data.products[0].category == "ebook"

        # Verify second product
        assert lib_data.products[1].product_name == "Book Two"
        assert lib_data.products[1].category == "audiobook"

    def test_empty_batch(
        self, empty_api_response: Dict[str, Any], order_model_path: Any
    ):
        """Test parsing empty API batch."""
        lib_data = build_library_json(
            [empty_api_response], order_model_path=order_model_path
        )

        assert lib_data.total_products == 0
        assert lib_data.products == []

    def test_empty_list(self, order_model_path: Any):
        """Test with empty batch list."""
        lib_data = build_library_json([], order_model_path=order_model_path)

        assert lib_data.total_products == 0
        assert lib_data.products == []

    def test_malformed_json_graceful_degradation(
        self, malformed_api_response: Dict[str, Any], order_model_path: Any
    ):
        """Test that malformed JSON is logged and skipped."""
        # Should not raise, but log error and continue
        lib_data = build_library_json(
            [malformed_api_response], order_model_path=order_model_path
        )

        # No products parsed from malformed batch
        assert lib_data.total_products == 0

    def test_missing_data_field_skips_batch(self, order_model_path: Any):
        """Test that batches without data are skipped."""
        lib_data = build_library_json([{}], order_model_path=order_model_path)
        assert lib_data.total_products == 0

    def test_non_dict_order_skipped(self, order_model_path: Any):
        """Test that non-dict orders are skipped."""
        batch = {"data": json.dumps({"key1": "not-a-dict"})}
        lib_data = build_library_json([batch], order_model_path=order_model_path)
        assert lib_data.total_products == 0

    def test_tpkd_entries_skipped_on_invalid(self, order_model_path: Any):
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "Keys",
                            "machine_name": "keys",
                            "category": "ebook",
                        },
                        "tpkd_dict": {"all_tpks": ["bad", {}]},
                        "subproducts": [],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)
        assert lib_data.total_products == 1
        assert lib_data.products[0].keys == []

    def test_subproduct_non_dict_and_payee_non_dict(self, order_model_path: Any):
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "Subproduct",
                            "machine_name": "subproduct",
                            "category": "ebook",
                        },
                        "subproducts": [
                            "not-a-dict",
                            {
                                "machine_name": "sub1",
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "file",
                                                "url": {
                                                    "web": "https://example.com/file.pdf"
                                                },
                                            }
                                        ],
                                    }
                                ],
                                "payee": "not-a-dict",
                            },
                        ],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)
        assert lib_data.total_products == 1
        assert lib_data.products[0].subproducts
        assert lib_data.products[0].subproducts[0].payee is None

    def test_top_level_downloads_parsed(self, order_model_path: Any):
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "Top",
                            "machine_name": "top",
                            "category": "ebook",
                        },
                        "downloads": [
                            {
                                "name": "file",
                                "url": "https://example.com/file.pdf",
                                "platform": "ebook",
                            }
                        ],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)
        assert lib_data.products[0].downloads
        assert lib_data.products[0].downloads[0].file_type == "pdf"

    def test_bittorrent_fallback_used(self, order_model_path: Any):
        """Test bittorrent URL fallback when web URL is missing."""
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "Torrent",
                            "machine_name": "torrent",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "file.bin",
                                                "url": {
                                                    "bittorrent": "https://example.com/file.torrent"
                                                },
                                            }
                                        ],
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)
        assert (
            lib_data.products[0].downloads[0].url == "https://example.com/file.torrent"
        )

    def test_missing_url_skips_download(self, order_model_path: Any):
        """Test that downloads without URLs are skipped."""
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "No URL",
                            "machine_name": "no_url",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {"name": "file.bin", "url": {}}
                                        ],
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)
        assert lib_data.products[0].downloads == []

    def test_file_parse_error_logged(self, order_model_path: Any):
        """Test file parse errors are skipped without stopping."""
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "Bad File",
                            "machine_name": "bad_file",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [None],
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)
        assert lib_data.total_products == 1
        assert lib_data.products[0].downloads == []

    def test_product_parse_error_logged(self, order_model_path: Any):
        """Test product parse errors are skipped without stopping."""
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "Bad Product",
                            "machine_name": "bad_product",
                            "category": "ebook",
                        },
                        "amount_spent": "not-a-number",
                        "subproducts": [],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)
        assert lib_data.total_products == 0

    def test_batch_unexpected_error_logged(self, order_model_path: Any):
        """Test unexpected batch errors are handled."""
        lib_data = build_library_json(
            ["not-a-dict"],  # type: ignore[arg-type]
            order_model_path=order_model_path,
        )
        assert lib_data.total_products == 0

    def test_batch_type_error_logged(self, order_model_path: Any):
        batch = {"data": []}
        lib_data = build_library_json([batch], order_model_path=order_model_path)
        assert lib_data.total_products == 0

    def test_relative_url_conversion(self, order_model_path: Any):
        """Test that relative URLs are converted to absolute."""
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "URL Test",
                            "machine_name": "url_test",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "test.pdf",
                                                "url": {"web": "/downloads/test.pdf"},
                                                "file_size": 1000,
                                            }
                                        ],
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        }
        lib_data = build_library_json([batch], order_model_path=order_model_path)

        # URL should be converted to absolute
        download = lib_data.products[0].downloads[0]
        assert download.url.startswith("https://www.humblebundle.com/")

    def test_relative_url_conversion_uses_api_config_endpoint(
        self, order_model_path: Any
    ):
        """Test that relative URLs use the configured API endpoint base."""
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "URL Test",
                            "machine_name": "url_test",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "test.pdf",
                                                "url": {"web": "/downloads/test.pdf"},
                                                "file_size": 1000,
                                            }
                                        ],
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        }
        lib_data = build_library_json(
            [batch],
            order_model_path=order_model_path,
            api_config=APIConfig(endpoint="https://example.humble.local/"),
        )

        download = lib_data.products[0].downloads[0]
        assert download.url == "https://example.humble.local/downloads/test.pdf"

    def test_absolute_url_preserved(self, order_model_path: Any):
        """Test that absolute URLs are preserved as-is."""
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "Absolute URL Test",
                            "machine_name": "abs_url_test",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "test.pdf",
                                                "url": {
                                                    "web": "https://cdn.humblebundle.com/test.pdf"
                                                },
                                                "file_size": 1000,
                                            }
                                        ],
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        }
        lib_data = build_library_json([batch], order_model_path=order_model_path)

        download = lib_data.products[0].downloads[0]
        assert download.url == "https://cdn.humblebundle.com/test.pdf"

    def test_checksums_extracted(self, order_model_path: Any):
        """Test that MD5 and SHA1 checksums are extracted."""
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "Checksum Test",
                            "machine_name": "checksum_test",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "test.pdf",
                                                "url": {
                                                    "web": "https://example.com/test.pdf"
                                                },
                                                "file_size": 1000,
                                                "md5": "abc123",
                                                "sha1": "def456",
                                            }
                                        ],
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        }
        lib_data = build_library_json([batch], order_model_path=order_model_path)

        download = lib_data.products[0].downloads[0]
        assert download.checksums["md5"] == "abc123"
        assert download.checksums["sha1"] == "def456"

    def test_subproducts_normalized(
        self, sample_api_response: Dict[str, Any], order_model_path: Any
    ):
        """Test that subproducts are normalized into the product payload."""
        lib_data = build_library_json(
            [sample_api_response], order_model_path=order_model_path
        )

        product = lib_data.products[0]
        assert product.subproducts
        assert product.subproducts[0].human_name == "The Sample Book"
        assert (
            product.subproducts[0].url
            == "https://publisher.example.com/books/the-sample-book"
        )
        assert len(product.subproducts[0].downloads) == 2

    def test_captured_at_timestamp(self, order_model_path: Any):
        """Test that captured_at timestamp is in ISO format."""
        lib_data = build_library_json([], order_model_path=order_model_path)

        # Should be ISO 8601 format
        captured_at = lib_data.captured_at
        # Verify it can be parsed as datetime
        datetime.fromisoformat(captured_at)
