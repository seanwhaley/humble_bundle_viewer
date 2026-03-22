"""Shared pytest fixtures for all test modules.

This module provides reusable fixtures for:
- Configuration objects (Settings, BrowserConfig, DownloadConfig)
- Sample data models (Download, Product, LibraryData)
- Mock API responses
- Mock Playwright browser objects
- Local FastAPI test clients and viewer API payloads
"""

import json
from collections.abc import Callable, Iterator
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import Mock, MagicMock

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from app.models.library import LibraryData as ViewerLibraryData
from hb_library_viewer.config import Settings
from hb_library_viewer.parsing import Download, Product, LibraryData


# =============== CONFIGURATION FIXTURES ===============
@pytest.fixture
def valid_config(tmp_path: Path, monkeypatch) -> Settings:
    """Provide valid Settings object with test values.

    Uses tmp_path for download folder to avoid filesystem side effects.
    """
    monkeypatch.setenv("HUMBLE_AUTH_COOKIE", "test_session_cookie_1234567890")
    monkeypatch.setenv("HUMBLE_BROWSER__HEADLESS", "true")
    monkeypatch.setenv("HUMBLE_BROWSER__TIMEOUT_MS", "30000")
    monkeypatch.setenv("HUMBLE_DOWNLOAD__BASE_FOLDER", str(tmp_path / "downloads"))
    monkeypatch.setenv("HUMBLE_DOWNLOAD__MAX_RETRIES", "3")
    monkeypatch.setenv("HUMBLE_DOWNLOAD__RETRY_DELAY_SECONDS", "1")
    monkeypatch.setenv("HUMBLE_DOWNLOAD__RATE_LIMIT_DELAY", "0.5")
    monkeypatch.setenv("HUMBLE_API__ENDPOINT", "https://www.humblebundle.com")
    monkeypatch.setenv("HUMBLE_API__TIMEOUT", "30")
    monkeypatch.setenv("HUMBLE_LOGGING__LEVEL", "info")

    return Settings()


@pytest.fixture
def minimal_config_dict() -> Dict[str, Any]:
    """Minimal config dictionary for testing defaults."""
    return {
        "auth_cookie": "test_cookie_minimal",
    }


@pytest.fixture
def test_env_file(tmp_path: Path) -> Path:
    """Create temporary .env file with test values."""
    env_file = tmp_path / ".env"
    env_file.write_text(
        "HUMBLE_AUTH_COOKIE=test_cookie_from_env\n"
        "HUMBLE_BROWSER__HEADLESS=true\n"
        "HUMBLE_BROWSER__TIMEOUT_MS=45000\n"
    )
    return env_file


@pytest.fixture
def test_config_yaml(tmp_path: Path) -> Path:
    """Create temporary config.yaml file with test values."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        """
browser:
  headless: false
  timeout_ms: 60000
download:
  base_folder: ./test_downloads
  max_retries: 5
logging:
  level: debug
"""
    )
    return config_file


# =============== DATA MODEL FIXTURES ===============
@pytest.fixture(name="sample_download")
def fixture_sample_download() -> Download:
    """Provide sample Download model for testing."""
    return Download(
        platform="ebook",
        name="Sample_Book.pdf",
        url="https://cdn.humblebundle.com/sample/file.pdf",
        size_bytes=1024000,
        checksums={"md5": "abc123def456", "sha1": "789ghi012jkl"},
    )


@pytest.fixture(name="sample_product")
def fixture_sample_product(sample_download: Download) -> Product:
    """Provide sample Product model with downloads."""
    return Product(
        gamekey="test_gamekey_123",
        product_name="Test Product Name",
        machine_name="test_product_name",
        category="ebook",
        downloads=[sample_download],
        amount_spent=15.99,
    )


@pytest.fixture(name="sample_library_data")
def fixture_sample_library_data(sample_product: Product) -> LibraryData:
    """Provide sample LibraryData with multiple products."""
    return LibraryData(
        products=[sample_product],
        total_products=1,
        captured_at=datetime.now().isoformat(),
    )


@pytest.fixture(name="sample_viewer_library_payload")
def fixture_sample_viewer_library_payload() -> Dict[str, Any]:
    """Provide a normalized viewer-library payload for API/model tests."""
    return {
        "products": [
            {
                "gamekey": "order-1",
                "product_name": "Sample Bundle",
                "machine_name": "sample_bundle",
                "category": "ebook",
                "downloads": [
                    {
                        "platform": "ebook",
                        "name": "Bundle.pdf",
                        "url": "https://cdn.example.com/bundle.pdf",
                        "size_bytes": 101,
                        "checksums": {"sha1": "bundle-sha1"},
                        "file_type": "pdf",
                        "display_category": "ebook",
                        "content_label": "PDF",
                        "package_label": None,
                        "display_label": "PDF",
                        "display_detail": None,
                    }
                ],
                "subproducts": [
                    {
                        "human_name": "Sample Book",
                        "machine_name": "sample_book",
                        "url": "https://cdn.example.com/subproduct.epub",
                        "downloads": [
                            {
                                "platform": "ebook",
                                "name": "Sample Book.epub",
                                "url": "https://cdn.example.com/subproduct.epub",
                                "size_bytes": 202,
                                "checksums": {"md5": "subproduct-md5"},
                                "file_type": "epub",
                                "display_category": "ebook",
                                "content_label": "EPUB",
                                "package_label": None,
                                "display_label": "EPUB",
                                "display_detail": None,
                            }
                        ],
                        "keys": [
                            {
                                "key_type": "steam",
                                "human_name": "Steam Key",
                                "machine_name": "steam_key",
                                "visible": True,
                            }
                        ],
                        "payee": {
                            "human_name": "Example Publisher",
                            "machine_name": "example_publisher",
                        },
                        "page_details": {
                            "url": "https://publisher.example.com/books/sample-book",
                            "title": "Sample Book",
                            "authors": ["Ada Lovelace"],
                            "publisher": "Example Publisher",
                        },
                    }
                ],
            }
        ],
        "total_products": 1,
        "captured_at": "2026-03-12T12:00:00",
    }


@pytest.fixture(name="sample_viewer_library_data")
def fixture_sample_viewer_library_data(
    sample_viewer_library_payload: Dict[str, Any],
) -> ViewerLibraryData:
    """Provide the viewer API LibraryData model for backend/app tests."""
    return ViewerLibraryData.model_validate(sample_viewer_library_payload)


# =============== API RESPONSE FIXTURES ===============
@pytest.fixture
def sample_api_response() -> Dict[str, Any]:
    """Fixture with sample API response structure.

    Mimics actual Humble Bundle API /api/v1/orders response format.
    """
    return {
        "data": json.dumps(
            {
                "gamekey123": {
                    "product": {
                        "human_name": "The Sample Book",
                        "machine_name": "the_sample_book",
                        "category": "ebook",
                    },
                    "created": "2026-01-01T00:00:00",
                    "amount_spent": 12.99,
                    "subproducts": [
                        {
                            "human_name": "The Sample Book",
                            "machine_name": "the_sample_book_item",
                            "url": "https://publisher.example.com/books/the-sample-book",
                            "downloads": [
                                {
                                    "platform": "ebook",
                                    "download_struct": [
                                        {
                                            "name": "Sample_Book.pdf",
                                            "url": {
                                                "web": "/downloads/sample123/file.pdf"
                                            },
                                            "file_size": 2048000,
                                            "md5": "abc123",
                                            "sha1": "def456",
                                        },
                                        {
                                            "name": "Sample_Book.epub",
                                            "url": {
                                                "web": "https://cdn.humblebundle.com/sample.epub"
                                            },
                                            "file_size": 1024000,
                                            "md5": "xyz789",
                                        },
                                    ],
                                }
                            ],
                        }
                    ],
                    "tpkd_dict": {
                        "all_tpks": [
                            {
                                "key_type": "steam",
                                "key_type_human_name": "Steam",
                                "human_name": "Sample Key",
                                "machine_name": "sample_key",
                                "keyindex": 1,
                                "class": "key-entry",
                                "visible": True,
                            }
                        ]
                    },
                }
            }
        )
    }


@pytest.fixture
def sample_api_response_keys_only() -> Dict[str, Any]:
    """Fixture with key-only API response (no subproducts)."""
    return {
        "data": json.dumps(
            {
                "gamekey_keys": {
                    "product": {
                        "human_name": "Key Bundle",
                        "machine_name": "key_bundle",
                        "category": "bundle",
                    },
                    "amount_spent": 5.0,
                    "subproducts": [],
                    "tpkd_dict": {
                        "all_tpks": [
                            {
                                "key_type": "epic",
                                "key_type_human_name": "Epic Games Store",
                                "human_name": "Epic Key",
                                "machine_name": "epic_key",
                                "keyindex": 0,
                                "visible": True,
                            },
                            {
                                "key_type": "external_key",
                                "key_type_human_name": "External",
                                "human_name": "External Key",
                                "machine_name": "external_key",
                                "keyindex": 1,
                                "visible": False,
                            },
                        ]
                    },
                }
            }
        )
    }


@pytest.fixture
def sample_api_batch_multiple() -> List[Dict[str, Any]]:
    """Multiple API batches for integration testing."""
    return [
        {
            "data": json.dumps(
                {
                    "gamekey1": {
                        "product": {
                            "human_name": "Book One",
                            "machine_name": "book_one",
                            "category": "ebook",
                        },
                        "amount_spent": 10.0,
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "ebook",
                                        "download_struct": [
                                            {
                                                "name": "Book_One.pdf",
                                                "url": {"web": "/downloads/book1.pdf"},
                                                "file_size": 1000000,
                                                "md5": "aaa111",
                                            }
                                        ],
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        },
        {
            "data": json.dumps(
                {
                    "gamekey2": {
                        "product": {
                            "human_name": "Book Two",
                            "machine_name": "book_two",
                            "category": "audiobook",
                        },
                        "amount_spent": 20.0,
                        "subproducts": [
                            {
                                "downloads": [
                                    {
                                        "platform": "audio",
                                        "download_struct": [
                                            {
                                                "name": "Book_Two.m4b",
                                                "url": {
                                                    "web": "https://cdn.humblebundle.com/book2.m4b"
                                                },
                                                "file_size": 50000000,
                                                "md5": "bbb222",
                                            }
                                        ],
                                    }
                                ]
                            }
                        ],
                    }
                }
            )
        },
    ]


@pytest.fixture
def empty_api_response() -> Dict[str, Any]:
    """Empty API response for edge case testing."""
    return {"data": json.dumps({})}


@pytest.fixture
def malformed_api_response() -> Dict[str, Any]:
    """Malformed API response for error handling tests."""
    return {"data": "not valid json {{{"}


@pytest.fixture
def order_model_path(tmp_path: Path) -> Path:
    """Provide a minimal generated order model file for parsing tests."""
    model_path = tmp_path / "order_payload_models.py"
    model_path.write_text(
        "from pydantic import BaseModel, RootModel, ConfigDict\n"
        "class OrderPayloadItem(BaseModel):\n"
        "    model_config = ConfigDict(extra='allow')\n"
        "class OrderPayloadList(RootModel[list[OrderPayloadItem]]):\n"
        "    root: list[OrderPayloadItem]\n",
        encoding="utf-8",
    )
    return model_path


# =============== MOCK BROWSER FIXTURES ===============
@pytest.fixture
def mock_browser() -> Mock:
    """Mock Playwright browser for testing browser automation.

    Returns a Mock with typical Playwright browser interface methods.
    """
    browser = Mock()
    browser.new_context = Mock(return_value=Mock())
    browser.close = Mock()
    return browser


@pytest.fixture(name="mock_page")
def fixture_mock_page() -> Mock:
    """Mock Playwright page for testing page interactions.

    Returns a Mock with typical Playwright page interface methods.
    """
    page = Mock()
    page.goto = Mock()
    page.wait_for_load_state = Mock()
    page.close = Mock()

    # Mock response event handling
    page.on = Mock()
    page.context = Mock()
    page.context.cookies = Mock(return_value=[])

    return page


@pytest.fixture(name="mock_browser_context")
def fixture_mock_browser_context(mock_page: Mock) -> Mock:
    """Mock Playwright browser context with page."""
    context = MagicMock()
    context.new_page = Mock(return_value=mock_page)
    context.close = Mock()
    context.add_cookies = Mock()
    return context


@pytest.fixture
def api_client_factory() -> Iterator[Callable[..., TestClient]]:
    """Create local FastAPI test clients for one or more routers."""

    clients: list[TestClient] = []

    def factory(*routers: APIRouter) -> TestClient:
        app = FastAPI()
        for router in routers:
            app.include_router(router)
        client = TestClient(app)
        clients.append(client)
        return client

    yield factory

    for client in clients:
        client.close()
