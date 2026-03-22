/**
 * Software library route grouped by subproduct downloads.
 */
import { useMemo, useState } from "react";
import { Loader2, Download, Monitor } from "lucide-react";
import { ColumnDef, RowSelectionState } from "@tanstack/react-table";

import { useLibraryData, useViewerConfig } from "../../data/api";
import { buildDownloadPlan } from "../../data/downloadPlanning";
import {
  applyProductFilters,
  buildDescriptionSnippet,
  buildSubproductItems,
  getFilterOptions,
  isSoftwarePlatform,
  normalizePlatformLabel,
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

interface SoftwareRow {
  id: string;
  subproductName: string;
  sourceBundle: string;
  infoUrl?: string;
  publisher?: string;
  descriptionSnippet?: string;
  platforms: string[];
  variants: string[];
  totalSize: string;
  dateAcquired: string;
  downloads: DownloadRecord[];
}

const SOFTWARE_FILTER_FIELDS: FilterBarField[] = [
  "category",
  "platform",
  "dateRange",
];

/**
 * Software view with platform/file-type aware download buttons.
 */
export default function Software() {
  const { data, isLoading, error } = useLibraryData();
  const { data: viewerConfig } = useViewerConfig();
  const { filters, setFilters } = useFilters();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedVariant, setSelectedVariant] = useState("");
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

  const softwareRows = useMemo(() => {
    if (!data?.products) return [];

    const filteredProducts = applyProductFilters(data.products, filters, {
      keyType: null,
      keyPresence: null,
      downloadPresence: null,
    });
    const subproductItems = buildSubproductItems(filteredProducts);

    return subproductItems
      .filter((item) =>
        item.downloads.some((download) =>
          isSoftwarePlatform(download.platform),
        ),
      )
      .map((item) => {
        const softwareDownloads = item.downloads.filter((download) =>
          isSoftwarePlatform(download.platform),
        );
        const variants = Array.from(
          new Set(
            softwareDownloads.map((download) =>
              getDownloadLabel(download, "displayLabel"),
            ),
          ),
        );
        const platforms = Array.from(
          new Set(
            softwareDownloads.map((download) =>
              normalizePlatformLabel(download.platform),
            ),
          ),
        );
        const size = softwareDownloads.reduce(
          (sum, download) => sum + (download.size_bytes || 0),
          0,
        );

        return {
          id: item.id,
          subproductName: item.subproductName || "Unknown Title",
          sourceBundle: item.parentName || "Unknown Bundle",
          infoUrl: item.infoUrl,
          publisher: item.publisher,
          descriptionSnippet: buildDescriptionSnippet(
            item.descriptionSnippet,
            180,
          ),
          platforms,
          variants,
          totalSize: formatBytes(size),
          dateAcquired: item.product.created_at || "",
          downloads: softwareDownloads,
        } satisfies SoftwareRow;
      });
  }, [data, filters]);

  const uniqueVariants = useMemo(() => {
    const counts = new Map<string, number>();
    softwareRows.forEach((row) => {
      row.downloads.forEach((download) => {
        const key = getDownloadLabel(download, "displayLabel");
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return Array.from(counts.keys()).sort((a, b) => {
      const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
  }, [softwareRows]);

  const selectedRows = useMemo(
    () => softwareRows.filter((row) => rowSelection[row.id]),
    [softwareRows, rowSelection],
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

  const columns: ColumnDef<SoftwareRow>[] = [
    { accessorKey: "subproductName", header: "Software" },
    {
      accessorKey: "publisher",
      header: "Publisher",
      cell: ({ getValue }) => (
        <div className="whitespace-normal break-words text-sm text-slate-200">
          {(getValue() as string) || "—"}
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
      accessorKey: "platforms",
      header: "Platforms",
      cell: ({ getValue }) => (getValue() as string[]).join(", "),
    },
    {
      accessorKey: "variants",
      header: "Files",
      cell: ({ getValue }) => (
        <div className="whitespace-normal break-words text-xs text-slate-300">
          {(getValue() as string[]).join(", ")}
        </div>
      ),
    },
    { accessorKey: "totalSize", header: "Total Size" },
    {
      accessorKey: "downloads",
      header: "Downloads",
      cell: ({ getValue }) => {
        const downloads = getValue() as DownloadRecord[];
        const rowVariants = Array.from(
          new Set(
            downloads.map((download) =>
              getDownloadLabel(download, "displayLabel"),
            ),
          ),
        ).sort((a, b) => a.localeCompare(b));
        return (
          <div className="flex flex-wrap items-start gap-1.5">
            <Tooltip content="Download every installer/archive for this title">
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
            {rowVariants.map((variant) => {
              const match = downloads.find(
                (download) =>
                  getDownloadLabel(download, "displayLabel") === variant,
              );

              if (match) {
                const status = getLinkStatus(match.url, expiringSoonMs);
                const statusClass =
                  status === "expired" ? "border-rose-500/60 text-rose-200"
                  : status === "expiring" ? "border-amber-400/60 text-amber-200"
                  : "";

                return (
                  <Tooltip
                    key={variant}
                    content={`${variant} • ${formatBytes(match.size_bytes)}`}>
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
                      {variant}
                    </Button>
                  </Tooltip>
                );
              }
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
          <Monitor className="h-8 w-8 text-primary" />
          Software Library
        </h2>
        <p className="text-muted-foreground">
          Review {softwareRows.length} software titles grouped into one row per
          subproduct, with platform and file-type variants kept visible.
        </p>
      </div>

      <FilterBar
        categories={options.categories}
        platforms={options.platforms}
        keyTypes={options.keyTypes}
        fields={SOFTWARE_FILTER_FIELDS}
      />

      {!softwareRows.length && (
        <DownloadRouteEmptyState routeLabel="Software" />
      )}

      {!!softwareRows.length && (
        <>
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  Selected titles: {selectedCount}
                </p>
                <p className="text-xs text-slate-400">
                  Bulk download across selected software titles.
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
                  value={selectedVariant}
                  onChange={(event) => setSelectedVariant(event.target.value)}
                  disabled={!selectedCount || bulkPlannerActive}
                  aria-label="Download software variant">
                  <option value="">Select platform + type</option>
                  {uniqueVariants.map((variant) => (
                    <option key={variant} value={variant}>
                      {variant}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={
                    !selectedCount ||
                    !selectedVariant ||
                    hasExpiredSelection ||
                    bulkPlannerActive
                  }
                  onClick={() => {
                    const items = selectedRows
                      .map((row) => {
                        const downloads = filterDownloadsByLabel(
                          row.downloads,
                          selectedVariant,
                          "displayLabel",
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
                  Download variant
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
            rows={softwareRows.map((row) => ({
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
            uniqueFormats={uniqueVariants}
            expiringSoonMs={expiringSoonMs}
            onExpiredLinks={() => setShowExpiredDialog(true)}
            mediaLabel="software"
            formatStrategy="displayLabel"
            pickerId="hb-library-viewer-managed-sync-software"
          />

          <DataTable
            columns={columns}
            data={softwareRows}
            globalFilter={filters.search}
            onGlobalFilterChange={(search) => setFilters({ search })}
            searchPlaceholder="Search software titles, publishers, bundles, or summaries"
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
