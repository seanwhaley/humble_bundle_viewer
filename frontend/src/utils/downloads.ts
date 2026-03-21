/**
 * Download utility helpers for bulk download actions.
 */
import { Download } from "../data/types";

export type DownloadLabelStrategy =
  | "contentLabel"
  | "displayLabel"
  | "packageLabel"
  | "name"
  | "fileType"
  | "platformFileType";
export type LinkStatus = "valid" | "expiring" | "expired" | "unknown";
export type LinkExpirationSummaryState =
  | "unknown"
  | "upcoming"
  | "expiring"
  | "partialExpired"
  | "allExpired";

export interface LinkExpirationSummary {
  state: LinkExpirationSummaryState;
  referenceMs: number | null;
  totalKnownExpirations: number;
  expiredCount: number;
  futureCount: number;
}

const DEFAULT_EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;

const getPlatformLabel = (platform?: string) => {
  const normalized = (platform || "").trim().toLowerCase();
  switch (normalized) {
    case "ebook":
      return "eBook";
    case "audio":
      return "Audio";
    case "mac":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    case "android":
      return "Android";
    case "":
    case "unknown":
      return "Unknown";
    default:
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
};

const getFileTypeLabel = (download: Download) => {
  const name = (download.name || "").trim();
  const rawType = download.file_type || "file";
  const fileTypeLabel =
    !rawType || rawType.toLowerCase() === "file" ?
      "FILE"
    : rawType.toUpperCase();

  if (name && name !== "Download" && fileTypeLabel === "FILE") {
    return name;
  }

  return fileTypeLabel;
};

const getLegacyDownloadLabel = (
  download: Download,
  strategy: "name" | "fileType" | "platformFileType",
) => {
  const name = (download.name || "").trim();
  if (strategy === "name" && name && name !== "Download") {
    return name;
  }
  const fileTypeLabel = getFileTypeLabel(download);

  if (strategy === "platformFileType") {
    const platformLabel = getPlatformLabel(download.platform);
    if (platformLabel === "Unknown") return fileTypeLabel;
    if (fileTypeLabel === "FILE") return platformLabel;
    return `${platformLabel} ${fileTypeLabel}`;
  }

  return fileTypeLabel;
};

export const getDownloadLabel = (
  download: Download,
  strategy: DownloadLabelStrategy = "displayLabel",
) => {
  const contentLabel = (download.content_label || "").trim();
  const packageLabel = (
    download.package_label ||
    download.display_detail ||
    ""
  ).trim();
  const displayLabel = (download.display_label || "").trim();

  if (strategy === "contentLabel") {
    return (
      contentLabel ||
      displayLabel ||
      getLegacyDownloadLabel(download, "fileType")
    );
  }

  if (strategy === "packageLabel") {
    return packageLabel || getFileTypeLabel(download);
  }

  if (strategy === "displayLabel") {
    return (
      displayLabel ||
      contentLabel ||
      getLegacyDownloadLabel(download, "platformFileType")
    );
  }

  if (strategy === "name") {
    return getLegacyDownloadLabel(download, "name");
  }

  if (strategy === "fileType") {
    return packageLabel || getLegacyDownloadLabel(download, "fileType");
  }

  return displayLabel || getLegacyDownloadLabel(download, "platformFileType");
};

export const collectDownloadUrls = (downloads: Download[]) => {
  const urls = downloads
    .map((download) => download.url)
    .filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
};

const parseSignedToken = (token: string) => {
  const parts = token.split("~");
  const values: Record<string, string> = {};
  parts.forEach((part) => {
    const [key, ...rest] = part.split("=");
    if (!key) return;
    values[key] = rest.join("=");
  });
  return values;
};

export const getLinkExpirationMs = (url?: string) => {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const token = parsed.searchParams.get("t");
  if (token) {
    const values = parseSignedToken(token);
    const expValue = values.exp;
    if (expValue && !Number.isNaN(Number(expValue))) {
      return Number(expValue) * 1000;
    }
  }

  const expParam = parsed.searchParams.get("exp");
  if (expParam && !Number.isNaN(Number(expParam))) {
    return Number(expParam) * 1000;
  }

  return null;
};

export const getLinkStatus = (
  url?: string,
  expiringSoonMs: number = DEFAULT_EXPIRING_SOON_MS,
): LinkStatus => {
  const expMs = getLinkExpirationMs(url);
  if (!expMs) {
    return "unknown";
  }

  const nowMs = Date.now();
  if (expMs <= nowMs) return "expired";
  if (expMs - nowMs <= expiringSoonMs) return "expiring";
  return "valid";
};

export const getEarliestLinkExpirationMs = (
  urls: Array<string | undefined>,
) => {
  const expirations = urls
    .map((url) => getLinkExpirationMs(url))
    .filter((value): value is number => typeof value === "number");

  if (!expirations.length) return null;
  return Math.min(...expirations);
};

export const getLinkExpirationSummary = (
  urls: Array<string | undefined>,
  expiringSoonMs: number = DEFAULT_EXPIRING_SOON_MS,
): LinkExpirationSummary => {
  const expirations = urls
    .map((url) => getLinkExpirationMs(url))
    .filter((value): value is number => typeof value === "number");

  if (!expirations.length) {
    return {
      state: "unknown",
      referenceMs: null,
      totalKnownExpirations: 0,
      expiredCount: 0,
      futureCount: 0,
    };
  }

  const nowMs = Date.now();
  const expired = expirations.filter((value) => value <= nowMs);
  const future = expirations.filter((value) => value > nowMs);
  const earliestFuture = future.length ? Math.min(...future) : null;
  const latestExpired = expired.length ? Math.max(...expired) : null;

  if (!future.length) {
    return {
      state: "allExpired",
      referenceMs: latestExpired,
      totalKnownExpirations: expirations.length,
      expiredCount: expired.length,
      futureCount: 0,
    };
  }

  if (expired.length) {
    return {
      state: "partialExpired",
      referenceMs: earliestFuture,
      totalKnownExpirations: expirations.length,
      expiredCount: expired.length,
      futureCount: future.length,
    };
  }

  return {
    state:
      earliestFuture !== null && earliestFuture - nowMs <= expiringSoonMs ?
        "expiring"
      : "upcoming",
    referenceMs: earliestFuture,
    totalKnownExpirations: expirations.length,
    expiredCount: 0,
    futureCount: future.length,
  };
};

export const hasExpiredLinks = (
  downloads: Download[],
  expiringSoonMs: number = DEFAULT_EXPIRING_SOON_MS,
) =>
  downloads.some(
    (download) => getLinkStatus(download.url, expiringSoonMs) === "expired",
  );

export const hasExpiringSoonLinks = (
  downloads: Download[],
  expiringSoonMs: number = DEFAULT_EXPIRING_SOON_MS,
) =>
  downloads.some(
    (download) => getLinkStatus(download.url, expiringSoonMs) === "expiring",
  );

export const filterDownloadsByLabel = (
  downloads: Download[],
  label: string,
  strategy: DownloadLabelStrategy,
) =>
  downloads.filter(
    (download) => getDownloadLabel(download, strategy) === label,
  );

export const triggerDownloadUrls = (urls: string[]) => {
  if (!urls.length) return;
  urls.forEach((url) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "";
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  });
};
