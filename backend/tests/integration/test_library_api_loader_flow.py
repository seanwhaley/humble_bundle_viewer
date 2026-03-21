"""Integration tests for library API routes backed by the real loader service."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest

from app.api import library as library_api
from app.services.library_loader import clear_library_path_override, set_library_path


@pytest.mark.integration
class TestLibraryApiLoaderFlow:
    """Exercise API routes with real file-backed loader behavior."""

    @pytest.fixture(autouse=True)
    def reset_library_override(self):
        clear_library_path_override()
        yield
        clear_library_path_override()

    @pytest.fixture(autouse=True)
    def allow_tmp_library_root(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            library_api,
            "_library_allowed_roots",
            lambda: (tmp_path.resolve(),),
        )

    def _write_library_file(
        self,
        tmp_path: Path,
        sample_viewer_library_payload: dict,
    ) -> Path:
        library_path = tmp_path / "library_products.json"
        library_path.write_text(
            json.dumps(deepcopy(sample_viewer_library_payload), indent=2),
            encoding="utf-8",
        )
        return library_path

    def _write_metadata_file(
        self,
        tmp_path: Path,
        *,
        url: str,
        title: str = "Recovered Metadata Title",
    ) -> Path:
        metadata_dir = tmp_path / "subproduct_pages"
        metadata_dir.mkdir(parents=True, exist_ok=True)
        metadata_path = metadata_dir / "metadata.json"
        metadata_path.write_text(
            json.dumps(
                {
                    "generated_at": "2026-03-13T12:30:00",
                    "total_entries": 1,
                    "items": [
                        {
                            "url": url,
                            "details": {
                                "url": url,
                                "title": title,
                                "description": "Loaded via integration flow.",
                                "authors": ["Octavia Butler"],
                                "publisher": "Integration Press",
                            },
                        }
                    ],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return metadata_path

    def test_get_library_loads_and_enriches_from_real_files(
        self,
        api_client_factory,
        sample_viewer_library_payload: dict,
        tmp_path: Path,
    ) -> None:
        library_path = self._write_library_file(tmp_path, sample_viewer_library_payload)
        subproduct = sample_viewer_library_payload["products"][0]["subproducts"][0]
        self._write_metadata_file(tmp_path, url=subproduct["url"])
        set_library_path(library_path)
        client = api_client_factory(library_api.router)

        response = client.get("/api/library")

        assert response.status_code == 200
        returned_subproduct = response.json()["products"][0]["subproducts"][0]
        assert returned_subproduct["page_details"]["title"] == "Recovered Metadata Title"
        assert returned_subproduct["page_details"]["authors"] == ["Octavia Butler"]

    def test_get_subproduct_page_serves_cached_html_next_to_selected_library(
        self,
        api_client_factory,
        sample_viewer_library_payload: dict,
        tmp_path: Path,
    ) -> None:
        library_path = self._write_library_file(tmp_path, sample_viewer_library_payload)
        subproduct = sample_viewer_library_payload["products"][0]["subproducts"][0]
        self._write_metadata_file(tmp_path, url=subproduct["url"])
        html_path = tmp_path / "subproduct_pages" / "pages" / "sample-book.html"
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text("<html><body>Integration Sample</body></html>", encoding="utf-8")
        set_library_path(library_path)
        client = api_client_factory(library_api.router)

        response = client.get(
            "/api/library/subproduct-page",
            params={"path": "pages/sample-book.html"},
        )

        assert response.status_code == 200
        assert "Integration Sample" in response.text

    def test_select_library_updates_followup_get_library_requests(
        self,
        api_client_factory,
        sample_viewer_library_payload: dict,
        tmp_path: Path,
    ) -> None:
        library_path = self._write_library_file(tmp_path, sample_viewer_library_payload)
        client = api_client_factory(library_api.router)

        select_response = client.post(
            "/api/library/select",
            json={"library_path": str(library_path)},
        )
        get_response = client.get("/api/library")

        assert select_response.status_code == 200
        assert select_response.json()["output_path"] == str(library_path.resolve())
        assert get_response.status_code == 200
        assert get_response.json()["products"][0]["product_name"] == "Sample Bundle"
