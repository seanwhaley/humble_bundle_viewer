/**
 * Downloads route focused on direct file download links.
 */
import { useMemo, useState } from "react";
import { Loader2, Download, Copy } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import FilterBar, { type FilterBarField } from "../../components/FilterBar";
import BarChart from "../../components/charts/BarChart";
import { DataTable } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
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
import { formatBytes, formatDate } from "../../utils/format";
import {
  collectDownloadUrls,
  getLinkStatus,
  triggerDownloadUrls,
} from "../../utils/downloads";
import ExpiredLinkDialog from "../../components/ExpiredLinkDialog";
import DownloadRouteEmptyState from "../../components/DownloadRouteEmptyState";

/**
 * Download inventory view with platform/file-type charts.
 */
const DOWNLOAD_FILTER_FIELDS: FilterBarField[] = [
  "category",
  "platform",
  "dateRange",
];

export default function Downloads() {
  const { data, isLoading, error } = useLibraryData();
  const { data: viewerConfig } = useViewerConfig();
  const { filters, setFilters } = useFilters();
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const expiringSoonMs =
    (viewerConfig?.link_expiry_warning_hours ?? 24) * 60 * 60 * 1000;

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
        const statusClass =
          status === "expired" ? "border-rose-500/60 text-rose-200"
          : status === "expiring" ? "border-amber-400/60 text-amber-200"
          : "";
        const rowData = row.original;

        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              className={`h-7 text-xs ${statusClass}`}
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
              className="h-7 gap-1 text-xs"
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
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        Failed to load library data.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Download inventory
        </h2>
        <p className="text-muted-foreground">
          Inspect download links and file types not already covered by the
          Software, Videos, Ebooks, or Audiobooks pages.
        </p>
      </div>

      <FilterBar
        categories={options.categories}
        platforms={options.platforms}
        keyTypes={options.keyTypes}
        fields={DOWNLOAD_FILTER_FIELDS}
      />

      {!downloads.length && (
        <DownloadRouteEmptyState
          routeLabel="Other Downloads"
          suggestedRoutes={[
            { label: "Open Software", to: "/software" },
            { label: "Open Videos", to: "/videos" },
            { label: "Open Ebooks", to: "/ebooks" },
            { label: "Open Audiobooks", to: "/audiobooks" },
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
