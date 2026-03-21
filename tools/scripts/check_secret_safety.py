"""Check the repository for committed secret-like values.

This script intentionally targets a narrow set of high-signal patterns so CI
can catch real credential leaks without flagging legitimate documentation or
symbol names such as ``HUMBLE_AUTH_COOKIE`` and ``_simpleauth_sess``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
TEXT_FILE_EXTENSIONS = {
    ".env",
    ".json",
    ".md",
    ".py",
    ".toml",
    ".txt",
    ".yaml",
    ".yml",
}
SAFE_PLACEHOLDER_TOKENS = {
    "<placeholder>",
    "changeme",
    "dummy",
    "example",
    "fake",
    "placeholder",
    "sample",
    "test",
    "test_token_for_testing",
    "test_token_for_validation",
}
ASSIGNMENT_PATTERNS = {
    "HUMBLE_AUTH_COOKIE assignment": re.compile(
        r"HUMBLE_AUTH_COOKIE\s*=\s*([^\r\n#]+)",
        re.IGNORECASE,
    ),
    "_simpleauth_sess cookie assignment": re.compile(
        r"_simpleauth_sess\s*[:=]\s*['\"]?([^'\"\s,;]+)",
        re.IGNORECASE,
    ),
}


@dataclass(slots=True)
class SafetyIssue:
    path: Path
    line_number: int
    message: str


def _iter_text_files(root: Path) -> list[Path]:
    try:
        completed = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=root,
            check=True,
            capture_output=True,
            text=False,
        )
        tracked_paths = [
            root / Path(path.decode("utf-8"))
            for path in completed.stdout.split(b"\x00")
            if path
        ]
    except (OSError, subprocess.CalledProcessError):
        tracked_paths = list(root.rglob("*"))

    files: list[Path] = []
    for path in tracked_paths:
        if not path.is_file():
            continue
        if any(
            part in {".git", ".venv", "node_modules", "site", "htmlcov", "tests"}
            for part in path.parts
        ):
            continue
        if path.suffix.lower() in TEXT_FILE_EXTENSIONS or path.name.startswith(".env"):
            files.append(path)
    return sorted(files)


def _normalize_value(raw_value: str) -> str:
    return raw_value.strip().strip("\"'")


def _looks_like_placeholder(value: str) -> bool:
    lowered = value.strip().lower()
    if not lowered:
        return True
    return any(token in lowered for token in SAFE_PLACEHOLDER_TOKENS)


def _check_env_file(path: Path) -> list[SafetyIssue]:
    if path.name == ".env.example":
        return []
    if path.name.startswith(".env"):
        return [
            SafetyIssue(
                path=path,
                line_number=1,
                message="committed .env-style file detected; keep local env files out of source control",
            )
        ]
    return []


def _check_assignments(path: Path) -> list[SafetyIssue]:
    if path.name == ".env.example":
        return []

    issues: list[SafetyIssue] = []
    text = path.read_text(encoding="utf-8", errors="ignore")
    for line_number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        for label, pattern in ASSIGNMENT_PATTERNS.items():
            match = pattern.search(line)
            if not match:
                continue
            value = _normalize_value(match.group(1))
            if len(value) < 10 or _looks_like_placeholder(value):
                continue
            issues.append(
                SafetyIssue(
                    path=path,
                    line_number=line_number,
                    message=f"{label} appears to contain a non-placeholder value",
                )
            )
    return issues


def main() -> int:
    issues: list[SafetyIssue] = []
    for path in _iter_text_files(REPO_ROOT):
        issues.extend(_check_env_file(path))
        issues.extend(_check_assignments(path))

    if issues:
        print("Secret safety check failed:\n")
        for issue in issues:
            relative = issue.path.relative_to(REPO_ROOT)
            print(f"- {relative}:{issue.line_number}: {issue.message}")
        return 1

    print("Secret safety check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())