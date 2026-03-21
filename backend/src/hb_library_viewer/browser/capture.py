"""Capture utilities for Playwright responses."""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from typing import Any, Protocol

from playwright.sync_api import Error as PlaywrightError, Page, Response

from ..api_batches import ApiBatchLike, ApiBatchRecord, coerce_api_batch_record
from .persistence import ArtifactStore


class ResponseLike(Protocol):
    """Protocol for response-like objects used in auth detection."""

    @property
    def url(self) -> str: ...

    def text(self) -> str: ...


def should_capture_response(url: str) -> bool:
    """Return True if the URL is part of library or orders capture."""
    return "/home/library" in url or "/api/v1/orders" in url


def detect_auth_failure(response: ResponseLike) -> str | None:
    """Detect authentication failures based on response URL/body."""
    url = response.url.lower()
    if "/login" in url:
        return "Authentication failed (redirected to login page)."

    try:
        body_text = response.text()
    except PlaywrightError:
        return None

    lowered = body_text.lower()
    if '"is_logged_in": false' in lowered:
        return "Authentication failed (session not logged in)."
    return None


def detect_login_state_html(body_text: str) -> str:
    """Return login state inferred from library HTML."""
    lowered = body_text.lower()
    if '"is_logged_in":true' in lowered or "'is_logged_in':true" in lowered:
        return "logged_in"
    if '"is_logged_in":false' in lowered or "'is_logged_in':false" in lowered:
        return "logged_out"
    if "<title>login" in lowered or ("login" in lowered and "password" in lowered):
        return "login_page"
    return "unknown"


def extract_api_keys(api_responses: Sequence[ApiBatchLike]) -> set[str]:
    """Extract game keys from captured API batch responses."""
    keys: set[str] = set()
    for response in api_responses:
        record = coerce_api_batch_record(response)
        if record.json_error:
            continue
        data = record.data
        if not data:
            continue
        try:
            parsed = json.loads(data)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            keys.update(parsed.keys())
    return keys


def extract_gamekeys(page: Page | None, logger: logging.Logger) -> list[str]:
    """Extract gamekeys from the library page JSON payload."""
    if not page:
        return []
    try:
        gamekeys_data = page.evaluate(
            """
            () => {
                const script = document.getElementById('user-home-json-data');
                if (script) {
                    try {
                        const data = JSON.parse(script.textContent);
                        return data.gamekeys || [];
                    } catch (e) {
                        return [];
                    }
                }
                return [];
            }
        """
        )

        if gamekeys_data and isinstance(gamekeys_data, list):
            logger.info("✓ Extracted %s gamekeys from page", len(gamekeys_data))
            return gamekeys_data

    except PlaywrightError as exc:
        logger.debug("Could not extract gamekeys from page: %s", exc)

    return []


class ResponseRecorder:
    """Record captured responses and persist artifacts when enabled."""

    def __init__(
        self,
        store: ArtifactStore,
        captured_responses: list[dict[str, Any]],
        api_responses: list[ApiBatchRecord],
        *,
        save_captured_responses: bool,
        save_api_batches: bool,
        logger: logging.Logger,
    ) -> None:
        self._store = store
        self._captured_responses = captured_responses
        self._api_responses = api_responses
        self._save_captured_responses = save_captured_responses
        self._save_api_batches = save_api_batches
        self._logger = logger
        self._capture_enabled = True

    @property
    def capture_enabled(self) -> bool:
        return self._capture_enabled

    def reset(self) -> None:
        """Reset capture state and clear stored artifacts."""
        self._capture_enabled = True
        self._captured_responses.clear()
        self._api_responses.clear()
        self._store.reset()
        self._store.clear()

    def disable(self) -> None:
        """Disable capturing further responses."""
        self._capture_enabled = False

    def _describe_json_error(self, exc: json.JSONDecodeError) -> str:
        return f"{exc.msg} (line {exc.lineno} col {exc.colno})"

    def _record_orders_payload(
        self,
        *,
        url: str,
        status: int,
        content_type: str,
        body_text: str,
    ) -> tuple[bool, str | None, str | None]:
        json_error: str | None = None
        json_valid = False
        is_json = body_text.lstrip().startswith(("{", "["))

        if is_json:
            try:
                json.loads(body_text)
                json_valid = True
            except json.JSONDecodeError as exc:
                json_error = self._describe_json_error(exc)
        else:
            json_error = "Response did not start with JSON."

        api_saved_path = None
        if self._save_api_batches:
            if json_valid:
                api_saved_path = self._store.write_api_batch(body_text)
            else:
                reason = "malformed_json" if is_json else "non_json"
                api_saved_path = self._store.write_api_batch_raw(
                    body_text,
                    content_type=content_type,
                    resp_url=url,
                    reason=reason,
                )

        if json_error:
            self._logger.warning(
                "Orders API response is not valid JSON (status=%s, content-type=%s, size=%s, error=%s)",
                status,
                content_type,
                len(body_text),
                json_error,
            )
            if api_saved_path:
                self._logger.warning(
                    "Saved invalid orders response to %s", api_saved_path
                )

        return json_valid, json_error, str(api_saved_path) if api_saved_path else None

    def record_api_response(
        self,
        url: str,
        status: int,
        content_type: str,
        body_text: str,
        body_bytes: bytes | None = None,
    ) -> None:
        """Record a raw API response captured outside the page handler."""
        if body_bytes is None:
            body_bytes = body_text.encode("utf-8", errors="ignore")
        saved_path = None
        if self._save_captured_responses:
            saved_path = self._store.write_response_file(
                url,
                content_type,
                body_bytes,
                body_text,
            )

        json_valid = False
        json_error = None
        api_saved_path = None
        if "/api/v1/orders" in url:
            json_valid, json_error, api_saved_path = self._record_orders_payload(
                url=url,
                status=status,
                content_type=content_type,
                body_text=body_text,
            )

        resp_data = {
            "url": url,
            "status": status,
            "content_type": content_type,
            "data": body_text,
            "size": len(body_text),
            "is_json": body_text.lstrip().startswith(("{", "[")),
            "saved_path": str(saved_path) if saved_path else None,
            "api_saved_path": api_saved_path,
            "json_error": json_error,
            "json_valid": json_valid if "/api/v1/orders" in url else None,
        }
        self._captured_responses.append(resp_data)
        self._api_responses.append(ApiBatchRecord.model_validate(resp_data))

    def handle_response(self, response: Response) -> None:
        """Handle HTTP responses captured by Playwright."""
        if not self._capture_enabled:
            return
        try:
            resp_url = response.url
            status = response.status

            if not should_capture_response(resp_url):
                return

            self._logger.debug(
                "Response: %s (status: %s)",
                resp_url[:100],
                status,
            )

            try:
                body: bytes | None = None
                try:
                    body = response.body()
                except PlaywrightError as exc:
                    self._logger.debug(
                        "Could not get body for %s: %s",
                        resp_url[:70],
                        exc,
                    )
                    return

                if not body:
                    return

                try:
                    body_text = body.decode("utf-8", errors="ignore")
                except UnicodeDecodeError as exc:
                    self._logger.debug("Could not decode response: %s", exc)
                    return

                content_type = response.headers.get("content-type", "unknown")
                saved_path = None
                if self._save_captured_responses:
                    saved_path = self._store.write_response_file(
                        resp_url,
                        content_type,
                        body,
                        body_text,
                    )

                if "/home/library" in resp_url and "text/html" in content_type.lower():
                    login_state = detect_login_state_html(body_text)
                    if login_state != "unknown":
                        self._logger.info(
                            "Library HTML login state: %s",
                            login_state,
                        )
                    else:
                        self._logger.debug(
                            "Library HTML login state: unknown",
                        )

                is_json = body_text.lstrip().startswith(("{", "["))
                json_valid = None
                json_error = None
                api_saved_path = None
                if "/api/v1/orders" in resp_url:
                    json_valid, json_error, api_saved_path = (
                        self._record_orders_payload(
                            url=resp_url,
                            status=status,
                            content_type=content_type,
                            body_text=body_text,
                        )
                    )

                resp_data = {
                    "url": resp_url,
                    "status": status,
                    "content_type": content_type,
                    "data": body_text,
                    "size": len(body_text),
                    "is_json": is_json,
                    "saved_path": str(saved_path) if saved_path else None,
                    "api_saved_path": api_saved_path,
                    "json_error": json_error,
                    "json_valid": json_valid,
                }
                self._captured_responses.append(resp_data)

                if "/api/v1/orders" in resp_url:
                    if json_valid:
                        self._api_responses.append(
                            ApiBatchRecord.model_validate(resp_data)
                        )
                        self._logger.info(
                            "🎯 Captured API batch response: %s bytes",
                            len(body_text),
                        )
                elif is_json:
                    self._api_responses.append(ApiBatchRecord.model_validate(resp_data))

            except (PlaywrightError, ValueError, TypeError) as exc:
                self._logger.debug("Error processing response: %s", exc)

        except PlaywrightError as exc:
            self._logger.debug("Error in response handler: %s", exc)
