"""Unit tests for managed local sync helpers."""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
import time
from types import SimpleNamespace

import pytest

from hb_library_viewer.config import DownloadConfig
from hb_library_viewer.parsing import Download, LibraryData, Product, Subproduct
from hb_library_viewer.sync import (
    SyncPlanSourceItem,
    build_sync_plan,
    build_sync_plan_from_items,
    sync_library_downloads,
)


def _ebook_library(*, duplicate_title: bool = False) -> LibraryData:
    secondary_title = (
        "Mastering TypeScript" if duplicate_title else "TypeScript Recipes"
    )
    return LibraryData(
        products=[
            Product(
                gamekey="bundle-1",
                product_name="Programming Bundle",
                machine_name="programming_bundle",
                category="ebook",
                subproducts=[
                    Subproduct(
                        human_name="Mastering TypeScript",
                        machine_name="mastering_typescript",
                        downloads=[
                            Download(
                                platform="ebook",
                                name="EPUB",
                                url="https://example.com/masteringtypescript.epub",
                                size_bytes=11,
                                checksums={},
                                file_type="epub",
                            )
                        ],
                    ),
                    Subproduct(
                        human_name=secondary_title,
                        machine_name="typescript_recipes",
                        downloads=[
                            Download(
                                platform="ebook",
                                name="EPUB",
                                url="https://example.com/typescriptrecipes.epub",
                                size_bytes=13,
                                checksums={},
                                file_type="epub",
                            )
                        ],
                    ),
                ],
                downloads=[],
                amount_spent=25.0,
            )
        ],
        total_products=1,
        captured_at="2026-03-06T00:00:00+00:00",
    )


def _single_title_library() -> LibraryData:
    return LibraryData(
        products=[
            Product(
                gamekey="bundle-1",
                product_name="Programming Bundle",
                machine_name="programming_bundle",
                category="ebook",
                subproducts=[
                    Subproduct(
                        human_name="Mastering TypeScript",
                        machine_name="mastering_typescript",
                        downloads=[
                            Download(
                                platform="ebook",
                                name="EPUB",
                                url="https://example.com/masteringtypescript.epub",
                                size_bytes=11,
                                checksums={},
                                file_type="epub",
                            )
                        ],
                    )
                ],
                downloads=[],
                amount_spent=25.0,
            )
        ],
        total_products=1,
        captured_at="2026-03-06T00:00:00+00:00",
    )


@pytest.mark.unit
class TestManagedSync:
    """Unit tests for sync planning and local append-only behavior."""

    def test_build_sync_plan_from_items_uses_shared_naming_and_checksums(self):
        items = [
            SyncPlanSourceItem(
                title_id="typescript-book",
                title="Mastering TypeScript",
                source_bundle="Programming Bundle",
                downloads=[
                    Download(
                        platform="ebook",
                        name="EPUB",
                        url="https://example.com/masteringtypescript.epub",
                        size_bytes=11,
                        checksums={"sha1": "abc123"},
                        file_type="epub",
                    )
                ],
            )
        ]

        plan = build_sync_plan_from_items(items)

        assert len(plan) == 1
        assert (
            plan[0].relative_path
            == "ebook/Mastering_TypeScript/masteringtypescript.epub"
        )
        assert plan[0].filename == "masteringtypescript.epub"
        assert plan[0].checksums == {"sha1": "abc123"}

    def test_build_sync_plan_from_items_reuses_shared_file_type_inference(self):
        items = [
            SyncPlanSourceItem(
                title_id="typescript-book",
                title="Mastering TypeScript",
                source_bundle="Programming Bundle",
                downloads=[
                    Download(
                        platform="ebook",
                        name="Download",
                        url="https://example.com/masteringtypescript.epub",
                        size_bytes=11,
                        checksums={},
                        file_type=None,
                    )
                ],
            )
        ]

        plan = build_sync_plan_from_items(items, file_types=["EPUB"])

        assert len(plan) == 1
        assert plan[0].file_type == "epub"
        assert plan[0].filename == "masteringtypescript.epub"

    def test_build_sync_plan_uses_subproduct_titles_and_unique_relative_paths(self):
        library = _ebook_library(duplicate_title=True)

        plan = build_sync_plan(library, platforms=["ebook"], file_types=["epub"])

        assert len(plan) == 2
        assert (
            plan[0].relative_path
            == "ebook/Mastering_TypeScript/masteringtypescript.epub"
        )
        assert (
            plan[1].relative_path == "ebook/Mastering_TypeScript/typescriptrecipes.epub"
        )

    def test_sync_library_downloads_skips_existing_matching_size(
        self, tmp_path: Path, monkeypatch
    ):
        library = _single_title_library()
        target_root = tmp_path / "sync-root"
        existing_path = (
            target_root / "ebook" / "Mastering_TypeScript" / "masteringtypescript.epub"
        )
        existing_path.parent.mkdir(parents=True, exist_ok=True)
        existing_path.write_bytes(b"12345678901")

        monkeypatch.setattr(
            "hb_library_viewer.sync.FileDownloader.download_file",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(
                AssertionError("download_file should not run for matching files")
            ),
        )

        summary = sync_library_downloads(
            library,
            target_root=target_root,
            platforms=["ebook"],
            file_types=["epub"],
        )

        assert summary.planned_files == 1
        assert summary.skipped_existing_files == 1
        assert summary.downloaded_files == 0
        manifest = json.loads(Path(summary.manifest_path).read_text(encoding="utf-8"))
        assert manifest["entries"][0]["status"] == "skipped_existing"

    def test_sync_library_downloads_preserves_mismatched_existing_files(
        self, tmp_path: Path, monkeypatch
    ):
        library = _single_title_library()
        target_root = tmp_path / "sync-root"
        existing_path = (
            target_root / "ebook" / "Mastering_TypeScript" / "masteringtypescript.epub"
        )
        existing_path.parent.mkdir(parents=True, exist_ok=True)
        existing_path.write_bytes(b"short")

        captured_paths: list[Path] = []

        def fake_download_file(
            _self,
            _url: str,
            dest_folder: str,
            filename: str,
            operation_id: str = "",
            on_progress=None,
        ):
            del operation_id, on_progress
            local_path = Path(dest_folder) / filename
            local_path.write_bytes(b"12345678901")
            captured_paths.append(local_path)
            return True

        monkeypatch.setattr(
            "hb_library_viewer.sync.FileDownloader.download_file",
            fake_download_file,
        )

        summary = sync_library_downloads(
            library,
            target_root=target_root,
            platforms=["ebook"],
            file_types=["epub"],
        )

        assert existing_path.read_bytes() == b"short"
        assert summary.downloaded_files == 1
        assert summary.renamed_files == 1
        assert captured_paths[0].name == "masteringtypescript (1).epub"

    def test_sync_library_downloads_reuses_matching_renamed_copy(
        self, tmp_path: Path, monkeypatch
    ):
        library = _single_title_library()
        target_root = tmp_path / "sync-root"
        existing_path = (
            target_root / "ebook" / "Mastering_TypeScript" / "masteringtypescript.epub"
        )
        renamed_path = (
            target_root
            / "ebook"
            / "Mastering_TypeScript"
            / "masteringtypescript (1).epub"
        )
        existing_path.parent.mkdir(parents=True, exist_ok=True)
        existing_path.write_bytes(b"short")
        renamed_path.write_bytes(b"12345678901")

        monkeypatch.setattr(
            "hb_library_viewer.sync.FileDownloader.download_file",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(
                AssertionError(
                    "download_file should not run when a renamed copy already matches"
                )
            ),
        )

        summary = sync_library_downloads(
            library,
            target_root=target_root,
            platforms=["ebook"],
            file_types=["epub"],
        )

        assert summary.planned_files == 1
        assert summary.skipped_existing_files == 1
        assert summary.downloaded_files == 0
        assert (
            summary.entries[0].local_path
            == "ebook/Mastering_TypeScript/masteringtypescript (1).epub"
        )
        assert (
            summary.entries[0].message
            == "Existing renamed file matches expected or previously synced payload size."
        )

    def test_sync_library_downloads_avoids_overwriting_existing_renamed_copy(
        self, tmp_path: Path, monkeypatch
    ):
        library = _single_title_library()
        target_root = tmp_path / "sync-root"
        existing_path = (
            target_root / "ebook" / "Mastering_TypeScript" / "masteringtypescript.epub"
        )
        renamed_path = (
            target_root
            / "ebook"
            / "Mastering_TypeScript"
            / "masteringtypescript (1).epub"
        )
        existing_path.parent.mkdir(parents=True, exist_ok=True)
        existing_path.write_bytes(b"short")
        renamed_path.write_bytes(b"older-mismatch")

        captured_paths: list[Path] = []

        def fake_download_file(
            _self,
            _url: str,
            dest_folder: str,
            filename: str,
            operation_id: str = "",
            on_progress=None,
        ):
            del operation_id, on_progress
            local_path = Path(dest_folder) / filename
            local_path.write_bytes(b"12345678901")
            captured_paths.append(local_path)
            return True

        monkeypatch.setattr(
            "hb_library_viewer.sync.FileDownloader.download_file",
            fake_download_file,
        )

        summary = sync_library_downloads(
            library,
            target_root=target_root,
            platforms=["ebook"],
            file_types=["epub"],
        )

        assert existing_path.read_bytes() == b"short"
        assert renamed_path.read_bytes() == b"older-mismatch"
        assert summary.downloaded_files == 1
        assert summary.renamed_files == 1
        assert captured_paths[0].name == "masteringtypescript (2).epub"

    def test_sync_library_downloads_writes_manifest_entries(
        self, tmp_path: Path, monkeypatch
    ):
        library = _single_title_library()
        target_root = tmp_path / "sync-root"

        def fake_download_file(
            _self,
            _url: str,
            dest_folder: str,
            filename: str,
            operation_id: str = "",
            on_progress=None,
        ):
            del operation_id, on_progress
            (Path(dest_folder) / filename).parent.mkdir(parents=True, exist_ok=True)
            (Path(dest_folder) / filename).write_bytes(b"12345678901")
            return True

        monkeypatch.setattr(
            "hb_library_viewer.sync.FileDownloader.download_file",
            fake_download_file,
        )

        summary = sync_library_downloads(
            library,
            target_root=target_root,
            platforms=["ebook"],
            file_types=["epub"],
        )

        manifest_path = Path(summary.manifest_path)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest_path.exists()
        assert manifest["planned_files"] == 1
        assert manifest["downloaded_files"] == 1
        assert {entry["status"] for entry in manifest["entries"]} == {"downloaded"}
        assert manifest["version"] == 2
        assert len(manifest["historyEntries"]) == 1
        assert manifest["lastRun"]["plannedFiles"] == 1
        assert manifest["lastRun"]["entries"][0]["plannedRelativePath"] == (
            "ebook/Mastering_TypeScript/masteringtypescript.epub"
        )

    def test_sync_library_downloads_reports_live_progress(
        self, tmp_path: Path, monkeypatch
    ):
        library = _single_title_library()
        target_root = tmp_path / "sync-root"
        progress_updates = []

        def fake_download_file(
            _self,
            _url: str,
            dest_folder: str,
            filename: str,
            operation_id: str = "",
            on_progress=None,
        ):
            del operation_id
            (Path(dest_folder) / filename).parent.mkdir(parents=True, exist_ok=True)
            if on_progress is not None:
                on_progress(
                    SimpleNamespace(
                        stage="downloading",
                        bytes_downloaded=6,
                        total_bytes=11,
                        attempt=1,
                        max_attempts=3,
                        elapsed_seconds=0.5,
                        message=None,
                    )
                )
            (Path(dest_folder) / filename).write_bytes(b"12345678901")
            if on_progress is not None:
                on_progress(
                    SimpleNamespace(
                        stage="completed",
                        bytes_downloaded=11,
                        total_bytes=11,
                        attempt=1,
                        max_attempts=3,
                        elapsed_seconds=1.0,
                        message=None,
                    )
                )
            return True

        monkeypatch.setattr(
            "hb_library_viewer.sync.FileDownloader.download_file",
            fake_download_file,
        )

        sync_library_downloads(
            library,
            target_root=target_root,
            platforms=["ebook"],
            file_types=["epub"],
            on_progress=progress_updates.append,
        )

        assert progress_updates[0].total_titles == 1
        assert progress_updates[0].total_files == 1
        assert progress_updates[0].reviewed_files == 0
        assert progress_updates[0].current_title is None
        assert any(
            update.current_bundle == "Programming Bundle"
            and update.current_title == "Mastering TypeScript"
            and update.current_file == "masteringtypescript.epub"
            for update in progress_updates
        )
        assert any(
            update.current_file_state == "downloading"
            and update.current_file_bytes_downloaded == 6
            and update.current_file_total_bytes == 11
            and update.current_file_attempt == 1
            and update.current_file_max_attempts == 3
            and update.current_file_elapsed_seconds == 0.5
            for update in progress_updates
        )
        assert any(
            update.reviewed_files == 1 and update.downloaded_files == 1
            for update in progress_updates
        )
        assert progress_updates[-1].reviewed_files == 1
        assert progress_updates[-1].downloaded_files == 1
        assert progress_updates[-1].active_downloads == 0
        assert progress_updates[-1].current_bundle is None
        assert progress_updates[-1].current_title is None
        assert progress_updates[-1].current_file is None

    def test_sync_library_downloads_reuses_viewer_history_actual_size(
        self, tmp_path: Path, monkeypatch
    ):
        library = _single_title_library()
        target_root = tmp_path / "sync-root"
        existing_path = (
            target_root / "ebook" / "Mastering_TypeScript" / "masteringtypescript.epub"
        )
        existing_path.parent.mkdir(parents=True, exist_ok=True)
        existing_path.write_bytes(b"historic-size")

        manifest_dir = target_root / ".hb-library-viewer"
        manifest_dir.mkdir(parents=True, exist_ok=True)
        (manifest_dir / "sync-manifest.json").write_text(
            json.dumps(
                {
                    "version": 2,
                    "updatedAt": "2026-03-17T00:00:00+00:00",
                    "historyEntries": [
                        {
                            "titleId": "bundle-1:mastering_typescript",
                            "title": "Mastering TypeScript",
                            "sourceBundle": "Programming Bundle",
                            "platform": "ebook",
                            "fileType": "epub",
                            "filename": "masteringtypescript.epub",
                            "relativePath": "ebook/Mastering_TypeScript/masteringtypescript.epub",
                            "plannedRelativePath": "ebook/Mastering_TypeScript/masteringtypescript.epub",
                            "localPath": "ebook/Mastering_TypeScript/masteringtypescript.epub",
                            "sizeBytes": 11,
                            "actualSizeBytes": len(b"historic-size"),
                            "status": "downloaded",
                            "syncedAt": "2026-03-17T00:00:00+00:00",
                        }
                    ],
                    "lastRun": {
                        "plannedFiles": 1,
                        "downloadedFiles": 1,
                        "skippedExistingFiles": 0,
                        "renamedFiles": 0,
                        "failedFiles": 0,
                        "manifestPath": ".hb-library-viewer/sync-manifest.json",
                        "entries": [],
                    },
                }
            ),
            encoding="utf-8",
        )

        monkeypatch.setattr(
            "hb_library_viewer.sync.FileDownloader.download_file",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(
                AssertionError("download_file should not run when history matches")
            ),
        )

        summary = sync_library_downloads(
            library,
            target_root=target_root,
            platforms=["ebook"],
            file_types=["epub"],
        )

        assert summary.skipped_existing_files == 1
        assert summary.downloaded_files == 0
        assert summary.entries[0].message == (
            "Existing file matches a previously synced payload size."
        )

    def test_sync_library_downloads_uses_configured_parallel_workers(
        self, tmp_path: Path, monkeypatch
    ):
        library = _ebook_library(duplicate_title=False)
        library.products[0].subproducts.extend(
            [
                Subproduct(
                    human_name="Cloud Native Patterns",
                    machine_name="cloud_native_patterns",
                    downloads=[
                        Download(
                            platform="ebook",
                            name="EPUB",
                            url="https://example.com/cloudnativepatterns.epub",
                            size_bytes=17,
                            checksums={},
                            file_type="epub",
                        )
                    ],
                ),
                Subproduct(
                    human_name="Distributed Systems Handbook",
                    machine_name="distributed_systems_handbook",
                    downloads=[
                        Download(
                            platform="ebook",
                            name="EPUB",
                            url="https://example.com/distributedsystems.epub",
                            size_bytes=19,
                            checksums={},
                            file_type="epub",
                        )
                    ],
                ),
            ]
        )

        target_root = tmp_path / "sync-root"
        state = {"active": 0, "peak": 0}
        state_lock = Lock()

        def fake_download_file(
            _self,
            _url: str,
            dest_folder: str,
            filename: str,
            operation_id: str = "",
            on_progress=None,
        ):
            del operation_id, on_progress
            with state_lock:
                state["active"] += 1
                state["peak"] = max(state["peak"], state["active"])
            time.sleep(0.05)
            local_path = Path(dest_folder) / filename
            local_path.parent.mkdir(parents=True, exist_ok=True)
            local_path.write_bytes(b"12345678901")
            with state_lock:
                state["active"] -= 1
            return True

        monkeypatch.setattr(
            "hb_library_viewer.sync.FileDownloader.download_file",
            fake_download_file,
        )

        summary = sync_library_downloads(
            library,
            target_root=target_root,
            platforms=["ebook"],
            file_types=["epub"],
            download_config=DownloadConfig(
                base_folder=target_root,
                managed_sync_max_parallel_downloads=3,
            ),
        )

        assert summary.downloaded_files == 4
        assert state["peak"] >= 2
