# Download Labeling Policy

This project derives viewer-facing download labels at load time instead of
storing them as source-of-truth values inside `library_products.json`.

The canonical policy lives in the backend package at:

- `backend/src/hb_library_viewer/data/download_label_policy.json`
- loaded by `backend/src/hb_library_viewer/download_labels.py`

## Goals

- show simple, human-friendly labels in the viewer
- keep media labels focused on the content users care about
- preserve package and installer details for software downloads
- keep backend and frontend behavior aligned through one canonical policy
- avoid saving derived display values into captured artifacts

## Derived fields returned by the backend

Each `Download` entry in the viewer payload can expose these derived fields:

- `display_category` — normalized family such as `ebook`, `audiobook`, `video`, `software`, or `generic`
- `content_label` — primary content label such as `EPUB`, `PDF`, `MP3`, `FLAC`, `MP4`, or `Linux 64-bit`
- `package_label` — normalized delivery/package label such as `ZIP`, `DEB`, `DMG`, `EXE`, or `Installer`
- `display_label` — the unique viewer-facing label used in buttons and filters
- `display_detail` — optional secondary detail, currently aligned with `package_label`

## How labels are derived

### eBooks, audiobooks, and videos

Media routes prioritize the semantic format users actually care about.

Examples:

- audiobook `name=MP3`, `file_type=zip` → `content_label=MP3`, `package_label=ZIP`, `display_label=MP3`
- ebook `name=Download`, `file_type=pdf` → `content_label=PDF`, `display_label=PDF`
- video `name=Download`, `file_type=mp4` → `content_label=MP4`, `display_label=MP4`

If a future link set contains two downloads that would otherwise render the same
media label, the backend disambiguates the `display_label` using package or
platform detail so the frontend still gets a unique selection value.

### Software downloads

Software labels keep the platform visible and include package/installer detail
when it matters.

Examples:

- Windows `Download` + `exe` → `display_label=Windows EXE`
- macOS `Download` + `dmg` → `display_label=macOS DMG`
- Linux `64-bit .deb` + `deb` → `display_label=Linux 64-bit DEB`
- Linux `Installer` + unknown extension → `display_label=Linux Installer`

## Storage and loading rules

- Do **not** write derived label fields back into `library_products.json` as the
  permanent source of truth.
- Do store the policy as committed JSON in the backend package so it is versioned,
  reviewable, and reusable.
- Do derive the label fields in `backend/app/services/library_loader.py` after
  file-type normalization.
- Do let the frontend consume the derived fields from `/api/library` instead of
  rebuilding route-specific label heuristics.

## Frontend usage rules

- use `display_label` for software download buttons and variant filters
- use `content_label` for eBook, audiobook, and video format buttons and filters
- treat `package_label` as secondary detail, not the primary label, for media
- keep planner/path/file selection logic separate from viewer labels; the backend
  planner still owns filenames, normalized file types, and relative paths

## Extending the policy

When new Humble download patterns appear:

1. update `download_label_policy.json`
2. update or add backend tests for the new pattern
3. only change frontend code if the backend response contract changes

Prefer policy updates over adding new route-specific string heuristics.
