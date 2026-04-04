import { useEffect, useMemo, useState } from "react";
import { Download, FolderOpen, Loader2, ShieldCheck } from "lucide-react";

import { useViewerConfig } from "../data/api";
import { Download as DownloadRecord } from "../data/types";
import { Button } from "./ui/button";
import {
  COMPACT_ACTION_BUTTON_WITH_GAP_CLASS,
  COMPACT_FORM_SELECT_CLASS,
  COMPACT_INFO_PANEL_CLASS,
  COMPACT_METRIC_LABEL_CLASS,
  LIBRARY_CONTEXT_METRIC_CLASS,
  MONO_INLINE_TEXT_CLASS,
} from "../styles/roles";
import {
  GRID_FOUR_METRIC_CLASS,
  PAGE_ACTION_ROW_CLASS,
  PANEL_META_ROW_CLASS,
  PANEL_HEADER_TOP_ALIGN_ROW_CLASS,
  PANEL_HELP_TEXT_CLASS,
} from "../styles/page";
import {
  STATUS_ERROR_TEXT_XS_CLASS,
  STATUS_PROGRESS_BAR_CLASS,
  STATUS_SCOPE_PANEL_CLASS,
  STATUS_SUCCESS_BODY_TEXT_CLASS,
  STATUS_SUCCESS_HEADER_CLASS,
  STATUS_SUCCESS_PANEL_SOFT_CLASS,
  STATUS_SUCCESS_TEXT_RIGHT_CLASS,
  STATUS_WARNING_TEXT_XS_CLASS,
} from "../styles/status";
import {
  buildManagedDownloadPlan,
  ManagedDownloadItem,
  ManagedDownloadPlanEntry,
  ManagedSyncProgress,
  ManagedSyncSummary,
  supportsManagedDownloads,
  syncManagedDownloads,
} from "../data/managedDownloads";
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
    <div className={STATUS_SUCCESS_PANEL_SOFT_CLASS}>
      <div className={PANEL_HEADER_TOP_ALIGN_ROW_CLASS}>
        <div>
          <h3 className={STATUS_SUCCESS_HEADER_CLASS}>
            <ShieldCheck className="h-4 w-4" />
            Advanced local sync
          </h3>
          <p className={STATUS_SUCCESS_BODY_TEXT_CLASS}>
            Save managed {mediaLabel} downloads into a folder on this device
            without writing the files to backend storage.
          </p>
        </div>
        <div className={STATUS_SCOPE_PANEL_CLASS}>
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

      <div className={PAGE_ACTION_ROW_CLASS}>
        <select
          className={COMPACT_FORM_SELECT_CLASS}
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
          className={COMPACT_FORM_SELECT_CLASS}
          value={sizePolicy}
          onChange={(event) => setSizePolicy(event.target.value as SizePolicy)}
          aria-label="Managed sync size policy">
          <option value="all">All files</option>
          <option value="smallest">Smallest per title</option>
          <option value="largest">Largest per title</option>
        </select>

        <Button
          size="sm"
          className={COMPACT_ACTION_BUTTON_WITH_GAP_CLASS}
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

      <p className={PANEL_HELP_TEXT_CLASS}>
        Managed sync now asks the backend to build the file plan first, so
        shared Python rules decide filenames, file types, and relative paths
        before the browser saves anything locally. It still reuses matching
        files, preserves mismatches with numbered copies, writes progress to{" "}
        <span className={MONO_INLINE_TEXT_CLASS}>.hb-library-viewer/sync-manifest.json</span>
        , and uses up to {maxParallelDownloads} parallel worker(s) from{" "}
        <span className={MONO_INLINE_TEXT_CLASS}>config.yaml</span> while the backend spaces
        upstream stream starts to respect the minimum rate limit.
      </p>
      {!managedDownloadSupported && (
        <p className={STATUS_WARNING_TEXT_XS_CLASS}>
          This browser does not support the local folder picker API. Use the CLI
          managed sync command instead.
        </p>
      )}
      {syncError && <p className={STATUS_ERROR_TEXT_XS_CLASS}>{syncError}</p>}

      {progress && (
        <div className={COMPACT_INFO_PANEL_CLASS}>
          <div className={PANEL_HEADER_TOP_ALIGN_ROW_CLASS}>
            <div>
              <p className={COMPACT_METRIC_LABEL_CLASS}>
                Sync progress
              </p>
              <p className="mt-1 text-sm text-card-foreground">
                Reviewed {progress.reviewedTitles} of {progress.totalTitles}{" "}
                title(s) and {progress.reviewedFiles} of {progress.totalFiles}{" "}
                file(s)
              </p>
            </div>
            <div className={STATUS_SUCCESS_TEXT_RIGHT_CLASS}>
              {reviewedPercent}% complete
            </div>
          </div>

          <progress
            className={STATUS_PROGRESS_BAR_CLASS}
            aria-label="Managed sync progress"
            max={Math.max(progress.totalFiles, 1)}
            value={progress.reviewedFiles}
          />

          <div className={GRID_FOUR_METRIC_CLASS}>
            <div className={LIBRARY_CONTEXT_METRIC_CLASS}>
              <div className={COMPACT_METRIC_LABEL_CLASS}>
                Titles in scope
              </div>
              <div className="mt-1 text-sm text-card-foreground">
                {progress.totalTitles}
              </div>
            </div>
            <div className={LIBRARY_CONTEXT_METRIC_CLASS}>
              <div className={COMPACT_METRIC_LABEL_CLASS}>
                Files planned
              </div>
              <div className="mt-1 text-sm text-card-foreground">
                {progress.totalFiles}
              </div>
            </div>
            <div className={LIBRARY_CONTEXT_METRIC_CLASS}>
              <div className={COMPACT_METRIC_LABEL_CLASS}>
                Downloaded
              </div>
              <div className="mt-1 text-sm text-status-success-foreground">
                {progress.downloadedFiles}
              </div>
            </div>
            <div className={LIBRARY_CONTEXT_METRIC_CLASS}>
              <div className={COMPACT_METRIC_LABEL_CLASS}>
                Skipped existing
              </div>
              <div className="mt-1 text-sm text-card-foreground">
                {progress.skippedExistingFiles}
              </div>
            </div>
          </div>

          <div className={PANEL_META_ROW_CLASS}>
            <span>
              Active workers: {progress.activeDownloads} /{" "}
              {maxParallelDownloads}
            </span>
            <span>Renamed: {progress.renamedFiles}</span>
            <span>Failed: {progress.failedFiles}</span>
          </div>

          <p className={PANEL_HELP_TEXT_CLASS}>
            Current title:{" "}
            <span className="font-medium text-card-foreground">
              {progress.currentTitle || "Finalizing manifest"}
            </span>
          </p>
          {progress.currentFile && (
            <p className="mt-1 text-xs text-muted-foreground">
              Current file:{" "}
              <span className={MONO_INLINE_TEXT_CLASS}>{progress.currentFile}</span>
            </p>
          )}
        </div>
      )}

      {summary && (
        <div className={COMPACT_INFO_PANEL_CLASS}>
          <div className={PAGE_ACTION_ROW_CLASS}>
            <span className="flex items-center gap-1">
              <Download className="h-3.5 w-3.5" />
              Downloaded: {summary.downloadedFiles}
            </span>
            <span>Skipped existing: {summary.skippedExistingFiles}</span>
            <span>Renamed: {summary.renamedFiles}</span>
            <span>Failed: {summary.failedFiles}</span>
          </div>
          <p className="mt-2 text-muted-foreground">
            Manifest: <span className={MONO_INLINE_TEXT_CLASS}>{summary.manifestPath}</span>
          </p>
        </div>
      )}
    </div>
  );
}
