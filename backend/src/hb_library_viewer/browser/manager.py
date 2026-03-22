"""Playwright-based browser automation for API response capture."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from playwright.sync_api import (
    Error as PlaywrightError,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)

from ..config import APIConfig, BrowserConfig
from ..api_batches import ApiBatchRecord
from ..utils import BrowserError
from ..runtime_status import format_hms
from .capture import (
    ResponseRecorder,
    detect_auth_failure,
    extract_api_keys,
    extract_gamekeys,
)
from .models import BrowserCaptureResult
from .persistence import ArtifactStore

logger = logging.getLogger(__name__)


class BrowserManager:  # pylint: disable=too-many-instance-attributes
    """Manage Playwright browser session for library page capture."""

    def __init__(
        self,
        config: BrowserConfig,
        auth_cookie: str,
        api_config: APIConfig | None = None,
        artifacts_dir: Path | str = "artifacts",
        save_captured_responses: bool | None = None,
        save_api_batches: bool | None = None,
        save_gamekeys: bool | None = None,
        save_html_on_failure: bool = True,
    ):  # pylint: disable=too-many-arguments,too-many-positional-arguments
        if not auth_cookie:
            raise ValueError("auth_cookie cannot be empty")

        self.config = config
        self.auth_cookie = auth_cookie
        self.api_config = api_config or APIConfig()

        self.save_captured_responses = (
            bool(save_captured_responses)
            if save_captured_responses is not None
            else False
        )
        self.save_api_batches = (
            bool(save_api_batches) if save_api_batches is not None else True
        )
        self.save_gamekeys = bool(save_gamekeys) if save_gamekeys is not None else False
        self.save_html_on_failure = save_html_on_failure

        self.store = ArtifactStore(
            artifacts_dir,
            save_captured_responses=self.save_captured_responses,
            save_api_batches=self.save_api_batches,
            save_gamekeys=self.save_gamekeys,
            save_html_on_failure=self.save_html_on_failure,
            logger=logger,
        )

        # Initialize Playwright components (set in __enter__)
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None

        # Storage for captured responses
        self.captured_responses: list[dict[str, Any]] = []
        self.api_responses: list[ApiBatchRecord] = []
        self.recorder = ResponseRecorder(
            self.store,
            self.captured_responses,
            self.api_responses,
            save_captured_responses=self.save_captured_responses,
            save_api_batches=self.save_api_batches,
            logger=logger,
        )

    def __enter__(self) -> "BrowserManager":
        """Enter context manager: launch browser and set up session."""
        try:
            logger.debug("Starting Playwright...")
            self.playwright = sync_playwright().start()

            logger.debug("Launching browser (headless=%s)...", self.config.headless)
            self.browser = self.playwright.chromium.launch(
                headless=self.config.headless
            )

            logger.debug("Creating browser context with authentication...")
            self.context = self.browser.new_context()

            self.context.add_cookies(
                [
                    {
                        "name": "_simpleauth_sess",
                        "value": self.auth_cookie,
                        "url": self.api_config.endpoint,
                    }
                ]
            )

            self.page = self.context.new_page()

            if self.config.user_agent:
                self.page.set_extra_http_headers({"User-Agent": self.config.user_agent})

            self.page.on("response", self.recorder.handle_response)

            logger.info("Browser session started successfully")
            return self

        except (PlaywrightError, RuntimeError) as exc:
            if self.browser:
                try:
                    self.browser.close()
                except (PlaywrightError, RuntimeError):
                    pass
            if self.playwright:
                try:
                    self.playwright.stop()
                except (PlaywrightError, RuntimeError):
                    pass
            raise BrowserError(f"Failed to start browser session: {exc}") from exc

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager: cleanup browser resources."""
        try:
            if self.context:
                logger.debug("Closing browser context...")
                self.context.close()
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.debug("Error closing context: %s", exc)

        try:
            if self.browser:
                logger.debug("Closing browser...")
                self.browser.close()
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.debug("Error closing browser: %s", exc)

        try:
            if self.playwright:
                logger.debug("Stopping Playwright...")
                self.playwright.stop()
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.debug("Error stopping Playwright: %s", exc)

        logger.info("Browser session closed")
        return False

    def _fetch_missing_keys(self, missing_keys: list[str]) -> list[str]:
        """Retry direct API requests for gamekeys that were not captured in-page."""
        if not missing_keys or not self.context:
            return missing_keys

        retries = self.api_config.per_key_max_retries
        timeout_ms = self.api_config.timeout * 1000

        remaining = set(missing_keys)
        for key in list(missing_keys):
            for _attempt in range(retries):
                if key not in remaining:
                    break
                url = self.api_config.build_url(
                    f"/api/v1/orders?all_tpkds=true&gamekeys={key}"
                )
                try:
                    response = self.context.request.get(url, timeout=timeout_ms)
                except (PlaywrightError, RuntimeError) as exc:
                    logger.debug("API retry failed for %s...: %s", key[:6], exc)
                    continue

                if response.status != 200:
                    logger.debug(
                        "API retry status %s for %s...", response.status, key[:6]
                    )
                    continue

                body_bytes: bytes | None = None
                body_text: str | None = None
                try:
                    body_bytes = response.body()
                    body_text = body_bytes.decode("utf-8", errors="ignore")
                except AttributeError:
                    try:
                        body_text = response.text()
                        body_bytes = body_text.encode("utf-8")
                    except (PlaywrightError, RuntimeError) as exc:
                        logger.debug(
                            "API retry body read failed for %s...: %s",
                            key[:6],
                            exc,
                        )
                        continue
                except (PlaywrightError, RuntimeError) as exc:
                    logger.debug(
                        "API retry body read failed for %s...: %s", key[:6], exc
                    )
                    continue
                except UnicodeDecodeError as exc:
                    logger.debug(
                        "API retry body decode failed for %s...: %s", key[:6], exc
                    )
                    continue

                if body_text is None:
                    logger.debug("API retry body missing for %s...", key[:6])
                    continue

                content_type = response.headers.get("content-type", "application/json")
                self.recorder.record_api_response(
                    url,
                    response.status,
                    content_type,
                    body_text,
                    body_bytes=body_bytes,
                )

                try:
                    parsed = json.loads(body_text)
                except json.JSONDecodeError:
                    continue

                if isinstance(parsed, dict) and key in parsed:
                    remaining.discard(key)
                    break

        return sorted(remaining)

    def capture_library_page(
        self,
    ) -> BrowserCaptureResult:  # pylint: disable=too-many-branches,too-many-statements
        """Navigate to library page and capture API responses."""
        if not self.page:
            raise BrowserError("Browser not initialized. Use with statement.")

        self.recorder.reset()

        url = self.api_config.library_url()
        logger.info("Loading library page: %s", url)

        try:
            logger.debug("Navigating to %s...", url)
            response = self.page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=self.config.timeout_ms,
            )

            if not response:
                raise BrowserError("Failed to navigate to library page")

            status_code = response.status
            logger.debug("Navigation response: HTTP %s", status_code)

            if status_code == 401:
                raise BrowserError(
                    "Authentication failed (HTTP 401). Invalid or expired cookie."
                )
            if status_code == 403:
                raise BrowserError("Access forbidden (HTTP 403).")
            if status_code not in (200, 304):
                raise BrowserError(f"Unexpected HTTP status: {status_code}")

            auth_failure_reason = detect_auth_failure(response)
            if auth_failure_reason:
                self.recorder.reset()
                self.recorder.disable()
                raise BrowserError(auth_failure_reason)

            logger.info("Waiting for page to load...")
            self.page.wait_for_load_state(
                "domcontentloaded",
                timeout=self.config.timeout_ms,
            )

            try:
                self.page.wait_for_load_state(
                    "load",
                    timeout=self.config.capture.load_timeout_ms,
                )
            except PlaywrightTimeoutError as exc:
                logger.warning("Load state timeout (continuing): %s", exc)

            logger.info("Waiting for API responses...")
            try:
                self.page.wait_for_load_state(
                    "networkidle",
                    timeout=self.config.capture.network_idle_timeout_ms,
                )
            except PlaywrightTimeoutError as exc:
                logger.warning("Network idle timeout (continuing capture): %s", exc)

            logger.debug("JavaScript execution wait...")
            time.sleep(self.config.capture.javascript_settle_seconds)

            try:
                logger.debug("Scrolling to trigger lazy-loaded content...")
                self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(self.config.capture.scroll_settle_seconds)
                self.page.evaluate("window.scrollTo(0, 0)")
            except PlaywrightError as exc:
                logger.debug("Scroll error (non-critical): %s", exc)

            max_wait = self.config.capture.api_wait_timeout_seconds
            wait_interval = self.config.capture.api_poll_interval_seconds
            log_interval = self.config.capture.api_progress_log_interval_seconds
            elapsed = 0.0
            next_log_at = log_interval

            while elapsed < max_wait:
                if len(self.api_responses) > 0:
                    logger.info("Captured %s API responses", len(self.api_responses))
                    time.sleep(self.config.capture.post_first_batch_delay_seconds)
                    break
                time.sleep(wait_interval)
                elapsed += wait_interval
                if elapsed >= next_log_at:
                    logger.info(
                        "Still waiting for API responses... (elapsed %s)",
                        format_hms(elapsed),
                    )
                    next_log_at += log_interval

            if len(self.api_responses) > 0:
                logger.info("Waiting 10 more seconds for additional batches...")
                time.sleep(self.config.capture.post_capture_delay_seconds)

            gamekeys = extract_gamekeys(self.page, logger)
            if gamekeys:
                self.store.write_gamekeys(gamekeys)

            if gamekeys:
                api_keys = extract_api_keys(self.api_responses)
                missing_keys = sorted(set(gamekeys) - api_keys)
                if missing_keys:
                    logger.warning(
                        "Missing API responses for %s gamekeys; retrying...",
                        len(missing_keys),
                    )
                    missing_keys = self._fetch_missing_keys(missing_keys)

                if missing_keys:
                    self.store.maybe_persist_library_html(
                        self.captured_responses,
                        reason="missing_api_batches",
                        fallback_url=url,
                    )
                    raise BrowserError(
                        "Missing API responses for "
                        f"{len(missing_keys)} gamekeys after retries."
                    )

            if not self.api_responses:
                self.store.maybe_persist_library_html(
                    self.captured_responses,
                    reason="no_api_responses",
                    fallback_url=url,
                )

            logger.info(
                "✓ Captured %s total responses, %s API batches",
                len(self.captured_responses),
                len(self.api_responses),
            )

            return BrowserCaptureResult(
                captured_responses=len(self.captured_responses),
                api_batches=len(self.api_responses),
                gamekeys=gamekeys,
                api_responses=self.api_responses,
            )

        except PlaywrightError as exc:
            raise BrowserError(f"Browser error during capture: {exc}") from exc
