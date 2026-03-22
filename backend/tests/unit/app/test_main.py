"""Unit tests for the FastAPI application factory."""

from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

app_main = importlib.import_module("app.main")
app = app_main.app
create_app = app_main.create_app


@pytest.mark.unit
class TestAppMain:
    """Verify application wiring for the viewer backend."""

    def test_module_level_app_is_created(self) -> None:
        assert app.title == "HB Library Viewer API"

    def test_create_app_exposes_health_and_registered_routes(self) -> None:
        created_app = create_app()
        client = TestClient(created_app)

        response = client.get("/api/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

        paths = {getattr(route, "path", "") for route in created_app.routes}
        assert "/api/library" in paths
        assert "/api/current-bundles" in paths
        assert "/api/current-choice" in paths
        assert "/api/downloads/stream" in paths
        assert "/api/viewer/config" in paths
        assert "/api/maintenance/build-viewer-assets" in paths
        assert "/api/maintenance/cache-subproduct-pages" in paths

        middleware_classes = {
            getattr(middleware.cls, "__name__", str(middleware.cls))
            for middleware in created_app.user_middleware
        }
        assert "CORSMiddleware" in middleware_classes

        client.close()

    def test_create_app_uses_runtime_server_config(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            app_main,
            "RuntimeSettings",
            lambda: SimpleNamespace(
                version="9.9.9",
                server=SimpleNamespace(cors_allowed_origins=["http://localhost:3000"]),
            ),
        )

        configured_app = create_app()
        client = TestClient(configured_app)
        response = client.get(
            "/api/health",
            headers={"Origin": "http://localhost:3000"},
        )

        assert configured_app.version == "9.9.9"
        assert (
            response.headers["access-control-allow-origin"] == "http://localhost:3000"
        )

        client.close()
