import { useEffect, useMemo, useState } from "react";
import { Download, FolderOpen, Loader2, ShieldCheck } from "lucide-react";

import { useViewerConfig } from "../data/api";
import { Download as DownloadRecord } from "../data/types";
import { Button } from "./ui/button";
import {
  buildManagedDownloadPlan,
  ManagedDownloadItem,
  ManagedDownloadPlanEntry,
  ManagedSyncProgress,
  ManagedSyncSummary,
  supportsManagedDownloads,
  syncManagedDownloads,
} from "../utils/managedDownloads";
import {
  DownloadLabelStrategy,
  filterDownloadsByLabel,
  getLinkStatus,
  hasExpiredLinks,
} from "../utils/downloads";

export interface AdvancedManagedSyncRow {
  id: string;
  subproductName: string;
  sourceBundle: string;
  downloads: DownloadRecord[];
}

interface AdvancedManagedSyncPanelProps {
  rows: AdvancedManagedSyncRow[];
  selectedRows: AdvancedManagedSyncRow[];
  uniqueFormats: string[];
  expiringSoonMs: number;
  onExpiredLinks: () => void;
  mediaLabel: string;
  formatStrategy: DownloadLabelStrategy;
  pickerId: string;
}

type SizePolicy = "all" | "smallest" | "largest";

const MAX_DIRECTORY_PICKER_ID_LENGTH = 32;

const normalizeDirectoryPickerId = (pickerId: string) => {
  const cleaned = pickerId
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!cleaned) {
    return "hb-viewer-sync";
  }

  if (cleaned.length <= MAX_DIRECTORY_PICKER_ID_LENGTH) {
    return cleaned;
  }

  const segments = cleaned.split("-").filter(Boolean);
  const tail = segments.slice(-2).join("-") || segments.at(-1) || "sync";
  return `hb-viewer-${tail}`.slice(0, MAX_DIRECTORY_PICKER_ID_LENGTH);
};

export default function AdvancedManagedSyncPanel({
  rows,
  selectedRows,
  uniqueFormats,
  expiringSoonMs,
  onExpiredLinks,
  mediaLabel,
  formatStrategy,
  pickerId,
}: AdvancedManagedSyncPanelProps) {
  const [format, setFormat] = useState("");
  const [sizePolicy, setSizePolicy] = useState<SizePolicy>("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ManagedSyncProgress | null>(null);
  const [summary, setSummary] = useState<ManagedSyncSummary | null>(null);
  const [plannedEntries, setPlannedEntries] = useState<
    ManagedDownloadPlanEntry[]
  >([]);
  const { data: viewerConfig } = useViewerConfig();

  const managedDownloadSupported = supportsManagedDownloads();
  const activeRows = selectedRows.length ? selectedRows : rows;
  const plannerFileTypes = useMemo(
    () =>
      format && formatStrategy === "fileType" ?
        [format.toLowerCase()]
      : undefined,
    [format, formatStrategy],
  );
  const directoryPickerId = useMemo(
    () => normalizeDirectoryPickerId(pickerId),
    [pickerId],
  );

  const syncItems = useMemo<ManagedDownloadItem[]>(() => {
    return activeRows
      .map((row) => {
        let downloads = [...row.downloads];
        if (format && formatStrategy !== "fileType") {
          downloads = filterDownloadsByLabel(downloads, format, formatStrategy);
        }

        return downloads.length ?
            {
              titleId: row.id,
              title: row.subproductName,
              sourceBundle: row.sourceBundle,
              downloads,
            }
          : null;
      })
      .filter(Boolean) as ManagedDownloadItem[];
  }, [activeRows, format, formatStrategy]);

  useEffect(() => {
    let cancelled = false;

    if (!syncItems.length) {
      setPlannedEntries([]);
      setIsPlanning(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPlanning(true);
    setSyncError(null);

    void buildManagedDownloadPlan(syncItems, {
      fileTypes: plannerFileTypes,
      sizePolicy,
    })
      .then((entries) => {
        if (!cancelled) {
          setPlannedEntries(entries);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPlannedEntries([]);
          setSyncError(
            error instanceof Error ?
              error.message
            : "Unable to build the managed download plan.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPlanning(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [plannerFileTypes, sizePolicy, syncItems]);

  const hasExpiredSelection = useMemo(
    () =>
      plannedEntries.some(
        (entry) => getLinkStatus(entry.url, expiringSoonMs) === "expired",
      ),
    [expiringSoonMs, plannedEntries],
  );

  const reviewedPercent = useMemo(() => {
    if (!progress || progress.totalFiles <= 0) return 0;
    return Math.min(
      100,
      Math.round((progress.reviewedFiles / progress.totalFiles) * 100),
    );
  }, [progress]);

  const maxParallelDownloads =
    viewerConfig?.managed_sync_max_parallel_downloads ?? 3;
  const manifestHistoryEntries =
    viewerConfig?.managed_sync_manifest_history_entries ?? 5000;

  const handleManagedSync = async () => {
    setSyncError(null);
    setSummary(null);
    setProgress(null);

    if (hasExpiredSelection) {
      onExpiredLinks();
      return;
    }

    if (!managedDownloadSupported || !window.showDirectoryPicker) {
      setSyncError(
        "This browser does not support local folder sync. Use Chrome or Edge, or run the CLI sync command instead.",
      );
      return;
    }

    try {
      setIsSyncing(true);
      const root = await window.showDirectoryPicker({
        id: directoryPickerId,
        mode: "readwrite",
        startIn: "downloads",
      });
      const result = await syncManagedDownloads(
        root,
        plannedEntries,
        {
          maxParallelDownloads,
          manifestHistoryEntries,
        },
        setProgress,
      );
      setSummary(result);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setSyncError(
        error instanceof Error ?
          error.message
        : "Managed sync could not start.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            Advanced local sync
          </h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-300">
            Save managed {mediaLabel} downloads into a folder on this device
            without writing the files to backend storage.
          </p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-right text-[11px] text-slate-300">
          <div>
            Scope:{" "}
            {selectedRows.length ?
              `${selectedRows.length} selected`
            : `${rows.length} filtered`}{" "}
            title(s)
          </div>
          <div>Planned files: {plannedEntries.length}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border border-slate-800 bg-slate-950 px-2 text-xs text-slate-100"
          value={format}
          onChange={(event) => setFormat(event.target.value)}
          aria-label="Managed sync format">
          <option value="">All formats</option>
          {uniqueFormats.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          className="h-8 rounded-md border border-slate-800 bg-slate-950 px-2 text-xs text-slate-100"
          value={sizePolicy}
          onChange={(event) => setSizePolicy(event.target.value as SizePolicy)}
          aria-label="Managed sync size policy">
          <option value="all">All files</option>
          <option value="smallest">Smallest per title</option>
          <option value="largest">Largest per title</option>
        </select>

        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={!plannedEntries.length || isSyncing || isPlanning}
          onClick={() => {
            void handleManagedSync();
          }}>
          {isSyncing || isPlanning ?
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          : <FolderOpen className="mr-2 h-3.5 w-3.5" />}
          {isPlanning ? "Planning files…" : "Choose folder and sync"}
        </Button>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Managed sync now asks the backend to build the file plan first, so
        shared Python rules decide filenames, file types, and relative paths
        before the browser saves anything locally. It still reuses matching
        files, preserves mismatches with numbered copies, writes progress to{" "}
        <span className="font-mono">.hb-library-viewer/sync-manifest.json</span>
        , and uses up to {maxParallelDownloads} parallel worker(s) from{" "}
        <span className="font-mono">config.yaml</span> while the backend spaces
        upstream stream starts to respect the minimum rate limit.
      </p>
      {!managedDownloadSupported && (
        <p className="mt-2 text-xs text-amber-300">
          This browser does not support the local folder picker API. Use the CLI
          managed sync command instead.
        </p>
      )}
      {syncError && <p className="mt-2 text-xs text-rose-300">{syncError}</p>}

      {progress && (
        <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sync progress
              </p>
              <p className="mt-1 text-sm text-slate-100">
                Reviewed {progress.reviewedTitles} of {progress.totalTitles}{" "}
                title(s) and {progress.reviewedFiles} of {progress.totalFiles}{" "}
                file(s)
              </p>
            </div>
            <div className="text-right text-sm font-medium text-emerald-200">
              {reviewedPercent}% complete
            </div>
          </div>

          <progress
            className="mt-3 h-2 w-full overflow-hidden rounded-full [appearance:none] [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-emerald-400 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-emerald-400"
            aria-label="Managed sync progress"
            max={Math.max(progress.totalFiles, 1)}
            value={progress.reviewedFiles}
          />

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Titles in scope
              </div>
              <div className="mt-1 text-sm text-slate-100">
                {progress.totalTitles}
              </div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Files planned
              </div>
              <div className="mt-1 text-sm text-slate-100">
                {progress.totalFiles}
              </div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Downloaded
              </div>
              <div className="mt-1 text-sm text-emerald-200">
                {progress.downloadedFiles}
              </div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Skipped existing
              </div>
              <div className="mt-1 text-sm text-slate-100">
                {progress.skippedExistingFiles}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <span>
              Active workers: {progress.activeDownloads} /{" "}
              {maxParallelDownloads}
            </span>
            <span>Renamed: {progress.renamedFiles}</span>
            <span>Failed: {progress.failedFiles}</span>
          </div>

          <p className="mt-3 text-xs text-slate-300">
            Current title:{" "}
            <span className="font-medium text-slate-100">
              {progress.currentTitle || "Finalizing manifest"}
            </span>
          </p>
          {progress.currentFile && (
            <p className="mt-1 text-xs text-slate-400">
              Current file:{" "}
              <span className="font-mono">{progress.currentFile}</span>
            </p>
          )}
        </div>
      )}

      {summary && (
        <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
          <div className="flex flex-wrap gap-4">
            <span className="flex items-center gap-1">
              <Download className="h-3.5 w-3.5" />
              Downloaded: {summary.downloadedFiles}
            </span>
            <span>Skipped existing: {summary.skippedExistingFiles}</span>
            <span>Renamed: {summary.renamedFiles}</span>
            <span>Failed: {summary.failedFiles}</span>
          </div>
          <p className="mt-2 text-slate-400">
            Manifest: <span className="font-mono">{summary.manifestPath}</span>
          </p>
        </div>
      )}
    </div>
  );
}
