"""Unit tests for viewer download label derivation."""

from __future__ import annotations

import pytest

from hb_library_viewer.download_labels import (
    _dedupe_parts,
    _fallback_label,
    derive_download_labels,
    enrich_downloads_with_labels,
    load_download_label_policy,
)
from hb_library_viewer.parsing import Download


@pytest.mark.unit
class TestDownloadLabels:
    """Verify canonical viewer-facing label derivation."""

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("", None),
            (".pdf", "PDF"),
            ("mp3", "MP3"),
            ("bonus content", "Bonus Content"),
        ],
    )
    def test_fallback_label_handles_empty_extension_token_and_phrase(
        self, value: str, expected: str | None
    ) -> None:
        assert _fallback_label(value) == expected

    def test_dedupe_parts_skips_empty_values_and_collapses_case_variants(self) -> None:
        assert _dedupe_parts(["ZIP", None, "Audio", "zip", "", "Audio"]) == [
            "ZIP",
            "Audio",
        ]

    def test_load_download_label_policy_reads_packaged_json(self) -> None:
        policy = load_download_label_policy()

        assert policy.version == 1
        assert policy.platform_families["audio"] == "audiobook"
        assert policy.file_type_labels["epub"] == "EPUB"

    def test_derive_download_labels_for_audio_uses_content_name(self) -> None:
        labels = derive_download_labels(
            Download(
                platform="audio",
                name="MP3",
                url="https://example.com/book-mp3.zip",
                size_bytes=10,
                checksums={},
                file_type="zip",
            )
        )

        assert labels.display_category == "audiobook"
        assert labels.content_label == "MP3"
        assert labels.package_label == "ZIP"
        assert labels.display_label == "MP3"

    def test_derive_download_labels_for_ebook_prefers_file_type_when_name_is_generic(
        self,
    ) -> None:
        labels = derive_download_labels(
            Download(
                platform="ebook",
                name="Download",
                url="https://example.com/book.pdf",
                size_bytes=10,
                checksums={},
                file_type="pdf",
            )
        )

        assert labels.display_category == "ebook"
        assert labels.content_label == "PDF"
        assert labels.package_label is None
        assert labels.display_label == "PDF"

    def test_derive_download_labels_for_software_combines_platform_and_package(
        self,
    ) -> None:
        labels = derive_download_labels(
            Download(
                platform="windows",
                name="Download",
                url="https://example.com/setup.exe",
                size_bytes=10,
                checksums={},
                file_type="exe",
            )
        )

        assert labels.display_category == "software"
        assert labels.content_label == "Windows"
        assert labels.package_label == "EXE"
        assert labels.display_label == "Windows EXE"

    def test_derive_download_labels_for_linux_deb_preserves_bitness(self) -> None:
        labels = derive_download_labels(
            Download(
                platform="linux",
                name="64-bit .deb",
                url="https://example.com/linux.deb",
                size_bytes=10,
                checksums={},
                file_type="deb",
            )
        )

        assert labels.content_label == "Linux 64-bit"
        assert labels.package_label == "DEB"
        assert labels.display_label == "Linux 64-bit DEB"

    def test_derive_download_labels_for_generic_platform_uses_name_and_package(
        self,
    ) -> None:
        labels = derive_download_labels(
            Download(
                platform="browser",
                name="bonus content",
                url="https://example.com/bonus.zip",
                size_bytes=10,
                checksums={},
                file_type="zip",
            )
        )

        assert labels.display_category == "generic"
        assert labels.content_label == "Bonus Content"
        assert labels.package_label == "ZIP"
        assert labels.display_label == "Bonus Content"

    def test_enrich_downloads_with_labels_disambiguates_duplicate_media_labels(
        self,
    ) -> None:
        downloads = [
            Download(
                platform="audio",
                name="MP3",
                url="https://example.com/book-one.mp3.zip",
                size_bytes=10,
                checksums={},
                file_type="zip",
            ),
            Download(
                platform="audio",
                name="MP3",
                url="https://example.com/book-two.mp3.zip",
                size_bytes=10,
                checksums={},
                file_type="zip",
            ),
        ]

        enrich_downloads_with_labels(downloads)

        assert downloads[0].display_label == "MP3 (ZIP, Audio)"
        assert downloads[1].display_label == "MP3 (ZIP, Audio) #2"
