"""Unit tests for library API routes."""

from __future__ import annotations

# pyright: reportPrivateUsage=false
# pylint: disable=protected-access

import importlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from hb_library_viewer.utils import BrowserError, ConfigError, HumbleBundleError

library_api = importlib.import_module("app.api.library")
LibraryNotFoundError = importlib.import_module(
    "app.services.library_loader"
).LibraryNotFoundError


@pytest.mark.unit
class TestLibraryApi:
    """Verify library API HTTP contracts in isolation."""

    @pytest.fixture(autouse=True)
    def restrict_library_roots(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> Path:
        allowed_root = (tmp_path / "allowed").resolve()
        allowed_root.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(
            library_api,
            "_library_allowed_roots",
            lambda: (allowed_root,),
        )
        monkeypatch.setattr(
            library_api,
            "default_library_dir",
            lambda: allowed_root,
        )
        return allowed_root

    @pytest.mark.parametrize(
        ("raw_path", "expected_suffix"),
        [
            ("exports", Path("exports/library_products.json")),
            ("library_products.json", Path("library_products.json")),
        ],
    )
    def test_normalize_output_path_handles_files_and_directories(
        self,
        tmp_path: Path,
        raw_path: str,
        expected_suffix: Path,
    ) -> None:
        normalized = library_api._normalize_output_path(str(tmp_path / raw_path))

        assert normalized == (tmp_path / expected_suffix).resolve()

    @pytest.mark.parametrize(
        ("raw_path", "expected_detail"),
        [
            ("   ", "Subproduct page path is required."),
            ("../outside.html", "inside the cache directory"),
            ("pages/not-html.txt", "Only cached HTML subproduct pages are supported."),
        ],
    )
    def test_resolve_subproduct_page_path_rejects_invalid_inputs(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        raw_path: str,
        expected_detail: str,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        monkeypatch.setattr(
            library_api,
            "resolve_subproduct_metadata_path",
            lambda: cache_dir / "metadata.json",
        )

        with pytest.raises(library_api.HTTPException) as exc_info:
            library_api._resolve_subproduct_page_path(raw_path)

        assert exc_info.value.status_code == 400
        assert expected_detail in exc_info.value.detail

    def test_resolve_subproduct_page_path_rejects_absolute_paths(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        absolute_path = (tmp_path / "absolute.html").resolve()
        monkeypatch.setattr(
            library_api,
            "resolve_subproduct_metadata_path",
            lambda: cache_dir / "metadata.json",
        )

        with pytest.raises(library_api.HTTPException) as exc_info:
            library_api._resolve_subproduct_page_path(str(absolute_path))

        assert exc_info.value.status_code == 400
        assert "relative to the cache directory" in exc_info.value.detail

    def test_get_library_returns_active_library(
        self,
        api_client_factory,
        sample_viewer_library_data,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            library_api, "load_library", lambda: sample_viewer_library_data
        )
        client = api_client_factory(library_api.router)

        response = client.get("/api/library")

        assert response.status_code == 200
        assert response.json()["total_products"] == 1
        assert response.json()["products"][0]["downloads"][0]["display_label"] == "PDF"

    def test_get_library_maps_missing_file_to_404(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_missing():
            raise LibraryNotFoundError("missing library")

        monkeypatch.setattr(library_api, "load_library", raise_missing)
        client = api_client_factory(library_api.router)

        response = client.get("/api/library")

        assert response.status_code == 404
        assert response.json()["detail"] == "missing library"

    def test_get_library_status_reports_paths(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        current_path = tmp_path / "library_products.json"
        current_path.write_text("{}", encoding="utf-8")
        default_dir = tmp_path / "downloads"

        monkeypatch.setattr(library_api, "resolve_library_path", lambda: current_path)
        monkeypatch.setattr(library_api, "default_library_dir", lambda: default_dir)
        client = api_client_factory(library_api.router)

        response = client.get("/api/library/status")

        assert response.status_code == 200
        assert response.json() == {
            "current_path": str(current_path),
            "exists": True,
            "default_save_dir": str(default_dir),
            "default_library_path": str(
                (default_dir / "library_products.json").resolve()
            ),
        }

    def test_pick_save_folder_returns_selected_directory(
        self,
        api_client_factory,
        restrict_library_roots: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        selected_dir = restrict_library_roots / "picked"
        monkeypatch.setattr(
            library_api, "pick_directory", lambda _initial: selected_dir
        )
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/pick-save-folder",
            json={"initial_path": str(restrict_library_roots)},
        )

        assert response.status_code == 200
        assert response.json() == {"selected_path": str(selected_dir.resolve())}

    def test_pick_save_folder_returns_null_when_canceled(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(library_api, "pick_directory", lambda _initial: None)
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/pick-save-folder",
            json={"initial_path": None},
        )

        assert response.status_code == 200
        assert response.json() == {"selected_path": None}

    def test_pick_save_folder_maps_picker_errors_to_500(
        self,
        api_client_factory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_picker(_initial: str | None) -> Path | None:
            raise RuntimeError(
                "Native folder selection is not available in this Python environment."
            )

        monkeypatch.setattr(library_api, "pick_directory", raise_picker)
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/pick-save-folder",
            json={"initial_path": None},
        )

        assert response.status_code == 500
        assert "Native folder selection is not available" in response.json()["detail"]

    def test_get_subproduct_page_returns_cached_html(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        html_path = cache_dir / "pages" / "sample-book.html"
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text("<html><body>Sample Book</body></html>", encoding="utf-8")

        monkeypatch.setattr(
            library_api,
            "resolve_subproduct_metadata_path",
            lambda: cache_dir / "metadata.json",
        )
        client = api_client_factory(library_api.router)

        response = client.get(
            "/api/library/subproduct-page",
            params={"path": "pages/sample-book.html"},
        )

        assert response.status_code == 200
        assert "Sample Book" in response.text
        assert response.headers["content-type"].startswith("text/html")

    def test_get_subproduct_page_rejects_directory_traversal(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        monkeypatch.setattr(
            library_api,
            "resolve_subproduct_metadata_path",
            lambda: cache_dir / "metadata.json",
        )
        client = api_client_factory(library_api.router)

        response = client.get(
            "/api/library/subproduct-page",
            params={"path": "../outside.html"},
        )

        assert response.status_code == 400
        assert "inside the cache directory" in response.json()["detail"]

    def test_get_subproduct_page_returns_404_for_missing_html(
        self,
        api_client_factory,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        cache_dir = tmp_path / "subproduct_pages"
        monkeypatch.setattr(
            library_api,
            "resolve_subproduct_metadata_path",
            lambda: cache_dir / "metadata.json",
        )
        client = api_client_factory(library_api.router)

        response = client.get(
            "/api/library/subproduct-page",
            params={"path": "pages/missing-book.html"},
        )

        assert response.status_code == 404
        assert "Cached subproduct page not found" in response.json()["detail"]

    def test_run_library_returns_summary_and_sets_active_path(
        self,
        api_client_factory,
        sample_viewer_library_data,
        restrict_library_roots: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        recorded: dict[str, Path] = {}

        monkeypatch.setattr(
            library_api,
            "run_library_capture",
            lambda **_kwargs: SimpleNamespace(
                library=sample_viewer_library_data,
                files_downloaded=2,
                files_failed=1,
            ),
        )
        monkeypatch.setattr(
            library_api,
            "set_library_path",
            lambda path: recorded.setdefault("path", path),
        )
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/run",
            json={
                "auth_cookie": "cookie-value-123",
                "output_path": str(restrict_library_roots / "viewer-output"),
                "download_files": True,
                "platforms": ["ebook"],
                "file_types": ["pdf"],
                "size_policy": "largest",
            },
        )

        assert response.status_code == 200
        assert response.json()["files_downloaded"] == 2
        assert (
            recorded["path"]
            == (
                restrict_library_roots / "viewer-output" / "library_products.json"
            ).resolve()
        )

    def test_run_library_accepts_paths_outside_allowed_roots(
        self,
        api_client_factory,
        sample_viewer_library_data,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        recorded: dict[str, Path] = {}

        monkeypatch.setattr(
            library_api,
            "run_library_capture",
            lambda **_kwargs: SimpleNamespace(
                library=sample_viewer_library_data,
                files_downloaded=0,
                files_failed=0,
            ),
        )
        monkeypatch.setattr(
            library_api,
            "set_library_path",
            lambda path: recorded.setdefault("path", path),
        )
        client = api_client_factory(library_api.router)

        output_dir = (tmp_path / "outside-root" / "capture-output").resolve()
        response = client.post(
            "/api/library/run",
            json={
                "auth_cookie": "cookie-value-123",
                "output_path": str(output_dir),
            },
        )

        assert response.status_code == 200
        assert response.json()["output_path"] == str(
            (output_dir / "library_products.json").resolve()
        )
        assert recorded["path"] == (output_dir / "library_products.json").resolve()

    def test_run_library_rejects_non_standard_json_filename(
        self,
        api_client_factory,
        tmp_path: Path,
    ) -> None:
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/run",
            json={
                "auth_cookie": "cookie-value-123",
                "output_path": str(tmp_path / "custom-name.json"),
            },
        )

        assert response.status_code == 400
        assert "library_products.json" in response.json()["detail"]

    def test_run_library_maps_config_error_to_400(
        self,
        api_client_factory,
        restrict_library_roots: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_config(**_kwargs):
            raise ConfigError("bad config")

        monkeypatch.setattr(library_api, "run_library_capture", raise_config)
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/run",
            json={
                "auth_cookie": "cookie-value-123",
                "output_path": str(restrict_library_roots / "viewer-output"),
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "bad config"

    @pytest.mark.parametrize(
        "message",
        [
            "too_many_redirects while login page redirected",
            "login form redirected unexpectedly",
            "redirect loop detected during auth",
        ],
    )
    def test_run_library_maps_auth_browser_error_to_401(
        self,
        api_client_factory,
        restrict_library_roots: Path,
        monkeypatch: pytest.MonkeyPatch,
        message: str,
    ) -> None:
        def raise_browser(**_kwargs):
            raise BrowserError(message)

        monkeypatch.setattr(library_api, "run_library_capture", raise_browser)
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/run",
            json={
                "auth_cookie": "cookie-value-123",
                "output_path": str(restrict_library_roots / "viewer-output"),
            },
        )

        assert response.status_code == 401
        assert "valid _simpleauth_sess cookie" in response.json()["detail"]

    def test_run_library_maps_non_auth_browser_error_to_502(
        self,
        api_client_factory,
        restrict_library_roots: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            library_api,
            "run_library_capture",
            lambda **_kwargs: (_ for _ in ()).throw(BrowserError("browser crashed")),
        )
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/run",
            json={
                "auth_cookie": "cookie-value-123",
                "output_path": str(restrict_library_roots / "viewer-output"),
            },
        )

        assert response.status_code == 502
        assert response.json()["detail"] == "Browser capture failed. Check server logs."

    def test_run_library_maps_value_error_to_400(
        self,
        api_client_factory,
        restrict_library_roots: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            library_api,
            "run_library_capture",
            lambda **_kwargs: (_ for _ in ()).throw(ValueError("bad size policy")),
        )
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/run",
            json={
                "auth_cookie": "cookie-value-123",
                "output_path": str(restrict_library_roots / "viewer-output"),
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "bad size policy"

    def test_run_library_maps_generic_humble_error_to_500(
        self,
        api_client_factory,
        restrict_library_roots: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def raise_hb_error(**_kwargs):
            raise HumbleBundleError("capture failed")

        monkeypatch.setattr(library_api, "run_library_capture", raise_hb_error)
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/run",
            json={
                "auth_cookie": "cookie-value-123",
                "output_path": str(restrict_library_roots / "viewer-output"),
            },
        )

        assert response.status_code == 500
        assert response.json()["detail"] == "capture failed"

    def test_run_library_maps_unexpected_error_to_500(
        self,
        api_client_factory,
        restrict_library_roots: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            library_api,
            "run_library_capture",
            lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/run",
            json={
                "auth_cookie": "cookie-value-123",
                "output_path": str(restrict_library_roots / "viewer-output"),
            },
        )

        assert response.status_code == 500
        assert response.json()["detail"] == "Library capture failed. Check server logs."

    def test_select_library_sets_existing_library(
        self,
        api_client_factory,
        sample_viewer_library_payload,
        restrict_library_roots: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        library_path = restrict_library_roots / "library_products.json"
        library_path.write_text(
            json.dumps(sample_viewer_library_payload), encoding="utf-8"
        )
        recorded: dict[str, Path] = {}
        monkeypatch.setattr(
            library_api,
            "set_library_path",
            lambda path: recorded.setdefault("path", path),
        )
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/select",
            json={"library_path": str(library_path)},
        )

        assert response.status_code == 200
        assert response.json()["total_products"] == 1
        assert recorded["path"] == library_path.resolve()

    def test_select_library_returns_404_for_missing_file(
        self,
        api_client_factory,
        restrict_library_roots: Path,
    ) -> None:
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/select",
            json={
                "library_path": str(restrict_library_roots / "library_products.json")
            },
        )

        assert response.status_code == 404

    def test_select_library_returns_400_for_invalid_library_payload(
        self,
        api_client_factory,
        restrict_library_roots: Path,
    ) -> None:
        library_path = restrict_library_roots / "library_products.json"
        library_path.write_text("{}", encoding="utf-8")
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/select",
            json={"library_path": str(library_path)},
        )

        assert response.status_code == 400

    def test_select_library_accepts_paths_outside_allowed_roots(
        self,
        api_client_factory,
        sample_viewer_library_payload,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        library_path = tmp_path / "library_products.json"
        library_path.write_text(
            json.dumps(sample_viewer_library_payload),
            encoding="utf-8",
        )
        recorded: dict[str, Path] = {}
        monkeypatch.setattr(
            library_api,
            "set_library_path",
            lambda path: recorded.setdefault("path", path),
        )
        client = api_client_factory(library_api.router)

        response = client.post(
            "/api/library/select",
            json={"library_path": str(library_path)},
        )

        assert response.status_code == 200
        assert response.json()["output_path"] == str(library_path.resolve())
        assert recorded["path"] == library_path.resolve()
