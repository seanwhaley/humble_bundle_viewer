"""Unit tests for subproduct page cache models."""

from __future__ import annotations

from pathlib import Path

import pytest
from tqdm import tqdm

from hb_library_viewer.subproducts.pages.models import (
    SharedCacheRunState,
    SubproductPageCacheSummary,
    SubproductPageManifestEntry,
)


@pytest.mark.unit
class TestSubproductPageModels:
    """Smoke tests for the extracted subproduct page models."""

    def test_manifest_entry_and_summary_defaults(self, tmp_path: Path):
        entry = SubproductPageManifestEntry(url="https://example.com/page")
        summary = SubproductPageCacheSummary(
            requested_urls=1,
            processed_urls=1,
            fetched_pages=1,
            reused_pages=0,
            failed_pages=0,
            skipped_pages=0,
            failure_limit=5,
            aborted=False,
            manifest_path=tmp_path / "index.json",
        )

        assert entry.references == []
        assert summary.manifest_path == tmp_path / "index.json"
        assert summary.model_dump(mode="json")["manifest_path"] == str(
            tmp_path / "index.json"
        )

    def test_shared_cache_run_state_initializes_threadsafe_fields(self):
        progress_bar = tqdm(total=0, disable=True)
        try:
            state = SharedCacheRunState(
                requested_urls=1,
                failure_limit=5,
                started_at=0.0,
                progress_log_every=10,
                items_by_url={},
                progress_bar=progress_bar,
            )
        finally:
            progress_bar.close()

        assert state.failure_breakdown == {}
        assert state.domain_stats == {}
        assert state.abort_event.is_set() is False
