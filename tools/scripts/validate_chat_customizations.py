"""Validate repository chat customization files.

This script checks the repository's `.github` customization surfaces for a small
set of structural issues that are easy to regress:

- instruction files missing YAML frontmatter
- custom agent files missing YAML frontmatter or descriptions
- project skill directories missing `SKILL.md`
- skill frontmatter names that do not match their directory name
- skill README drift relative to actual skill directories
- prompt files with malformed frontmatter
- CODEOWNERS references that point at missing files or directories

The script is intentionally lightweight and uses only the Python standard
library so it can run in CI without extra dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import sys
from typing import Iterable, List


REPO_ROOT = Path(__file__).resolve().parents[2]
GITHUB_DIR = REPO_ROOT / ".github"
FRONTMATTER_PATTERN = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
NAME_PATTERN = re.compile(r"^[a-z0-9-]{1,64}$")


@dataclass
class ValidationIssue:
    path: Path
    message: str


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str] | None:
    text = read_text(path)
    match = FRONTMATTER_PATTERN.match(text)
    if not match:
        return None

    data: dict[str, str] = {}
    for raw_line in match.group(1).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip("\"'")

    return data, text[match.end() :]


def validate_instruction_files() -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for path in sorted((GITHUB_DIR / "instructions").rglob("*.instructions.md")):
        parsed = parse_frontmatter(path)
        if parsed is None:
            issues.append(ValidationIssue(path, "missing YAML frontmatter"))
            continue
        frontmatter, body = parsed
        if not frontmatter.get("description"):
            issues.append(
                ValidationIssue(path, "missing non-empty description in frontmatter")
            )
        if not body.strip():
            issues.append(ValidationIssue(path, "instruction body is empty"))
    return issues


def validate_prompt_files() -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    prompts_dir = GITHUB_DIR / "prompts"
    if not prompts_dir.exists():
        return issues

    for path in sorted(prompts_dir.rglob("*.prompt.md")):
        parsed = parse_frontmatter(path)
        if parsed is None:
            issues.append(
                ValidationIssue(path, "prompt file is missing YAML frontmatter")
            )
            continue
        frontmatter, body = parsed
        if not frontmatter.get("description"):
            issues.append(
                ValidationIssue(path, "prompt file should define a description")
            )
        if not body.strip():
            issues.append(ValidationIssue(path, "prompt body is empty"))
    return issues


def validate_agent_files() -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    agents_dir = GITHUB_DIR / "agents"
    if not agents_dir.exists():
        return issues

    for path in sorted(agents_dir.rglob("*.agent.md")):
        parsed = parse_frontmatter(path)
        if parsed is None:
            issues.append(
                ValidationIssue(path, "custom agent file is missing YAML frontmatter")
            )
            continue
        frontmatter, body = parsed
        if not frontmatter.get("description"):
            issues.append(
                ValidationIssue(path, "custom agent file should define a description")
            )
        if not body.strip():
            issues.append(ValidationIssue(path, "custom agent body is empty"))
    return issues


def validate_skill_files() -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    skills_dir = GITHUB_DIR / "skills"
    for entry in sorted(skills_dir.iterdir()):
        if entry.is_file():
            if entry.name != "README.md":
                issues.append(
                    ValidationIssue(
                        entry,
                        "flat skill files are not supported; move this skill to <name>/SKILL.md",
                    )
                )
            continue
        if entry.is_dir():
            skill_file = entry / "SKILL.md"
            if not skill_file.exists():
                issues.append(
                    ValidationIssue(entry, "skill directory is missing SKILL.md")
                )
                continue

            parsed = parse_frontmatter(skill_file)
            if parsed is None:
                issues.append(
                    ValidationIssue(skill_file, "SKILL.md is missing YAML frontmatter")
                )
                continue

            frontmatter, body = parsed
            skill_name = frontmatter.get("name", "")
            if skill_name != entry.name:
                issues.append(
                    ValidationIssue(
                        skill_file,
                        f"skill name '{skill_name}' must match directory '{entry.name}'",
                    )
                )
            if not NAME_PATTERN.fullmatch(skill_name):
                issues.append(
                    ValidationIssue(
                        skill_file,
                        "skill name must be lowercase letters, numbers, or hyphens",
                    )
                )
            if not frontmatter.get("description"):
                issues.append(
                    ValidationIssue(skill_file, "skill description is missing or empty")
                )
            if not body.strip():
                issues.append(ValidationIssue(skill_file, "skill body is empty"))
    return issues


def validate_skills_readme() -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    skills_dir = GITHUB_DIR / "skills"
    readme_path = skills_dir / "README.md"
    if not readme_path.exists():
        issues.append(ValidationIssue(readme_path, "skills README is missing"))
        return issues

    readme_text = read_text(readme_path)
    skill_dirs = sorted(
        entry.name
        for entry in skills_dir.iterdir()
        if entry.is_dir() and (entry / "SKILL.md").exists()
    )

    for skill_name in skill_dirs:
        marker = f"({skill_name}/SKILL.md)"
        if marker not in readme_text:
            issues.append(
                ValidationIssue(
                    readme_path,
                    f"skills README is missing an entry for '{skill_name}'",
                )
            )

    for relative_target in re.findall(r"\(([^)]+/SKILL\.md)\)", readme_text):
        target = skills_dir / relative_target
        if not target.exists():
            issues.append(
                ValidationIssue(
                    readme_path,
                    f"skills README references a missing skill file: {relative_target}",
                )
            )

    return issues


def iter_codeowners_paths(lines: Iterable[str]) -> Iterable[str]:
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = stripped.split()
        if not parts:
            continue
        path_candidate = parts[0]
        if path_candidate.startswith("@"):
            continue
        yield path_candidate


def validate_codeowners() -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    path = GITHUB_DIR / "CODEOWNERS"
    if not path.exists():
        issues.append(ValidationIssue(path, "CODEOWNERS file is missing"))
        return issues

    for raw_pattern in iter_codeowners_paths(read_text(path).splitlines()):
        if any(char in raw_pattern for char in "*?["):
            continue
        normalized = raw_pattern.lstrip("/")
        target = REPO_ROOT / normalized
        if not target.exists():
            issues.append(
                ValidationIssue(path, f"CODEOWNERS path does not exist: {raw_pattern}")
            )
    return issues


def main() -> int:
    issues: List[ValidationIssue] = []
    issues.extend(validate_instruction_files())
    issues.extend(validate_prompt_files())
    issues.extend(validate_agent_files())
    issues.extend(validate_skill_files())
    issues.extend(validate_skills_readme())
    issues.extend(validate_codeowners())

    if issues:
        print("Customization validation failed:\n")
        for issue in issues:
            relative = issue.path.relative_to(REPO_ROOT)
            print(f"- {relative}: {issue.message}")
        return 1

    print("Customization validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
