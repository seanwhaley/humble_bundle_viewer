"""FastAPI application for the library viewer backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.downloads import router as downloads_router
from app.api.current_bundles import router as current_bundles_router
from app.api.current_choice import router as current_choice_router
from app.api.library import router as library_router
from app.api.maintenance import router as maintenance_router
from app.api.viewer_config import router as viewer_config_router
from hb_library_viewer.config import RuntimeSettings, ServerConfig


def create_app() -> FastAPI:
    """Create and configure the FastAPI app instance."""
    runtime_settings = RuntimeSettings()
    server_config = runtime_settings.server
    if not isinstance(server_config, ServerConfig):
        server_payload = (
            server_config if isinstance(server_config, dict) else vars(server_config)
        )
        server_config = ServerConfig.model_validate(server_payload)

    fastapi_app = FastAPI(
        title="HB Library Viewer API",
        version=runtime_settings.version,
    )
    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=server_config.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    fastapi_app.include_router(library_router)
    fastapi_app.include_router(current_bundles_router)
    fastapi_app.include_router(current_choice_router)
    fastapi_app.include_router(downloads_router)
    fastapi_app.include_router(viewer_config_router)
    fastapi_app.include_router(maintenance_router)

    @fastapi_app.get("/api/health")
    def health() -> dict[str, str]:  # type: ignore[reportUnusedFunction]
        return {"status": "ok"}

    return fastapi_app


app = create_app()
