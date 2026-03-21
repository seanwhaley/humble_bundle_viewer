"""File download with retry logic and rate limiting.

This module provides:
- FileDownloader class for downloading files
- Automatic retry with exponential backoff
- Rate limiting to respect server resources
- DownloadTask and DownloadResult Pydantic models

Key features:
- Hardcoded minimum 0.5s rate limit (configurable upward only)
- Streaming downloads for memory efficiency
- Deduplication (skips existing files)
- Detailed error reporting

Examples
--------
Download a single file:

    >>> from hb_library_viewer.download import FileDownloader  # doctest: +SKIP
    >>> from hb_library_viewer.config import Settings
    >>> config = Settings()  # doctest: +SKIP
    >>> downloader = FileDownloader(config.download)  # doctest: +SKIP
    >>> success = downloader.download_file(
    ...     "https://example.com/file.pdf",
    ...     "/downloads",
    ...     "myfile.pdf"
    ... )  # doctest: +SKIP
    >>> success
    True

Download a complete product:

    >>> from hb_library_viewer.download import FileDownloader, DownloadTask  # doctest: +SKIP
    >>> task = DownloadTask(  # doctest: +SKIP
    ...     gamekey="abc123",
    ...     product_name="My Book",
    ...     downloads=[...]
    ... )
    >>> result = downloader.download_product(task)  # doctest: +SKIP
    >>> print(f"Downloaded {result.files_downloaded} files")  # doctest: +SKIP
"""

import logging
import time
from collections.abc import Callable
from pathlib import Path
from threading import Lock
from typing import Literal
from urllib.parse import urlparse

import requests
from pydantic import BaseModel, Field

from .config import DownloadConfig
from .parsing import Download
from .utils import DownloadError, get_file_extension, sanitize_filename, validate_url

logger = logging.getLogger(__name__)


class DownloadFileProgress(BaseModel):
    """Live progress snapshot for a single file download."""

    filename: str
    operation_id: str = ""
    stage: Literal["starting", "downloading", "retrying", "completed"]
    bytes_downloaded: int = Field(default=0, ge=0)
    total_bytes: int | None = Field(default=None, ge=0)
    attempt: int = Field(default=1, ge=1)
    max_attempts: int = Field(default=1, ge=1)
    elapsed_seconds: float | None = Field(default=None, ge=0)
    message: str | None = None


DownloadFileProgressCallback = Callable[[DownloadFileProgress], None]


def _resolve_download_filename(download: Download) -> str:
    """Build a stable local filename for a download entry."""
    clean_name = sanitize_filename(download.name)
    if clean_name and "." in clean_name:
        return clean_name

    url_name = sanitize_filename(Path(urlparse(download.url or "").path).name)
    if url_name and "." in url_name:
        return url_name

    base_name = clean_name or sanitize_filename(
        Path(urlparse(download.url or "").path).stem
    )
    if not base_name:
        base_name = "file"

    extension = (download.file_type or "").strip(".").lower()
    if not extension:
        extension = get_file_extension(download.platform)

    return f"{base_name}.{extension}" if extension else base_name


class DownloadTask(BaseModel):
    """Task to download all files for one product.

    Attributes
    ----------
    gamekey : str
        Unique product identifier
    product_name : str
        Human-readable product name (for logging)
    downloads : list[Download]
        Pydantic Download objects with URLs and metadata

    Examples
    --------
    >>> task = DownloadTask(
    ...     gamekey='abc123',
    ...     product_name='My Book',
    ...     downloads=[]
    ... )
    >>> task.gamekey
    'abc123'
    """

    gamekey: str = Field(..., description="Product identifier")
    product_name: str = Field(..., description="Human-readable product name")
    downloads: list[Download] = Field(..., description="Downloads to process")


class DownloadResult(BaseModel):
    """Result of download operation for one product.

    Attributes
    ----------
    gamekey : str
        Product identifier
    status : str
        Overall status: 'success', 'partial', or 'failed'
    files_downloaded : int
        Number of files successfully downloaded
    errors : list[str]
        List of error messages (no URLs/paths for security)

    Examples
    --------
    >>> result = DownloadResult(
    ...     gamekey='abc123',
    ...     status='success',
    ...     files_downloaded=3,
    ...     errors=[]
    ... )
    >>> result.status
    'success'
    """

    gamekey: str = Field(..., description="Product identifier")
    status: str = Field(..., description="'success', 'partial', or 'failed'")
    files_downloaded: int = Field(default=0, ge=0, description="Files downloaded")
    errors: list[str] = Field(default_factory=list, description="Error messages")


class FileDownloader:
    """Download files with retry logic and rate limiting.

    This class manages file downloads with:
    - Automatic retry with exponential backoff
    - Rate limiting (hardcoded minimum 0.5s between requests)
    - File deduplication
    - Streaming downloads (memory efficient)
    - Detailed error reporting

    The hardcoded 0.5s minimum rate limit ensures we respect server
    resources. This can be configured upward but never lower.

    Attributes
    ----------
    config : DownloadConfig
        Download configuration

    Examples
    --------
    Download files with default configuration:

        >>> from hb_library_viewer.download import FileDownloader  # doctest: +SKIP
        >>> from hb_library_viewer.config import DownloadConfig
        >>> config = DownloadConfig(base_folder="./Downloads")
        >>> downloader = FileDownloader(config)
        >>> downloader.config.rate_limit_delay
        0.5
    """

    # Hardcoded minimum rate limit (0.5s) - NEVER reduce this
    HARDCODED_MIN_RATE_LIMIT = 0.5

    def __init__(self, config: DownloadConfig):
        """Initialize downloader with configuration.

        Parameters
        ----------
        config : DownloadConfig
            Download settings
        """
        self.config = config
        logger.debug(
            "FileDownloader initialized with max_retries=%s",
            config.max_retries,
        )
        self._request_gate = Lock()
        self._last_request_started_at = 0.0

    def _wait_for_request_slot(self, operation_id: str) -> None:
        """Coordinate request openings across concurrent download workers."""

        minimum_delay = max(
            self.HARDCODED_MIN_RATE_LIMIT,
            float(self.config.rate_limit_delay),
        )
        with self._request_gate:
            now = time.monotonic()
            elapsed = now - self._last_request_started_at
            remaining_delay = minimum_delay - elapsed
            if remaining_delay > 0:
                logger.debug(
                    "[%s] Waiting %.3fs for shared download rate limit",
                    operation_id,
                    remaining_delay,
                )
                time.sleep(remaining_delay)
            self._last_request_started_at = time.monotonic()

    def download_file(  # pylint: disable=too-many-branches,too-many-statements
        self,
        url: str,
        dest_folder: str,
        filename: str,
        operation_id: str = "",
        on_progress: DownloadFileProgressCallback | None = None,
    ) -> bool:
        """Download a single file with retry logic.

        Handles complete download workflow:
        1. Validates URL format
        2. Checks for existing file (deduplication)
        3. Applies rate limiting
        4. Attempts download with retries
        5. Validates downloaded content

        Parameters
        ----------
        url : str
            Full download URL (HTTP or HTTPS)
        dest_folder : str
            Destination directory path
        filename : str
            Target filename (should be sanitized)
        operation_id : str, optional
            Operation ID for logging (default: filename)

        Returns
        -------
        bool
            True if download succeeded or file exists
            False if download failed after all retries

        Raises
        ------
        DownloadError
            If URL validation fails or permanent errors occur (404, 403)

        Examples
        --------
        >>> downloader = FileDownloader(DownloadConfig())  # doctest: +SKIP
        >>> success = downloader.download_file(
        ...     "https://example.com/file.pdf",
        ...     "./downloads",
        ...     "file.pdf"
        ... )  # doctest: +SKIP
        """
        # Validate URL format
        if not validate_url(url):
            logger.warning("Invalid URL format: %s", url)
            raise DownloadError(f"Invalid download URL: {url}")

        op_id = operation_id or filename
        logger.debug("[%s] Starting download validation", op_id)

        def emit_progress(
            *,
            stage: Literal["starting", "downloading", "retrying", "completed"],
            bytes_downloaded: int = 0,
            total_bytes: int | None = None,
            attempt: int = 1,
            elapsed_seconds: float | None = None,
            message: str | None = None,
        ) -> None:
            if on_progress is None:
                return
            on_progress(
                DownloadFileProgress(
                    filename=filename,
                    operation_id=op_id,
                    stage=stage,
                    bytes_downloaded=bytes_downloaded,
                    total_bytes=total_bytes,
                    attempt=attempt,
                    max_attempts=self.config.max_retries,
                    elapsed_seconds=elapsed_seconds,
                    message=message,
                )
            )

        # Build full file path
        file_path = Path(dest_folder) / filename

        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise DownloadError(
                f"Cannot create download directory for {filename}"
            ) from exc

        # Skip if file already exists (deduplication)
        if file_path.exists():
            logger.info("[%s] File already exists, skipping", op_id)
            return True

        logger.info("[%s] Downloading %s...", op_id, filename)
        logger.debug("[%s] URL: %s...", op_id, url[:80])

        # Attempt download with retries
        for attempt in range(1, self.config.max_retries + 1):
            total_bytes: int | None = None
            downloaded_bytes = 0
            attempt_started_at = time.monotonic()
            try:
                # Apply rate limiting (respect server resources)
                logger.debug(
                    "[%s] Request slot target delay: %ss",
                    op_id,
                    self.config.rate_limit_delay,
                )
                self._wait_for_request_slot(op_id)

                logger.debug(
                    "[%s] Download attempt %s/%s",
                    op_id,
                    attempt,
                    self.config.max_retries,
                )
                emit_progress(stage="starting", attempt=attempt, elapsed_seconds=0.0)

                # Download with streaming for memory efficiency
                with requests.get(
                    url,
                    stream=True,
                    timeout=(
                        self.config.connect_timeout_seconds,
                        self.config.stream_timeout_seconds,
                    ),
                ) as r:
                    # Raise exception for HTTP errors
                    r.raise_for_status()

                    # Validate content size before allocating disk space
                    if "content-length" in r.headers:
                        try:
                            total_bytes = int(r.headers["content-length"])
                            if total_bytes == 0:
                                logger.error(
                                    "[%s] Server returned 0-byte file",
                                    op_id,
                                )
                                raise DownloadError(
                                    f"Server returned empty file for {filename}"
                                )
                            logger.debug(
                                "[%s] File size: %.1f MB",
                                op_id,
                                total_bytes / 1024 / 1024,
                            )
                        except ValueError:
                            total_bytes = None
                            logger.debug(
                                "[%s] Cannot parse content-length header",
                                op_id,
                            )

                    emit_progress(
                        stage="downloading",
                        bytes_downloaded=0,
                        total_bytes=total_bytes,
                        attempt=attempt,
                        elapsed_seconds=0.0,
                    )

                    # Stream response content to file in chunks (memory efficient)
                    # Ensures we don't load large files into memory
                    last_emit_at = time.monotonic()
                    with file_path.open("wb") as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                                downloaded_bytes += len(chunk)
                                now = time.monotonic()
                                if (
                                    total_bytes is not None
                                    and downloaded_bytes >= total_bytes
                                ) or (now - last_emit_at) >= 0.1:
                                    emit_progress(
                                        stage="downloading",
                                        bytes_downloaded=downloaded_bytes,
                                        total_bytes=total_bytes,
                                        attempt=attempt,
                                        elapsed_seconds=(
                                            time.monotonic() - attempt_started_at
                                        ),
                                    )
                                    last_emit_at = now

                emit_progress(
                    stage="completed",
                    bytes_downloaded=downloaded_bytes,
                    total_bytes=total_bytes or downloaded_bytes,
                    attempt=attempt,
                    elapsed_seconds=time.monotonic() - attempt_started_at,
                )

                logger.info(
                    "[%s] ✓ Successfully downloaded %s",
                    op_id,
                    filename,
                )
                return True

            # Handle HTTP errors with specific status codes
            except requests.exceptions.HTTPError as e:
                status_code = e.response.status_code
                logger.warning(
                    "[%s] HTTP %s on attempt %s/%s",
                    op_id,
                    status_code,
                    attempt,
                    self.config.max_retries,
                )

                # Permanent errors (404 Not Found, 403 Forbidden) - don't retry
                if status_code in (404, 403):
                    logger.error(
                        "[%s] Permanent error (HTTP %s). Skipping.",
                        op_id,
                        status_code,
                    )
                    raise DownloadError(
                        f"Cannot download file: HTTP {status_code} (permanent error)"
                    ) from e
                emit_progress(
                    stage="retrying",
                    bytes_downloaded=downloaded_bytes,
                    total_bytes=total_bytes,
                    attempt=attempt,
                    elapsed_seconds=time.monotonic() - attempt_started_at,
                    message=f"HTTP {status_code}",
                )
                # Other HTTP errors (5xx, etc.) - retry if not exhausted

            # Handle transient network errors - retry
            except (
                requests.exceptions.Timeout,
                requests.exceptions.ConnectionError,
            ) as e:
                logger.warning(
                    "[%s] Network error on attempt %s/%s: %s",
                    op_id,
                    attempt,
                    self.config.max_retries,
                    type(e).__name__,
                )
                emit_progress(
                    stage="retrying",
                    bytes_downloaded=downloaded_bytes,
                    total_bytes=total_bytes,
                    attempt=attempt,
                    elapsed_seconds=time.monotonic() - attempt_started_at,
                    message=type(e).__name__,
                )

            # Catch other unexpected errors
            except DownloadError:
                # Re-raise validation errors
                raise
            except Exception as e:  # pylint: disable=broad-exception-caught
                logger.warning(
                    "[%s] Unexpected error on attempt %s/%s: %s",
                    op_id,
                    attempt,
                    self.config.max_retries,
                    e,
                )
                emit_progress(
                    stage="retrying",
                    bytes_downloaded=downloaded_bytes,
                    total_bytes=total_bytes,
                    attempt=attempt,
                    elapsed_seconds=time.monotonic() - attempt_started_at,
                    message=type(e).__name__,
                )

            # Wait before retry (exponential backoff: delay * attempt)
            if attempt < self.config.max_retries:
                wait_time = self.config.retry_delay_seconds * attempt
                logger.info("[%s] Retrying in %ss...", op_id, wait_time)
                time.sleep(wait_time)

        # All retries exhausted
        logger.error(
            "[%s] Failed after %s retries. Giving up.",
            op_id,
            self.config.max_retries,
        )
        raise DownloadError(
            f"Failed to download {filename} after {self.config.max_retries} attempts"
        )

    def download_product(self, task: DownloadTask) -> DownloadResult:
        """Download all files in a product.

        Iterates through all downloads in the product and attempts to
        download each one. Aggregates results and errors.

        Parameters
        ----------
        task : DownloadTask
            Task containing product info and downloads

        Returns
        -------
        DownloadResult
            Result with status, count of successful downloads, and errors

        Examples
        --------
        >>> from hb_library_viewer.download import DownloadTask  # doctest: +SKIP
        >>> task = DownloadTask(  # doctest: +SKIP
        ...     gamekey='abc123',
        ...     product_name='My Book',
        ...     downloads=[]
        ... )
        >>> downloader = FileDownloader(DownloadConfig())  # doctest: +SKIP
        >>> result = downloader.download_product(task)  # doctest: +SKIP
        >>> print(result.status)  # doctest: +SKIP
        'success'
        """
        logger.info(
            "Downloading product: %s (%s files)",
            task.product_name,
            len(task.downloads),
        )

        files_downloaded = 0
        errors: list[str] = []

        for download in task.downloads:
            try:
                filename = _resolve_download_filename(download)

                # Perform download
                op_id = f"{task.product_name}/{download.platform}"
                try:
                    success = self.download_file(
                        download.url,
                        self.config.base_folder.as_posix(),
                        filename,
                        op_id,
                    )
                    if success:
                        files_downloaded += 1
                except DownloadError as e:
                    error_msg = str(e)
                    # Remove sensitive info (URLs, paths)
                    if "http" in error_msg:
                        error_msg = error_msg.split("http", maxsplit=1)[0].rstrip()
                    errors.append(error_msg)
                    logger.warning("File download failed: %s", error_msg)

            except Exception as e:  # pylint: disable=broad-exception-caught
                logger.exception("Error downloading file: %s", e)
                errors.append(f"Unexpected error: {type(e).__name__}")

        # Determine overall status
        if files_downloaded == len(task.downloads):
            status = "success"
        elif files_downloaded > 0:
            status = "partial"
        else:
            status = "failed"

        result = DownloadResult(
            gamekey=task.gamekey,
            status=status,
            files_downloaded=files_downloaded,
            errors=errors,
        )

        logger.info(
            "✓ Product %s: %s/%s files",
            task.product_name,
            files_downloaded,
            len(task.downloads),
        )

        return result
