/**
 * Other downloads route focused on direct file download links.
 */
import { useMemo, useState } from "react";
import {
  Download,
  Copy,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import FilterBar, { type FilterBarField } from "../../components/FilterBar";
import BarChart from "../../components/charts/BarChart";
import { DataTable } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import PageFiltersButton from "../../components/ui/PageFiltersButton";
import PaneHeader from "../../components/ui/PaneHeader";
import { RouteErrorState, RouteLoadingState } from "../../components/ui/RouteState";
import { ProductCell } from "../../components/ProductCell";
import { useLibraryData, useViewerConfig } from "../../data/api";
import {
  applyProductFilters,
  flattenDownloads,
  getFilterOptions,
  groupSmallValues,
  isDedicatedContentPlatform,
} from "../../data/selectors";
import { useFilters } from "../../state/filters";
import { FlattenedDownload } from "../../data/types";
import { cn } from "../../lib/utils";
import { formatBytes, formatDate, formatNumber } from "../../utils/format";
import {
  collectDownloadUrls,
  getLinkStatus,
  triggerDownloadUrls,
} from "../../utils/downloads";
import ExpiredLinkDialog from "../../components/ExpiredLinkDialog";
import DownloadRouteEmptyState from "../../components/DownloadRouteEmptyState";
import {
  DOWNLOAD_ACTION_BAR_CLASS,
  DOWNLOAD_ACTION_BUTTON_CLASS,
  DOWNLOAD_ACTION_BUTTON_WITH_ICON_CLASS,
  FILTER_PANEL_CLASS,
  INSET_PANEL_COMPACT_CLASS,
  SECTION_EYEBROW_CLASS,
} from "../../styles/roles";
import { DOWNLOAD_ACTION_STATUS_CLASS } from "../../styles/status";
import { usePageHeaderActions } from "../layout/PageHeaderContext";

/**
 * Download inventory view with platform/file-type charts.
 */
const DOWNLOAD_FILTER_FIELDS: FilterBarField[] = [
  "category",
  "platform",
  "dateRange",
];

export default function OtherDownloads() {
  const { data, isLoading, error } = useLibraryData();
  const { data: viewerConfig } = useViewerConfig();
  const { filters, setFilters } = useFilters();
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const expiringSoonMs =
    (viewerConfig?.link_expiry_warning_hours ?? 24) * 60 * 60 * 1000;
  const activePageFilterCount = [
    filters.category,
    filters.platform,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;
  const filtersPanelOpen = showFiltersPanel || activePageFilterCount > 0;
  const headerActions = useMemo(
    () => (
      <PageFiltersButton
        expanded={filtersPanelOpen}
        activeCount={activePageFilterCount}
        onClick={() => setShowFiltersPanel((current) => !current)}
      />
    ),
    [activePageFilterCount, filtersPanelOpen],
  );
  usePageHeaderActions(headerActions);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    return applyProductFilters(data.products, filters, {
      keyType: null,
      keyPresence: null,
      downloadPresence: null,
    });
  }, [data, filters]);

  const options = useMemo(() => {
    if (!data) return { categories: [], platforms: [], keyTypes: [] };
    return getFilterOptions(data.products);
  }, [data]);

  const downloads = useMemo(() => {
    const all = flattenDownloads(filteredProducts);
    // Filter out content handled by dedicated media/software pages.
    return all.filter(
      (download) => !isDedicatedContentPlatform(download.platform),
    );
  }, [filteredProducts]);

  const platformCounts = useMemo(() => {
    const counts = new Map<string, number>();
    downloads.forEach((d) => {
      const label = d.platform || "unknown";
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    const result = Array.from(counts.entries()).map(([label, value]) => ({
      label,
      value,
    }));
    return groupSmallValues(result);
  }, [downloads]);

  const fileTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    downloads.forEach((d) => {
      const label = d.fileType || "file";
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    const result = Array.from(counts.entries()).map(([label, value]) => ({
      label,
      value,
    }));
    return groupSmallValues(result);
  }, [downloads]);

  const columns: ColumnDef<FlattenedDownload>[] = [
    { accessorKey: "productName", header: "Item Name" },
    {
      accessorKey: "orderName",
      header: "Source Bundle",
      cell: ProductCell,
    },
    {
      accessorKey: "dateAcquired",
      header: "Date Acquired",
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    { accessorKey: "platform", header: "Platform" },
    { accessorKey: "fileType", header: "File type" },
    {
      accessorKey: "sizeBytes",
      header: "Size",
      cell: ({ getValue }) => formatBytes(getValue() as number),
    },
    {
      accessorKey: "url",
      header: "Actions",
      cell: ({ getValue, row }) => {
        const url = getValue() as string;
        if (!url) return <span className="text-muted-foreground">–</span>;
        const status = getLinkStatus(url, expiringSoonMs);
        const rowData = row.original;

        return (
          <div className={DOWNLOAD_ACTION_BAR_CLASS}>
            <Button
              size="sm"
              variant={status === "valid" ? "default" : "outline"}
              className={cn(
                DOWNLOAD_ACTION_BUTTON_CLASS,
                DOWNLOAD_ACTION_STATUS_CLASS[status],
              )}
              onClick={() => {
                if (status === "expired") {
                  setShowExpiredDialog(true);
                  return;
                }
                triggerDownloadUrls(
                  collectDownloadUrls([
                    {
                      url,
                      platform: rowData.platform,
                      file_type: rowData.fileType,
                      size_bytes: rowData.sizeBytes,
                      name:
                        rowData.productName || rowData.orderName || "download",
                    },
                  ]),
                );
              }}>
              <Download className="mr-1 h-3 w-3" />
              Download
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={DOWNLOAD_ACTION_BUTTON_WITH_ICON_CLASS}
              onClick={() => navigator.clipboard.writeText(url)}
              title="Copy link">
              <Copy className="h-3 w-3" />
              Copy link
            </Button>
          </div>
        );
      },
    },
  ];

  if (isLoading) {
    return <RouteLoadingState label="Loading downloads…" />;
  }

  if (error || !data) {
    return <RouteErrorState message="Failed to load library data." />;
  }

  return (
    <div className="w-full flex flex-col space-y-4">
      <Card surface="panel">
        <CardHeader className="pb-4">
          <PaneHeader
            titleAs="h2"
            title="Review the leftover download inventory that does not belong on the dedicated media pages"
            description="Use this route for direct-download files that fall outside Software, Videos, eBooks, and Audiobooks. Start with the table, then open header filters only when you need to narrow the remaining rows."
            eyebrow={<Badge variant="info">Other downloads</Badge>}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                Rows in scope
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {formatNumber(downloads.length)} other-download row
                {downloads.length === 1 ? "" : "s"} in the current view.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                Platforms in scope
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {formatNumber(platformCounts.length)} platform bucket
                {platformCounts.length === 1 ? "" : "s"} are represented in the current view.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                File types in scope
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {formatNumber(fileTypeCounts.length)} file-type bucket
                {fileTypeCounts.length === 1 ? "" : "s"} remain after the current filters.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Downloads still use your browser’s normal save flow. Browsers may
            prompt before allowing multiple files to open at once. Use the
            dedicated media routes whenever you need format-aware bulk actions
            or managed sync.
          </p>
        </CardContent>
      </Card>

      {filtersPanelOpen && (
        <FilterBar
          categories={options.categories}
          platforms={options.platforms}
          keyTypes={options.keyTypes}
          fields={DOWNLOAD_FILTER_FIELDS}
          hideHeader
          isExpanded
          className={FILTER_PANEL_CLASS}
        />
      )}

      {!downloads.length && (
        <DownloadRouteEmptyState
          routeLabel="Other Downloads"
          suggestedRoutes={[
            { label: "Open Software", to: "/library/software" },
            { label: "Open Videos", to: "/library/videos" },
            { label: "Open eBooks", to: "/library/ebooks" },
            { label: "Open Audiobooks", to: "/library/audiobooks" },
          ]}
        />
      )}

      {!!downloads.length && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarChart
              title="Download platforms"
              data={platformCounts}
              selected={filters.platform}
              onSelect={(value) =>
                setFilters({
                  platform: filters.platform === value ? null : value,
                })
              }
            />
            <BarChart title="File types" data={fileTypeCounts} />
          </div>

          <DataTable
            columns={columns}
            data={downloads}
            globalFilter={filters.search}
            onGlobalFilterChange={(search) => setFilters({ search })}
            searchPlaceholder="Search downloads, bundles, platforms, or file types"
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
