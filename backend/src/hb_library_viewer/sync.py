"""Managed local sync helpers for advanced download workflows.

This module provides a shared sync-planning and execution layer for:
- CLI-managed local sync into a user-selected folder
- Viewer-side advanced sync workflows that need deterministic relative paths
- Manifest generation for resumable and auditable sync runs

The sync flow is append-only:
- existing files with matching expected size are skipped
- mismatched existing files are preserved and new downloads use a unique filename
- no existing file is deleted or overwritten
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .config import DownloadConfig
from .download import DownloadFileProgress, FileDownloader, _resolve_download_filename
from .download_selection import (
    SIZE_POLICIES,
    download_file_type,
    filter_downloads_by_file_types,
    filter_downloads_by_platforms,
    normalize_file_types,
    select_downloads_by_size,
)
from .parsing import Download, LibraryData
from .utils import sanitize_filename

MANIFEST_DIRNAME = ".hb-library-viewer"
MANIFEST_FILENAME = "sync-manifest.json"
MANIFEST_VERSION = 2

SyncStatus = Literal[
    "downloaded",
    "downloaded_renamed",
    "skipped_existing",
    "failed",
]


class SyncPlanEntry(BaseModel):
    """One planned local file in a managed sync run."""

    title_id: str
    title: str
    source_bundle: str
    platform: str
    file_type: str
    filename: str
    relative_path: str
    size_bytes: int = Field(default=0, ge=0)
    url: str
    checksums: dict[str, str] | None = None


class SyncPlanSourceItem(BaseModel):
    """Input item for shared managed-sync planning."""

    title_id: str
    title: str
    source_bundle: str
    downloads: list[Download] = Field(default_factory=list)


class SyncManifestEntry(BaseModel):
    """Persisted result for a planned sync entry."""

    model_config = ConfigDict(populate_by_name=True)

    title_id: str = Field(alias="titleId")
    title: str
    source_bundle: str = Field(alias="sourceBundle")
    platform: str
    file_type: str = Field(alias="fileType")
    filename: str
    relative_path: str = Field(alias="relativePath")
    local_path: str = Field(alias="localPath")
    size_bytes: int = Field(default=0, ge=0, alias="sizeBytes")
    planned_relative_path: str | None = Field(
        default=None,
        alias="plannedRelativePath",
    )
    status: SyncStatus
    message: str | None = None
    synced_at: str = Field(alias="syncedAt")
    actual_size_bytes: int | None = Field(
        default=None,
        ge=0,
        alias="actualSizeBytes",
    )


class SyncManifest(BaseModel):
    """On-disk manifest for a managed sync run."""

    manifest_version: int = MANIFEST_VERSION
    created_at: str
    target_root: str
    planned_files: int = 0
    downloaded_files: int = 0
    skipped_existing_files: int = 0
    renamed_files: int = 0
    failed_files: int = 0
    entries: list[SyncManifestEntry] = Field(default_factory=list)


class SyncSummary(BaseModel):
    """Summary returned to CLI callers after a sync run."""

    target_root: str
    manifest_path: str
    planned_files: int = 0
    downloaded_files: int = 0
    skipped_existing_files: int = 0
    renamed_files: int = 0
    failed_files: int = 0
    entries: list[SyncManifestEntry] = Field(default_factory=list)


class SyncProgress(BaseModel):
    """Live progress snapshot for managed sync workflows."""

    total_titles: int = 0
    reviewed_titles: int = 0
    total_files: int = 0
    reviewed_files: int = 0
    downloaded_files: int = 0
    skipped_existing_files: int = 0
    renamed_files: int = 0
    failed_files: int = 0
    active_downloads: int = 0
    current_bundle: str | None = None
    current_title: str | None = None
    current_file: str | None = None
    current_file_state: str | None = None
    current_file_bytes_downloaded: int = 0
    current_file_total_bytes: int | None = None
    current_file_attempt: int | None = None
    current_file_max_attempts: int | None = None
    current_file_elapsed_seconds: float | None = None
    current_file_message: str | None = None


SyncProgressCallback = Callable[[SyncProgress], None]


@dataclass
class ActiveSyncEntryState:
    """Mutable progress state for one active sync item."""

    source_bundle: str
    title: str
    filename: str
    state: str | None = None
    bytes_downloaded: int = 0
    total_bytes: int | None = None
    attempt: int | None = None
    max_attempts: int | None = None
    elapsed_seconds: float | None = None
    message: str | None = None


def load_library_data(path: Path) -> LibraryData:
    """Load and validate a `library_products.json` file."""

    payload = json.loads(path.expanduser().resolve().read_text(encoding="utf-8"))
    return LibraryData.model_validate(payload)


def select_downloads(
    downloads: list[Download],
    *,
    platforms: Iterable[str] | None = None,
    file_types: Iterable[str] | None = None,
    size_policy: str = "all",
) -> list[Download]:
    """Apply platform, file-type, and size filters to download entries."""

    if size_policy not in SIZE_POLICIES:
        raise ValueError("size_policy must be one of: all, smallest, largest")

    filtered = filter_downloads_by_platforms(downloads, platforms)
    filtered = filter_downloads_by_file_types(
        filtered, normalize_file_types(file_types)
    )
    return select_downloads_by_size(filtered, size_policy)


def _safe_path_part(value: str | None, fallback: str) -> str:
    cleaned = sanitize_filename((value or "").strip()).strip("._")
    return cleaned[:120] or fallback


def _with_index_suffix(path: PurePosixPath, index: int) -> PurePosixPath:
    suffix = path.suffix
    stem = path.stem
    parent = path.parent
    return parent / f"{stem} ({index}){suffix}"


def _uniquify_relative_path(
    relative_path: PurePosixPath, seen_paths: set[str]
) -> PurePosixPath:
    candidate = relative_path
    counter = 1
    while candidate.as_posix() in seen_paths:
        candidate = _with_index_suffix(relative_path, counter)
        counter += 1
    seen_paths.add(candidate.as_posix())
    return candidate


def _iter_download_groups(library: LibraryData):
    for product_index, product in enumerate(library.products):
        if product.subproducts:
            for sub_index, subproduct in enumerate(product.subproducts):
                downloads = list(subproduct.downloads or [])
                if not downloads:
                    continue
                title_id = (
                    f"{product.gamekey}:{subproduct.machine_name}"
                    if subproduct.machine_name
                    else f"{product.gamekey}:{sub_index}"
                )
                title = (
                    subproduct.human_name
                    or subproduct.machine_name
                    or product.product_name
                    or f"title-{product_index}-{sub_index}"
                )
                yield {
                    "title_id": title_id,
                    "title": title,
                    "source_bundle": product.product_name,
                    "downloads": downloads,
                }
            continue

        downloads = list(product.downloads or [])
        if not downloads:
            continue
        title = product.product_name or product.machine_name or f"title-{product_index}"
        yield {
            "title_id": product.gamekey,
            "title": title,
            "source_bundle": product.product_name,
            "downloads": downloads,
        }


def build_sync_plan_from_items(
    items: Iterable[SyncPlanSourceItem],
    *,
    platforms: Iterable[str] | None = None,
    file_types: Iterable[str] | None = None,
    size_policy: str = "all",
) -> list[SyncPlanEntry]:
    """Build deterministic local sync entries from viewer or CLI-provided items."""

    if size_policy not in SIZE_POLICIES:
        raise ValueError("size_policy must be one of: all, smallest, largest")

    entries: list[SyncPlanEntry] = []
    seen_relative_paths: set[str] = set()
    normalized_file_types = normalize_file_types(file_types)

    for item in items:
        selected = select_downloads(
            list(item.downloads),
            platforms=platforms,
            file_types=normalized_file_types,
            size_policy=size_policy,
        )
        for download in selected:
            filename = _resolve_download_filename(download)
            platform_folder = _safe_path_part(
                download.platform or "downloads", "downloads"
            )
            title_folder = _safe_path_part(item.title, item.title_id)
            relative_path = _uniquify_relative_path(
                PurePosixPath(platform_folder) / title_folder / filename,
                seen_relative_paths,
            )
            entries.append(
                SyncPlanEntry(
                    title_id=item.title_id,
                    title=item.title,
                    source_bundle=item.source_bundle or item.title,
                    platform=download.platform or "unknown",
                    file_type=download_file_type(download),
                    filename=Path(relative_path.as_posix()).name,
                    relative_path=relative_path.as_posix(),
                    size_bytes=download.size_bytes or 0,
                    url=download.url,
                    checksums=download.checksums or None,
                )
            )

    return entries


def build_sync_plan(
    library: LibraryData,
    *,
    platforms: Iterable[str] | None = None,
    file_types: Iterable[str] | None = None,
    size_policy: str = "all",
) -> list[SyncPlanEntry]:
    """Build deterministic local sync entries from normalized library data."""
    return build_sync_plan_from_items(
        (
            SyncPlanSourceItem(
                title_id=str(group["title_id"]),
                title=str(group["title"]),
                source_bundle=str(group["source_bundle"] or group["title"]),
                downloads=list(group["downloads"]),
            )
            for group in _iter_download_groups(library)
        ),
        platforms=platforms,
        file_types=file_types,
        size_policy=size_policy,
    )


def _entry_identity_key(
    *,
    title_id: str,
    platform: str,
    relative_path: str,
) -> str:
    return f"{title_id}::{platform}::{relative_path}"


def _build_accepted_sizes(
    planned: SyncPlanEntry,
    history_entries: list[SyncManifestEntry],
) -> set[int]:
    accepted_sizes: set[int] = set()
    if planned.size_bytes > 0:
        accepted_sizes.add(planned.size_bytes)

    planned_identity = _entry_identity_key(
        title_id=planned.title_id,
        platform=planned.platform,
        relative_path=planned.relative_path,
    )
    for history_entry in history_entries:
        entry_identity = _entry_identity_key(
            title_id=history_entry.title_id,
            platform=history_entry.platform,
            relative_path=(
                history_entry.planned_relative_path or history_entry.relative_path
            ),
        )
        if entry_identity != planned_identity or history_entry.status == "failed":
            continue
        historical_size = history_entry.actual_size_bytes or history_entry.size_bytes
        if historical_size and historical_size > 0:
            accepted_sizes.add(historical_size)

    return accepted_sizes


def _matches_accepted_sizes(path: Path, accepted_sizes: set[int]) -> bool:
    if not path.exists() or not path.is_file():
        return False
    if not accepted_sizes:
        return True
    return path.stat().st_size in accepted_sizes


def _indexed_local_path(path: Path, index: int) -> Path:
    return path.with_name(f"{path.stem} ({index}){path.suffix}")


def _resolve_sync_target_path(
    path: Path,
    expected_size: int,
    accepted_sizes: set[int],
) -> tuple[Path, SyncStatus, str | None]:
    if _matches_accepted_sizes(path, accepted_sizes):
        message = "Existing file matches expected size."
        if expected_size > 0 and path.stat().st_size != expected_size:
            message = "Existing file matches a previously synced payload size."
        return path, "skipped_existing", message

    if not path.exists():
        return path, "downloaded", None

    counter = 1
    while True:
        candidate = _indexed_local_path(path, counter)
        if _matches_accepted_sizes(candidate, accepted_sizes):
            return (
                candidate,
                "skipped_existing",
                "Existing renamed file matches expected or previously synced payload size.",
            )
        if not candidate.exists():
            return (
                candidate,
                "downloaded_renamed",
                "Existing file had a different size; kept both copies.",
            )
        counter += 1


def _manifest_path(target_root: Path) -> Path:
    return target_root / MANIFEST_DIRNAME / MANIFEST_FILENAME


def _trim_manifest_history(
    entries: list[SyncManifestEntry],
    max_history_entries: int,
) -> list[SyncManifestEntry]:
    if len(entries) <= max_history_entries:
        return entries
    return entries[-max_history_entries:]


def _load_manifest_history(target_root: Path) -> list[SyncManifestEntry]:
    manifest_path = _manifest_path(target_root)
    if not manifest_path.exists():
        return []

    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    raw_entries = payload.get("historyEntries")
    if not isinstance(raw_entries, list):
        raw_entries = payload.get("entries")
    if not isinstance(raw_entries, list):
        return []

    entries: list[SyncManifestEntry] = []
    for raw_entry in raw_entries:
        if not isinstance(raw_entry, dict):
            continue
        entries.append(SyncManifestEntry.model_validate(raw_entry))
    return entries


def _build_summary(
    *,
    target_root: Path,
    manifest_path: Path,
    planned_files: int,
    entries: list[SyncManifestEntry],
) -> SyncSummary:
    return SyncSummary(
        target_root=str(target_root),
        manifest_path=str(manifest_path),
        planned_files=planned_files,
        downloaded_files=sum(
            1
            for entry in entries
            if entry.status in {"downloaded", "downloaded_renamed"}
        ),
        skipped_existing_files=sum(
            1 for entry in entries if entry.status == "skipped_existing"
        ),
        renamed_files=sum(
            1 for entry in entries if entry.status == "downloaded_renamed"
        ),
        failed_files=sum(1 for entry in entries if entry.status == "failed"),
        entries=entries,
    )


def _write_manifest(
    target_root: Path,
    history_entries: list[SyncManifestEntry],
    summary: SyncSummary,
    *,
    max_history_entries: int,
) -> Path:
    manifest_path = _manifest_path(target_root)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    updated_at = datetime.now(timezone.utc).isoformat()
    trimmed_history = _trim_manifest_history(history_entries, max_history_entries)
    manifest = SyncManifest(
        created_at=updated_at,
        target_root=str(target_root),
        planned_files=summary.planned_files,
        downloaded_files=summary.downloaded_files,
        skipped_existing_files=summary.skipped_existing_files,
        renamed_files=summary.renamed_files,
        failed_files=summary.failed_files,
        entries=trimmed_history,
    )
    compatibility_payload = manifest.model_dump(
        mode="json",
        by_alias=False,
        exclude_none=True,
    )
    alias_history = [
        entry.model_dump(mode="json", by_alias=True, exclude_none=True)
        for entry in trimmed_history
    ]
    alias_entries = [
        entry.model_dump(mode="json", by_alias=True, exclude_none=True)
        for entry in summary.entries
    ]
    manifest_path.write_text(
        json.dumps(
            {
                **compatibility_payload,
                "version": MANIFEST_VERSION,
                "updatedAt": updated_at,
                "historyEntries": alias_history,
                "lastRun": {
                    "plannedFiles": summary.planned_files,
                    "downloadedFiles": summary.downloaded_files,
                    "skippedExistingFiles": summary.skipped_existing_files,
                    "renamedFiles": summary.renamed_files,
                    "failedFiles": summary.failed_files,
                    "manifestPath": f"{MANIFEST_DIRNAME}/{MANIFEST_FILENAME}",
                    "entries": alias_entries,
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return manifest_path


def _build_manifest_entry(
    *,
    planned: SyncPlanEntry,
    resolved_target_root: Path,
    local_path: Path,
    status: SyncStatus,
    timestamp: str,
    message: str | None,
    actual_size_bytes: int | None,
) -> SyncManifestEntry:
    return SyncManifestEntry.model_validate(
        {
            **planned.model_dump(exclude={"filename", "relative_path"}),
            "filename": local_path.name,
            "relative_path": local_path.relative_to(resolved_target_root).as_posix(),
            "planned_relative_path": planned.relative_path,
            "local_path": local_path.relative_to(resolved_target_root).as_posix(),
            "status": status,
            "message": message,
            "synced_at": timestamp,
            "actual_size_bytes": actual_size_bytes,
        }
    )


def sync_library_downloads(
    library: LibraryData,
    *,
    target_root: Path,
    download_config: DownloadConfig | None = None,
    platforms: Iterable[str] | None = None,
    file_types: Iterable[str] | None = None,
    size_policy: str = "all",
    on_progress: SyncProgressCallback | None = None,
) -> SyncSummary:
    """Sync library downloads into a local folder using append-only behavior."""

    resolved_target_root = target_root.expanduser().resolve()
    resolved_target_root.mkdir(parents=True, exist_ok=True)
    plan = build_sync_plan(
        library,
        platforms=platforms,
        file_types=file_types,
        size_policy=size_policy,
    )

    effective_config = (
        download_config.model_copy(update={"base_folder": resolved_target_root})
        if download_config is not None
        else DownloadConfig(base_folder=resolved_target_root)
    )
    downloader = FileDownloader(effective_config)
    history_entries = _load_manifest_history(resolved_target_root)
    max_history_entries = max(
        1,
        int(effective_config.managed_sync_manifest_history_entries),
    )
    worker_count = min(
        len(plan) or 1,
        max(1, int(effective_config.managed_sync_max_parallel_downloads)),
    )

    entries: list[SyncManifestEntry | None] = [None] * len(plan)
    total_titles = len({item.title_id for item in plan})
    title_entry_counts: dict[str, int] = {}
    reviewed_entry_counts: dict[str, int] = {}
    active_entries: dict[int, ActiveSyncEntryState] = {}
    state_lock = Lock()
    next_index = 0

    for planned in plan:
        title_entry_counts[planned.title_id] = (
            title_entry_counts.get(planned.title_id, 0) + 1
        )

    progress = SyncProgress(
        total_titles=total_titles,
        total_files=len(plan),
    )

    def emit_progress() -> None:
        if on_progress is not None:
            on_progress(progress.model_copy(deep=True))

    def mark_entry_reviewed(planned: SyncPlanEntry) -> None:
        progress.reviewed_files += 1
        reviewed_count = reviewed_entry_counts.get(planned.title_id, 0) + 1
        reviewed_entry_counts[planned.title_id] = reviewed_count
        if reviewed_count == title_entry_counts.get(planned.title_id, 0):
            progress.reviewed_titles += 1

    def refresh_active_progress() -> None:
        progress.active_downloads = len(active_entries)
        latest_key = next(reversed(active_entries), None) if active_entries else None
        latest_entry = (
            active_entries.get(latest_key) if latest_key is not None else None
        )
        progress.current_bundle = latest_entry.source_bundle if latest_entry else None
        progress.current_title = latest_entry.title if latest_entry else None
        progress.current_file = latest_entry.filename if latest_entry else None
        progress.current_file_state = latest_entry.state if latest_entry else None
        progress.current_file_bytes_downloaded = (
            latest_entry.bytes_downloaded if latest_entry else 0
        )
        progress.current_file_total_bytes = (
            latest_entry.total_bytes if latest_entry else None
        )
        progress.current_file_attempt = latest_entry.attempt if latest_entry else None
        progress.current_file_max_attempts = (
            latest_entry.max_attempts if latest_entry else None
        )
        progress.current_file_elapsed_seconds = (
            latest_entry.elapsed_seconds if latest_entry else None
        )
        progress.current_file_message = latest_entry.message if latest_entry else None

    def take_next_index() -> int | None:
        nonlocal next_index
        with state_lock:
            if next_index >= len(plan):
                return None
            current_index = next_index
            next_index += 1
            return current_index

    emit_progress()

    def process_entry(index: int) -> None:
        planned = plan[index]
        desired_path = resolved_target_root / Path(planned.relative_path)
        desired_path.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).isoformat()
        with state_lock:
            active_entries[index] = ActiveSyncEntryState(
                source_bundle=planned.source_bundle,
                title=planned.title,
                filename=planned.filename,
                state="preparing",
            )
            refresh_active_progress()
            snapshot = progress.model_copy(deep=True)
        if on_progress is not None:
            on_progress(snapshot)

        def handle_download_progress(download_progress: DownloadFileProgress) -> None:
            with state_lock:
                active_entry = active_entries.get(index)
                if active_entry is None:
                    return
                active_entry.state = download_progress.stage
                active_entry.bytes_downloaded = download_progress.bytes_downloaded
                active_entry.total_bytes = download_progress.total_bytes
                active_entry.attempt = download_progress.attempt
                active_entry.max_attempts = download_progress.max_attempts
                active_entry.elapsed_seconds = download_progress.elapsed_seconds
                active_entry.message = download_progress.message
                refresh_active_progress()
                snapshot = progress.model_copy(deep=True)
            if on_progress is not None:
                on_progress(snapshot)

        accepted_sizes = _build_accepted_sizes(planned, history_entries)
        local_path, status, message = _resolve_sync_target_path(
            desired_path,
            planned.size_bytes,
            accepted_sizes,
        )

        if status == "skipped_existing":
            entry = _build_manifest_entry(
                planned=planned,
                resolved_target_root=resolved_target_root,
                local_path=local_path,
                status="skipped_existing",
                timestamp=timestamp,
                message=message,
                actual_size_bytes=(
                    local_path.stat().st_size if local_path.exists() else None
                ),
            )
            with state_lock:
                progress.skipped_existing_files += 1
                mark_entry_reviewed(planned)
                entries[index] = entry
                active_entries.pop(index, None)
                refresh_active_progress()
                snapshot = progress.model_copy(deep=True)
            if on_progress is not None:
                on_progress(snapshot)
            return

        try:
            downloader.download_file(
                planned.url,
                str(local_path.parent),
                local_path.name,
                operation_id=f"{planned.title}/{planned.file_type}",
                on_progress=handle_download_progress,
            )
            entry = _build_manifest_entry(
                planned=planned,
                resolved_target_root=resolved_target_root,
                local_path=local_path,
                status=status,
                timestamp=timestamp,
                message=message,
                actual_size_bytes=(
                    local_path.stat().st_size if local_path.exists() else None
                ),
            )
            with state_lock:
                progress.downloaded_files += 1
                if status == "downloaded_renamed":
                    progress.renamed_files += 1
                mark_entry_reviewed(planned)
                entries[index] = entry
                active_entries.pop(index, None)
                refresh_active_progress()
                snapshot = progress.model_copy(deep=True)
            if on_progress is not None:
                on_progress(snapshot)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            error_message = str(exc).split("http", maxsplit=1)[0].rstrip()
            entry = _build_manifest_entry(
                planned=planned,
                resolved_target_root=resolved_target_root,
                local_path=local_path,
                status="failed",
                timestamp=timestamp,
                message=error_message or f"{type(exc).__name__} during sync.",
                actual_size_bytes=None,
            )
            with state_lock:
                progress.failed_files += 1
                mark_entry_reviewed(planned)
                entries[index] = entry
                active_entries.pop(index, None)
                refresh_active_progress()
                snapshot = progress.model_copy(deep=True)
            if on_progress is not None:
                on_progress(snapshot)

    def worker() -> None:
        while True:
            index = take_next_index()
            if index is None:
                return
            process_entry(index)

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = [executor.submit(worker) for _ in range(worker_count)]
        for future in futures:
            future.result()

    finalized_entries = [entry for entry in entries if entry is not None]
    manifest_path = _manifest_path(resolved_target_root)
    summary = _build_summary(
        target_root=resolved_target_root,
        manifest_path=manifest_path,
        planned_files=len(plan),
        entries=finalized_entries,
    )
    manifest_path = _write_manifest(
        resolved_target_root,
        [*history_entries, *finalized_entries],
        summary,
        max_history_entries=max_history_entries,
    )
    return summary.model_copy(update={"manifest_path": str(manifest_path)})
