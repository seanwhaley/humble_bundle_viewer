"""Unit test for module entry point."""

from __future__ import annotations

import importlib
import runpy
import sys

import pytest


@pytest.mark.unit
def test_module_entry_invokes_cli_main(monkeypatch):
    import hb_library_viewer.cli as cli

    monkeypatch.setattr(sys, "argv", ["hb_library_viewer"])

    monkeypatch.setattr(cli, "main", lambda **_kwargs: 0)

    with pytest.raises(SystemExit) as excinfo:
        runpy.run_module("hb_library_viewer.__main__", run_name="__main__")

    assert excinfo.value.code == 0


@pytest.mark.unit
def test_module_entry_rebuild_order_models(monkeypatch):
    import hb_library_viewer.cli as cli

    monkeypatch.setattr(
        sys, "argv", ["hb_library_viewer", "rebuild-order-models"]
    )
    monkeypatch.setattr(cli, "rebuild_order_models_from_artifacts", lambda **_kwargs: 0)

    with pytest.raises(SystemExit) as excinfo:
        runpy.run_module("hb_library_viewer.__main__", run_name="__main__")

    assert excinfo.value.code == 0


@pytest.mark.unit
def test_module_import_does_not_execute_app():
    module = importlib.import_module("hb_library_viewer.__main__")
    assert hasattr(module, "app")
