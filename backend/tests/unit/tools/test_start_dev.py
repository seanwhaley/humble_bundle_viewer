"""Unit tests for the local viewer startup helper script."""

from __future__ import annotations

import importlib.util
import socket
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[4]
START_DEV_PATH = ROOT / "tools" / "start_dev.py"


def load_start_dev_module() -> ModuleType:
    """Load the standalone tools/start_dev.py module for testing."""

    module_name = "testable_start_dev"
    spec = importlib.util.spec_from_file_location(module_name, START_DEV_PATH)
    assert spec is not None
    assert spec.loader is not None

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.unit
class TestStartDev:
    """Verify the viewer startup helper builds robust process commands."""

    def test_build_frontend_command_uses_local_vite_entrypoint(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        module = load_start_dev_module()
        frontend_dir = tmp_path / "frontend"
        vite_entrypoint = frontend_dir / "node_modules" / "vite" / "bin" / "vite.js"
        vite_entrypoint.parent.mkdir(parents=True)
        vite_entrypoint.write_text("console.log('vite');", encoding="utf-8")

        monkeypatch.setattr(module, "resolve_node", lambda: "node")
        monkeypatch.setattr(module, "resolve_npm", lambda: "npm.cmd")

        command = module.build_frontend_command(
            host="127.0.0.1",
            port=4173,
            frontend_dir=frontend_dir,
        )

        assert command == [
            "node",
            str(vite_entrypoint),
            "--host",
            "127.0.0.1",
            "--port",
            "4173",
        ]

    def test_build_frontend_command_falls_back_to_npm_when_vite_missing(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        module = load_start_dev_module()
        frontend_dir = tmp_path / "frontend"
        frontend_dir.mkdir(parents=True)

        monkeypatch.setattr(module, "resolve_node", lambda: None)
        monkeypatch.setattr(module, "resolve_npm", lambda: "npm.cmd")

        command = module.build_frontend_command(
            host="127.0.0.1",
            port=5173,
            frontend_dir=frontend_dir,
        )

        assert command == [
            "npm.cmd",
            "run",
            "dev",
            "--",
            "--host",
            "127.0.0.1",
            "--port",
            "5173",
        ]

    def test_parse_windows_netstat_listening_pids_filters_exact_port(self) -> None:
        module = load_start_dev_module()
        output = """
  Proto  Local Address          Foreign Address        State           PID
  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       4242
  TCP    127.0.0.1:8000         0.0.0.0:0              LISTENING       5252
  TCP    127.0.0.1:51730        0.0.0.0:0              LISTENING       6262
  TCP    [::1]:5173             [::]:0                 LISTENING       7272
        """

        assert module.parse_windows_netstat_listening_pids(output, 5173) == {4242, 7272}

    def test_wait_for_port_detects_listener(self) -> None:
        module = load_start_dev_module()
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            sock.listen(1)
            port = sock.getsockname()[1]

            assert module.wait_for_port(
                "127.0.0.1",
                port,
                timeout_seconds=1.0,
            )

    def test_stop_existing_listeners_terminates_found_pids(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        module = load_start_dev_module()
        terminated: list[int] = []

        monkeypatch.setattr(module, "list_listening_pids", lambda port: {111, 222})
        monkeypatch.setattr(module, "terminate_pid_tree", terminated.append)
        monkeypatch.setattr(
            module, "wait_for_port", lambda host, port, timeout_seconds: False
        )

        module.stop_existing_listeners(5173, service_name="frontend")

        assert terminated == [111, 222]
