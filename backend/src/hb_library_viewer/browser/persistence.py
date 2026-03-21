"""Artifact persistence helpers for browser capture."""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from ..utils import sanitize_filename


class ArtifactStore:
    """Manage artifact persistence for captured responses and metadata."""

    def __init__(
        self,
        artifacts_dir: Path | str,
        *,
        save_captured_responses: bool,
        save_api_batches: bool,
        save_gamekeys: bool,
        save_html_on_failure: bool,
        logger: logging.Logger,
    ) -> None:
        self.artifacts_dir = Path(artifacts_dir)
        self.capture_dir = self.artifacts_dir / "captured_responses"
        self.api_dir = self.artifacts_dir / "api_responses"
        self.gamekeys_path = self.artifacts_dir / "gamekeys.json"

        self.save_captured_responses = save_captured_responses
        self.save_api_batches = save_api_batches
        self.save_gamekeys = save_gamekeys
        self.save_html_on_failure = save_html_on_failure
        self._logger = logger

        self._response_index = 0
        self._api_index = 0
        self._saved_failure_html = False

    def reset(self) -> None:
        """Reset counters and failure flags for a new capture."""
        self._response_index = 0
        self._api_index = 0
        self._saved_failure_html = False

    def ensure_dirs(self, *, capture: bool = False, api: bool = False) -> None:
        """Ensure artifact directories exist when saving is enabled."""
        if capture and (self.save_captured_responses or self.save_html_on_failure):
            self.capture_dir.mkdir(parents=True, exist_ok=True)
        if api and self.save_api_batches:
            self.api_dir.mkdir(parents=True, exist_ok=True)

    def clear(self) -> None:
        """Remove artifact directories according to save settings."""
        if self.save_captured_responses or self.save_html_on_failure:
            if self.capture_dir.exists():
                shutil.rmtree(self.capture_dir, ignore_errors=True)
        if self.save_api_batches:
            if self.api_dir.exists():
                shutil.rmtree(self.api_dir, ignore_errors=True)
        if self.save_gamekeys and self.gamekeys_path.exists():
            self.gamekeys_path.unlink(missing_ok=True)

    def write_gamekeys(self, gamekeys: list[str]) -> None:
        """Persist gamekeys to disk when enabled."""
        if not self.save_gamekeys:
            return
        payload = {
            "total": len(gamekeys),
            "gamekeys": gamekeys,
        }
        self.gamekeys_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def find_library_html_response(
        self, captured_responses: list[dict[str, Any]]
    ) -> Optional[dict[str, Any]]:
        """Return the most recent captured HTML response for the library page."""
        for response in reversed(captured_responses):
            url = response.get("url", "")
            content_type = str(response.get("content_type", "")).lower()
            if "/home/library" in url and "text/html" in content_type:
                return response
        return None

    def maybe_persist_library_html(
        self,
        captured_responses: list[dict[str, Any]],
        *,
        reason: str,
        fallback_url: str | None = None,
    ) -> None:
        """Persist library HTML once when capture fails and HTML saving is enabled."""
        if self.save_captured_responses or not self.save_html_on_failure:
            return
        if self._saved_failure_html:
            return
        response = self.find_library_html_response(captured_responses)
        if not response:
            self._logger.debug(
                "No library HTML available for failure diagnostics (%s)",
                reason,
            )
            return
        self._persist_html_text(
            str(response.get("url") or fallback_url or "response"),
            str(response.get("content_type", "text/html")),
            str(response.get("data", "")),
            reason=reason,
        )

    def _persist_html_text(
        self,
        resp_url: str,
        content_type: str,
        body_text: str,
        *,
        reason: str,
    ) -> None:
        if self.save_captured_responses or not self.save_html_on_failure:
            return
        if self._saved_failure_html:
            return
        if not body_text:
            return
        safe_type = content_type or "text/html"
        if "text/html" not in safe_type.lower():
            safe_type = "text/html"
        try:
            self.write_response_file(
                resp_url,
                safe_type,
                body_text.encode("utf-8", errors="ignore"),
                body_text,
            )
            self._saved_failure_html = True
            self._logger.info("Saved library HTML for troubleshooting (%s)", reason)
        except OSError as exc:
            self._logger.debug(
                "Failed to save library HTML for troubleshooting: %s",
                exc,
            )

    @staticmethod
    def guess_extension(content_type: str, url: str) -> str:
        """Infer a file extension from content type or URL."""
        content_type = content_type.lower()
        if "application/json" in content_type:
            return ".json"
        if "text/html" in content_type:
            return ".html"
        if "javascript" in content_type:
            return ".js"
        if "text/css" in content_type:
            return ".css"

        parsed = urlparse(url)
        suffix = Path(parsed.path).suffix
        return suffix if suffix else ".txt"

    def write_response_file(
        self,
        resp_url: str,
        content_type: str,
        body: bytes,
        _body_text: str,
    ) -> Path:
        """Write a captured response body to disk and return its path."""
        self.ensure_dirs(capture=True)
        self._response_index += 1

        parsed = urlparse(resp_url)
        slug = sanitize_filename(f"{parsed.netloc}{parsed.path}")
        if not slug:
            slug = "response"

        extension = self.guess_extension(content_type, resp_url)
        filename = f"response_{self._response_index}_{slug}{extension}"
        file_path = self.capture_dir / filename

        # Persist raw bytes exactly as received.
        file_path.write_bytes(body)

        return file_path

    def write_api_batch(self, body_text: str) -> Path:
        """Write a raw API batch body to disk."""
        self.ensure_dirs(api=True)
        self._api_index += 1
        file_path = self.api_dir / f"orders_batch_{self._api_index}.json"
        file_path.write_text(body_text, encoding="utf-8")
        return file_path

    def write_api_batch_raw(
        self,
        body_text: str,
        *,
        content_type: str,
        resp_url: str,
        reason: str,
    ) -> Path:
        """Write a raw API batch body when JSON is invalid."""
        self.ensure_dirs(api=True)
        self._api_index += 1
        safe_reason = sanitize_filename(reason) or "invalid"
        extension = self.guess_extension(content_type, resp_url)
        file_path = (
            self.api_dir / f"orders_batch_{self._api_index}_{safe_reason}{extension}"
        )
        file_path.write_text(body_text, encoding="utf-8", errors="ignore")
        return file_path
