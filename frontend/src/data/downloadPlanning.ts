/**
 * Shared viewer-side client for backend download planning contracts.
 */
import { Download } from "./types";

export type DownloadPlanSizePolicy = "all" | "smallest" | "largest";

export interface DownloadPlanItem {
  titleId: string;
  title: string;
  sourceBundle: string;
  downloads: Download[];
}

export interface DownloadPlanEntry {
  titleId: string;
  title: string;
  sourceBundle: string;
  platform: string;
  fileType: string;
  filename: string;
  relativePath: string;
  sizeBytes: number;
  url: string;
  checksums?: Record<string, string> | null;
}

export interface DownloadPlanOptions {
  platforms?: string[];
  fileTypes?: string[];
  sizePolicy?: DownloadPlanSizePolicy;
}

interface DownloadPlanResponseEntry {
  title_id: string;
  title: string;
  source_bundle: string;
  platform: string;
  file_type: string;
  filename: string;
  relative_path: string;
  size_bytes: number;
  url: string;
  checksums?: Record<string, string> | null;
}

export const buildDownloadPlan = async (
  items: DownloadPlanItem[],
  options?: DownloadPlanOptions
): Promise<DownloadPlanEntry[]> => {
  if (!items.length) {
    return [];
  }

  const response = await fetch("/api/downloads/plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: items.map((item) => ({
        title_id: item.titleId,
        title: item.title,
        source_bundle: item.sourceBundle,
        downloads: item.downloads
          .filter((download) => Boolean(download.url))
          .map((download) => ({
            platform: download.platform || null,
            name: download.name || null,
            url: download.url,
            size_bytes: download.size_bytes || 0,
            checksums: download.checksums || null,
            file_type: download.file_type || null,
          })),
      })),
      platforms: options?.platforms,
      file_types: options?.fileTypes,
      size_policy: options?.sizePolicy || "all",
    }),
  });

  const payload = (await response.json().catch(() => [])) as
    | DownloadPlanResponseEntry[]
    | { detail?: string };

  if (!response.ok) {
    throw new Error(
      "detail" in payload && payload.detail
        ? payload.detail
        : "Unable to build the download plan."
    );
  }

  return (payload as DownloadPlanResponseEntry[]).map((entry) => ({
    titleId: entry.title_id,
    title: entry.title,
    sourceBundle: entry.source_bundle,
    platform: entry.platform,
    fileType: entry.file_type,
    filename: entry.filename,
    relativePath: entry.relative_path,
    sizeBytes: entry.size_bytes,
    url: entry.url,
    checksums: entry.checksums || null,
  }));
};