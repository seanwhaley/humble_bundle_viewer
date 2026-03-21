/**
 * Audiobook library route grouped by audio download formats.
 */
import { useMemo, useState } from "react";
import { Loader2, Download, Headphones } from "lucide-react";
import { ColumnDef, RowSelectionState } from "@tanstack/react-table";

import { useLibraryData, useViewerConfig } from "../../data/api";
import { buildDownloadPlan } from "../../data/downloadPlanning";
import {
  applyProductFilters,
  buildDescriptionSnippet,
  buildSuborders,
  getFilterOptions,
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

interface AudiobookRow {
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

const AUDIOBOOK_FILTER_FIELDS: FilterBarField[] = ["category", "dateRange"];

/**
 * Audiobook view with format-aware download buttons.
 */
export default function Audiobooks() {
  const { data, isLoading, error } = useLibraryData();
  const { data: viewerConfig } = useViewerConfig();
  const { filters, setFilters } = useFilters();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedFormat, setSelectedFormat] = useState("");
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const [bulkPlannerBusy, setBulkPlannerBusy] = useState<
    "smallest" | "largest" | null
  >(null);
  const [bulkPlannerError, setBulkPlannerError] = useState<string | null>(null);
  const expiringSoonMs =
    (viewerConfig?.link_expiry_warning_hours ?? 24) * 60 * 60 * 1000;

  const options = useMemo(() => {
    if (!data) return { categories: [], platforms: [], keyTypes: [] };
    return getFilterOptions(data.products);
  }, [data]);

  const audiobooks = useMemo(() => {
    if (!data?.products) return [];

    const filteredProducts = applyProductFilters(data.products, filters, {
      keyType: null,
      keyPresence: null,
      downloadPresence: null,
      platform: null,
    });
    const allSuborders = buildSuborders(filteredProducts);

    return allSuborders
      .filter((item) => item.downloads.some((d) => d.platform === "audio"))
      .map((item) => {
        const audioDownloads = item.downloads.filter(
          (d) => d.platform === "audio",
        );
        const formats = Array.from(
          new Set(
            audioDownloads.map((d) => getDownloadLabel(d, "contentLabel")),
          ),
        );
        const size = audioDownloads.reduce(
          (sum, d) => sum + (d.size_bytes || 0),
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
          downloads: audioDownloads,
        };
      });
  }, [data, filters]);

  const uniqueFormats = useMemo(() => {
    const counts = new Map<string, number>();
    audiobooks.forEach((book) => {
      book.downloads.forEach((d) => {
        const label = getDownloadLabel(d, "contentLabel");
        counts.set(label, (counts.get(label) || 0) + 1);
      });
    });

    return Array.from(counts.keys()).sort((a, b) => {
      const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
  }, [audiobooks]);

  const selectedRows = useMemo(
    () => audiobooks.filter((row) => rowSelection[row.id]),
    [audiobooks, rowSelection],
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
    sizePolicy: "smallest" | "largest",
  ) => {
    if (hasExpiredSelection) {
      setShowExpiredDialog(true);
      return;
    }

    setBulkPlannerError(null);
    setBulkPlannerBusy(sizePolicy);
    try {
      const plan = await buildDownloadPlan(
        selectedRows.map((row) => ({
          titleId: row.id,
          title: row.subproductName,
          sourceBundle: row.sourceBundle,
          downloads: row.downloads,
        })),
        { sizePolicy },
      );

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

  const columns: ColumnDef<AudiobookRow>[] = [
    { accessorKey: "subproductName", header: "Title" },
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
              // Find download matching this format label
              const dl = downloads.find(
                (d) => getDownloadLabel(d, "contentLabel") === format,
              );

              if (dl) {
                const status = getLinkStatus(dl.url, expiringSoonMs);
                const statusClass =
                  status === "expired" ? "border-rose-500/60 text-rose-200"
                  : status === "expiring" ? "border-amber-400/60 text-amber-200"
                  : "";
                return (
                  <Tooltip
                    key={format}
                    content={`${format} • ${formatBytes(dl.size_bytes)}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-7 text-xs ${statusClass}`}
                      onClick={() => {
                        if (status === "expired") {
                          setShowExpiredDialog(true);
                          return;
                        }
                        triggerDownloadUrls(collectDownloadUrls([dl]));
                      }}>
                      <>
                        <Download className="mr-1 h-3 w-3" />
                        {format}
                      </>
                    </Button>
                  </Tooltip>
                );
              }

              // Placeholder
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
          <Headphones className="h-8 w-8 text-primary" />
          Audiobook Library
        </h2>
        <p className="text-muted-foreground">
          Listen to your collection of {audiobooks.length} audiobooks, with
          direct links to each title's external info page when Humble provides
          one.
        </p>
      </div>

      <FilterBar
        categories={options.categories}
        platforms={options.platforms}
        keyTypes={options.keyTypes}
        fields={AUDIOBOOK_FILTER_FIELDS}
      />

      {!audiobooks.length && (
        <DownloadRouteEmptyState routeLabel="Audiobooks" />
      )}

      {!!audiobooks.length && (
        <>
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  Selected titles: {selectedCount}
                </p>
                <p className="text-xs text-slate-400">
                  Bulk download across selected titles.
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
                    !selectedCount ||
                    !selectedFormat ||
                    hasExpiredSelection ||
                    bulkPlannerActive
                  }
                  onClick={() => {
                    const items = selectedRows
                      .map((row) => {
                        const downloads = filterDownloadsByLabel(
                          row.downloads,
                          selectedFormat,
                          "contentLabel",
                        );
                        return downloads.length ?
                            {
                              title_id: row.id,
                              title: row.subproductName,
                              downloads,
                            }
                          : null;
                      })
                      .filter(Boolean) as {
                      title_id: string;
                      title: string;
                      downloads: DownloadRecord[];
                    }[];
                    if (
                      hasExpiredLinks(
                        items.flatMap((item) => item.downloads),
                        expiringSoonMs,
                      )
                    ) {
                      setShowExpiredDialog(true);
                      return;
                    }
                    triggerDownloadUrls(
                      collectDownloadUrls(
                        items.flatMap((item) => item.downloads),
                      ),
                    );
                  }}>
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
                    void triggerPlannedBulkDownload("smallest");
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
                    void triggerPlannedBulkDownload("largest");
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
            rows={audiobooks.map((row) => ({
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
            mediaLabel="audiobook"
            formatStrategy="contentLabel"
            pickerId="hb-library-viewer-managed-sync-audiobooks"
          />

          <DataTable
            columns={columns}
            data={audiobooks}
            globalFilter={filters.search}
            onGlobalFilterChange={(search) => setFilters({ search })}
            searchPlaceholder="Search audiobook titles, authors, bundles, or summaries"
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
