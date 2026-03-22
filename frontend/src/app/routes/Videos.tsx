/**
 * Video library route grouped by subproduct downloads.
 */
import { useMemo, useState } from "react";
import { Loader2, Download, Film } from "lucide-react";
import { ColumnDef, RowSelectionState } from "@tanstack/react-table";

import { useLibraryData, useViewerConfig } from "../../data/api";
import { buildDownloadPlan } from "../../data/downloadPlanning";
import {
  applyProductFilters,
  buildDescriptionSnippet,
  buildSubproductItems,
  getFilterOptions,
  isVideoPlatform,
} from "../../data/selectors";
import { formatBytes, formatDate } from "../../utils/format";
import { DataTable } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { ProductCell } from "../../components/ProductCell";
import SubproductInfoLink from "../../components/SubproductInfoLink";
import { Tooltip } from "../../components/ui/tooltip";
import FilterBar, { type FilterBarField } from "../../components/FilterBar";
import { useFilters } from "../../state/filters";
import { Download as DownloadRecord } from "../../data/types";
import AdvancedManagedSyncPanel from "../../components/AdvancedManagedSyncPanel";
import {
  collectDownloadUrls,
  filterDownloadsByLabel,
  getDownloadLabel,
  getLinkStatus,
  hasExpiredLinks,
  hasExpiringSoonLinks,
  triggerDownloadUrls,
} from "../../utils/downloads";
import ExpiredLinkDialog from "../../components/ExpiredLinkDialog";
import DownloadRouteEmptyState from "../../components/DownloadRouteEmptyState";

interface VideoRow {
  id: string;
  subproductName: string;
  sourceBundle: string;
  infoUrl?: string;
  authorSummary?: string;
  publisher?: string;
  descriptionSnippet?: string;
  formats: string[];
  totalSize: string;
  dateAcquired: string;
  downloads: DownloadRecord[];
}

const VIDEO_FILTER_FIELDS: FilterBarField[] = ["category", "dateRange"];

/**
 * Video view with format-aware download buttons.
 */
export default function Videos() {
  const { data, isLoading, error } = useLibraryData();
  const { data: viewerConfig } = useViewerConfig();
  const { filters, setFilters } = useFilters();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedFormat, setSelectedFormat] = useState("");
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const [bulkPlannerBusy, setBulkPlannerBusy] = useState<
    "format" | "smallest" | "largest" | null
  >(null);
  const [bulkPlannerError, setBulkPlannerError] = useState<string | null>(null);
  const expiringSoonMs =
    (viewerConfig?.link_expiry_warning_hours ?? 24) * 60 * 60 * 1000;

  const options = useMemo(() => {
    if (!data) return { categories: [], platforms: [], keyTypes: [] };
    return getFilterOptions(data.products);
  }, [data]);

  const videos = useMemo(() => {
    if (!data?.products) return [];

    const filteredProducts = applyProductFilters(data.products, filters, {
      keyType: null,
      keyPresence: null,
      downloadPresence: null,
      platform: null,
    });
    const subproductItems = buildSubproductItems(filteredProducts);

    return subproductItems
      .filter((item) =>
        item.downloads.some((download) => isVideoPlatform(download.platform)),
      )
      .map((item) => {
        const videoDownloads = item.downloads.filter((download) =>
          isVideoPlatform(download.platform),
        );
        const formats = Array.from(
          new Set(
            videoDownloads.map((download) =>
              getDownloadLabel(download, "contentLabel"),
            ),
          ),
        );
        const size = videoDownloads.reduce(
          (sum, download) => sum + (download.size_bytes || 0),
          0,
        );

        return {
          id: item.id,
          subproductName: item.subproductName || "Unknown Title",
          sourceBundle: item.parentName || "Unknown Bundle",
          infoUrl: item.infoUrl,
          authorSummary: item.authorSummary,
          publisher: item.publisher,
          descriptionSnippet: buildDescriptionSnippet(
            item.descriptionSnippet,
            180,
          ),
          formats,
          totalSize: formatBytes(size),
          dateAcquired: item.product.created_at || "",
          downloads: videoDownloads,
        } satisfies VideoRow;
      });
  }, [data, filters]);

  const uniqueFormats = useMemo(() => {
    const counts = new Map<string, number>();
    videos.forEach((video) => {
      video.downloads.forEach((download) => {
        const key = getDownloadLabel(download, "contentLabel");
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return Array.from(counts.keys()).sort((a, b) => {
      const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
  }, [videos]);

  const selectedRows = useMemo(
    () => videos.filter((row) => rowSelection[row.id]),
    [videos, rowSelection],
  );
  const selectedCount = selectedRows.length;
  const selectedDownloads = useMemo(
    () => selectedRows.flatMap((row) => row.downloads),
    [selectedRows],
  );
  const hasExpiredSelection = useMemo(
    () => hasExpiredLinks(selectedDownloads, expiringSoonMs),
    [selectedDownloads, expiringSoonMs],
  );
  const hasExpiringSelection = useMemo(
    () => hasExpiringSoonLinks(selectedDownloads, expiringSoonMs),
    [selectedDownloads, expiringSoonMs],
  );
  const bulkPlannerActive = bulkPlannerBusy !== null;

  const triggerPlannedBulkDownload = async (
    busyState: "format" | "smallest" | "largest",
    options: {
      sizePolicy: "all" | "smallest" | "largest";
    },
    selectedLabel?: string,
  ) => {
    setBulkPlannerError(null);
    setBulkPlannerBusy(busyState);
    try {
      const plan = await buildDownloadPlan(
        selectedRows
          .map((row) => {
            const downloads =
              selectedLabel ?
                filterDownloadsByLabel(
                  row.downloads,
                  selectedLabel,
                  "contentLabel",
                )
              : row.downloads;
            return downloads.length ?
                {
                  titleId: row.id,
                  title: row.subproductName,
                  sourceBundle: row.sourceBundle,
                  downloads,
                }
              : null;
          })
          .filter(Boolean) as {
          titleId: string;
          title: string;
          sourceBundle: string;
          downloads: DownloadRecord[];
        }[],
        options,
      );

      if (
        plan.some(
          (entry) => getLinkStatus(entry.url, expiringSoonMs) === "expired",
        )
      ) {
        setShowExpiredDialog(true);
        return;
      }

      triggerDownloadUrls(Array.from(new Set(plan.map((entry) => entry.url))));
    } catch (error) {
      setBulkPlannerError(
        error instanceof Error ?
          error.message
        : "Unable to plan the selected downloads.",
      );
    } finally {
      setBulkPlannerBusy(null);
    }
  };

  const columns: ColumnDef<VideoRow>[] = [
    { accessorKey: "subproductName", header: "Video Title" },
    {
      accessorKey: "authorSummary",
      header: "Author",
      cell: ({ row }) => (
        <div className="whitespace-normal break-words text-sm text-slate-200">
          {row.original.authorSummary || "—"}
          {row.original.publisher && (
            <div className="text-xs text-slate-400">
              {row.original.publisher}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "infoUrl",
      header: "Info",
      cell: ({ getValue, row }) => (
        <SubproductInfoLink
          url={getValue() as string | undefined}
          label={`Open info page for ${row.original.subproductName}`}
        />
      ),
    },
    {
      accessorKey: "descriptionSnippet",
      header: "Summary",
      cell: ({ row }) => (
        <Tooltip
          content={
            row.original.descriptionSnippet || "No summary metadata yet"
          }>
          <p className="line-clamp-3 whitespace-normal break-words text-xs text-slate-300">
            {row.original.descriptionSnippet || "No summary metadata yet"}
          </p>
        </Tooltip>
      ),
    },
    {
      accessorKey: "sourceBundle",
      header: "Source Bundle",
      cell: ProductCell,
    },
    {
      accessorKey: "dateAcquired",
      header: "Date Acquired",
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      accessorKey: "formats",
      header: "Formats",
      cell: ({ getValue }) => (getValue() as string[]).join(", "),
    },
    { accessorKey: "totalSize", header: "Total Size" },
    {
      accessorKey: "downloads",
      header: "Downloads",
      cell: ({ getValue }) => {
        const downloads = getValue() as DownloadRecord[];
        return (
          <div className="flex flex-wrap items-start gap-1.5">
            <Tooltip content="Download all formats for this title">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                disabled={!downloads.length}
                onClick={() => {
                  if (hasExpiredLinks(downloads, expiringSoonMs)) {
                    setShowExpiredDialog(true);
                    return;
                  }
                  triggerDownloadUrls(collectDownloadUrls(downloads));
                }}>
                <Download className="mr-1 h-3 w-3" />
                All
              </Button>
            </Tooltip>
            {uniqueFormats.map((format) => {
              const match = downloads.find(
                (download) =>
                  getDownloadLabel(download, "contentLabel") === format,
              );

              if (!match) {
                return (
                  <Button
                    key={format}
                    variant="ghost"
                    size="sm"
                    disabled
                    className="h-7 text-xs opacity-20 cursor-default border border-dashed border-slate-700">
                    {format}
                  </Button>
                );
              }

              const status = getLinkStatus(match.url, expiringSoonMs);
              const statusClass =
                status === "expired" ? "border-rose-500/60 text-rose-200"
                : status === "expiring" ? "border-amber-400/60 text-amber-200"
                : "";

              return (
                <Tooltip
                  key={format}
                  content={`${format} • ${formatBytes(match.size_bytes)}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-7 text-xs ${statusClass}`}
                    onClick={() => {
                      if (status === "expired") {
                        setShowExpiredDialog(true);
                        return;
                      }
                      triggerDownloadUrls(collectDownloadUrls([match]));
                    }}>
                    <Download className="mr-1 h-3 w-3" />
                    {format}
                  </Button>
                </Tooltip>
              );
            })}
          </div>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        Failed to load library data.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Film className="h-8 w-8 text-primary" />
          Video Library
        </h2>
        <p className="text-muted-foreground">
          Review {videos.length} video titles with format-aware browser
          downloads and local sync options.
        </p>
      </div>

      <FilterBar
        categories={options.categories}
        platforms={options.platforms}
        keyTypes={options.keyTypes}
        fields={VIDEO_FILTER_FIELDS}
      />

      {!videos.length && <DownloadRouteEmptyState routeLabel="Videos" />}

      {!!videos.length && (
        <>
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  Selected titles: {selectedCount}
                </p>
                <p className="text-xs text-slate-400">
                  Bulk download across selected video titles.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-xs"
                  disabled={
                    !selectedCount || hasExpiredSelection || bulkPlannerActive
                  }
                  onClick={() => {
                    if (hasExpiredSelection) {
                      setShowExpiredDialog(true);
                      return;
                    }
                    triggerDownloadUrls(
                      collectDownloadUrls(
                        selectedRows.flatMap((row) => row.downloads),
                      ),
                    );
                  }}>
                  Download all
                </Button>
                <select
                  className="h-8 rounded-md border border-slate-800 bg-slate-950 px-2 text-xs text-slate-100"
                  value={selectedFormat}
                  onChange={(event) => setSelectedFormat(event.target.value)}
                  disabled={!selectedCount || bulkPlannerActive}
                  aria-label="Download format">
                  <option value="">Select format</option>
                  {uniqueFormats.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={
                    !selectedCount || !selectedFormat || bulkPlannerActive
                  }
                  onClick={() => {
                    void triggerPlannedBulkDownload(
                      "format",
                      {
                        sizePolicy: "all",
                      },
                      selectedFormat,
                    );
                  }}>
                  {bulkPlannerBusy === "format" && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  Download format
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={
                    !selectedCount || hasExpiredSelection || bulkPlannerActive
                  }
                  onClick={() => {
                    void triggerPlannedBulkDownload("smallest", {
                      sizePolicy: "smallest",
                    });
                  }}>
                  {bulkPlannerBusy === "smallest" && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  Smallest
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={
                    !selectedCount || hasExpiredSelection || bulkPlannerActive
                  }
                  onClick={() => {
                    void triggerPlannedBulkDownload("largest", {
                      sizePolicy: "largest",
                    });
                  }}>
                  {bulkPlannerBusy === "largest" && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  Largest
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Downloads open in your browser and save to this device using the
              browser's normal download location. Browsers may prompt before
              allowing multiple file downloads.
              {hasExpiringSelection && " Some selected links expire soon."}
            </p>
            {bulkPlannerError && (
              <p className="mt-2 text-xs text-rose-300">{bulkPlannerError}</p>
            )}
          </div>

          <AdvancedManagedSyncPanel
            rows={videos.map((row) => ({
              id: row.id,
              subproductName: row.subproductName,
              sourceBundle: row.sourceBundle,
              downloads: row.downloads,
            }))}
            selectedRows={selectedRows.map((row) => ({
              id: row.id,
              subproductName: row.subproductName,
              sourceBundle: row.sourceBundle,
              downloads: row.downloads,
            }))}
            uniqueFormats={uniqueFormats}
            expiringSoonMs={expiringSoonMs}
            onExpiredLinks={() => setShowExpiredDialog(true)}
            mediaLabel="video"
            formatStrategy="contentLabel"
            pickerId="hb-library-viewer-managed-sync-videos"
          />

          <DataTable
            columns={columns}
            data={videos}
            globalFilter={filters.search}
            onGlobalFilterChange={(search) => setFilters({ search })}
            searchPlaceholder="Search video titles, authors, bundles, or summaries"
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            getRowId={(row) => row.id}
          />
        </>
      )}

      <ExpiredLinkDialog
        isOpen={showExpiredDialog}
        onClose={() => setShowExpiredDialog(false)}
      />
    </div>
  );
}
