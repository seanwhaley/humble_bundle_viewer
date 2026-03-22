"""Generate deterministic documentation screenshots for the viewer UI.

This script captures documentation-safe screenshots from the running frontend
while mocking `/api/*` responses with committed fixture files and applying
targeted static-value overrides to selected UI fields.

Run it after starting the frontend dev server, for example with:

    python tools/start_dev.py
    python tools/scripts/capture_documentation_screenshots.py

Use ``--check`` to regenerate into a temporary directory and fail when the
committed PNG assets differ from what the current code would render.
"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from playwright.sync_api import BrowserContext, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LIBRARY = ROOT / "docs" / "assets" / "screenshots" / "library.json"
INJECTED_SCREENSHOT_CSS = """
* {
  scrollbar-width: none !important;
}

*::-webkit-scrollbar {
  display: none !important;
}

body {
  background: #020617 !important;
}
"""


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_relative_path(base_dir: Path, value: str) -> Path:
    return (base_dir / value).resolve()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture README/docs-safe viewer screenshots from a manifest.",
    )
    parser.add_argument(
        "--library",
        type=Path,
        default=DEFAULT_LIBRARY,
        help="Path to the screenshot manifest JSON.",
    )
    parser.add_argument(
        "--page",
        dest="pages",
        action="append",
        default=[],
        help="Capture only the named page ID from the manifest. Repeat as needed.",
    )
    parser.add_argument(
        "--base-url",
        default=None,
        help="Override the manifest base_url for the running frontend.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Render into a temporary directory and fail if outputs differ from committed PNGs.",
    )
    return parser.parse_args()


def build_fixture_map(page_spec: dict[str, Any], manifest_dir: Path) -> dict[str, str]:
    fixtures: dict[str, str] = {}
    for api_path, relative_fixture_path in page_spec.get("fixtures", {}).items():
        fixture_path = resolve_relative_path(manifest_dir, relative_fixture_path)
        fixtures[api_path] = fixture_path.read_text(encoding="utf-8")
    return fixtures


def wait_for_target(page: Page, wait_for: dict[str, str] | None) -> None:
    if not wait_for:
        page.wait_for_load_state("networkidle")
        return

    if text := wait_for.get("text"):
        page.get_by_text(text, exact=False).first.wait_for(timeout=10_000)
    elif selector := wait_for.get("selector"):
        page.locator(selector).first.wait_for(timeout=10_000)

    page.wait_for_load_state("networkidle")


def apply_overrides(page: Page, overrides: dict[str, str]) -> list[str]:
    if not overrides:
        return []

    return page.evaluate(
        """
        (entries) => {
          const missing = [];
          for (const [key, value] of Object.entries(entries)) {
            const element = document.querySelector(`[data-doc-id="${key}"]`);
            if (!element) {
              missing.push(key);
              continue;
            }

            if (
              element instanceof HTMLInputElement ||
              element instanceof HTMLTextAreaElement ||
              element instanceof HTMLSelectElement
            ) {
              element.value = value;
              element.setAttribute("value", value);
            } else {
              element.textContent = value;
            }
          }
          return missing;
        }
        """,
        overrides,
    )


def capture_page(
    context: BrowserContext,
    *,
    base_url: str,
    manifest_dir: Path,
    output_root: Path,
    page_spec: dict[str, Any],
) -> Path:
    fixtures = build_fixture_map(page_spec, manifest_dir)
    unknown_api_paths: list[str] = []
    page = context.new_page()
    viewport = page_spec.get("viewport", {})
    page.set_viewport_size(
        {
            "width": int(viewport.get("width", 1600)),
            "height": int(viewport.get("height", 900)),
        }
    )

    def handle_route(route, request) -> None:
        request_path = urlparse(request.url).path
        if request_path in fixtures:
            route.fulfill(
                status=200,
                content_type="application/json",
                body=fixtures[request_path],
            )
            return
        if request_path.startswith("/api/"):
            unknown_api_paths.append(request_path)
            route.fulfill(
                status=500,
                content_type="application/json",
                body=json.dumps(
                    {"detail": f"No screenshot fixture for {request_path}"}
                ),
            )
            return
        route.continue_()

    page.route("**/*", handle_route)
    page.goto(urljoin(base_url.rstrip("/") + "/", page_spec["route"].lstrip("/")))
    page.add_style_tag(content=INJECTED_SCREENSHOT_CSS)
    wait_for_target(page, page_spec.get("wait_for"))
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    missing_overrides = apply_overrides(page, page_spec.get("overrides", {}))
    if missing_overrides:
        raise RuntimeError(
            f"Missing screenshot override targets for page {page_spec['id']}: {', '.join(missing_overrides)}"
        )
    if unknown_api_paths:
        unique_paths = ", ".join(sorted(set(unknown_api_paths)))
        raise RuntimeError(
            f"Unexpected API requests while capturing {page_spec['id']}: {unique_paths}"
        )

    output_path = output_root / page_spec["output"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output_path), animations="disabled")
    page.close()
    return output_path


def run_capture(args: argparse.Namespace) -> int:
    manifest_path = args.library.resolve()
    if not manifest_path.exists():
        print(f"Screenshot manifest not found: {manifest_path}")
        return 1

    manifest = load_json(manifest_path)
    manifest_dir = manifest_path.parent
    base_url = args.base_url or manifest.get("base_url")
    if not base_url:
        print(
            "The screenshot manifest must define base_url or you must pass --base-url."
        )
        return 1

    all_pages = manifest.get("pages", [])
    selected_pages = [
        page_spec
        for page_spec in all_pages
        if not args.pages or page_spec.get("id") in set(args.pages)
    ]
    if not selected_pages:
        print("No screenshot pages matched the requested selection.")
        return 1

    missing_ids = sorted(
        set(args.pages) - {page_spec.get("id") for page_spec in selected_pages}
    )
    if missing_ids:
        print(f"Unknown screenshot page ids: {', '.join(missing_ids)}")
        return 1

    output_root = resolve_relative_path(manifest_dir, manifest.get("output_dir", "."))
    temp_dir: tempfile.TemporaryDirectory[str] | None = None
    if args.check:
        temp_dir = tempfile.TemporaryDirectory(prefix="hb-doc-screenshots-")
        output_root = Path(temp_dir.name)

    generated_outputs: list[tuple[dict[str, Any], Path]] = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            context = browser.new_context(color_scheme="dark")
            for page_spec in selected_pages:
                output_path = capture_page(
                    context,
                    base_url=base_url,
                    manifest_dir=manifest_dir,
                    output_root=output_root,
                    page_spec=page_spec,
                )
                generated_outputs.append((page_spec, output_path))
                print(f"Generated {page_spec['id']}: {output_path}")
            context.close()
            browser.close()

        if args.check:
            mismatches: list[str] = []
            for page_spec, generated_path in generated_outputs:
                committed_path = (
                    resolve_relative_path(manifest_dir, manifest.get("output_dir", "."))
                    / page_spec["output"]
                )
                if not committed_path.exists():
                    mismatches.append(f"Missing committed screenshot: {committed_path}")
                    continue
                if generated_path.read_bytes() != committed_path.read_bytes():
                    mismatches.append(
                        f"Out-of-date screenshot: {committed_path} (regenerate with capture_documentation_screenshots.py)"
                    )

            if mismatches:
                print("Screenshot check failed:")
                for mismatch in mismatches:
                    print(f" - {mismatch}")
                return 1

            print("Screenshot check passed.")
            return 0

        print("Documentation screenshots refreshed successfully.")
        return 0
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()


if __name__ == "__main__":
    raise SystemExit(run_capture(parse_args()))
