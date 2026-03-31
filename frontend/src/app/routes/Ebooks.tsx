/**
 * Ebook library route grouped by subproduct downloads.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Download,
  ChevronDown,
  ChevronRight,
  FileText,
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react";
import { ColumnDef, RowSelectionState } from "@tanstack/react-table";

import { useLibraryData, useViewerConfig } from "../../data/api";
import { buildDownloadPlan } from "../../data/downloadPlanning";
import {
  applyProductFilters,
  buildSuborders,
  getFilterOptions,
} from "../../data/selectors";
import { formatBytes, formatDate, formatNumber } from "../../utils/format";
import { DataTable } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
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

interface EbookRow {
  id: string;
  subproductName: string;
  authorSummary: string;
  descriptionSnippet: string;
  sourceBundle: string;
  infoUrl?: string;
  viewerPagePath?: string;
  formats: string[];
  totalSize: string;
  dateAcquired: string;
  dateAcquiredLabel: string;
  sizeBytes: number;
  downloads: DownloadRecord[];
}

const FILTER_SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const EBOOK_FILTER_FIELDS: FilterBarField[] = ["category", "dateRange"];

/**
 * Ebook view with format-aware download buttons.
 */
export default function Ebooks() {
  const { data, isLoading, error } = useLibraryData();
  const { data: viewerConfig } = useViewerConfig();
  const { filters, setFilters } = useFilters();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedFormat, setSelectedFormat] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [showPageFilters, setShowPageFilters] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showManagedSync, setShowManagedSync] = useState(false);
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

  const ebooks = useMemo(() => {
    if (!data?.products) return [];

    const filteredProducts = applyProductFilters(data.products, filters, {
      keyType: null,
      keyPresence: null,
      downloadPresence: null,
      platform: null,
    });
    const allSuborders = buildSuborders(filteredProducts);

    return allSuborders
      .filter((item) =>
        item.downloads.some((download) => download.platform === "ebook"),
      )
      .map((item) => {
        const ebookDownloads = item.downloads.filter(
          (download) => download.platform === "ebook",
        );
        const formats = Array.from(
          new Set(
            ebookDownloads.map((download) =>
              getDownloadLabel(download, "contentLabel"),
            ),
          ),
        );
        const size = ebookDownloads.reduce(
          (sum, download) => sum + (download.size_bytes || 0),
          0,
        );
        const dateAcquired = item.product.created_at || "";
        const dateAcquiredLabel = formatDate(dateAcquired);
        const totalSize = formatBytes(size);

        return {
          id: item.id,
          subproductName: item.subproductName || "Unknown Title",
          authorSummary: item.authorSummary || "—",
          descriptionSnippet: item.descriptionSnippet || "—",
          sourceBundle: item.parentName || "Unknown Bundle",
          infoUrl: item.infoUrl,
          viewerPagePath: item.viewerPagePath,
          formats,
          totalSize,
          sizeBytes: size,
          dateAcquired,
          dateAcquiredLabel,
          downloads: ebookDownloads,
        };
      });
  }, [data, filters]);

  const uniqueFormats = useMemo(() => {
    const counts = new Map<string, number>();
    ebooks.forEach((book) => {
      book.downloads.forEach((download) => {
        const format = getDownloadLabel(download, "contentLabel");
        counts.set(format, (counts.get(format) || 0) + 1);
      });
    });

    return Array.from(counts.keys()).sort((a, b) => {
      const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
  }, [ebooks]);

  const filteredEbooks = useMemo(() => {
    return ebooks.filter((book) => {
      const matchesFormat =
        !formatFilter || book.formats.includes(formatFilter);
      const matchesAuthor =
        !authorFilter ||
        (book.authorSummary || "")
          .toLowerCase()
          .includes(authorFilter.trim().toLowerCase());

      return matchesFormat && matchesAuthor;
    });
  }, [authorFilter, ebooks, formatFilter]);

  const selectedRows = useMemo(
    () => filteredEbooks.filter((row) => rowSelection[row.id]),
    [filteredEbooks, rowSelection],
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
    () =>
      [
        filters.category,
        filters.startDate || filters.endDate,
        formatFilter,
        authorFilter,
      ].filter(Boolean).length,
    [
      authorFilter,
      filters.category,
      filters.startDate,
      filters.endDate,
      formatFilter,
    ],
  );
  const showFiltersPanel = showPageFilters || activePageFilterCount > 0;
  const showBulkActionsPanel =
    showBulkActions || selectedCount > 0 || bulkPlannerError !== null;
  const bulkPlannerActive = bulkPlannerBusy !== null;

  const scopedBulkFormats = useMemo(() => {
    const sourceRows = selectedCount > 0 ? selectedRows : filteredEbooks;
    const counts = new Map<string, number>();
    sourceRows.forEach((book) => {
      book.downloads.forEach((download) => {
        const format = getDownloadLabel(download, "contentLabel");
        counts.set(format, (counts.get(format) || 0) + 1);
      });
    });

    return Array.from(counts.keys()).sort((a, b) => {
      const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
  }, [filteredEbooks, selectedCount, selectedRows]);

  useEffect(() => {
    if (selectedFormat && !scopedBulkFormats.includes(selectedFormat)) {
      setSelectedFormat("");
    }
  }, [scopedBulkFormats, selectedFormat]);

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

  const renderRowDownloads = (downloads: DownloadRecord[]) => {
    const orderedDownloads = uniqueFormats
      .map((format) =>
        downloads.find(
          (item) =>
            item.url && getDownloadLabel(item, "contentLabel") === format,
        ),
      )
      .filter((download): download is DownloadRecord => Boolean(download?.url));

    if (!orderedDownloads.length) {
      return (
        <span className="text-[11px] text-slate-500">
          No active download links
        </span>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Tooltip content="Download all available formats for this title">
          <Button
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              if (hasExpiredLinks(orderedDownloads, expiringSoonMs)) {
                setShowExpiredDialog(true);
                return;
              }
              triggerDownloadUrls(collectDownloadUrls(orderedDownloads));
            }}>
            All
          </Button>
        </Tooltip>
        {orderedDownloads.map((download) => {
          const format = getDownloadLabel(download, "contentLabel");
          const status = getLinkStatus(download.url, expiringSoonMs);
          const statusClass =
            status === "expired" ? "border-rose-500/60 text-rose-200"
            : status === "expiring" ? "border-amber-400/60 text-amber-200"
            : "";

          return (
            <Tooltip
              key={`${format}-${download.url}`}
              content={`${format} • ${formatBytes(download.size_bytes)}`}>
              <Button
                variant="outline"
                size="sm"
                className={`h-6 px-2 text-[11px] ${statusClass}`}
                onClick={() => {
                  if (status === "expired") {
                    setShowExpiredDialog(true);
                    return;
                  }
                  triggerDownloadUrls(collectDownloadUrls([download]));
                }}>
                {format}
              </Button>
            </Tooltip>
          );
        })}
      </div>
    );
  };

  const columns: ColumnDef<EbookRow>[] = [
    {
      accessorKey: "subproductName",
      header: "Book Title",
      meta: {
        headerClassName: "w-[18%]",
        cellClassName: "w-[18%]",
      },
      cell: ({ row }) => (
        <div className="whitespace-normal break-words text-sm font-medium text-slate-100">
          {row.original.subproductName}
        </div>
      ),
    },
    {
      accessorKey: "authorSummary",
      header: "Author",
      meta: {
        headerClassName: "w-[12%]",
        cellClassName: "w-[12%]",
      },
      cell: ({ row }) => (
        <div className="line-clamp-3 whitespace-normal break-words text-xs text-slate-300 md:text-sm">
          {row.original.authorSummary}
        </div>
      ),
    },
    {
      accessorKey: "infoUrl",
      header: "Links",
      enableColumnFilter: false,
      enableSorting: false,
      meta: {
        headerClassName: "w-[10%]",
        cellClassName: "w-[10%]",
      },
      cell: ({ getValue, row }) => {
        const officialUrl = getValue() as string | undefined;
        const viewerPageUrl =
          row.original.viewerPagePath ?
            `/api/library/subproduct-page?path=${encodeURIComponent(
              row.original.viewerPagePath,
            )}`
          : undefined;

        if (!officialUrl && !viewerPageUrl) {
          return <span className="text-xs text-slate-500">—</span>;
        }

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {officialUrl && (
              <SubproductInfoLink
                url={officialUrl}
                label={`Open official product page for ${row.original.subproductName}`}
                buttonLabel="Official"
                showLabel
                className="h-7 gap-1.5 px-2 text-xs"
              />
            )}
            {viewerPageUrl && (
              <SubproductInfoLink
                url={viewerPageUrl}
                label={`Open cached viewer page for ${row.original.subproductName}`}
                buttonLabel="Viewer"
                showLabel
                icon={FileText}
                className="h-7 gap-1.5 px-2 text-xs"
              />
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "sourceBundle",
      header: "Source Bundle",
      meta: {
        headerClassName: "w-[14%]",
        cellClassName: "w-[14%]",
      },
      cell: ({ row }) => (
        <div className="line-clamp-3 whitespace-normal break-words text-sm text-slate-200">
          {row.original.sourceBundle}
        </div>
      ),
    },
    {
      accessorKey: "descriptionSnippet",
      header: "Description",
      meta: {
        headerClassName: "w-[18%]",
        cellClassName: "w-[18%]",
      },
      cell: ({ row }) => (
        <p className="line-clamp-3 whitespace-normal break-words text-xs text-slate-400 md:text-sm">
          {row.original.descriptionSnippet}
        </p>
      ),
    },
    {
      accessorKey: "dateAcquired",
      header: "Date Acquired",
      meta: {
        headerClassName: "w-[10%]",
        cellClassName: "w-[10%] whitespace-nowrap",
      },
      cell: ({ row }) => row.original.dateAcquiredLabel,
    },
    {
      accessorKey: "sizeBytes",
      header: "Total Size",
      enableColumnFilter: false,
      meta: {
        headerClassName: "w-[8%]",
        cellClassName: "w-[8%] whitespace-nowrap",
      },
      cell: ({ row }) => row.original.totalSize,
    },
    {
      accessorKey: "downloads",
      header: "Downloads",
      enableColumnFilter: false,
      enableSorting: false,
      meta: {
        headerClassName: "w-[18%]",
        cellClassName: "w-[18%]",
      },
      cell: ({ row }) => renderRowDownloads(row.original.downloads),
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
    <div className="flex w-full flex-col space-y-4">
      <Card className="bg-card/60">
        <CardHeader className="space-y-4 pb-4">
          <div>
            <Badge variant="info">Reader-friendly layout</Badge>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-card-foreground">
              Start with the table, then open filters, browser downloads, or
              local sync only when you need them
            </h2>
            <p className="text-sm text-muted-foreground">
              Keep discovery focused on titles, authors, and metadata first.
              Official product links and cached viewer pages stay visible in the
              table, while heavier route-level controls remain one click away.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Collection view
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {formatNumber(filteredEbooks.length)} eBooks in the current view.
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

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={showFiltersPanel ? "default" : "outline"}
              size="sm"
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
              variant={showBulkActionsPanel ? "default" : "outline"}
              size="sm"
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
              variant={showManagedSync ? "default" : "outline"}
              size="sm"
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
        <FilterBar
          categories={options.categories}
          platforms={options.platforms}
          keyTypes={options.keyTypes}
          fields={EBOOK_FILTER_FIELDS}
          hideHeader
          isExpanded
          className="rounded-lg border-slate-800 bg-slate-900 px-4 py-4"
          onClear={() => {
            setFormatFilter("");
            setAuthorFilter("");
          }}
          extraContent={
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-slate-200">
                  Author
                </label>
                <input
                  className={FILTER_SELECT_CLASS}
                  title="Author"
                  type="text"
                  placeholder="Filter by author"
                  value={authorFilter}
                  onChange={(event) => setAuthorFilter(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-slate-200">
                  Format
                </label>
                <select
                  className={FILTER_SELECT_CLASS}
                  title="Format"
                  value={formatFilter}
                  onChange={(event) => setFormatFilter(event.target.value)}>
                  <option value="">All formats</option>
                  {uniqueFormats.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          }
        />
      )}

      {!filteredEbooks.length && (
        <DownloadRouteEmptyState routeLabel="E-books" />
      )}

      {!!filteredEbooks.length && showBulkActionsPanel && (
        <Card className="bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-base font-semibold text-card-foreground">
                  Bulk browser downloads
                </h3>
                <p className="text-sm text-muted-foreground">
                  Select titles in the table first, then choose whether you want
                  every file, one matching format, or a planned smallest/largest
                  download per title.
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
            <p className="text-xs text-muted-foreground">
              {selectedCount > 0 ?
                "Format choices are scoped to the currently selected titles so the picker stays focused on relevant reader formats."
              : "Select one or more rows in the table to enable bulk downloads and narrow the format list."}
            </p>
            {bulkPlannerError && (
              <p className="text-xs text-rose-300">{bulkPlannerError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {!!filteredEbooks.length && showManagedSync && (
        <AdvancedManagedSyncPanel
          rows={filteredEbooks.map((row) => ({
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
          mediaLabel="eBook"
          formatStrategy="contentLabel"
          pickerId="hb-library-viewer-managed-sync-ebooks"
        />
      )}

      <ExpiredLinkDialog
        isOpen={showExpiredDialog}
        onClose={() => setShowExpiredDialog(false)}
      />

      {!!filteredEbooks.length && (
        <DataTable
          columns={columns}
          data={filteredEbooks}
          globalFilter={filters.search}
          onGlobalFilterChange={(search) => setFilters({ search })}
          searchPlaceholder="Search eBook titles, authors, descriptions, bundles, dates, or sizes"
          enableRowSelection
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          getRowId={(row) => row.id}
          allowHorizontalScroll={false}
        />
      )}
    </div>
  );
}
