/**
 * Video library route grouped by subproduct downloads.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Download,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
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
import { cn } from "../../lib/utils";
import { formatBytes, formatDate, formatNumber } from "../../utils/format";
import { DataTable } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import PageFiltersButton from "../../components/ui/PageFiltersButton";
import PaneHeader from "../../components/ui/PaneHeader";
import { RouteErrorState, RouteLoadingState } from "../../components/ui/RouteState";
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
import {
  COMPACT_ACTION_BUTTON_CLASS,
  COMPACT_ACTION_BUTTON_WITH_GAP_CLASS,
  COMPACT_FORM_SELECT_CLASS,
  CONTENT_BODY_TEXT_CLASS,
  CONTENT_PREVIEW_TEXT_CLASS,
  DOWNLOAD_ACTION_BAR_CLASS,
  DOWNLOAD_ACTION_BUTTON_CLASS,
  DOWNLOAD_PLACEHOLDER_BUTTON_CLASS,
  INSET_PANEL_COMPACT_CLASS,
  INSET_PANEL_BODY_TEXT_CLASS,
  SECTION_EYEBROW_CLASS,
  SECTION_TITLE_CLASS,
} from "../../styles/roles";
import { DOWNLOAD_ACTION_STATUS_CLASS } from "../../styles/status";
import {
  GRID_THREE_COLUMN_CLASS,
  PAGE_ACTION_ROW_CLASS,
  PAGE_STACK_TIGHT_CLASS,
  PANEL_ERROR_TEXT_CLASS,
  PANEL_HEADER_SPLIT_ROW_CLASS,
  PANEL_HELP_TEXT_CLASS,
} from "../../styles/page";
import { usePageHeaderActions } from "../layout/PageHeaderContext";

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
  const activePageFilterCount = useMemo(
    () => [filters.category, filters.startDate || filters.endDate].filter(Boolean).length,
    [filters.category, filters.endDate, filters.startDate],
  );
  const showFiltersPanel = showPageFilters || activePageFilterCount > 0;
  const showBulkActionsPanel =
    showBulkActions || selectedCount > 0 || bulkPlannerError !== null;
  const bulkPlannerActive = bulkPlannerBusy !== null;
  const headerActions = useMemo(
    () => (
      <PageFiltersButton
        expanded={showFiltersPanel}
        activeCount={activePageFilterCount}
        onClick={() => setShowPageFilters((current) => !current)}
      />
    ),
    [activePageFilterCount, showFiltersPanel],
  );
  usePageHeaderActions(headerActions);

  const scopedBulkFormats = useMemo(() => {
    const sourceRows = selectedCount > 0 ? selectedRows : videos;
    const counts = new Map<string, number>();
    sourceRows.forEach((video) => {
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
  }, [selectedCount, selectedRows, videos]);

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

  const columns: ColumnDef<VideoRow>[] = [
    { accessorKey: "subproductName", header: "Video Title" },
    {
      accessorKey: "authorSummary",
      header: "Author",
      cell: ({ row }) => (
        <div className={CONTENT_BODY_TEXT_CLASS}>
          {row.original.authorSummary || "—"}
          {row.original.publisher && (
            <div className="text-xs text-muted-foreground">
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
          <p className={CONTENT_PREVIEW_TEXT_CLASS}>
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
          <div className={DOWNLOAD_ACTION_BAR_CLASS}>
            <Tooltip content="Download all formats for this title">
              <Button
                variant="secondary"
                size="sm"
                className={DOWNLOAD_ACTION_BUTTON_CLASS}
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
                    className={DOWNLOAD_PLACEHOLDER_BUTTON_CLASS}>
                    {format}
                  </Button>
                );
              }

              const status = getLinkStatus(match.url, expiringSoonMs);

              return (
                <Tooltip
                  key={format}
                  content={`${format} • ${formatBytes(match.size_bytes)}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      DOWNLOAD_ACTION_BUTTON_CLASS,
                      DOWNLOAD_ACTION_STATUS_CLASS[status],
                    )}
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
    return <RouteLoadingState label="Loading videos…" />;
  }

  if (error) {
    return <RouteErrorState message="Failed to load library data." />;
  }

  return (
    <div className={PAGE_STACK_TIGHT_CLASS}>
      <Card surface="panel">
        <CardHeader className="pb-4">
          <PaneHeader
            titleAs="h2"
            title="Review the video library before you download or sync"
            description="Use the table to compare titles, summaries, formats, and bundle context first. Bulk browser downloads and advanced local sync stay available without crowding the primary browsing view."
            eyebrow={<Badge variant="info">Video workflow</Badge>}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={GRID_THREE_COLUMN_CLASS}>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                Titles in scope
              </p>
              <p className={INSET_PANEL_BODY_TEXT_CLASS}>
                {formatNumber(videos.length)} video title{videos.length === 1 ? "" : "s"} match the current filters.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                Selected now
              </p>
              <p className={INSET_PANEL_BODY_TEXT_CLASS}>
                {formatNumber(selectedCount)} title{selectedCount === 1 ? "" : "s"} are selected for route-level actions.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                Formats in scope
              </p>
              <p className={INSET_PANEL_BODY_TEXT_CLASS}>
                {formatNumber(scopedBulkFormats.length)} format{scopedBulkFormats.length === 1 ? "" : "s"} are available in the current bulk-download scope.
              </p>
            </div>
          </div>

          <div className={PAGE_ACTION_ROW_CLASS}>
            <Button
              size="sm"
              variant={showBulkActionsPanel ? "default" : "outline"}
              className={COMPACT_ACTION_BUTTON_WITH_GAP_CLASS}
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
              className={COMPACT_ACTION_BUTTON_WITH_GAP_CLASS}
              aria-expanded={showManagedSync}
              onClick={() => setShowManagedSync((current) => !current)}>
              {showManagedSync ?
                <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
              <ShieldCheck className="h-4 w-4" />
              Advanced local sync
            </Button>
          </div>

          <p className={PANEL_HELP_TEXT_CLASS}>
            Downloads still use your browser’s normal save flow. Browsers may
            prompt before allowing multiple files to open at once. Bulk browser
            downloads and advanced local sync both follow the titles currently
            selected in the table.
            {hasExpiringSelection && " Some selected links expire soon."}
          </p>
        </CardContent>
      </Card>

      {showFiltersPanel && (
        <Card surface="panel">
          <CardHeader className="pb-3">
            <h3 className={SECTION_TITLE_CLASS}>
              Narrow the video shelf before you download
            </h3>
            <p className="text-sm text-muted-foreground">
              Filter by category or acquisition date first so the table and bulk
              actions stay focused on the videos you actually want.
            </p>
          </CardHeader>
          <CardContent>
            <FilterBar
              categories={options.categories}
              platforms={options.platforms}
              keyTypes={options.keyTypes}
              fields={VIDEO_FILTER_FIELDS}
            />
          </CardContent>
        </Card>
      )}

      {!videos.length && <DownloadRouteEmptyState routeLabel="Videos" />}

      {!!videos.length && (
        <>
          {showBulkActionsPanel && (
            <Card surface="panel">
              <CardHeader className="pb-3">
                <div className={PANEL_HEADER_SPLIT_ROW_CLASS}>
                  <div>
                    <h3 className={SECTION_TITLE_CLASS}>
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
                <div className={PAGE_ACTION_ROW_CLASS}>
                <Button
                  size="sm"
                  variant="default"
                  className={COMPACT_ACTION_BUTTON_CLASS}
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
                  className={COMPACT_FORM_SELECT_CLASS}
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
                  className={COMPACT_ACTION_BUTTON_CLASS}
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
                  className={COMPACT_ACTION_BUTTON_CLASS}
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
                  className={COMPACT_ACTION_BUTTON_CLASS}
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
                <p className={PANEL_HELP_TEXT_CLASS}>
                  {selectedCount > 0 ?
                    "Format choices are scoped to the currently selected titles so the picker stays relevant to the video set you chose."
                  : "Select one or more rows in the table to enable bulk downloads and narrow the format list."}
                </p>
                {bulkPlannerError && (
                  <p className={PANEL_ERROR_TEXT_CLASS}>{bulkPlannerError}</p>
                )}
              </CardContent>
            </Card>
          )}

          {showManagedSync && (
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
          )}

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
