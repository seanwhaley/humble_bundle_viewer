/**
 * Audiobook library route grouped by audio download formats.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Download,
  Headphones,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react";
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
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
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
  const [showPageFilters, setShowPageFilters] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showManagedSync, setShowManagedSync] = useState(false);
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
  const activePageFilterCount = useMemo(
    () => [filters.category, filters.startDate || filters.endDate].filter(Boolean).length,
    [filters.category, filters.endDate, filters.startDate],
  );
  const showFiltersPanel = showPageFilters || activePageFilterCount > 0;
  const showBulkActionsPanel =
    showBulkActions || selectedCount > 0 || bulkPlannerError !== null;
  const bulkPlannerActive = bulkPlannerBusy !== null;

  const scopedBulkFormats = useMemo(() => {
    const sourceRows = selectedCount > 0 ? selectedRows : audiobooks;
    const counts = new Map<string, number>();
    sourceRows.forEach((book) => {
      book.downloads.forEach((download) => {
        const label = getDownloadLabel(download, "contentLabel");
        counts.set(label, (counts.get(label) || 0) + 1);
      });
    });

    return Array.from(counts.keys()).sort((a, b) => {
      const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
  }, [audiobooks, selectedCount, selectedRows]);

  useEffect(() => {
    if (selectedFormat && !scopedBulkFormats.includes(selectedFormat)) {
      setSelectedFormat("");
    }
  }, [scopedBulkFormats, selectedFormat]);

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
      <Card className="bg-card/60">
        <CardHeader className="space-y-4 pb-4">
          <div>
            <Badge variant="info">Listen-first layout</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Headphones className="h-6 w-6 text-primary" />
              <h2 className="text-lg font-semibold text-card-foreground">
                Audiobook Library
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Browse titles, authors, and bundle context first. Filters, bulk
              browser downloads, and managed sync stay available, but only take
              over the page when you open them intentionally.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Library scope
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {audiobooks.length} audiobooks in the current view.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Active selection
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {selectedCount} title{selectedCount === 1 ? "" : "s"} selected for route-level actions.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Format coverage
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {scopedBulkFormats.length} formats in the current bulk-download scope.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={showFiltersPanel ? "default" : "outline"}
              className="h-8 gap-2 text-xs"
              aria-expanded={showFiltersPanel}
              onClick={() => setShowPageFilters((current) => !current)}>
              {showFiltersPanel ?
                <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
              <SlidersHorizontal className="h-4 w-4" />
              Filters{activePageFilterCount > 0 ? ` (${activePageFilterCount})` : ""}
            </Button>
            <Button
              size="sm"
              variant={showBulkActionsPanel ? "default" : "outline"}
              className="h-8 gap-2 text-xs"
              aria-expanded={showBulkActionsPanel}
              onClick={() => setShowBulkActions((current) => !current)}>
              {showBulkActionsPanel ?
                <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
              <Download className="h-4 w-4" />
              Bulk browser downloads{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </Button>
            <Button
              size="sm"
              variant={showManagedSync ? "default" : "outline"}
              className="h-8 gap-2 text-xs"
              aria-expanded={showManagedSync}
              onClick={() => setShowManagedSync((current) => !current)}>
              {showManagedSync ?
                <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
              <ShieldCheck className="h-4 w-4" />
              Advanced local sync
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Downloads still use your browser’s normal save flow. Browsers may
            prompt before allowing multiple files to open at once.
            {hasExpiringSelection && " Some selected links expire soon."}
          </p>
        </CardContent>
      </Card>

      {showFiltersPanel && (
        <Card className="bg-card/60">
          <CardHeader className="pb-3">
            <h3 className="text-base font-semibold text-card-foreground">
              Narrow the listening queue before you download
            </h3>
            <p className="text-sm text-muted-foreground">
              Filter by category or acquisition date first so the table and bulk
              actions stay focused on the titles you actually want.
            </p>
          </CardHeader>
          <CardContent>
            <FilterBar
              categories={options.categories}
              platforms={options.platforms}
              keyTypes={options.keyTypes}
              fields={AUDIOBOOK_FILTER_FIELDS}
            />
          </CardContent>
        </Card>
      )}

      {!audiobooks.length && (
        <DownloadRouteEmptyState routeLabel="Audiobooks" />
      )}

      {!!audiobooks.length && (
        <>
          {showBulkActionsPanel && (
            <Card className="bg-card/60">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-card-foreground">
                      Bulk browser downloads
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Select rows in the table first, then choose whether you
                      want every file, one matching format, or a planned
                      smallest/largest download per title.
                    </p>
                  </div>
                  <Badge variant={selectedCount > 0 ? "success" : "neutral"}>
                    Selected titles: {selectedCount}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  value={selectedFormat}
                  onChange={(event) => setSelectedFormat(event.target.value)}
                  disabled={!selectedCount || bulkPlannerActive}
                  aria-label="Download format">
                  <option value="">Select format</option>
                  {scopedBulkFormats.map((format) => (
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
                <p className="text-xs text-muted-foreground">
                  {selectedCount > 0 ?
                    "Format choices are scoped to the currently selected titles so the picker stays relevant to the audiobook set you chose."
                  : "Select one or more rows in the table to enable bulk downloads and narrow the format list."}
                </p>
                {bulkPlannerError && (
                  <p className="text-xs text-rose-300">{bulkPlannerError}</p>
                )}
              </CardContent>
            </Card>
          )}

          {showManagedSync && (
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
          )}

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
