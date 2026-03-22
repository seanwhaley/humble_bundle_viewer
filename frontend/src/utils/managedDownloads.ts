import {
  buildDownloadPlan,
  type DownloadPlanEntry,
  type DownloadPlanItem,
  type DownloadPlanOptions,
} from "../data/downloadPlanning";

const MANIFEST_DIRNAME = ".hb-library-viewer";
const MANIFEST_FILENAME = "sync-manifest.json";
const MANIFEST_VERSION = 2;
const DEFAULT_MANAGED_SYNC_MANIFEST_HISTORY_ENTRIES = 5000;
const DEFAULT_MANAGED_SYNC_MAX_PARALLEL_DOWNLOADS = 3;

export type ManagedSyncStatus =
  | "downloaded"
  | "downloaded_renamed"
  | "skipped_existing"
  | "failed";

export type ManagedDownloadItem = DownloadPlanItem;

export type ManagedDownloadPlanEntry = DownloadPlanEntry;

export interface ManagedSyncResultEntry extends ManagedDownloadPlanEntry {
  plannedRelativePath: string;
  localPath: string;
  status: ManagedSyncStatus;
  message?: string;
  syncedAt: string;
  actualSizeBytes?: number;
}

export interface ManagedSyncSummary {
  plannedFiles: number;
  downloadedFiles: number;
  skippedExistingFiles: number;
  renamedFiles: number;
  failedFiles: number;
  manifestPath: string;
  entries: ManagedSyncResultEntry[];
}

export interface ManagedSyncProgress {
  totalTitles: number;
  reviewedTitles: number;
  totalFiles: number;
  reviewedFiles: number;
  downloadedFiles: number;
  skippedExistingFiles: number;
  renamedFiles: number;
  failedFiles: number;
  activeDownloads: number;
  currentTitle: string | null;
  currentFile: string | null;
}

interface ManagedSyncManifest {
  version: number;
  updatedAt: string;
  historyEntries: ManagedSyncResultEntry[];
  lastRun: ManagedSyncSummary;
}

export interface ManagedSyncOptions {
  maxParallelDownloads?: number;
  manifestHistoryEntries?: number;
}

type ManagedFileTargetResolution =
  | {
      kind: "skip";
      fileName: string;
      message: string;
      actualSizeBytes: number;
    }
  | {
      kind: "download";
      fileName: string;
      status: "downloaded" | "downloaded_renamed";
      message?: string;
    };

const getOrCreateDirectory = async (
  root: FileSystemDirectoryHandle,
  segments: string[]
) => {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
};

const getFileHandleIfExists = async (
  directory: FileSystemDirectoryHandle,
  fileName: string
) => {
  try {
    return await directory.getFileHandle(fileName);
  } catch {
    return null;
  }
};

const getIndexedFileName = (fileName: string, counter: number) => {
  const dot = fileName.lastIndexOf(".");
  const stem = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot >= 0 ? fileName.slice(dot) : "";
  return `${stem} (${counter})${ext}`;
};

const ensurePermission = async (handle: FileSystemHandle) => {
  const descriptor = { mode: "readwrite" as const };
  if (handle.queryPermission) {
    const permission = await handle.queryPermission(descriptor);
    if (permission === "granted") return;
  }
  if (handle.requestPermission) {
    const permission = await handle.requestPermission(descriptor);
    if (permission === "granted") return;
  }
  throw new Error("Local folder permission was not granted.");
};

const getPlanIdentityKey = (entry: ManagedDownloadPlanEntry) =>
  `${entry.titleId}::${entry.platform}::${entry.relativePath}`;

const getResultIdentityKey = (entry: ManagedSyncResultEntry) =>
  `${entry.titleId}::${entry.platform}::${entry.plannedRelativePath}`;

const buildAcceptedSizes = (
  entry: ManagedDownloadPlanEntry,
  historyEntries: ManagedSyncResultEntry[]
) => {
  const acceptedSizes = new Set<number>();
  if (entry.sizeBytes > 0) {
    acceptedSizes.add(entry.sizeBytes);
  }

  const identityKey = getPlanIdentityKey(entry);
  historyEntries.forEach((historyEntry) => {
    if (
      historyEntry.status !== "failed" &&
      historyEntry.actualSizeBytes &&
      historyEntry.actualSizeBytes > 0 &&
      getResultIdentityKey(historyEntry) === identityKey
    ) {
      acceptedSizes.add(historyEntry.actualSizeBytes);
    }
  });

  return acceptedSizes;
};

const matchesAcceptedSize = (file: File, acceptedSizes: Set<number>) => {
  if (!acceptedSizes.size) {
    return true;
  }
  return acceptedSizes.has(file.size);
};

const getNextAvailableRenamedFileName = async (
  directory: FileSystemDirectoryHandle,
  fileName: string,
  acceptedSizes: Set<number>
): Promise<ManagedFileTargetResolution> => {
  let counter = 1;
  while (true) {
    const candidate = getIndexedFileName(fileName, counter);
    const existing = await getFileHandleIfExists(directory, candidate);
    if (existing) {
      const existingFile = await existing.getFile();
      if (matchesAcceptedSize(existingFile, acceptedSizes)) {
        return {
          kind: "skip",
          fileName: candidate,
          message:
            "Existing renamed file matches the expected or previously synced payload size.",
          actualSizeBytes: existingFile.size,
        };
      }
      counter += 1;
      continue;
    }

    return {
      kind: "download",
      fileName: candidate,
      status: "downloaded_renamed",
      message: "Existing file had a different size; kept both copies.",
    };
  }
};

const resolveManagedFileTarget = async (
  directory: FileSystemDirectoryHandle,
  fileName: string,
  acceptedSizes: Set<number>
): Promise<ManagedFileTargetResolution> => {
  const exactHandle = await getFileHandleIfExists(directory, fileName);
  if (!exactHandle) {
    return {
      kind: "download",
      fileName,
      status: "downloaded",
    };
  }

  const existingFile = await exactHandle.getFile();
  if (matchesAcceptedSize(existingFile, acceptedSizes)) {
    return {
      kind: "skip",
      fileName,
      message:
        acceptedSizes.size > 1
          ? "Existing file matches a previously synced payload size."
          : "Existing file matches expected size.",
      actualSizeBytes: existingFile.size,
    };
  }

  return getNextAvailableRenamedFileName(directory, fileName, acceptedSizes);
};

const streamDownloadToFile = async (
  entry: ManagedDownloadPlanEntry,
  fileHandle: FileSystemFileHandle,
  suggestedFileName: string
) => {
  const response = await fetch("/api/downloads/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: entry.url,
      suggested_filename: suggestedFileName,
    }),
  });

  if (!response.ok) {
    let detail = "Unable to stream the selected download.";
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Ignore JSON parsing errors and use the default message.
    }
    throw new Error(detail);
  }

  const writable = await fileHandle.createWritable({ keepExistingData: false });
  try {
    if (!response.body) {
      const blob = await response.blob();
      await writable.write(blob);
      await writable.close();
      return blob.size;
    }

    let bytesWritten = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        bytesWritten += value.byteLength;
        await writable.write(value);
      }
    }
    await writable.close();
    return bytesWritten;
  } catch (error) {
    await writable.abort(error);
    throw error;
  }
};

const buildSummary = (
  plannedFiles: number,
  entries: ManagedSyncResultEntry[]
): ManagedSyncSummary => ({
  plannedFiles,
  downloadedFiles: entries.filter(
    (entry) => entry.status === "downloaded" || entry.status === "downloaded_renamed"
  ).length,
  skippedExistingFiles: entries.filter(
    (entry) => entry.status === "skipped_existing"
  ).length,
  renamedFiles: entries.filter(
    (entry) => entry.status === "downloaded_renamed"
  ).length,
  failedFiles: entries.filter((entry) => entry.status === "failed").length,
  manifestPath: `${MANIFEST_DIRNAME}/${MANIFEST_FILENAME}`,
  entries,
});

const trimManifestHistory = (
  entries: ManagedSyncResultEntry[],
  maxHistoryEntries: number
) => {
  if (entries.length <= maxHistoryEntries) {
    return entries;
  }
  return entries.slice(entries.length - maxHistoryEntries);
};

const loadManifest = async (
  root: FileSystemDirectoryHandle
): Promise<ManagedSyncManifest | null> => {
  try {
    const manifestDir = await root.getDirectoryHandle(MANIFEST_DIRNAME);
    const manifestFile = await manifestDir.getFileHandle(MANIFEST_FILENAME);
    const manifestText = await (await manifestFile.getFile()).text();
    const parsed = JSON.parse(manifestText) as Partial<ManagedSyncManifest>;

    if (!Array.isArray(parsed.historyEntries) || !parsed.lastRun) {
      return null;
    }

    return {
      version:
        typeof parsed.version === "number" ? parsed.version : MANIFEST_VERSION,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
      historyEntries: parsed.historyEntries as ManagedSyncResultEntry[],
      lastRun: parsed.lastRun as ManagedSyncSummary,
    };
  } catch {
    return null;
  }
};

const writeManifest = async (
  root: FileSystemDirectoryHandle,
  historyEntries: ManagedSyncResultEntry[],
  summary: ManagedSyncSummary,
  manifestHistoryEntries: number
) => {
  const manifest: ManagedSyncManifest = {
    version: MANIFEST_VERSION,
    updatedAt: new Date().toISOString(),
    historyEntries: trimManifestHistory(historyEntries, manifestHistoryEntries),
    lastRun: summary,
  };

  const manifestDir = await root.getDirectoryHandle(MANIFEST_DIRNAME, {
    create: true,
  });
  const manifestFile = await manifestDir.getFileHandle(MANIFEST_FILENAME, {
    create: true,
  });
  const writable = await manifestFile.createWritable({ keepExistingData: false });
  try {
    await writable.write(JSON.stringify(manifest, null, 2));
    await writable.close();
  } catch (error) {
    await writable.abort(error);
    throw error;
  }
};

export const supportsManagedDownloads = () =>
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

export const buildManagedDownloadPlan = async (
  items: ManagedDownloadItem[],
  options?: DownloadPlanOptions
): Promise<ManagedDownloadPlanEntry[]> => {
  return buildDownloadPlan(items, options);
};

export const syncManagedDownloads = async (
  root: FileSystemDirectoryHandle,
  entries: ManagedDownloadPlanEntry[],
  options?: ManagedSyncOptions,
  onProgress?: (progress: ManagedSyncProgress) => void
): Promise<ManagedSyncSummary> => {
  await ensurePermission(root);

  const maxParallelDownloads = Math.max(
    1,
    Math.floor(
      options?.maxParallelDownloads ??
        DEFAULT_MANAGED_SYNC_MAX_PARALLEL_DOWNLOADS
    )
  );
  const manifestHistoryEntries = Math.max(
    1,
    Math.floor(
      options?.manifestHistoryEntries ??
        DEFAULT_MANAGED_SYNC_MANIFEST_HISTORY_ENTRIES
    )
  );

  const existingManifest = await loadManifest(root);
  const historyEntries = [...(existingManifest?.historyEntries || [])];
  const results: Array<ManagedSyncResultEntry | undefined> = new Array(entries.length);
  const totalFiles = entries.length;
  const totalTitles = new Set(entries.map((entry) => entry.titleId)).size;
  const titleEntryCounts = new Map<string, number>();
  const reviewedEntryCounts = new Map<string, number>();
  const activeEntries = new Map<number, { title: string; fileName: string }>();
  let nextEntryIndex = 0;
  let manifestWriteQueue: Promise<void> = Promise.resolve();

  entries.forEach((entry) => {
    titleEntryCounts.set(
      entry.titleId,
      (titleEntryCounts.get(entry.titleId) || 0) + 1
    );
  });

  const progress: ManagedSyncProgress = {
    totalTitles,
    reviewedTitles: 0,
    totalFiles,
    reviewedFiles: 0,
    downloadedFiles: 0,
    skippedExistingFiles: 0,
    renamedFiles: 0,
    failedFiles: 0,
    activeDownloads: 0,
    currentTitle: null,
    currentFile: null,
  };

  const getCompletedResults = () =>
    results.filter(Boolean) as ManagedSyncResultEntry[];

  const refreshCurrentProgress = () => {
    const latestActiveEntry = Array.from(activeEntries.values()).at(-1) || null;
    progress.activeDownloads = activeEntries.size;
    progress.currentTitle = latestActiveEntry?.title || null;
    progress.currentFile = latestActiveEntry?.fileName || null;
  };

  const emitProgress = () => {
    onProgress?.({ ...progress });
  };

  const markEntryReviewed = (entry: ManagedDownloadPlanEntry) => {
    progress.reviewedFiles += 1;
    const nextReviewed = (reviewedEntryCounts.get(entry.titleId) || 0) + 1;
    reviewedEntryCounts.set(entry.titleId, nextReviewed);
    if (nextReviewed === titleEntryCounts.get(entry.titleId)) {
      progress.reviewedTitles += 1;
    }
  };

  const queueManifestWrite = (snapshotEntries: ManagedSyncResultEntry[]) => {
    const snapshotSummary = buildSummary(totalFiles, snapshotEntries);
    const snapshotHistory = trimManifestHistory(
      [...historyEntries, ...snapshotEntries],
      manifestHistoryEntries
    );
    manifestWriteQueue = manifestWriteQueue.then(() =>
      writeManifest(
        root,
        snapshotHistory,
        snapshotSummary,
        manifestHistoryEntries
      )
    );
    return manifestWriteQueue;
  };

  const persistResult = async (index: number, result: ManagedSyncResultEntry) => {
    results[index] = result;
    await queueManifestWrite(getCompletedResults());
  };

  const takeNextIndex = () => {
    if (nextEntryIndex >= entries.length) {
      return null;
    }
    const currentIndex = nextEntryIndex;
    nextEntryIndex += 1;
    return currentIndex;
  };

  emitProgress();
  await queueManifestWrite([]);

  const processEntry = async (entry: ManagedDownloadPlanEntry, index: number) => {
    const timestamp = new Date().toISOString();
    const segments = entry.relativePath.split("/").filter(Boolean);
    const requestedFileName = segments.pop() || entry.filename;

    activeEntries.set(index, {
      title: entry.title,
      fileName: requestedFileName,
    });
    refreshCurrentProgress();
    emitProgress();

    try {
      const directory = await getOrCreateDirectory(root, segments);
      const acceptedSizes = buildAcceptedSizes(entry, historyEntries);
      const target = await resolveManagedFileTarget(
        directory,
        requestedFileName,
        acceptedSizes
      );
      const finalFileName = target.fileName;
      const finalRelativePath = [...segments, finalFileName].join("/");

      if (target.kind === "skip") {
        progress.skippedExistingFiles += 1;
        markEntryReviewed(entry);
        await persistResult(index, {
          ...entry,
          filename: finalFileName,
          relativePath: finalRelativePath,
          plannedRelativePath: entry.relativePath,
          localPath: finalRelativePath,
          status: "skipped_existing",
          message: target.message,
          syncedAt: timestamp,
          actualSizeBytes: target.actualSizeBytes,
        });
        emitProgress();
        return;
      }

      const targetHandle = await directory.getFileHandle(finalFileName, {
        create: true,
      });
      const bytesWritten = await streamDownloadToFile(
        entry,
        targetHandle,
        finalFileName
      );
      const actualSizeBytes =
        bytesWritten > 0 ? bytesWritten : (await targetHandle.getFile()).size;

      progress.downloadedFiles += 1;
      if (target.status === "downloaded_renamed") {
        progress.renamedFiles += 1;
      }
      markEntryReviewed(entry);
      await persistResult(index, {
        ...entry,
        filename: finalFileName,
        relativePath: finalRelativePath,
        plannedRelativePath: entry.relativePath,
        localPath: finalRelativePath,
        status: target.status,
        message: target.message,
        syncedAt: timestamp,
        actualSizeBytes,
      });
      emitProgress();
    } catch (error) {
      progress.failedFiles += 1;
      markEntryReviewed(entry);
      await persistResult(index, {
        ...entry,
        plannedRelativePath: entry.relativePath,
        localPath: entry.relativePath,
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Managed sync failed for this file.",
        syncedAt: timestamp,
      });
      emitProgress();
    } finally {
      activeEntries.delete(index);
      refreshCurrentProgress();
      emitProgress();
    }
  };

  const workerCount = Math.min(
    Math.max(totalFiles, 1),
    maxParallelDownloads
  );

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = takeNextIndex();
      if (currentIndex === null) {
        return;
      }
      await processEntry(entries[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  await manifestWriteQueue;

  refreshCurrentProgress();
  emitProgress();

  const finalResults = getCompletedResults();
  const finalSummary = buildSummary(totalFiles, finalResults);
  await writeManifest(
    root,
    trimManifestHistory([...historyEntries, ...finalResults], manifestHistoryEntries),
    finalSummary,
    manifestHistoryEntries
  );
  return finalSummary;
};