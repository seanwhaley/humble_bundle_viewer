"""JSON parsing and data model structuring.

This module provides:
- Pydantic models for API responses (Download, Product, LibraryData)
- build_library_json() function to parse raw API batches into structured models
- Automatic validation of all data

All data is validated automatically by Pydantic. Invalid data raises
ValidationError which is caught in the CLI module.

Examples
--------
Parse API batch responses into structured LibraryData:

    >>> from hb_library_viewer.parsing import build_library_json  # doctest: +SKIP
    >>> api_batches = [{"data": '{"gamekey1": {...}}'}]  # doctest: +SKIP
    >>> model_path = Path("data/artifacts/order_payload_models.py")  # doctest: +SKIP
    >>> lib_data = build_library_json(api_batches, model_path)  # doctest: +SKIP
    >>> len(lib_data.products)  # doctest: +SKIP
    243

Serialize to JSON for storage or transmission:

    >>> lib_data.model_dump_json()  # doctest: +SKIP
    '{...}'
"""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, ValidationError

from .api_batches import ApiBatchLike, ApiBatchRecord, coerce_api_batch_record
from .config import APIConfig
from .model_generation import load_generated_order_model
from .subproducts.metadata.models import SubproductPageDetails

logger = logging.getLogger(__name__)


def _format_batch_context(batch: ApiBatchLike) -> str:
    record = coerce_api_batch_record(batch)
    url = record.url
    status = record.status
    content_type = record.content_type
    size = record.size
    saved_path = record.api_saved_path or record.saved_path
    return (
        f"url={url} status={status} content_type={content_type} "
        f"size={size} saved_path={saved_path}"
    )


# =============== PYDANTIC DATA MODELS ===============
class Download(BaseModel):
    """Single download file (one platform and format).

    Represents one downloadable file in one specific format (e.g., PDF,
    EPUB, M4B). A product may have multiple downloads for different
    platforms or formats.

    Attributes
    ----------
    platform : str
        Platform type (e.g., 'ebook', 'audio', 'video')
    name : str
        Human-readable file name
    url : str
        Full download URL (HTTP or HTTPS)
    size_bytes : int
        File size in bytes
    checksums : dict
        File integrity hashes (keys: 'md5', 'sha1', etc.)

    Examples
    --------
    >>> download = Download(
    ...     platform='ebook',
    ...     name='My_Book.pdf',
    ...     url='https://example.com/file.pdf',
    ...     size_bytes=1024000,
    ...     checksums={'md5': 'abc123', 'sha1': 'def456'}
    ... )
    >>> download.platform
    'ebook'

    >>> download.model_dump_json()  # doctest: +SKIP
    '{...}'
    """

    model_config = ConfigDict(extra="allow")

    platform: str = Field(..., description="Platform type (e.g., 'ebook', 'audio')")
    name: str = Field(..., description="File name")
    url: str = Field(..., description="Full download URL")
    size_bytes: int = Field(default=0, ge=0, description="File size in bytes")
    checksums: dict[str, str] = Field(
        default_factory=dict, description="Hash checksums (md5, sha1, etc.)"
    )
    file_type: str | None = Field(
        default=None,
        description="File extension inferred from name or URL (e.g., pdf, epub)",
    )
    display_category: str | None = Field(
        default=None,
        description="Viewer-facing download family (ebook, audiobook, video, software, generic)",
    )
    content_label: str | None = Field(
        default=None,
        description="Primary user-facing content label such as EPUB, MP3, or Linux 64-bit",
    )
    package_label: str | None = Field(
        default=None,
        description="Normalized package or delivery label such as ZIP, DEB, DMG, or Installer",
    )
    display_label: str | None = Field(
        default=None,
        description="Unique viewer-facing label to show in route actions and filters",
    )
    display_detail: str | None = Field(
        default=None,
        description="Optional secondary detail for the viewer display label",
    )


class KeyEntry(BaseModel):
    """Third-party key metadata entry.

    Represents a redeemable key (Steam, Epic, etc.) or entitlement
    for products that do not expose downloadable files.
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    key_type: str = Field(..., description="Key platform type (steam, epic, etc.)")
    key_type_human_name: str | None = Field(
        default=None, description="Human-friendly key type"
    )
    human_name: str | None = Field(default=None, description="Display name")
    machine_name: str | None = Field(default=None, description="Machine name")
    gamekey: str | None = Field(default=None, description="Associated gamekey")
    keyindex: int | None = Field(default=None, description="Key index")
    redeemed_key_val: str | None = Field(
        default=None, description="Revealed key value (when redeemed)"
    )
    sold_out: bool | None = Field(default=None, description="Sold out flag")
    steam_app_id: int | str | None = Field(
        default=None, description="Steam App ID when available"
    )
    num_days_until_expired: int | None = Field(
        default=None, description="Days until expiration when provided"
    )
    class_name: str | None = Field(
        default=None, alias="class", description="Grouping or CSS class"
    )
    is_expired: bool | None = Field(default=None, description="Expiration status")
    is_gift: bool | None = Field(default=None, description="Gift flag")
    direct_redeem: bool | None = Field(default=None, description="Direct redeem flag")
    visible: bool | None = Field(default=None, description="Visibility flag")


class Payee(BaseModel):
    """Publisher/payee metadata for a subproduct."""

    model_config = ConfigDict(extra="allow")

    human_name: str | None = Field(default=None, description="Publisher name")
    machine_name: str | None = Field(default=None, description="Publisher slug")


class Subproduct(BaseModel):
    """Normalized subproduct (bundle item) with downloads and keys."""

    model_config = ConfigDict(extra="allow")

    human_name: str | None = Field(default=None, description="Display name")
    machine_name: str | None = Field(default=None, description="Machine name")
    url: str | None = Field(
        default=None,
        description="External info URL for this subproduct when provided",
    )
    downloads: list[Download] = Field(
        default_factory=list, description="Downloads for this subproduct"
    )
    keys: list[KeyEntry] = Field(
        default_factory=list, description="Keys scoped to this subproduct"
    )
    payee: Payee | None = Field(default=None, description="Publisher/payee info")
    page_details: SubproductPageDetails | None = Field(
        default=None,
        description="Structured metadata extracted from a cached external info page",
    )


class Product(BaseModel):
    """One product in the Humble Bundle library.

    Represents a single purchase or bundle with all its downloadable
    files across different platforms and formats.

    Attributes
    ----------
    gamekey : str
        Unique product identifier
    product_name : str
        Human-readable product name
    machine_name : str
        Slug/identifier for the product
    category : str
        Product category (ebook, audiobook, video, etc.)
    created_at : str
        ISO 8601 timestamp of purchase
    subproducts : list[Subproduct]
        Normalized subproducts for bundles
    downloads : list[Download]
        List of downloadable files
    keys : list[KeyEntry]
        List of redeemable keys (when present)
    amount_spent : float
        Amount spent on this product

    Examples
    --------
    >>> product = Product(
    ...     gamekey='abc123',
    ...     product_name='My Book',
    ...     machine_name='my_book',
    ...     category='ebook',
    ...     downloads=[],
    ...     amount_spent=9.99
    ... )
    >>> product.gamekey
    'abc123'

    >>> len(product.downloads)
    0
    """

    model_config = ConfigDict(extra="allow")

    gamekey: str = Field(..., description="Unique product key")
    product_name: str = Field(..., description="Human-readable name")
    machine_name: str = Field(..., description="Slug/identifier")
    category: str = Field(..., description="Product category")
    created_at: str | None = Field(
        default=None, description="ISO 8601 timestamp of purchase"
    )
    subproducts: list[Subproduct] = Field(
        default_factory=list, description="Normalized subproducts"
    )
    downloads: list[Download] = Field(
        default_factory=list, description="List of downloadable files"
    )
    keys: list[KeyEntry] = Field(
        default_factory=list, description="List of redeemable keys"
    )
    amount_spent: float = Field(default=0.0, ge=0.0, description="Amount spent")
    _raw_order: dict[str, Any] = PrivateAttr(default_factory=dict)

    @property
    def raw_order(self) -> dict[str, Any]:
        """Raw order payload associated with this product (not serialized)."""
        return self._raw_order

    @raw_order.setter
    def raw_order(self, value: dict[str, Any]) -> None:
        self._raw_order = value


class LibraryData(BaseModel):
    """Complete Humble Bundle library data.

    Aggregates all products in the user's library along with metadata
    about when the data was captured.

    Attributes
    ----------
    products : list[Product]
        All products in the library
    total_products : int
        Number of products
    captured_at : str
        ISO 8601 timestamp of capture

    Examples
    --------
    >>> lib_data = LibraryData(
    ...     products=[],
    ...     total_products=0,
    ...     captured_at='2026-01-30T12:00:00'
    ... )
    >>> lib_data.total_products
    0

    >>> lib_data.model_dump_json()  # doctest: +SKIP
    '{...}'

    >>> json_str = lib_data.model_dump_json(indent=2)  # doctest: +SKIP
    """

    model_config = ConfigDict(extra="allow")

    products: list[Product] = Field(default_factory=list, description="All products")
    total_products: int = Field(default=0, ge=0, description="Total product count")
    captured_at: str = Field(
        ...,
        description="ISO 8601 timestamp when data was captured",
    )
    _api_responses: list[ApiBatchRecord] = PrivateAttr(default_factory=list)
    _raw_orders: dict[str, dict[str, Any]] = PrivateAttr(default_factory=dict)

    @property
    def api_responses(self) -> list[ApiBatchRecord]:
        """Raw API batch payloads (not serialized)."""
        return self._api_responses

    @api_responses.setter
    def api_responses(self, value: list[ApiBatchLike]) -> None:
        self._api_responses = [coerce_api_batch_record(item) for item in value]

    @property
    def raw_orders(self) -> dict[str, dict[str, Any]]:
        """Raw order payloads keyed by gamekey (not serialized)."""
        return self._raw_orders

    @raw_orders.setter
    def raw_orders(self, value: dict[str, dict[str, Any]]) -> None:
        self._raw_orders = value


# =============== PARSING FUNCTION ===============
def _parse_download_groups(  # pylint: disable=too-many-branches
    platform_downloads: list[dict[str, Any]],
    product_name: str,
    api_config: APIConfig,
) -> list[Download]:
    def _guess_file_type(name: str | None, url: str | None) -> str:
        if name:
            suffix = Path(name).suffix.lower().lstrip(".")
            if suffix:
                return suffix
        if url:
            parsed = urlparse(url)
            suffix = Path(parsed.path).suffix.lower().lstrip(".")
            if suffix:
                return suffix
        return "file"

    downloads: list[Download] = []
    for download_by_platform in platform_downloads:
        if not isinstance(download_by_platform, dict):
            continue
        platform = download_by_platform.get("platform", "unknown")
        download_struct = download_by_platform.get("download_struct", [])
        if not isinstance(download_struct, list):
            continue

        for file_info in download_struct:
            if not isinstance(file_info, dict):
                continue
            url_info = file_info.get("url", {})
            if not isinstance(url_info, dict):
                url_info = {}
            web_url = url_info.get("web", "")

            if web_url:
                full_url = api_config.build_url(str(web_url))
            else:
                full_url = url_info.get("bittorrent", "")

            if not full_url:
                logger.debug("No URL found for %s %s", product_name, platform)
                continue

            checksums: dict[str, str] = {}
            if md5 := file_info.get("md5"):
                checksums["md5"] = md5
            if sha1 := file_info.get("sha1"):
                checksums["sha1"] = sha1

            downloads.append(
                Download(
                    platform=platform,
                    name=file_info.get("name", "file"),
                    url=full_url,
                    size_bytes=file_info.get("file_size", 0),
                    checksums=checksums,
                    file_type=_guess_file_type(
                        file_info.get("name", None),
                        full_url,
                    ),
                )
            )

    return downloads


def _parse_simple_downloads(raw_downloads: list[dict[str, Any]]) -> list[Download]:
    def _guess_file_type(name: str | None, url: str | None) -> str:
        if name:
            suffix = Path(name).suffix.lower().lstrip(".")
            if suffix:
                return suffix
        if url:
            parsed = urlparse(url)
            suffix = Path(parsed.path).suffix.lower().lstrip(".")
            if suffix:
                return suffix
        return "file"

    downloads: list[Download] = []
    for entry in raw_downloads:
        if not isinstance(entry, dict):
            continue
        url = entry.get("url") or ""
        if not url:
            continue
        downloads.append(
            Download(
                platform=entry.get("platform", "unknown"),
                name=entry.get("name", "file"),
                url=url,
                size_bytes=entry.get("size_bytes", 0),
                checksums=entry.get("checksums", {}) or {},
                file_type=_guess_file_type(entry.get("name", None), url),
            )
        )
    return downloads


def build_library_json(  # pylint: disable=too-many-locals,too-many-branches,too-many-statements,too-many-nested-blocks
    api_batches: Sequence[ApiBatchLike],
    order_model_path: Path,
    order_model_class: str = "OrderPayloadList",
    api_config: APIConfig | None = None,
) -> LibraryData:
    """Parse API batch responses into structured LibraryData.

    Processes raw API JSON responses from /api/v1/orders endpoints and
    transforms them into structured Pydantic models with automatic
    validation.

    Parameters
    ----------
    api_batches : Sequence[ApiBatchLike]
        List of typed API batch records, each with a ``data`` field containing
        JSON string of order information
    order_model_path : Path
        Path to a generated order payload model for validation.
    order_model_class : str
        Class name to load from the generated model file.

    Returns
    -------
    LibraryData
        Validated structured library data with products and downloads

    Raises
    ------
    json.JSONDecodeError
        If API batch contains invalid JSON
    pydantic.ValidationError
        If parsed data doesn't match expected schema

    Examples
    --------
    >>> api_batches = [
    ...     {
    ...         'data': '{"gamekey1": {"product": {"human_name": "Book"}, '
    ...                 '"subproducts": []}}'
    ...     }
    ... ]
    >>> model_path = Path("data/artifacts/order_payload_models.py")
    >>> lib_data = build_library_json(api_batches, model_path)
    >>> lib_data.total_products
    1

    Notes
    -----
    Invalid entries are logged and skipped (graceful degradation).
    If an API batch or product is malformed, it's skipped with a warning
    but processing continues with remaining batches.
    """
    logger.debug("Parsing %s API batch responses...", len(api_batches))

    effective_api_config = api_config or APIConfig()

    order_model_path = Path(order_model_path)
    if not order_model_path.exists():
        raise ValueError(f"Order model not found: {order_model_path}")

    model_cls = load_generated_order_model(order_model_path, order_model_class)
    if model_cls is None:
        raise ValueError(
            f"Order model class {order_model_class} not found in {order_model_path}"
        )

    all_products: list[Product] = []
    raw_orders: dict[str, dict[str, Any]] = {}

    for batch_idx, batch in enumerate(api_batches, 1):
        batch_record: ApiBatchRecord | None = None
        try:
            if isinstance(batch, ApiBatchRecord):
                batch_record = batch
            elif isinstance(batch, dict):
                batch_record = coerce_api_batch_record(batch)
            else:
                logger.error("Batch %s: Unexpected batch type", batch_idx)
                continue

            json_error = batch_record.json_error
            if json_error:
                logger.error(
                    "Batch %s: Skipping non-JSON API response (%s). %s",
                    batch_idx,
                    json_error,
                    _format_batch_context(batch_record),
                )
                continue

            # Extract JSON string from batch (API response format)
            batch_data_str = batch_record.data
            if not batch_data_str:
                logger.warning("Batch %s: No data field found", batch_idx)
                continue

            # Parse JSON string
            orders_data = json.loads(batch_data_str)
            if not isinstance(orders_data, dict):
                logger.error("Batch %s: Unexpected JSON payload type", batch_idx)
                continue

            try:
                model_cls.model_validate(list(orders_data.values()))
                logger.info(
                    "Validated %s orders with generated model",
                    len(orders_data),
                )
            except ValidationError as exc:
                logger.warning(
                    "Generated order model validation failed (%s)",
                    type(exc).__name__,
                )

            # orders_data is a dict where keys are gamekeys
            for gamekey, order in orders_data.items():
                if not isinstance(order, dict):
                    logger.debug(
                        "Batch %s: Skipping non-dict entry for %s",
                        batch_idx,
                        gamekey,
                    )
                    continue

                raw_orders[gamekey] = order

                # Extract product metadata
                product_meta = order.get("product", {})
                product_name = product_meta.get("human_name", "Unknown Product")
                machine_name = product_meta.get("machine_name", "")
                category = product_meta.get("category", "")

                # Parse redeemable keys (tpkd_dict)
                key_entries: list[KeyEntry] = []
                tpkd_entries = order.get("tpkd_dict", {}).get("all_tpks", [])
                for entry in tpkd_entries:
                    if not isinstance(entry, dict):
                        logger.debug("Skipping non-dict tpkd entry for %s", gamekey)
                        continue
                    try:
                        key_entries.append(KeyEntry.model_validate(entry))
                    except ValidationError as exc:
                        logger.debug(
                            "Error parsing tpkd entry for %s: %s", gamekey, exc
                        )
                        continue

                normalized_subproducts: list[Subproduct] = []
                subproducts = order.get("subproducts", [])
                if isinstance(subproducts, list):
                    for subproduct in subproducts:
                        if not isinstance(subproduct, dict):
                            continue
                        platform_downloads = subproduct.get("downloads", [])
                        sub_downloads = _parse_download_groups(
                            platform_downloads,
                            product_name,
                            effective_api_config,
                        )
                        sub_machine = subproduct.get("machine_name")
                        sub_keys = [
                            key
                            for key in key_entries
                            if key.machine_name
                            and sub_machine
                            and key.machine_name == sub_machine
                        ]
                        payee_info = subproduct.get("payee")
                        payee = (
                            Payee.model_validate(payee_info)
                            if isinstance(payee_info, dict)
                            else None
                        )
                        normalized_subproducts.append(
                            Subproduct(
                                human_name=subproduct.get("human_name"),
                                machine_name=sub_machine,
                                url=subproduct.get("url"),
                                downloads=sub_downloads,
                                keys=sub_keys,
                                payee=payee,
                            )
                        )

                aggregated_downloads: list[Download] = []
                for subproduct in normalized_subproducts:
                    aggregated_downloads.extend(subproduct.downloads)

                if not aggregated_downloads:
                    top_level_downloads = order.get("downloads", [])
                    if isinstance(top_level_downloads, list):
                        aggregated_downloads = _parse_simple_downloads(
                            top_level_downloads
                        )

                try:
                    product = Product(
                        gamekey=gamekey,
                        product_name=product_name,
                        machine_name=machine_name,
                        category=category,
                        created_at=order.get("created") or order.get("created_at"),
                        subproducts=normalized_subproducts,
                        downloads=aggregated_downloads,
                        keys=key_entries,
                        amount_spent=order.get("amount_spent", 0.0),
                    )
                    product.raw_order = order
                    all_products.append(product)
                except ValidationError as exc:
                    logger.warning("Error parsing product %s: %s", gamekey, exc)
                    continue

        except json.JSONDecodeError as e:
            logger.error(
                "Batch %s: Invalid JSON in API response: %s (%s)",
                batch_idx,
                e,
                _format_batch_context(batch_record or {"data": ""}),
            )
            continue
        except (TypeError, ValueError, KeyError) as e:
            logger.error("Batch %s: Unexpected error: %s", batch_idx, e)
            continue

    # Create LibraryData with captured timestamp
    lib_data = LibraryData(
        products=all_products,
        total_products=len(all_products),
        captured_at=datetime.now().isoformat(),
    )
    lib_data.api_responses = list(api_batches)
    lib_data.raw_orders = raw_orders

    logger.info(
        "Successfully parsed %s products from %s API batches",
        lib_data.total_products,
        len(api_batches),
    )

    return lib_data
