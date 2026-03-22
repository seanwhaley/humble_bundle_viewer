"""Integration tests for parsing models with API responses.

Tests build_library_json with sample responses and JSON serialization roundtrip.
"""

import json
from typing import Any, Dict, List

import pytest

from hb_library_viewer.parsing import (
    build_library_json,
    LibraryData,
    Product,
    Download,
)


@pytest.mark.integration
class TestBuildLibraryJsonIntegration:
    """Test build_library_json with realistic API responses."""

    def test_build_from_single_batch(
        self, sample_api_response: Dict[str, Any], order_model_path: Any
    ):
        """Test building LibraryData from single API batch."""
        lib_data = build_library_json(
            [sample_api_response], order_model_path=order_model_path
        )

        assert isinstance(lib_data, LibraryData)
        assert lib_data.total_products == 1
        assert len(lib_data.products) == 1

        product = lib_data.products[0]
        assert isinstance(product, Product)
        assert product.gamekey == "gamekey123"
        assert product.product_name == "The Sample Book"
        assert product.raw_order["product"]["human_name"] == "The Sample Book"
        assert lib_data.api_responses
        assert "gamekey123" in lib_data.raw_orders
        assert (
            product.subproducts[0].url
            == "https://publisher.example.com/books/the-sample-book"
        )

        # Should have 2 downloads (PDF and EPUB)
        assert len(product.downloads) == 2
        assert len(product.keys) == 1
        assert product.keys[0].key_type == "steam"
        for download in product.downloads:
            assert isinstance(download, Download)

    def test_build_from_multiple_batches(
        self, sample_api_batch_multiple: List[Dict[str, Any]], order_model_path: Any
    ):
        """Test building LibraryData from multiple API batches."""
        lib_data = build_library_json(
            sample_api_batch_multiple, order_model_path=order_model_path
        )

        assert lib_data.total_products == 2
        assert len(lib_data.products) == 2

        # Verify products from different batches
        product1 = lib_data.products[0]
        assert product1.product_name == "Book One"
        assert product1.category == "ebook"

        product2 = lib_data.products[1]
        assert product2.product_name == "Book Two"
        assert product2.category == "audiobook"

    def test_build_with_mixed_valid_invalid_batches(
        self,
        sample_api_response: Dict[str, Any],
        malformed_api_response: Dict[str, Any],
        order_model_path: Any,
    ):
        """Test graceful handling of mixed valid/invalid batches."""
        batches = [sample_api_response, malformed_api_response, sample_api_response]

        # Should not raise, malformed batch is skipped
        lib_data = build_library_json(batches, order_model_path=order_model_path)

        # Only valid batches contribute products
        assert lib_data.total_products == 2  # Two valid batches

    def test_product_metadata_extraction(self, order_model_path: Any):
        """Test that all product metadata is correctly extracted."""
        batch = {
            "data": json.dumps(
                {
                    "detailed_key": {
                        "product": {
                            "human_name": "Detailed Product",
                            "machine_name": "detailed_product",
                            "category": "ebook",
                        },
                        "amount_spent": 25.50,
                        "subproducts": [],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)
        product = lib_data.products[0]

        assert product.gamekey == "detailed_key"
        assert product.product_name == "Detailed Product"
        assert product.machine_name == "detailed_product"
        assert product.category == "ebook"
        assert product.amount_spent == 25.50

    def test_download_metadata_extraction(self, order_model_path: Any):
        """Test that download metadata is correctly extracted."""
        batch = {
            "data": json.dumps(
                {
                    "key1": {
                        "product": {
                            "human_name": "Download Test",
                            "machine_name": "download_test",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "Test_Book.pdf",
                                                "url": {
                                                    "web": "https://cdn.humblebundle.com/test.pdf"
                                                },
                                                "file_size": 3145728,
                                                "md5": "abc123def456",
                                                "sha1": "789ghi012jkl",
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

        assert download.platform == "ebook"
        assert download.name == "Test_Book.pdf"
        assert download.url == "https://cdn.humblebundle.com/test.pdf"
        assert download.size_bytes == 3145728
        assert download.checksums["md5"] == "abc123def456"
        assert download.checksums["sha1"] == "789ghi012jkl"


@pytest.mark.integration
class TestProductModelCreationFromApi:
    """Test creating Product models from API data."""

    def test_product_with_multiple_platforms(self, order_model_path: Any):
        """Test product with downloads across multiple platforms."""
        batch = {
            "data": json.dumps(
                {
                    "multi_platform_key": {
                        "product": {
                            "human_name": "Multi-Platform Product",
                            "machine_name": "multi_platform",
                            "category": "crossplatform",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "book.pdf",
                                                "url": {"web": "/downloads/book.pdf"},
                                                "file_size": 1000,
                                            }
                                        ],
                                    },
                                    {
                                        "platform": "audio",
                                        "download_struct": [
                                            {
                                                "name": "book.m4b",
                                                "url": {"web": "/downloads/book.m4b"},
                                                "file_size": 50000,
                                            }
                                        ],
                                    },
                                ]
                            }
                        ],
                    }
                }
            )
        }

        lib_data = build_library_json([batch], order_model_path=order_model_path)
        product = lib_data.products[0]

        # Should have downloads for both platforms
        assert len(product.downloads) == 2
        platforms = {d.platform for d in product.downloads}
        assert "ebook" in platforms
        assert "audio" in platforms

    def test_product_with_multiple_formats(self, order_model_path: Any):
        """Test product with multiple formats for same platform."""
        batch = {
            "data": json.dumps(
                {
                    "multi_format_key": {
                        "product": {
                            "human_name": "Multi-Format Book",
                            "machine_name": "multi_format",
                            "category": "ebook",
                        },
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "book.pdf",
                                                "url": {"web": "/downloads/book.pdf"},
                                                "file_size": 1000,
                                            },
                                            {
                                                "name": "book.epub",
                                                "url": {"web": "/downloads/book.epub"},
                                                "file_size": 800,
                                            },
                                            {
                                                "name": "book.mobi",
                                                "url": {"web": "/downloads/book.mobi"},
                                                "file_size": 900,
                                            },
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
        product = lib_data.products[0]

        # Should have 3 downloads (PDF, EPUB, MOBI)
        assert len(product.downloads) == 3
        names = {d.name for d in product.downloads}
        assert "book.pdf" in names
        assert "book.epub" in names
        assert "book.mobi" in names


@pytest.mark.integration
class TestJsonSerializationRoundtrip:
    """Test JSON serialization and deserialization roundtrip."""

    def test_library_data_json_roundtrip(self, sample_library_data: LibraryData):
        """Test serializing and deserializing LibraryData preserves data."""
        # Serialize to JSON
        json_str = sample_library_data.model_dump_json()

        # Deserialize back
        parsed_data = json.loads(json_str)
        roundtrip_lib_data = LibraryData(**parsed_data)

        # Verify data is preserved
        assert roundtrip_lib_data.total_products == sample_library_data.total_products
        assert len(roundtrip_lib_data.products) == len(sample_library_data.products)

        # Verify first product
        original_product = sample_library_data.products[0]
        roundtrip_product = roundtrip_lib_data.products[0]
        assert roundtrip_product.gamekey == original_product.gamekey
        assert roundtrip_product.product_name == original_product.product_name

    def test_product_json_roundtrip(self, sample_product: Product):
        """Test serializing and deserializing Product preserves data."""
        # Serialize
        json_str = sample_product.model_dump_json()

        # Deserialize
        parsed_data = json.loads(json_str)
        roundtrip_product = Product(**parsed_data)

        # Verify
        assert roundtrip_product.gamekey == sample_product.gamekey
        assert roundtrip_product.product_name == sample_product.product_name
        assert len(roundtrip_product.downloads) == len(sample_product.downloads)

    def test_download_json_roundtrip(self, sample_download: Download):
        """Test serializing and deserializing Download preserves data."""
        # Serialize
        json_str = sample_download.model_dump_json()

        # Deserialize
        parsed_data = json.loads(json_str)
        roundtrip_download = Download(**parsed_data)

        # Verify
        assert roundtrip_download.platform == sample_download.platform
        assert roundtrip_download.name == sample_download.name
        assert roundtrip_download.url == sample_download.url
        assert roundtrip_download.size_bytes == sample_download.size_bytes
        assert roundtrip_download.checksums == sample_download.checksums

    def test_full_workflow_api_to_json_file(
        self,
        sample_api_batch_multiple: List[Dict[str, Any]],
        tmp_path,
        order_model_path: Any,
    ):
        """Test complete workflow: API response -> LibraryData -> JSON file."""
        # Parse API batches
        lib_data = build_library_json(
            sample_api_batch_multiple, order_model_path=order_model_path
        )

        # Write to file
        output_file = tmp_path / "library_products.json"
        output_file.write_text(lib_data.model_dump_json(indent=2))

        # Read back from file
        loaded_data = json.loads(output_file.read_text())
        loaded_lib_data = LibraryData(**loaded_data)

        # Verify integrity
        assert loaded_lib_data.total_products == lib_data.total_products
        assert len(loaded_lib_data.products) == len(lib_data.products)

        # Verify product details preserved
        for original, loaded in zip(lib_data.products, loaded_lib_data.products):
            assert loaded.gamekey == original.gamekey
            assert loaded.product_name == original.product_name
            assert len(loaded.downloads) == len(original.downloads)
