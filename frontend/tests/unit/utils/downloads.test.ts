import { describe, expect, it, vi, afterEach } from "vitest";

import { type Download } from "../../../src/data/types";
import {
  filterDownloadsByLabel,
  getDownloadLabel,
  getLinkExpirationSummary,
} from "../../../src/utils/downloads";

const makeDownload = (overrides: Partial<Download> = {}): Download => ({
  platform: "ebook",
  name: "Download",
  file_type: "pdf",
  url: "https://example.com/file.pdf",
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getDownloadLabel", () => {
  it("prefers backend-derived content and display labels", () => {
    const download = makeDownload({
      platform: "audio",
      name: "MP3",
      file_type: "zip",
      content_label: "MP3",
      package_label: "ZIP",
      display_label: "MP3 (ZIP)",
    });

    expect(getDownloadLabel(download, "contentLabel")).toBe("MP3");
    expect(getDownloadLabel(download, "displayLabel")).toBe("MP3 (ZIP)");
    expect(getDownloadLabel(download, "packageLabel")).toBe("ZIP");
  });

  it("keeps legacy name and file-type strategies semantically accurate", () => {
    const download = makeDownload({
      platform: "audio",
      name: "MP3",
      file_type: "zip",
      content_label: "MP3",
      package_label: "ZIP",
      display_label: "MP3",
    });

    expect(getDownloadLabel(download, "name")).toBe("MP3");
    expect(getDownloadLabel(download, "fileType")).toBe("ZIP");
    expect(getDownloadLabel(download, "platformFileType")).toBe("MP3");
  });

  it("falls back to legacy formatting when backend-derived fields are missing", () => {
    const download = makeDownload({
      platform: "windows",
      name: "Installer",
      file_type: "exe",
    });

    expect(getDownloadLabel(download, "contentLabel")).toBe("EXE");
    expect(getDownloadLabel(download, "displayLabel")).toBe("Windows EXE");
    expect(getDownloadLabel(download, "packageLabel")).toBe("EXE");
  });
});

describe("filterDownloadsByLabel", () => {
  it("filters using backend-derived label strategies", () => {
    const downloads = [
      makeDownload({
        platform: "audio",
        name: "MP3",
        file_type: "zip",
        content_label: "MP3",
        package_label: "ZIP",
        display_label: "MP3",
        url: "https://example.com/book-mp3.zip",
      }),
      makeDownload({
        platform: "audio",
        name: "FLAC",
        file_type: "zip",
        content_label: "FLAC",
        package_label: "ZIP",
        display_label: "FLAC",
        url: "https://example.com/book-flac.zip",
      }),
    ];

    expect(filterDownloadsByLabel(downloads, "MP3", "contentLabel")).toEqual([
      downloads[0],
    ]);
    expect(filterDownloadsByLabel(downloads, "FLAC", "displayLabel")).toEqual([
      downloads[1],
    ]);
  });
});

describe("getLinkExpirationSummary", () => {
  it("reports the next upcoming expiry when all known links are still valid", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));

    const summary = getLinkExpirationSummary([
      "https://example.com/file-a.pdf?exp=1777000000",
      "https://example.com/file-b.pdf?exp=1778000000",
    ]);

    expect(summary.state).toBe("upcoming");
    expect(summary.referenceMs).toBe(1777000000 * 1000);
    expect(summary.expiredCount).toBe(0);
    expect(summary.futureCount).toBe(2);
  });

  it("reports an expiring state when the next known link expiry is within the warning window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));

    const summary = getLinkExpirationSummary([
      "https://example.com/file-a.pdf?exp=1774000000",
      "https://example.com/file-b.pdf?exp=1775000000",
    ]);

    expect(summary.state).toBe("expiring");
    expect(summary.referenceMs).toBe(1774000000 * 1000);
    expect(summary.expiredCount).toBe(0);
    expect(summary.futureCount).toBe(2);
  });

  it("reports a partial-expired state when some links are past and others remain future-dated", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));

    const summary = getLinkExpirationSummary([
      "https://example.com/file-a.pdf?exp=1742000000",
      "https://example.com/file-b.pdf?exp=1774000000",
    ]);

    expect(summary.state).toBe("partialExpired");
    expect(summary.referenceMs).toBe(1774000000 * 1000);
    expect(summary.expiredCount).toBe(1);
    expect(summary.futureCount).toBe(1);
  });

  it("reports an all-expired state when every known expiration is in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));

    const summary = getLinkExpirationSummary([
      "https://example.com/file-a.pdf?exp=1741000000",
      "https://example.com/file-b.pdf?exp=1742000000",
    ]);

    expect(summary.state).toBe("allExpired");
    expect(summary.referenceMs).toBe(1742000000 * 1000);
    expect(summary.expiredCount).toBe(2);
    expect(summary.futureCount).toBe(0);
  });

  it("reports unknown when no signed-expiry timestamps are available", () => {
    const summary = getLinkExpirationSummary([
      "https://example.com/file-a.pdf",
      undefined,
    ]);

    expect(summary.state).toBe("unknown");
    expect(summary.referenceMs).toBeNull();
    expect(summary.totalKnownExpirations).toBe(0);
  });
});
