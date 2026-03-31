/**
 * Software library route grouped by subproduct downloads.
 */
import { useEffect, useMemo, useState } from "react";
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
  const [showFilters, setShowFilters] = useState(false);
  const [showBulkDownloads, setShowBulkDownloads] = useState(false);
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
  const activeFilterCount = useMemo(
    () =>
      [
        filters.category,
        filters.platform,
        filters.startDate,
        filters.endDate,
      ].filter(Boolean).length,
    [filters.category, filters.endDate, filters.platform, filters.startDate],
  );
  const showFiltersPanel = showFilters || activeFilterCount > 0;
  const showBulkDownloadsPanel =
    showBulkDownloads || selectedCount > 0 || bulkPlannerError !== null;
  const variantOptions = useMemo(() => {
    const sourceRows = selectedCount > 0 ? selectedRows : softwareRows;
    const counts = new Map<string, number>();
    sourceRows.forEach((row) => {
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
  }, [selectedCount, selectedRows, softwareRows]);

  useEffect(() => {
    if (selectedVariant && !variantOptions.includes(selectedVariant)) {
      setSelectedVariant("");
    }
  }, [selectedVariant, variantOptions]);

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
        <div className="whitespace-normal break-words text-sm text-foreground">
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
          <p className="line-clamp-3 whitespace-normal break-words text-xs text-muted-foreground">
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
        <div className="whitespace-normal break-words text-xs text-muted-foreground">
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

      {!softwareRows.length && (
        <DownloadRouteEmptyState routeLabel="Software" />
      )}

      {!!softwareRows.length && (
        <>
          <Card className="bg-card/60">
            <CardHeader className="space-y-4 pb-4">
              <div>
                <Badge variant="info">Browse-first layout</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-card-foreground">
                  Start with the table, then open filters, bulk downloads, or
                  managed sync only when you need them
                </h3>
                <p className="text-sm text-muted-foreground">
                  Software titles tend to have the noisiest variant lists, so
                  the heavier tools stay tucked away until you are ready to use
                  them. Bulk variant downloads also scope themselves to the
                  titles you selected in the table.
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
                    {softwareRows.length} software titles are ready to browse.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Active selection
                  </p>
                  <p className="mt-2 text-sm text-card-foreground">
                    {selectedCount} title{selectedCount === 1 ? "" : "s"} selected for bulk actions.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Variant coverage
                  </p>
                  <p className="mt-2 text-sm text-card-foreground">
                    {variantOptions.length} platform and file-type variants in the current scope.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={showFiltersPanel ? "default" : "outline"}
                  onClick={() => setShowFilters((value) => !value)}>
                  Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </Button>
                <Button
                  size="sm"
                  variant={showBulkDownloadsPanel ? "default" : "outline"}
                  onClick={() => setShowBulkDownloads((value) => !value)}>
                  Bulk downloads{selectedCount > 0 ? ` (${selectedCount})` : ""}
                </Button>
                <Button
                  size="sm"
                  variant={showManagedSync ? "default" : "outline"}
                  onClick={() => setShowManagedSync((value) => !value)}>
                  Managed sync
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Downloads still use your browser's normal save flow. Browsers
                may prompt before allowing multiple files to open at once.
                {hasExpiringSelection && " Some selected links expire soon."}
              </p>
            </CardContent>
          </Card>

          {showFiltersPanel && (
            <Card className="bg-card/60">
              <CardHeader className="pb-3">
                <h3 className="text-base font-semibold text-card-foreground">
                  Narrow the library before you download
                </h3>
                <p className="text-sm text-muted-foreground">
                  Category, platform, and acquisition date filters reduce table
                  noise without changing the global search box.
                </p>
              </CardHeader>
              <CardContent>
                <FilterBar
                  categories={options.categories}
                  platforms={options.platforms}
                  keyTypes={options.keyTypes}
                  fields={SOFTWARE_FILTER_FIELDS}
                />
              </CardContent>
            </Card>
          )}

          {showBulkDownloadsPanel && (
            <Card className="bg-card/60">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-card-foreground">
                      Bulk downloads
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Select titles in the table first, then choose whether you
                      want every file, one matching variant, or a planned
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
                    value={selectedVariant}
                    onChange={(event) => setSelectedVariant(event.target.value)}
                    disabled={!selectedCount || bulkPlannerActive}
                    aria-label="Download software variant">
                    <option value="">Select platform + type</option>
                    {variantOptions.map((variant) => (
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

                <p className="text-xs text-muted-foreground">
                  {selectedCount > 0 ?
                    "Variant options are scoped to the currently selected titles so you do not have to scroll through irrelevant file types."
                  : "Select one or more rows in the table to enable bulk downloads and narrow the variant list."}
                </p>

                {bulkPlannerError && (
                  <p className="text-xs text-rose-300">{bulkPlannerError}</p>
                )}
              </CardContent>
            </Card>
          )}

          {showManagedSync && (
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
          )}

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
