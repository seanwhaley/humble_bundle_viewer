"""Canonical download labeling for the viewer portal.

This module owns the user-facing label policy for download links. The mapping
data lives in packaged JSON so policy can be documented and reviewed without
duplicating label heuristics across the backend and frontend.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from importlib.resources import files

from pydantic import BaseModel, Field

from .parsing import Download

_POLICY_PACKAGE = "hb_library_viewer.data"
_POLICY_FILE = "download_label_policy.json"
_UPPERCASE_TOKEN_RE = re.compile(r"^[a-z0-9.+_-]{1,8}$")


class SoftwareNameOverride(BaseModel):
    """Policy override for software-specific display derivation."""

    content_suffix: str | None = None
    package_label: str | None = None


class DownloadLabelPolicy(BaseModel):
    """Validated JSON policy for viewer download labels."""

    version: int = Field(..., ge=1)
    platform_families: dict[str, str] = Field(default_factory=dict)
    platform_labels: dict[str, str] = Field(default_factory=dict)
    file_type_labels: dict[str, str] = Field(default_factory=dict)
    name_labels: dict[str, str] = Field(default_factory=dict)
    software_name_overrides: dict[str, SoftwareNameOverride] = Field(
        default_factory=dict
    )
    generic_name_tokens: list[str] = Field(default_factory=list)
    generic_package_tokens: list[str] = Field(default_factory=list)


class DerivedDownloadLabels(BaseModel):
    """Derived label fields attached to a viewer download."""

    display_category: str
    content_label: str
    package_label: str | None = None
    display_label: str
    display_detail: str | None = None


def _normalize_key(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _title_case(value: str) -> str:
    return " ".join(
        part[:1].upper() + part[1:] for part in re.split(r"[\s_-]+", value) if part
    )


def _fallback_label(value: str | None) -> str | None:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    if not cleaned:
        return None
    if cleaned.startswith(".") and len(cleaned) > 1:
        return cleaned[1:].upper()
    if _UPPERCASE_TOKEN_RE.fullmatch(cleaned):
        return cleaned.upper()
    return _title_case(cleaned)


def _dedupe_parts(parts: list[str | None]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if not part:
            continue
        key = _normalize_key(part)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(part)
    return ordered


@lru_cache(maxsize=1)
def load_download_label_policy() -> DownloadLabelPolicy:
    """Load and validate the packaged download labeling policy."""

    policy_text = (
        files(_POLICY_PACKAGE).joinpath(_POLICY_FILE).read_text(encoding="utf-8")
    )
    return DownloadLabelPolicy.model_validate(json.loads(policy_text))


def _family_for_platform(policy: DownloadLabelPolicy, platform: str | None) -> str:
    return policy.platform_families.get(_normalize_key(platform), "generic")


def _platform_label(policy: DownloadLabelPolicy, platform: str | None) -> str:
    normalized = _normalize_key(platform)
    if normalized in policy.platform_labels:
        return policy.platform_labels[normalized]
    fallback = _fallback_label(normalized)
    return fallback or "Download"


def _lookup_name_label(policy: DownloadLabelPolicy, name: str | None) -> str | None:
    normalized = _normalize_key(name)
    if not normalized:
        return None
    if normalized in policy.name_labels:
        return policy.name_labels[normalized]
    return _fallback_label(name)


def _lookup_file_type_label(
    policy: DownloadLabelPolicy, file_type: str | None
) -> str | None:
    normalized = _normalize_key(file_type)
    if not normalized:
        return None
    if normalized in policy.file_type_labels:
        return policy.file_type_labels[normalized]
    return _fallback_label(file_type)


@lru_cache(maxsize=None)
def _generic_name_tokens(values: tuple[str, ...]) -> frozenset[str]:
    return frozenset(_normalize_key(value) for value in values if _normalize_key(value))


def _is_generic_name(policy: DownloadLabelPolicy, name: str | None) -> bool:
    normalized = _normalize_key(name)
    if not normalized:
        return True
    words = set(normalized.replace("/", " ").replace("-", " ").split())
    tokens = _generic_name_tokens(tuple(policy.generic_name_tokens))
    return normalized in tokens or bool(words & tokens)


def _meaningful_name_label(policy: DownloadLabelPolicy, name: str | None) -> str | None:
    label = _lookup_name_label(policy, name)
    if not label:
        return None
    if _is_generic_name(policy, name):
        return None
    if _normalize_key(label) == "download":
        return None
    return label


def _meaningful_package_label(label: str | None) -> str | None:
    if not label or _normalize_key(label) == "download":
        return None
    return label


def derive_download_labels(download: Download) -> DerivedDownloadLabels:
    """Derive viewer-facing labels for one download entry."""

    policy = load_download_label_policy()
    family = _family_for_platform(policy, download.platform)
    platform_label = _platform_label(policy, download.platform)
    file_type_label = _lookup_file_type_label(policy, download.file_type)
    meaningful_name = _meaningful_name_label(policy, download.name)
    meaningful_file_type = _meaningful_package_label(file_type_label)

    if family in {"ebook", "audiobook", "video"}:
        content_label = meaningful_name or meaningful_file_type or platform_label
        package_label = (
            meaningful_file_type
            if meaningful_file_type
            and _normalize_key(meaningful_file_type) != _normalize_key(content_label)
            else None
        )
        display_label = content_label
    elif family == "software":
        override = policy.software_name_overrides.get(_normalize_key(download.name))
        content_parts = [platform_label]
        if override and override.content_suffix:
            content_parts.append(override.content_suffix)
        content_label = " ".join(content_parts).strip() or platform_label
        package_label = _meaningful_package_label(
            (override.package_label if override else None)
            or meaningful_file_type
            or meaningful_name
        )
        if package_label and _normalize_key(package_label) == _normalize_key(
            content_label
        ):
            package_label = None
        display_label = (
            f"{content_label} {package_label}" if package_label else content_label
        )
    else:
        content_label = meaningful_name or meaningful_file_type or platform_label
        package_label = (
            meaningful_file_type
            if meaningful_file_type
            and _normalize_key(meaningful_file_type) != _normalize_key(content_label)
            else None
        )
        display_label = content_label

    return DerivedDownloadLabels(
        display_category=family,
        content_label=content_label or "Download",
        package_label=package_label,
        display_label=display_label or "Download",
        display_detail=package_label,
    )


def enrich_downloads_with_labels(downloads: list[Download]) -> None:
    """Mutate downloads in-place with canonical viewer-facing label fields."""

    policy = load_download_label_policy()
    derived_by_download: list[DerivedDownloadLabels] = [
        derive_download_labels(download) for download in downloads
    ]
    counts: dict[str, int] = {}
    for derived in derived_by_download:
        counts[derived.display_label] = counts.get(derived.display_label, 0) + 1

    seen_labels: dict[str, int] = {}
    seen_final_labels: dict[str, int] = {}
    for download, derived in zip(downloads, derived_by_download):
        base_display_label = derived.display_label
        display_label = base_display_label
        seen_labels[base_display_label] = seen_labels.get(base_display_label, 0) + 1

        if counts[base_display_label] > 1:
            disambiguators = _dedupe_parts(
                [
                    derived.package_label,
                    _lookup_name_label(policy, download.name),
                    _platform_label(policy, download.platform),
                ]
            )
            disambiguators = [
                value
                for value in disambiguators
                if _normalize_key(value) != _normalize_key(base_display_label)
            ]

            if disambiguators:
                display_label = f"{base_display_label} ({', '.join(disambiguators)})"
            else:
                display_label = (
                    f"{base_display_label} #{seen_labels[base_display_label]}"
                )

        seen_final_labels[display_label] = seen_final_labels.get(display_label, 0) + 1
        if seen_final_labels[display_label] > 1:
            display_label = f"{display_label} #{seen_final_labels[display_label]}"

        download.display_category = derived.display_category
        download.content_label = derived.content_label
        download.package_label = derived.package_label
        download.display_detail = derived.display_detail
        download.display_label = display_label
