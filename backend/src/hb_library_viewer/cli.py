"""Command-line entry point orchestrating the complete workflow.

This module provides:
- main() function as the entrypoint
- Complete error handling
- Logging setup
- Workflow orchestration

The main() function:
1. Loads configuration (Settings validates all constraints)
2. Sets up logging
3. Launches browser with authentication
4. Captures API responses
5. Parses library data and writes aggregated artifacts
6. Prompts for download confirmation
7. Downloads files with retry/rate limiting
8. Handles all errors gracefully

Examples
--------
Run from command line:

        python -m hb_library_viewer

Within code:

        >>> from hb_library_viewer.cli import main  # doctest: +SKIP
        >>> main()  # doctest: +SKIP
"""

# pylint: disable=no-member,too-many-lines

import logging
import os
import queue
import sys
import threading
import time
from collections import Counter, defaultdict
from contextlib import ExitStack
from pathlib import Path
from urllib.parse import urlparse
from typing import Any, Optional

import typer
from rich.console import Console, Group
from rich.live import Live
from rich.logging import RichHandler
from rich.text import Text
from tqdm import tqdm
from typer.models import OptionInfo

from .artifact_workflows import (
    ORDER_MODEL_CLASS,
    generate_order_models_from_api_dir,
    library_products_path as _library_products_path,
    rebuild_library_artifacts_from_api_dir,
    rebuild_order_models_from_artifacts as _rebuild_order_models_from_artifacts,
    summarize_missing_paths as _summarize_missing_paths,
    write_order_model_artifacts as _write_order_model_artifacts,
    write_viewer_schema,
)
from .browser.manager import BrowserManager
from .capture_workflow import capture_library_data, download_library_products
from .config import (
    DEFAULT_ARTIFACTS_DIR,
    DEFAULT_ENV_PATH,
    DEFAULT_VIEWER_SCHEMA_OUTPUT,
    RuntimeSettings,
    Settings,
    default_api_responses_dir,
    default_library_products_path,
    default_order_model_path,
    load_artifacts_config,
    load_browser_config,
    load_current_bundles_config,
    load_current_choice_config,
    load_logging_config,
    load_subproduct_page_cache_config,
    load_viewer_config,
)
from .current_bundles import capture_and_report_current_bundles, normalize_bundle_types
from .current_choice import capture_and_report_current_choice
from .download import FileDownloader
from .download_selection import (
    SIZE_POLICIES,
    collect_downloads as _collect_downloads,
    normalize_file_types as _normalize_file_types,
)
from .model_generation import find_missing_order_payload_paths
from .parsing import build_library_json
from .runtime_status import estimate_eta_seconds, format_hms
from .subproducts.metadata.service import (
    build_subproduct_metadata_analysis_report,
    build_subproduct_page_metadata,
)
from .subproducts.pages.service import cache_subproduct_pages
from .sync import (
    SyncProgress,
    build_sync_plan,
    load_library_data,
    sync_library_downloads,
)
from .utils import BrowserError, ConfigError, HumbleBundleError

logger = logging.getLogger(__name__)
console = Console()
app = typer.Typer(add_completion=False)

ARTIFACTS_DIR = DEFAULT_ARTIFACTS_DIR
DEFAULT_SCHEMA_OUTPUT = DEFAULT_VIEWER_SCHEMA_OUTPUT


def _truncate_status_text(value: str | None, limit: int = 80) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[: max(0, limit - 3)].rstrip()}..."


def _format_sync_outcome_label(previous: SyncProgress, current: SyncProgress) -> str:
    if current.failed_files > previous.failed_files:
        return "failed"
    if current.skipped_existing_files > previous.skipped_existing_files:
        return "skipped_existing"
    if current.renamed_files > previous.renamed_files:
        return "downloaded_renamed"
    if current.downloaded_files > previous.downloaded_files:
        return "downloaded"
    return "reviewed"


def _load_managed_sync_download_config():
    """Load runtime settings for the managed sync command."""

    return RuntimeSettings()


def _format_bytes(value: int | None) -> str:
    if value is None:
        return "?"
    size = float(value)
    units = ["B", "KB", "MB", "GB", "TB"]
    for unit in units:
        if size < 1024 or unit == units[-1]:
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{int(value)} B"


def _format_bytes_per_second(
    bytes_downloaded: int,
    elapsed_seconds: float | None,
) -> str | None:
    if elapsed_seconds is None or elapsed_seconds <= 0 or bytes_downloaded <= 0:
        return None
    return f"{_format_bytes(int(bytes_downloaded / elapsed_seconds))}/s"


def _build_managed_sync_live_lines(
    progress: SyncProgress,
    *,
    elapsed_seconds: float,
    eta_seconds: float | None,
) -> tuple[str, str]:
    overall_parts = [
        "Overall",
        f"files {progress.reviewed_files}/{progress.total_files}",
        f"titles {progress.reviewed_titles}/{progress.total_titles}",
        (
            "counts "
            f"dl={progress.downloaded_files} "
            f"skip={progress.skipped_existing_files} "
            f"ren={progress.renamed_files} "
            f"fail={progress.failed_files}"
        ),
        f"active={progress.active_downloads}",
        f"elapsed={format_hms(elapsed_seconds)}",
    ]
    if eta_seconds is not None:
        overall_parts.append(f"eta={format_hms(eta_seconds)}")

    current_prefix = "Current"
    if progress.active_downloads > 1:
        current_prefix = f"Current (latest of {progress.active_downloads} active)"

    if not progress.current_file:
        return " | ".join(overall_parts), f"{current_prefix}: waiting for next file..."

    scope_parts = [
        part for part in [progress.current_bundle, progress.current_title] if part
    ]
    current_scope = " → ".join(scope_parts) if scope_parts else "Managed sync"
    current_scope = f"{current_scope} [{progress.current_file}]"

    state = (progress.current_file_state or "working").strip().lower()
    state_parts = [state]
    if progress.current_file_attempt and progress.current_file_max_attempts:
        state_parts.append(
            f"attempt {progress.current_file_attempt}/{progress.current_file_max_attempts}"
        )

    if state == "downloading":
        if progress.current_file_total_bytes:
            percent = 0.0
            if progress.current_file_total_bytes > 0:
                percent = (
                    progress.current_file_bytes_downloaded
                    / progress.current_file_total_bytes
                ) * 100
            state_parts.append(
                (
                    f"{_format_bytes(progress.current_file_bytes_downloaded)}"
                    f"/{_format_bytes(progress.current_file_total_bytes)}"
                    f" ({percent:.0f}%)"
                )
            )
        elif progress.current_file_bytes_downloaded > 0:
            state_parts.append(_format_bytes(progress.current_file_bytes_downloaded))

        speed = _format_bytes_per_second(
            progress.current_file_bytes_downloaded,
            progress.current_file_elapsed_seconds,
        )
        if speed is not None:
            state_parts.append(speed)

    if progress.current_file_message:
        state_parts.append(progress.current_file_message)

    return (
        " | ".join(overall_parts),
        f"{current_prefix}: {_truncate_status_text(current_scope, 110)} | {' | '.join(state_parts)}",
    )


def _build_managed_sync_live_renderable(
    progress: SyncProgress,
    *,
    elapsed_seconds: float,
    eta_seconds: float | None,
):
    overall_line, current_line = _build_managed_sync_live_lines(
        progress,
        elapsed_seconds=elapsed_seconds,
        eta_seconds=eta_seconds,
    )
    return Group(Text(overall_line), Text(current_line))


def _prompt_for_auth_cookie() -> Optional[str]:
    if not sys.stdin or not sys.stdin.isatty():
        return None
    try:
        return console.input("Enter _simpleauth_sess cookie: ", password=True)
    except (EOFError, KeyboardInterrupt):
        return None


def _write_env_value(env_path: Path, key: str, value: str) -> None:
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    updated = False
    new_lines: list[str] = []
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("#"):
            new_lines.append(line)
            continue
        if stripped.startswith(f"{key}="):
            indent = line[: len(line) - len(stripped)]
            new_lines.append(f"{indent}{key}={value}")
            updated = True
        else:
            new_lines.append(line)

    if not updated:
        if new_lines and new_lines[-1].strip() != "":
            new_lines.append("")
        new_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def _maybe_persist_auth_cookie(
    cookie: str,
    *,
    env_path: Path = DEFAULT_ENV_PATH,
    save_auth_cookie: Optional[bool] = None,
) -> None:
    if save_auth_cookie is False:
        return

    if save_auth_cookie is True:
        _write_env_value(env_path, "HUMBLE_AUTH_COOKIE", cookie)
        logger.info("Saved session cookie to %s", env_path)
        return

    if not sys.stdin or not sys.stdin.isatty():
        return

    response = (
        console.input("Save session cookie to backend/.env for future use? [y/N]: ")
        .strip()
        .lower()
    )
    if response not in {"y", "yes"}:
        return

    _write_env_value(env_path, "HUMBLE_AUTH_COOKIE", cookie)
    logger.info("Saved session cookie to %s", env_path)


def _load_settings_with_overrides(
    config_path: Optional[Path],
    auth_cookie: Optional[str],
    prompt_auth: bool,
    save_auth_cookie: Optional[bool],
) -> Settings:
    original_config = os.getenv("HUMBLE_CONFIG_YAML")
    if config_path:
        os.environ["HUMBLE_CONFIG_YAML"] = str(config_path)

    try:
        if auth_cookie:
            settings = Settings(auth_cookie=auth_cookie)
            _maybe_persist_auth_cookie(auth_cookie, save_auth_cookie=save_auth_cookie)
            return settings

        try:
            return Settings()
        except ConfigError as exc:
            if prompt_auth and "auth_cookie" in str(exc).lower():
                cookie = _prompt_for_auth_cookie()
                if cookie:
                    _maybe_persist_auth_cookie(
                        cookie,
                        save_auth_cookie=save_auth_cookie,
                    )
                    return Settings(auth_cookie=cookie)
            raise
    finally:
        if config_path is not None:
            if original_config is None:
                os.environ.pop("HUMBLE_CONFIG_YAML", None)
            else:
                os.environ["HUMBLE_CONFIG_YAML"] = original_config


def _download_record_extension(record: Any) -> str:
    url = getattr(record, "url", "") or ""
    url_path = urlparse(url).path if url else ""
    ext = Path(url_path).suffix.lower().lstrip(".") if url_path else ""
    if not ext:
        name = getattr(record, "download_name", None) or getattr(record, "name", "")
        ext = Path(name).suffix.lower().lstrip(".") if name else ""
    return ext or "unknown"


def _summarize_download_records(records: list[Any]) -> dict[str, Counter]:
    grouped: dict[str, Counter] = defaultdict(Counter)
    for record in records:
        grouped[record.platform][_download_record_extension(record)] += 1
    return grouped


def _log_download_summary(records: list[Any]) -> None:
    if not records:
        logger.info("No download records available for summary")
        return

    logger.info("Download file types by platform:")
    grouped = _summarize_download_records(records)
    for platform in sorted(grouped):
        total = sum(grouped[platform].values())
        logger.info("  %s (total %s)", platform, total)
        for ext, count in sorted(
            grouped[platform].items(), key=lambda item: (-item[1], item[0])
        ):
            logger.info("    %s: %s", ext, count)


def _read_input_with_timeout(prompt: str, timeout_seconds: float) -> Optional[str]:
    if timeout_seconds <= 0:
        return None

    if not sys.stdin or not sys.stdin.isatty():
        return None

    response_queue: queue.Queue[Optional[str]] = queue.Queue(maxsize=1)

    def _reader() -> None:
        try:
            response = console.input(prompt)
        except EOFError:
            response = None
        response_queue.put(response)

    thread = threading.Thread(target=_reader, daemon=True)
    thread.start()

    try:
        return response_queue.get(timeout=timeout_seconds)
    except queue.Empty:
        return None


def _prompt_for_download(
    total_products: int, total_records: int, timeout_seconds: float
) -> bool:
    if timeout_seconds <= 0:
        logger.warning(
            "Download confirmation timeout must be positive; skipping downloads"
        )
        return False

    if not sys.stdin or not sys.stdin.isatty():
        logger.warning("No interactive input detected; skipping downloads")
        return False

    response = _read_input_with_timeout(
        (
            "Download "
            f"{total_records} files from {total_products} products? "
            f"[y/N] (timeout {format_hms(timeout_seconds)}): "
        ),
        timeout_seconds,
    )
    if response is None:
        logger.info(
            "Download confirmation timed out after %s; skipping downloads",
            format_hms(timeout_seconds),
        )
        return False

    cleaned = response.strip().lower()
    if cleaned in {"y", "yes"}:
        return True

    logger.info("Download confirmation declined; skipping downloads")
    return False


def _prompt_for_order_model_rebuild(timeout_seconds: float) -> bool:
    if timeout_seconds <= 0:
        logger.info("Order model rebuild prompt disabled; skipping")
        return False

    if not sys.stdin or not sys.stdin.isatty():
        logger.info("No interactive input detected; skipping order model rebuild")
        return False

    response = _read_input_with_timeout(
        f"Rebuild order payload model? [y/N] (timeout {format_hms(timeout_seconds)}): ",
        timeout_seconds,
    )
    if response is None:
        logger.info(
            "Order model rebuild prompt timed out after %s; skipping",
            format_hms(timeout_seconds),
        )
        return False

    cleaned = response.strip().lower()
    return cleaned in {"y", "yes"}


def _format_count_breakdown(
    counts: dict[str, int] | None,
    *,
    limit: int = 8,
) -> str | None:
    if not counts:
        return None
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return ", ".join(f"{label}={count}" for label, count in ordered[:limit])


def _resolve_log_level(log_level: str) -> int:
    """Resolve a logging level name to a stdlib logging level."""
    level_map = {
        "debug": logging.DEBUG,
        "info": logging.INFO,
        "warning": logging.WARNING,
        "error": logging.ERROR,
        "critical": logging.CRITICAL,
    }
    return level_map.get(log_level.lower(), logging.INFO)


def _clear_root_handlers() -> logging.Logger:
    """Remove and close existing root handlers so repeated CLI runs stay clean."""
    root_logger = logging.getLogger()
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)
        try:
            handler.close()
        except Exception:  # pylint: disable=broad-exception-caught
            pass
    return root_logger


def attach_file_logging(log_file: Path, log_level: str, log_format: str) -> Path:
    """Attach a plain-text file log handler and return its resolved path."""
    resolved_log_file = log_file.expanduser().resolve()
    resolved_log_file.parent.mkdir(parents=True, exist_ok=True)

    file_handler = logging.FileHandler(
        resolved_log_file,
        mode="w",
        encoding="utf-8",
    )
    file_handler.setLevel(_resolve_log_level(log_level))
    file_handler.setFormatter(logging.Formatter(log_format))
    logging.getLogger().addHandler(file_handler)
    return resolved_log_file


def setup_logging(log_level: str, log_format: str) -> None:
    """Configure logging for the application.

    Parameters
    ----------
    log_level : str
            Log level (debug, info, warning, error)
    log_format : str
            Log format string with %(variable)s placeholders

    Examples
    --------
    >>> setup_logging("info", "%(name)s - %(levelname)s - %(message)s")
    """
    resolved_level = _resolve_log_level(log_level)
    root_logger = _clear_root_handlers()
    root_logger.setLevel(resolved_level)

    interactive_console = bool(sys.stderr and sys.stderr.isatty())
    if interactive_console:
        console_handler: logging.Handler = RichHandler(
            console=console,
            rich_tracebacks=True,
            tracebacks_show_locals=False,
            markup=True,
            show_path=False,
        )
        console_handler.setFormatter(logging.Formatter("%(message)s"))
    else:
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(logging.Formatter(log_format))

    console_handler.setLevel(resolved_level)
    root_logger.addHandler(console_handler)

    # Reduce verbosity of noisy libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("playwright").setLevel(logging.WARNING)


def _runtime_artifacts_dir() -> Path:
    """Return the config-driven artifacts directory for standalone CLI commands."""

    return getattr(
        getattr(RuntimeSettings(), "artifacts", None),
        "base_dir",
        ARTIFACTS_DIR,
    )


def _runtime_library_file() -> Path:
    """Return the config-driven default library file for standalone CLI commands."""

    runtime_settings = RuntimeSettings()
    viewer_config = getattr(runtime_settings, "viewer", None)
    configured_library_path = getattr(viewer_config, "library_path", None)
    if configured_library_path is not None:
        return configured_library_path
    return _library_products_path(_runtime_artifacts_dir())


def _resolve_current_bundle_analysis_library_file(
    *,
    config_path: Path | None,
    library_file: Path | None,
) -> Path:
    """Resolve the library file used for current bundle overlap analysis."""

    if library_file is not None:
        return library_file.expanduser().resolve()

    current_bundles_config = load_current_bundles_config(config_path)
    if current_bundles_config.library_path is not None:
        return current_bundles_config.library_path

    viewer_config = load_viewer_config(config_path)
    if viewer_config.library_path is not None:
        return viewer_config.library_path

    artifacts_config = load_artifacts_config(config_path)
    return default_library_products_path(artifacts_config.base_dir)


def _resolve_current_choice_analysis_library_file(
    *,
    config_path: Path | None,
    library_file: Path | None,
) -> Path:
    """Resolve the library file used for current Humble Choice analysis."""

    if library_file is not None:
        return library_file.expanduser().resolve()

    current_choice_config = load_current_choice_config(config_path)
    if current_choice_config.library_path is not None:
        return current_choice_config.library_path

    viewer_config = load_viewer_config(config_path)
    if viewer_config.library_path is not None:
        return viewer_config.library_path

    artifacts_config = load_artifacts_config(config_path)
    return default_library_products_path(artifacts_config.base_dir)


def main(  # pylint: disable=too-many-arguments,too-many-positional-arguments,too-many-locals,too-many-branches,too-many-statements,too-many-return-statements,too-many-nested-blocks
    download: Optional[bool] = typer.Option(
        None,
        "--download",
        help="Skip the prompt and download files.",
        show_default=False,
    ),
    skip_downloads: Optional[bool] = typer.Option(
        None,
        "--skip-downloads",
        help="Skip downloading files.",
        show_default=False,
    ),
    config_path: Optional[Path] = typer.Option(
        None,
        "--config",
        help="Path to config.yaml (overrides HUMBLE_CONFIG_YAML).",
    ),
    auth_cookie: Optional[str] = typer.Option(
        None,
        "--auth-cookie",
        help="Provide the session cookie (not persisted).",
        show_default=False,
    ),
    save_auth_cookie: Optional[bool] = typer.Option(
        None,
        "--save-auth-cookie/--no-save-auth-cookie",
        help="Save the session cookie to backend/.env without prompting.",
        show_default=False,
    ),
    prompt_auth_save: bool = typer.Option(
        False,
        "--prompt-auth-save",
        help="Prompt for session cookie and save it to backend/.env without asking.",
        show_default=True,
    ),
    prompt_auth: bool = typer.Option(
        True,
        "--prompt-auth/--no-prompt-auth",
        help="Prompt for session cookie when missing.",
        show_default=True,
    ),
    platforms: Optional[list[str]] = typer.Option(
        None,
        "--platform",
        "-p",
        help="Limit downloads to one or more platforms (repeatable).",
        show_default=False,
    ),
    file_types: Optional[list[str]] = typer.Option(
        None,
        "--file-type",
        "-t",
        help="Limit downloads to one or more file types (repeatable).",
        show_default=False,
    ),
    size_policy: str = typer.Option(
        "all",
        "--size-policy",
        help="Download all files or only the smallest/largest per product.",
        show_default=True,
    ),
    artifacts_dir: Optional[Path] = typer.Option(
        None,
        "--artifacts-dir",
        help="Directory for API batches and library artifacts.",
    ),
    output_products: Optional[Path] = typer.Option(
        None,
        "--output-products",
        help="Output path for library_products.json.",
    ),
    order_model_path: Optional[Path] = typer.Option(
        None,
        "--order-model",
        help="Path to order payload model file.",
    ),
    order_model_class: str = typer.Option(
        ORDER_MODEL_CLASS,
        "--order-model-class",
        help="Order payload model class name.",
    ),
    save_api_batches: Optional[bool] = typer.Option(
        None,
        "--save-api-batches/--no-save-api-batches",
        help="Override artifacts.save_api_batches.",
        show_default=False,
    ),
    save_captured_responses: Optional[bool] = typer.Option(
        None,
        "--save-captured-responses/--no-save-captured-responses",
        help="Override artifacts.save_captured_responses.",
        show_default=False,
    ),
    save_gamekeys: Optional[bool] = typer.Option(
        None,
        "--save-gamekeys/--no-save-gamekeys",
        help="Override artifacts.save_gamekeys.",
        show_default=False,
    ),
    save_html_on_failure: Optional[bool] = typer.Option(
        None,
        "--save-html-on-failure/--no-save-html-on-failure",
        help="Override artifacts.save_html_on_failure.",
        show_default=False,
    ),
) -> int:
    """Main entry point orchestrating complete workflow.

    Workflow:
    1. Load and validate configuration from multiple sources
    2. Set up logging
    3. Open browser with authentication cookie
    4. Capture library page responses
    5. Parse API batches into structured data and write outputs
    6. Confirm downloads interactively
    7. Download files with retry and rate limiting
    8. Handle errors gracefully with appropriate exit codes

    Returns
    -------
    int
            Exit code: 0 for success, 1 for errors

    Examples
    --------
    >>> if __name__ == "__main__":  # doctest: +SKIP
    ...     exit_code = main()
    ...     sys.exit(exit_code)
    """
    try:
        if isinstance(download, OptionInfo):
            download = None
        if isinstance(skip_downloads, OptionInfo):
            skip_downloads = None
        if isinstance(config_path, OptionInfo):
            config_path = None
        if isinstance(auth_cookie, OptionInfo):
            auth_cookie = None
        if isinstance(save_auth_cookie, OptionInfo):
            save_auth_cookie = None
        if isinstance(prompt_auth_save, OptionInfo):
            prompt_auth_save = False
        if isinstance(prompt_auth, OptionInfo):
            prompt_auth = True
        if isinstance(platforms, OptionInfo):
            platforms = None
        if isinstance(file_types, OptionInfo):
            file_types = None
        if isinstance(size_policy, OptionInfo):
            size_policy = "all"
        if isinstance(artifacts_dir, OptionInfo):
            artifacts_dir = None
        if isinstance(output_products, OptionInfo):
            output_products = None
        if isinstance(order_model_path, OptionInfo):
            order_model_path = None
        if isinstance(order_model_class, OptionInfo):
            order_model_class = ORDER_MODEL_CLASS
        if isinstance(save_api_batches, OptionInfo):
            save_api_batches = None
        if isinstance(save_captured_responses, OptionInfo):
            save_captured_responses = None
        if isinstance(save_gamekeys, OptionInfo):
            save_gamekeys = None
        if isinstance(save_html_on_failure, OptionInfo):
            save_html_on_failure = None

        if prompt_auth_save:
            prompt_auth = True
            if save_auth_cookie is None:
                save_auth_cookie = True

        if download and skip_downloads:
            raise typer.BadParameter("Choose either --download or --skip-downloads.")

        size_policy = (size_policy or "all").strip().lower()
        if size_policy not in SIZE_POLICIES:
            raise typer.BadParameter(
                "--size-policy must be one of: all, smallest, largest."
            )

        normalized_file_types = _normalize_file_types(file_types)

        force_downloads: Optional[bool] = None
        if download:
            force_downloads = True
        elif skip_downloads:
            force_downloads = False

        # =============== STEP 1: LOAD CONFIGURATION ===============
        logger.info("=" * 70)
        logger.info("HB Library Viewer v1.0")
        logger.info("=" * 70)

        logger.info("Loading configuration...")
        try:
            config = _load_settings_with_overrides(
                config_path=config_path,
                auth_cookie=auth_cookie,
                prompt_auth=prompt_auth,
                save_auth_cookie=save_auth_cookie,
            )
        except ConfigError as e:
            logger.critical("Configuration error: %s", e)
            print(f"\n❌ Configuration Error: {e}", file=sys.stderr)
            return 1
        except ValueError as e:
            logger.critical("Configuration validation failed: %s", e)
            print(f"\n❌ Configuration Error: {e}", file=sys.stderr)
            return 1
        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.critical("Unexpected configuration error: %s", e)
            print(f"\n❌ Configuration Error: {e}", file=sys.stderr)
            return 1

        if save_api_batches is not None:
            config.artifacts.save_api_batches = save_api_batches
        if save_captured_responses is not None:
            config.artifacts.save_captured_responses = save_captured_responses
        if save_gamekeys is not None:
            config.artifacts.save_gamekeys = save_gamekeys
        if save_html_on_failure is not None:
            config.artifacts.save_html_on_failure = save_html_on_failure

        resolved_artifacts_dir = (
            (artifacts_dir or getattr(config.artifacts, "base_dir", ARTIFACTS_DIR))
            .expanduser()
            .resolve()
        )
        resolved_order_model_path = (
            order_model_path
            if order_model_path is not None
            else resolved_artifacts_dir / "order_payload_models.py"
        )
        resolved_output_products = (
            output_products
            if output_products is not None
            else _library_products_path(resolved_artifacts_dir)
        )

        logger.debug("Download folder: %s", config.download.base_folder)
        logger.debug("Log level: %s", config.logging.level)
        logger.info("✓ Configuration loaded successfully")

        if force_downloads is not None:
            config.download.prompt_before_download = False
            config.download.force_individual_file_downloads = force_downloads

        # =============== STEP 2: SET UP LOGGING ===============
        setup_logging(config.logging.level, config.logging.format)
        logger.debug("Logging configured")

        try:
            prompt_timeout = getattr(config.download, "prompt_timeout_seconds", 30)
            capture_summary = capture_library_data(
                settings=config,
                artifacts_dir=resolved_artifacts_dir,
                output_products=resolved_output_products,
                order_model_path=resolved_order_model_path,
                order_model_class=order_model_class,
                prompt_timeout_seconds=prompt_timeout,
                prompt_for_order_model_rebuild=_prompt_for_order_model_rebuild,
                browser_manager_cls=BrowserManager,
                library_builder=build_library_json,
                missing_paths_finder=find_missing_order_payload_paths,
                order_model_writer=_write_order_model_artifacts,
            )
            lib_data = capture_summary.library
        except BrowserError as e:
            logger.error("Browser error: %s", e)
            print(f"\n❌ Browser Error: {e}", file=sys.stderr)
            return 1
        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("Error capturing or parsing API responses: %s", e)
            print(f"\n❌ Parse Error: {e}", file=sys.stderr)
            return 1

        # =============== STEP 5: DOWNLOAD FILES ===============
        active_platforms = platforms or getattr(config, "platforms", None)
        downloads = _collect_downloads(
            lib_data.products,
            active_platforms,
            normalized_file_types,
            size_policy,
        )
        total_records = len(downloads)

        if lib_data.total_products == 0:
            logger.warning("No products found in library")
            logger.warning("Nothing to download")
            _log_download_summary(downloads)
            return 0

        forced_downloads = getattr(
            config.download, "force_individual_file_downloads", None
        )
        prompt_before_download = getattr(
            config.download, "prompt_before_download", True
        )

        if forced_downloads is False:
            logger.info("Download skipped by configuration")
            _log_download_summary(downloads)
            return 0

        if forced_downloads is None and prompt_before_download:
            prompt_timeout = getattr(config.download, "prompt_timeout_seconds", 30)
            if not _prompt_for_download(
                lib_data.total_products, total_records, prompt_timeout
            ):
                logger.info("Download skipped by user or timeout")
                _log_download_summary(downloads)
                return 0

        if forced_downloads is True:
            logger.info("Download forced by configuration; starting downloads")
        elif not prompt_before_download:
            logger.info("Download confirmation disabled; starting downloads")

        logger.info("=" * 70)
        logger.info("Found %s products to download", lib_data.total_products)
        logger.info("=" * 70)

        try:
            with tqdm(
                lib_data.products,
                total=lib_data.total_products,
                desc="Downloading",
                unit="product",
                disable=not sys.stderr.isatty(),
            ):
                download_summary = download_library_products(
                    library=lib_data,
                    download_config=config.download,
                    platforms=active_platforms,
                    file_types=normalized_file_types,
                    size_policy=size_policy,
                    downloader_cls=FileDownloader,
                )
        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.exception("Unexpected error during download execution")
            print(f"\n❌ Download Error: {e}", file=sys.stderr)
            return 1

        total_downloaded = download_summary.files_downloaded
        total_failed = download_summary.files_failed

        # =============== STEP 6: SUMMARY ===============
        logger.info("=" * 70)
        logger.info("Download Summary:")
        logger.info("  Products processed: %s", lib_data.total_products)
        logger.info("  Files downloaded: %s", total_downloaded)
        logger.info("  Files failed/skipped: %s", total_failed)
        logger.info("=" * 70)

        _log_download_summary(downloads)

        if total_downloaded > 0:
            logger.info("✓ Download complete!")
            return 0

        logger.warning("No files were downloaded")
        return 1

    except KeyboardInterrupt:
        logger.warning("Download interrupted by user")
        print("\n⚠️ Download interrupted", file=sys.stderr)
        return 1

    except HumbleBundleError as e:
        logger.critical("Application error: %s", e)
        print(f"\n❌ Error: {e}", file=sys.stderr)
        return 1

    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.exception("Fatal unexpected error")
        print(f"\n❌ Fatal Error: {e}", file=sys.stderr)
        return 1


def rebuild_order_models_from_artifacts(
    artifacts_dir: Optional[Path] = None,
    pattern: str = "orders_batch_*.json",
    order_model_path: Optional[Path] = None,
    order_model_class: str = ORDER_MODEL_CLASS,
) -> int:
    """Rebuild order payload models from saved API response artifacts."""
    resolved_artifacts_dir = (
        (artifacts_dir or _runtime_artifacts_dir()).expanduser().resolve()
    )
    try:
        result = _rebuild_order_models_from_artifacts(
            artifacts_dir=resolved_artifacts_dir,
            pattern=pattern,
            order_model_path=order_model_path,
            order_model_class=order_model_class,
        )
    except FileNotFoundError as exc:
        logger.error("%s", exc)
        return 1

    if result.missing_paths:
        logger.warning(
            "Order payload model missing %s field paths: %s",
            len(result.missing_paths),
            _summarize_missing_paths(result.missing_paths),
        )
    else:
        logger.info("✓ Order payload model matches API responses")
    return 0


@app.callback(invoke_without_command=True)
def run(  # pylint: disable=too-many-arguments,too-many-positional-arguments,too-many-locals
    ctx: typer.Context,
    download: Optional[bool] = typer.Option(
        None,
        "--download",
        help="Skip the prompt and download files.",
        show_default=False,
    ),
    skip_downloads: Optional[bool] = typer.Option(
        None,
        "--skip-downloads",
        help="Skip downloading files.",
        show_default=False,
    ),
    config_path: Optional[Path] = typer.Option(
        None,
        "--config",
        help="Path to config.yaml (overrides HUMBLE_CONFIG_YAML).",
    ),
    auth_cookie: Optional[str] = typer.Option(
        None,
        "--auth-cookie",
        help="Provide the session cookie (not persisted).",
        show_default=False,
    ),
    save_auth_cookie: Optional[bool] = typer.Option(
        None,
        "--save-auth-cookie/--no-save-auth-cookie",
        help="Save the session cookie to backend/.env without prompting.",
        show_default=False,
    ),
    prompt_auth_save: bool = typer.Option(
        False,
        "--prompt-auth-save",
        help="Prompt for session cookie and save it to backend/.env without asking.",
        show_default=True,
    ),
    prompt_auth: bool = typer.Option(
        True,
        "--prompt-auth/--no-prompt-auth",
        help="Prompt for session cookie when missing.",
        show_default=True,
    ),
    platforms: Optional[list[str]] = typer.Option(
        None,
        "--platform",
        "-p",
        help="Limit downloads to one or more platforms (repeatable).",
        show_default=False,
    ),
    file_types: Optional[list[str]] = typer.Option(
        None,
        "--file-type",
        "-t",
        help="Limit downloads to one or more file types (repeatable).",
        show_default=False,
    ),
    size_policy: str = typer.Option(
        "all",
        "--size-policy",
        help="Download all files or only the smallest/largest per product.",
        show_default=True,
    ),
    artifacts_dir: Optional[Path] = typer.Option(
        None,
        "--artifacts-dir",
        help="Directory for API batches and library artifacts.",
    ),
    output_products: Optional[Path] = typer.Option(
        None,
        "--output-products",
        help="Output path for library_products.json.",
    ),
    order_model_path: Optional[Path] = typer.Option(
        None,
        "--order-model",
        help="Path to order payload model file.",
    ),
    order_model_class: str = typer.Option(
        ORDER_MODEL_CLASS,
        "--order-model-class",
        help="Order payload model class name.",
    ),
    save_api_batches: Optional[bool] = typer.Option(
        None,
        "--save-api-batches/--no-save-api-batches",
        help="Override artifacts.save_api_batches.",
        show_default=False,
    ),
    save_captured_responses: Optional[bool] = typer.Option(
        None,
        "--save-captured-responses/--no-save-captured-responses",
        help="Override artifacts.save_captured_responses.",
        show_default=False,
    ),
    save_gamekeys: Optional[bool] = typer.Option(
        None,
        "--save-gamekeys/--no-save-gamekeys",
        help="Override artifacts.save_gamekeys.",
        show_default=False,
    ),
    save_html_on_failure: Optional[bool] = typer.Option(
        None,
        "--save-html-on-failure/--no-save-html-on-failure",
        help="Override artifacts.save_html_on_failure.",
        show_default=False,
    ),
) -> None:
    """Run the full capture → parse → download workflow."""
    if ctx.invoked_subcommand:
        return
    raise typer.Exit(
        main(
            download=download,
            skip_downloads=skip_downloads,
            config_path=config_path,
            auth_cookie=auth_cookie,
            save_auth_cookie=save_auth_cookie,
            prompt_auth_save=prompt_auth_save,
            prompt_auth=prompt_auth,
            platforms=platforms,
            file_types=file_types,
            size_policy=size_policy,
            artifacts_dir=artifacts_dir,
            output_products=output_products,
            order_model_path=order_model_path,
            order_model_class=order_model_class,
            save_api_batches=save_api_batches,
            save_captured_responses=save_captured_responses,
            save_gamekeys=save_gamekeys,
            save_html_on_failure=save_html_on_failure,
        )
    )


@app.command("rebuild-order-models")
def rebuild_order_models_command(
    artifacts_dir: Optional[Path] = typer.Option(
        None,
        "--artifacts-dir",
        help="Directory containing API response artifacts.",
        show_default=False,
    ),
    pattern: str = typer.Option(
        "orders_batch_*.json",
        "--pattern",
        help="Filename glob for API batch files.",
    ),
    order_model_path: Optional[Path] = typer.Option(
        None,
        "--order-model",
        help="Output path for generated order model.",
    ),
    order_model_class: str = typer.Option(
        ORDER_MODEL_CLASS,
        "--order-model-class",
        help="Root class name for generated models.",
    ),
) -> None:
    """Rebuild order payload models from stored API batches."""
    if isinstance(artifacts_dir, OptionInfo):
        artifacts_dir = None
    if isinstance(order_model_path, OptionInfo):
        order_model_path = None
    raise typer.Exit(
        rebuild_order_models_from_artifacts(
            artifacts_dir=artifacts_dir,
            pattern=pattern,
            order_model_path=order_model_path,
            order_model_class=order_model_class,
        )
    )


@app.command("generate-order-models")
def generate_order_models_command(
    api_dir: Optional[Path] = typer.Option(
        None,
        "--api-dir",
        help="Directory containing orders_batch_*.json files.",
        show_default=False,
    ),
    pattern: str = typer.Option(
        "orders_batch_*.json",
        "--pattern",
        help="Filename glob for API batch files.",
    ),
    output_models: Optional[Path] = typer.Option(
        None,
        "--output-models",
        help="Output path for generated order payload models.",
        show_default=False,
    ),
    class_name: str = typer.Option(
        ORDER_MODEL_CLASS,
        "--class-name",
        help="Root class name for the generated models.",
    ),
) -> None:
    """Generate order payload models from stored API responses."""
    if isinstance(api_dir, OptionInfo):
        api_dir = None
    if isinstance(output_models, OptionInfo):
        output_models = None
    if isinstance(pattern, OptionInfo):
        pattern = "orders_batch_*.json"
    if isinstance(class_name, OptionInfo):
        class_name = ORDER_MODEL_CLASS

    artifacts_dir = _runtime_artifacts_dir()
    resolved_api_dir = (
        (api_dir or default_api_responses_dir(artifacts_dir)).expanduser().resolve()
    )
    resolved_output_models = (
        (output_models or default_order_model_path(artifacts_dir))
        .expanduser()
        .resolve()
    )
    try:
        generate_order_models_from_api_dir(
            api_dir=resolved_api_dir,
            pattern=pattern,
            output_models=resolved_output_models,
            class_name=class_name,
        )
    except FileNotFoundError as exc:
        typer.echo(str(exc))
        raise typer.Exit(code=1) from exc
    except ValueError as exc:
        typer.echo(str(exc))
        raise typer.Exit(code=1) from exc
    except OSError as exc:
        typer.echo(f"Failed to back up existing model: {exc}")
        raise typer.Exit(code=1) from exc


@app.command("rebuild-library-artifacts")
def rebuild_library_artifacts_command(
    api_dir: Optional[Path] = typer.Option(
        None,
        "--api-dir",
        help="Directory containing orders_batch_*.json files.",
        show_default=False,
    ),
    pattern: str = typer.Option(
        "orders_batch_*.json",
        "--pattern",
        help="Filename glob for API batch files.",
    ),
    output_products: Optional[Path] = typer.Option(
        None,
        "--output-products",
        help="Output path for library_products.json.",
        show_default=False,
    ),
    order_model_path: Optional[Path] = typer.Option(
        None,
        "--order-model",
        help="Generated order model file for validation.",
        show_default=False,
    ),
    order_model_class: str = typer.Option(
        ORDER_MODEL_CLASS,
        "--order-model-class",
        help="Class name to load from the order model file.",
    ),
) -> None:
    """Rebuild library_products.json from stored API responses."""
    if isinstance(api_dir, OptionInfo):
        api_dir = None
    if isinstance(output_products, OptionInfo):
        output_products = None
    if isinstance(order_model_path, OptionInfo):
        order_model_path = None
    if isinstance(pattern, OptionInfo):
        pattern = "orders_batch_*.json"
    if isinstance(order_model_class, OptionInfo):
        order_model_class = ORDER_MODEL_CLASS

    artifacts_dir = _runtime_artifacts_dir()
    resolved_api_dir = (
        (api_dir or default_api_responses_dir(artifacts_dir)).expanduser().resolve()
    )
    resolved_output_products = (
        (output_products or _library_products_path(artifacts_dir))
        .expanduser()
        .resolve()
    )
    resolved_order_model_path = (
        (order_model_path or default_order_model_path(artifacts_dir))
        .expanduser()
        .resolve()
    )
    try:
        rebuild_library_artifacts_from_api_dir(
            api_dir=resolved_api_dir,
            pattern=pattern,
            output_products=resolved_output_products,
            order_model_path=resolved_order_model_path,
            order_model_class=order_model_class,
        )
    except FileNotFoundError as exc:
        typer.echo(str(exc))
        raise typer.Exit(code=1) from exc


@app.command("build-viewer-assets")
def build_viewer_assets_command(
    schema_output: Path = typer.Option(
        DEFAULT_SCHEMA_OUTPUT,
        "--schema-output",
        help="Output path for viewer schema.",
    )
) -> None:
    """Generate the viewer schema from LibraryData."""
    write_viewer_schema(schema_output)


@app.command("sync-downloads")
def sync_downloads_command(
    library_file: Optional[Path] = typer.Option(
        None,
        "--library-file",
        help="Path to library_products.json.",
        show_default=False,
    ),
    target_folder: Path = typer.Option(
        ...,
        "--target-folder",
        help="Local root folder for managed sync downloads.",
    ),
    platforms: Optional[list[str]] = typer.Option(
        None,
        "--platform",
        "-p",
        help="Limit sync to one or more platforms (defaults to ebook).",
        show_default=False,
    ),
    file_types: Optional[list[str]] = typer.Option(
        None,
        "--file-type",
        "-t",
        help="Limit sync to one or more file types (repeatable).",
        show_default=False,
    ),
    size_policy: str = typer.Option(
        "all",
        "--size-policy",
        help="Sync all files or only the smallest/largest per title.",
        show_default=True,
    ),
    dry_run: bool = typer.Option(
        False,
        "--dry-run",
        help="Print the sync plan without downloading files.",
    ),
) -> None:
    """Sync downloads into a local folder with skip-existing behavior."""

    if isinstance(library_file, OptionInfo):
        library_file = None

    requested_platforms = platforms or ["ebook"]
    normalized_size_policy = (size_policy or "all").strip().lower()
    if normalized_size_policy not in SIZE_POLICIES:
        raise typer.BadParameter(
            "--size-policy must be one of: all, smallest, largest."
        )

    resolved_library_file = (
        (library_file or _runtime_library_file()).expanduser().resolve()
    )
    if not resolved_library_file.exists():
        typer.echo(f"Library file not found: {resolved_library_file}")
        raise typer.Exit(code=1)

    library = load_library_data(resolved_library_file)
    plan = build_sync_plan(
        library,
        platforms=requested_platforms,
        file_types=file_types,
        size_policy=normalized_size_policy,
    )

    console.print(
        f"Managed sync plan: {len(plan)} file(s) into {target_folder.expanduser().resolve()}"
    )
    if not plan:
        console.print("No downloads matched the selected filters.")
        raise typer.Exit(code=0)

    for entry in plan[:10]:
        console.print(f"  - {entry.relative_path}")
    if len(plan) > 10:
        console.print(f"  ... and {len(plan) - 10} more")

    if dry_run:
        raise typer.Exit(code=0)

    runtime_settings = _load_managed_sync_download_config()
    download_config = runtime_settings.download.model_copy(
        update={"base_folder": target_folder.expanduser().resolve()}
    )

    progress_started_at = time.monotonic()
    last_progress = SyncProgress(total_titles=0, total_files=len(plan))
    interactive_progress = bool(sys.stderr and sys.stderr.isatty())
    last_logged_reviewed = 0

    console.print(
        "Managed sync runtime settings: "
        f"workers={download_config.managed_sync_max_parallel_downloads}, "
        f"manifest history={download_config.managed_sync_manifest_history_entries}"
    )

    progress_bar = None
    live_display = None

    def handle_progress(progress: SyncProgress) -> None:
        nonlocal last_logged_reviewed, last_progress

        elapsed_seconds = time.monotonic() - progress_started_at
        eta_seconds = estimate_eta_seconds(
            elapsed_seconds=elapsed_seconds,
            completed_items=progress.reviewed_files,
            total_items=progress.total_files,
        )

        if interactive_progress and live_display is not None:
            live_display.update(
                _build_managed_sync_live_renderable(
                    progress,
                    elapsed_seconds=elapsed_seconds,
                    eta_seconds=eta_seconds,
                ),
                refresh=True,
            )
        elif progress_bar is not None:
            current_scope = "Managed sync"
            if progress.current_bundle or progress.current_title:
                scope_parts = [
                    part
                    for part in [progress.current_bundle, progress.current_title]
                    if part
                ]
                current_scope = " → ".join(scope_parts)
            if progress.current_file:
                current_scope = f"{current_scope} [{progress.current_file}]"

            progress_bar.n = progress.reviewed_files
            progress_bar.set_description_str(_truncate_status_text(current_scope, 64))
            postfix = (
                f"titles={progress.reviewed_titles}/{progress.total_titles} "
                f"dl={progress.downloaded_files} "
                f"skip={progress.skipped_existing_files} "
                f"ren={progress.renamed_files} "
                f"fail={progress.failed_files} "
                f"active={progress.active_downloads} "
                f"elapsed={format_hms(elapsed_seconds)}"
            )
            if eta_seconds is not None:
                postfix = f"{postfix} eta={format_hms(eta_seconds)}"
            progress_bar.set_postfix_str(postfix)
            progress_bar.refresh()

        if (
            not interactive_progress
        ) and progress.reviewed_files > last_progress.reviewed_files:
            outcome = _format_sync_outcome_label(last_progress, progress)
            should_log_snapshot = (
                outcome == "failed"
                or progress.reviewed_files == progress.total_files
                or (progress.reviewed_files - last_logged_reviewed) >= 25
            )

            if should_log_snapshot:
                detail_parts = [
                    f"[{outcome}]",
                    f"files {progress.reviewed_files}/{progress.total_files}",
                    f"titles {progress.reviewed_titles}/{progress.total_titles}",
                    (
                        "counts "
                        f"dl={progress.downloaded_files} "
                        f"skip={progress.skipped_existing_files} "
                        f"ren={progress.renamed_files} "
                        f"fail={progress.failed_files}"
                    ),
                    f"elapsed={format_hms(elapsed_seconds)}",
                ]
                if eta_seconds is not None:
                    detail_parts.append(f"eta={format_hms(eta_seconds)}")
                if progress.current_bundle:
                    detail_parts.append(
                        f"bundle={_truncate_status_text(progress.current_bundle, 48)}"
                    )
                if progress.current_title:
                    detail_parts.append(
                        f"title={_truncate_status_text(progress.current_title, 48)}"
                    )
                if progress.current_file:
                    detail_parts.append(
                        f"file={_truncate_status_text(progress.current_file, 40)}"
                    )

                progress_line = " | ".join(detail_parts)
                if progress_bar is not None and not progress_bar.disable:
                    progress_bar.write(progress_line)
                else:
                    console.print(progress_line)
                last_logged_reviewed = progress.reviewed_files

        last_progress = progress

    with ExitStack() as exit_stack:
        if interactive_progress:
            live_display = exit_stack.enter_context(
                Live(
                    _build_managed_sync_live_renderable(
                        last_progress,
                        elapsed_seconds=0,
                        eta_seconds=None,
                    ),
                    console=console,
                    refresh_per_second=10,
                    transient=True,
                    auto_refresh=False,
                )
            )
        else:
            progress_bar = tqdm(
                total=len(plan),
                desc="Managed sync",
                unit="file",
                disable=not sys.stderr.isatty(),
            )
            exit_stack.callback(progress_bar.close)

        summary = sync_library_downloads(
            library,
            target_root=target_folder,
            download_config=download_config,
            platforms=requested_platforms,
            file_types=file_types,
            size_policy=normalized_size_policy,
            on_progress=handle_progress,
        )

    elapsed_seconds = time.monotonic() - progress_started_at

    console.print("Managed sync complete:")
    console.print(f"  Planned files: {summary.planned_files}")
    console.print(f"  Downloaded: {summary.downloaded_files}")
    console.print(f"  Skipped existing: {summary.skipped_existing_files}")
    console.print(f"  Renamed to preserve existing files: {summary.renamed_files}")
    console.print(f"  Failed: {summary.failed_files}")
    console.print(f"  Elapsed: {format_hms(elapsed_seconds)}")
    console.print(f"  Manifest: {summary.manifest_path}")


@app.command("cache-subproduct-pages")
def cache_subproduct_pages_command(
    library_file: Optional[Path] = typer.Option(
        None,
        "--library-file",
        help="Path to library_products.json.",
        show_default=False,
    ),
    config_path: Optional[Path] = typer.Option(
        None,
        "--config",
        help="Path to config.yaml (overrides HUMBLE_CONFIG_YAML).",
    ),
    cache_dir: Optional[Path] = typer.Option(
        None,
        "--cache-dir",
        help="Override the subproduct page cache directory.",
    ),
    redownload_existing: Optional[bool] = typer.Option(
        None,
        "--redownload-existing/--no-redownload-existing",
        help="Override subproduct_pages.redownload_existing.",
        show_default=False,
    ),
    subproduct_query: Optional[str] = typer.Option(
        None,
        "--subproduct-query",
        help=(
            "Filter to matching subproduct/product metadata (title, machine name, publisher, or URL substring)."
        ),
        show_default=False,
    ),
    url: Optional[str] = typer.Option(
        None,
        "--url",
        help="Fetch only this exact external subproduct info URL.",
        show_default=False,
    ),
    limit: Optional[int] = typer.Option(
        None,
        "--limit",
        help="Limit the number of matching URLs processed.",
        show_default=False,
    ),
    max_failures: Optional[int] = typer.Option(
        None,
        "--max-failures",
        help="Abort after this many consecutive non-HTTP page fetch failures.",
        show_default=False,
    ),
    domain_workers: Optional[int] = typer.Option(
        None,
        "--domain-workers",
        help="Process different domains concurrently while keeping each domain serial and rate-limited.",
        show_default=False,
    ),
    log_file: Optional[Path] = typer.Option(
        None,
        "--log-file",
        help="Write a plain-text cache run log to this path (defaults to <cache-dir>/cache_run.log).",
        show_default=False,
    ),
) -> None:
    """Cache external subproduct info pages for later scraping."""

    if isinstance(library_file, OptionInfo):
        library_file = None

    if isinstance(config_path, OptionInfo):
        config_path = None
    if isinstance(cache_dir, OptionInfo):
        cache_dir = None
    if isinstance(redownload_existing, OptionInfo):
        redownload_existing = None
    if isinstance(subproduct_query, OptionInfo):
        subproduct_query = None
    if isinstance(url, OptionInfo):
        url = None
    if isinstance(limit, OptionInfo):
        limit = None
    if isinstance(max_failures, OptionInfo):
        max_failures = None
    if isinstance(domain_workers, OptionInfo):
        domain_workers = None
    if isinstance(log_file, OptionInfo):
        log_file = None

    if limit is not None and limit < 1:
        raise typer.BadParameter("--limit must be at least 1.")
    if max_failures is not None and max_failures < 1:
        raise typer.BadParameter("--max-failures must be at least 1.")
    if domain_workers is not None and domain_workers < 1:
        raise typer.BadParameter("--domain-workers must be at least 1.")

    resolved_library_file = (
        (library_file or _runtime_library_file()).expanduser().resolve()
    )
    if not resolved_library_file.exists():
        typer.echo(f"Library file not found: {resolved_library_file}")
        raise typer.Exit(code=1)

    logging_config = load_logging_config(config_path)
    setup_logging(logging_config.level, logging_config.format)

    browser_config = load_browser_config(config_path)
    page_cache_config = load_subproduct_page_cache_config(config_path)
    if cache_dir is not None:
        page_cache_config.base_dir = cache_dir.expanduser().resolve()
    if domain_workers is not None:
        page_cache_config.domain_workers = domain_workers

    resolved_log_file = attach_file_logging(
        log_file
        or getattr(page_cache_config, "log_path", None)
        or (page_cache_config.base_dir / "cache_run.log"),
        logging_config.level,
        logging_config.format,
    )
    logger.info("Writing plain-text cache run log to %s", resolved_log_file)

    library = load_library_data(resolved_library_file)
    summary = cache_subproduct_pages(
        library,
        page_cache_config,
        browser_config=browser_config,
        redownload_existing=redownload_existing,
        subproduct_query=subproduct_query,
        target_url=url,
        limit=limit,
        max_failures=max_failures,
    )

    if summary.requested_urls == 0:
        console.print("No matching subproduct info URLs found.")
        raise typer.Exit(code=0)

    console.print("Subproduct page cache complete:")
    console.print(f"  Requested URLs: {summary.requested_urls}")
    console.print(f"  Processed URLs: {summary.processed_urls}")
    console.print(f"  Fetched live: {summary.fetched_pages}")
    console.print(f"  Reused cached: {summary.reused_pages}")
    console.print(f"  Failed: {summary.failed_pages}")
    if getattr(summary, "skipped_pages", 0):
        console.print(f"  Skipped by bad domain: {summary.skipped_pages}")
    if summary.failure_limit is not None:
        console.print(f"  Failure limit: {summary.failure_limit}")
    if getattr(summary, "elapsed_seconds", 0):
        console.print(f"  Elapsed: {format_hms(summary.elapsed_seconds)}")
    failure_breakdown = _format_count_breakdown(
        getattr(summary, "failure_breakdown", None)
    )
    if failure_breakdown:
        console.print(f"  Failure breakdown: {failure_breakdown}")
    if summary.aborted:
        console.print("  Status: Aborted after reaching the failure limit")
    console.print(f"  Manifest: {summary.manifest_path}")
    console.print(f"  Log: {resolved_log_file}")

    if summary.aborted:
        raise typer.Exit(code=1)


@app.command("extract-subproduct-metadata")
def extract_subproduct_metadata_command(
    config_path: Optional[Path] = typer.Option(
        None,
        "--config",
        help="Path to config.yaml (overrides HUMBLE_CONFIG_YAML).",
    ),
    cache_dir: Optional[Path] = typer.Option(
        None,
        "--cache-dir",
        help="Override the subproduct page cache directory.",
    ),
    output_file: Optional[Path] = typer.Option(
        None,
        "--output-file",
        help="Write extracted metadata to this path (defaults to <cache-dir>/metadata.json).",
    ),
    report_file: Optional[Path] = typer.Option(
        None,
        "--report-file",
        help="Also write a structured markdown analysis report to this path.",
        show_default=False,
    ),
) -> None:
    """Extract structured metadata from cached external subproduct pages."""

    if isinstance(config_path, OptionInfo):
        config_path = None
    if isinstance(cache_dir, OptionInfo):
        cache_dir = None
    if isinstance(output_file, OptionInfo):
        output_file = None
    if isinstance(report_file, OptionInfo):
        report_file = None

    logging_config = load_logging_config(config_path)
    setup_logging(logging_config.level, logging_config.format)

    page_cache_config = load_subproduct_page_cache_config(config_path)
    if cache_dir is not None:
        page_cache_config.base_dir = cache_dir.expanduser().resolve()

    logger.info(
        "Starting subproduct metadata extraction from %s",
        page_cache_config.base_dir,
    )

    summary = build_subproduct_page_metadata(
        page_cache_config.base_dir,
        output_path=output_file,
    )

    report_path: Path | None = None
    if report_file is not None:
        logger.info("Generating markdown analysis report for extracted metadata")
        report_path = build_subproduct_metadata_analysis_report(
            page_cache_config.base_dir,
            metadata_file=summary.output_path,
            output_path=report_file,
        )

    console.print("Subproduct metadata extraction complete:")
    console.print(f"  Processed entries: {summary.processed_entries}")
    console.print(f"  Extracted from HTML: {summary.extracted_entries}")
    console.print(f"  Fallback-only entries: {summary.fallback_only_entries}")
    if summary.html_read_failures:
        console.print(f"  HTML read failures: {summary.html_read_failures}")
    console.print(f"  Elapsed: {format_hms(summary.elapsed_seconds)}")
    console.print(f"  Output: {summary.output_path}")
    if report_path is not None:
        console.print(f"  Markdown report: {report_path}")


@app.command("analyze-current-bundles")
def analyze_current_bundles_command(
    config_path: Optional[Path] = typer.Option(
        None,
        "--config",
        help="Path to config.yaml (overrides HUMBLE_CONFIG_YAML).",
    ),
    output_dir: Optional[Path] = typer.Option(
        None,
        "--output-dir",
        help="Override the current bundle artifact output directory.",
        show_default=False,
    ),
    library_file: Optional[Path] = typer.Option(
        None,
        "--library-file",
        help="Path to library_products.json used for overlap analysis.",
        show_default=False,
    ),
    bundle_types: Optional[list[str]] = typer.Option(
        None,
        "--bundle-type",
        "-b",
        help="Analyze one or more bundle categories (games, books, software).",
        show_default=False,
    ),
    timeout_seconds: Optional[int] = typer.Option(
        None,
        "--timeout-seconds",
        help="Override the current bundle request timeout in seconds.",
        show_default=False,
    ),
) -> None:
    """Capture current Humble bundle pages and build overlap analysis artifacts."""

    if isinstance(config_path, OptionInfo):
        config_path = None
    if isinstance(output_dir, OptionInfo):
        output_dir = None
    if isinstance(library_file, OptionInfo):
        library_file = None
    if isinstance(bundle_types, OptionInfo):
        bundle_types = None
    if isinstance(timeout_seconds, OptionInfo):
        timeout_seconds = None

    if timeout_seconds is not None and timeout_seconds < 1:
        raise typer.BadParameter("--timeout-seconds must be at least 1.")

    logging_config = load_logging_config(config_path)
    setup_logging(logging_config.level, logging_config.format)

    current_bundles_config = load_current_bundles_config(config_path)
    resolved_output_dir = (
        (output_dir or current_bundles_config.base_dir).expanduser().resolve()
    )
    resolved_library_file = _resolve_current_bundle_analysis_library_file(
        config_path=config_path,
        library_file=library_file,
    )
    if not resolved_library_file.exists():
        typer.echo(f"Library file not found: {resolved_library_file}")
        raise typer.Exit(code=1)

    selected_bundle_types = normalize_bundle_types(
        bundle_types
        if bundle_types is not None
        else current_bundles_config.bundle_types
    )

    try:
        artifacts = capture_and_report_current_bundles(
            output_dir=resolved_output_dir,
            library_path=resolved_library_file,
            bundle_types=selected_bundle_types,
            timeout_seconds=timeout_seconds or current_bundles_config.timeout_seconds,
        )
    except FileNotFoundError as exc:
        typer.echo(str(exc))
        raise typer.Exit(code=1) from exc
    except ValueError as exc:
        typer.echo(str(exc))
        raise typer.Exit(code=1) from exc
    except OSError as exc:
        typer.echo(f"Current bundle analysis failed: {exc}")
        raise typer.Exit(code=1) from exc

    console.print("Current bundle analysis complete:")
    console.print(f"  Bundle types: {', '.join(artifacts.bundle_types)}")
    console.print(f"  Library: {resolved_library_file}")
    console.print(f"  Output dir: {artifacts.output_dir}")
    console.print(f"  Catalog: {artifacts.catalog_json_path}")
    console.print(f"  Report JSON: {artifacts.report_json_path}")
    console.print(f"  Report Markdown: {artifacts.report_markdown_path}")
    console.print(f"  Bundles analyzed: {artifacts.bundle_count}")


@app.command("analyze-current-choice")
def analyze_current_choice_command(
    config_path: Optional[Path] = typer.Option(
        None,
        "--config",
        help="Path to config.yaml (overrides HUMBLE_CONFIG_YAML).",
    ),
    output_dir: Optional[Path] = typer.Option(
        None,
        "--output-dir",
        help="Override the current Choice artifact output directory.",
        show_default=False,
    ),
    library_file: Optional[Path] = typer.Option(
        None,
        "--library-file",
        help="Path to library_products.json used for overlap analysis.",
        show_default=False,
    ),
    timeout_seconds: Optional[int] = typer.Option(
        None,
        "--timeout-seconds",
        help="Override the current Choice request timeout in seconds.",
        show_default=False,
    ),
) -> None:
    """Capture the current Humble Choice page and build overlap analysis artifacts."""

    if isinstance(config_path, OptionInfo):
        config_path = None
    if isinstance(output_dir, OptionInfo):
        output_dir = None
    if isinstance(library_file, OptionInfo):
        library_file = None
    if isinstance(timeout_seconds, OptionInfo):
        timeout_seconds = None

    if timeout_seconds is not None and timeout_seconds < 1:
        raise typer.BadParameter("--timeout-seconds must be at least 1.")

    logging_config = load_logging_config(config_path)
    setup_logging(logging_config.level, logging_config.format)

    current_choice_config = load_current_choice_config(config_path)
    resolved_output_dir = (
        (output_dir or current_choice_config.base_dir).expanduser().resolve()
    )
    resolved_library_file = _resolve_current_choice_analysis_library_file(
        config_path=config_path,
        library_file=library_file,
    )
    if not resolved_library_file.exists():
        typer.echo(f"Library file not found: {resolved_library_file}")
        raise typer.Exit(code=1)

    try:
        artifacts = capture_and_report_current_choice(
            output_dir=resolved_output_dir,
            library_path=resolved_library_file,
            timeout_seconds=timeout_seconds or current_choice_config.timeout_seconds,
        )
    except FileNotFoundError as exc:
        typer.echo(str(exc))
        raise typer.Exit(code=1) from exc
    except ValueError as exc:
        typer.echo(str(exc))
        raise typer.Exit(code=1) from exc
    except OSError as exc:
        typer.echo(f"Current Choice analysis failed: {exc}")
        raise typer.Exit(code=1) from exc

    console.print("Current Choice analysis complete:")
    console.print(f"  Month: {artifacts.month_label}")
    console.print(f"  Library: {resolved_library_file}")
    console.print(f"  Output dir: {artifacts.output_dir}")
    console.print(f"  Page HTML: {artifacts.page_html_path}")
    console.print(f"  Snapshot JSON: {artifacts.snapshot_json_path}")
    console.print(f"  Report JSON: {artifacts.report_json_path}")
    console.print(f"  Report Markdown: {artifacts.report_markdown_path}")
    console.print(f"  Games analyzed: {artifacts.game_count}")


if __name__ == "__main__":
    sys.exit(main())
