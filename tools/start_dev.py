from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from types import FrameType
from typing import Sequence

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"

DEFAULT_HOST = "127.0.0.1"
BACKEND_PORT = 8000
FRONTEND_PORT = 5173
STARTUP_TIMEOUT_SECONDS = 20.0
POLL_INTERVAL_SECONDS = 0.2
SHUTDOWN_TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class ServiceSpec:
    """Configuration for a managed dev service process."""

    name: str
    command: list[str]
    cwd: Path
    host: str
    port: int


def run_process(command: Sequence[str], cwd: Path) -> subprocess.Popen[str]:
    """Launch a child process in its own group so shutdown can clean up descendants."""

    kwargs: dict[str, object] = {
        "cwd": str(cwd),
        "env": os.environ.copy(),
        "text": True,
    }
    if os.name == "nt":
        kwargs["creationflags"] = getattr(
            subprocess,
            "CREATE_NEW_PROCESS_GROUP",
            0,
        )
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(list(command), **kwargs)


def resolve_node() -> str | None:
    """Resolve a Node.js executable from PATH."""

    candidates = ["node", "node.exe"] if os.name == "nt" else ["node"]
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def resolve_npm() -> str | None:
    """Resolve npm from PATH for environments without a direct Vite launch path."""

    candidates = ["npm", "npm.cmd", "npm.exe"] if os.name == "nt" else ["npm"]
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def frontend_vite_entrypoint(frontend_dir: Path = FRONTEND_DIR) -> Path:
    """Return the local Vite entrypoint used for a direct Node launch."""

    return frontend_dir / "node_modules" / "vite" / "bin" / "vite.js"


def build_backend_command(
    python_executable: str,
    *,
    host: str = DEFAULT_HOST,
    port: int = BACKEND_PORT,
) -> list[str]:
    """Build the uvicorn command for the viewer backend."""

    return [
        python_executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--reload",
        "--host",
        host,
        "--port",
        str(port),
    ]


def build_frontend_command(
    *,
    host: str = DEFAULT_HOST,
    port: int = FRONTEND_PORT,
    frontend_dir: Path = FRONTEND_DIR,
) -> list[str] | None:
    """Build a robust frontend command that works in the current IDE shell."""

    node_executable = resolve_node()
    vite_entrypoint = frontend_vite_entrypoint(frontend_dir)
    if node_executable and vite_entrypoint.exists():
        return [
            node_executable,
            str(vite_entrypoint),
            "--host",
            host,
            "--port",
            str(port),
        ]

    npm_executable = resolve_npm()
    if npm_executable:
        return [
            npm_executable,
            "run",
            "dev",
            "--",
            "--host",
            host,
            "--port",
            str(port),
        ]

    return None


def parse_windows_netstat_listening_pids(output: str, port: int) -> set[int]:
    """Extract TCP listener PIDs for a local port from `netstat -ano -p tcp` output."""

    port_token = f":{port}"
    pids: set[int] = set()
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line.startswith("TCP"):
            continue
        parts = line.split()
        if len(parts) < 5:
            continue
        local_address = parts[1]
        state = parts[3].upper()
        pid_text = parts[4]
        if state != "LISTENING" or not local_address.endswith(port_token):
            continue
        try:
            pids.add(int(pid_text))
        except ValueError:
            continue
    return pids


def list_listening_pids(port: int) -> set[int]:
    """Return PIDs listening on a TCP port using OS-native tooling."""

    if os.name == "nt":
        result = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            check=False,
        )
        return parse_windows_netstat_listening_pids(result.stdout, port)

    lsof_executable = shutil.which("lsof")
    if not lsof_executable:
        return set()

    result = subprocess.run(
        [lsof_executable, "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        int(line.strip())
        for line in result.stdout.splitlines()
        if line.strip().isdigit()
    }


def terminate_pid_tree(pid: int) -> None:
    """Terminate a PID and its descendants."""

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            text=True,
            check=False,
        )
        return

    try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            return


def terminate_process_tree(process: subprocess.Popen[str]) -> None:
    """Terminate a started process and its descendants."""

    if process.poll() is not None:
        return
    terminate_pid_tree(process.pid)


def port_is_open(host: str, port: int) -> bool:
    """Return True when a TCP port accepts connections."""

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def wait_for_port(
    host: str,
    port: int,
    *,
    timeout_seconds: float,
) -> bool:
    """Wait until a TCP port is reachable or the timeout expires."""

    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if port_is_open(host, port):
            return True
        time.sleep(POLL_INTERVAL_SECONDS)
    return False


def stop_existing_listeners(port: int, *, service_name: str) -> None:
    """Terminate stale listeners on a dev port before starting a fresh service."""

    stale_pids = list_listening_pids(port)
    if not stale_pids:
        return

    ordered_pids = sorted(stale_pids)

    pid_list = ", ".join(str(pid) for pid in ordered_pids)
    print(f"Stopping existing {service_name} listener(s) on port {port}: {pid_list}")
    for pid in ordered_pids:
        terminate_pid_tree(pid)

    if wait_for_port(DEFAULT_HOST, port, timeout_seconds=SHUTDOWN_TIMEOUT_SECONDS):
        raise RuntimeError(
            f"Port {port} is still in use after stopping the existing {service_name} listener(s)."
        )


def wait_for_services(
    services: Sequence[ServiceSpec],
    processes: dict[str, subprocess.Popen[str]],
    *,
    timeout_seconds: float,
) -> bool:
    """Wait until both backend and frontend are reachable or fail fast if one exits."""

    pending = {service.name for service in services}
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        for service in services:
            if service.name in pending and port_is_open(service.host, service.port):
                print(f"✓ {service.name} ready at http://{service.host}:{service.port}")
                pending.discard(service.name)

        if not pending:
            return True

        for service in services:
            process = processes[service.name]
            exit_code = process.poll()
            if exit_code is not None:
                print(
                    f"{service.name} exited before startup completed (exit code {exit_code})."
                )
                return False

        time.sleep(POLL_INTERVAL_SECONDS)

    waiting_on = ", ".join(sorted(pending))
    print(f"Timed out waiting for: {waiting_on}")
    return False


def shutdown_processes(
    processes: Sequence[subprocess.Popen[str]],
    *,
    reason: str,
) -> None:
    """Terminate all managed child processes."""

    print(f"Stopping dev servers ({reason})...")
    for process in processes:
        terminate_process_tree(process)


def main() -> int:
    if not BACKEND_DIR.exists() or not FRONTEND_DIR.exists():
        print("Expected backend and frontend folders under the repo root.")
        return 1

    frontend_command = build_frontend_command(host=DEFAULT_HOST, port=FRONTEND_PORT)
    if not frontend_command:
        print(
            "Could not resolve a frontend launch command. Install Node.js and run npm install in frontend/."
        )
        return 1

    services = [
        ServiceSpec(
            name="Backend",
            command=build_backend_command(
                sys.executable,
                host=DEFAULT_HOST,
                port=BACKEND_PORT,
            ),
            cwd=BACKEND_DIR,
            host=DEFAULT_HOST,
            port=BACKEND_PORT,
        ),
        ServiceSpec(
            name="Frontend",
            command=frontend_command,
            cwd=FRONTEND_DIR,
            host=DEFAULT_HOST,
            port=FRONTEND_PORT,
        ),
    ]

    try:
        for service in services:
            stop_existing_listeners(service.port, service_name=service.name.lower())
    except RuntimeError as exc:
        print(exc)
        return 1

    processes: dict[str, subprocess.Popen[str]] = {}
    try:
        for service in services:
            print(f"Starting {service.name.lower()}...")
            processes[service.name] = run_process(service.command, service.cwd)

        def shutdown(_signum: int, _frame: FrameType | None) -> None:
            shutdown_processes(processes.values(), reason="signal")
            raise SystemExit(0)

        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)

        if not wait_for_services(
            services,
            processes,
            timeout_seconds=STARTUP_TIMEOUT_SECONDS,
        ):
            shutdown_processes(processes.values(), reason="startup failure")
            return 1

        print("Viewer dev servers are ready:")
        print(f"  Backend:  http://{DEFAULT_HOST}:{BACKEND_PORT}")
        print(f"  Frontend: http://{DEFAULT_HOST}:{FRONTEND_PORT}")
        print("Press Ctrl+C to stop both services.")

        while True:
            for service in services:
                process = processes[service.name]
                exit_code = process.poll()
                if exit_code is None:
                    continue
                shutdown_processes(
                    [
                        other_process
                        for name, other_process in processes.items()
                        if name != service.name
                    ],
                    reason=f"{service.name.lower()} exited",
                )
                print(f"{service.name} exited with code {exit_code}.")
                return exit_code
            time.sleep(POLL_INTERVAL_SECONDS)

    except KeyboardInterrupt:
        shutdown_processes(processes.values(), reason="keyboard interrupt")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
