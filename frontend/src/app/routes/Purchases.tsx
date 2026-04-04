/**
 * Purchases route with hierarchy-first browsing and secondary included-item analysis.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Eye, Download, Key, ArrowLeft } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import FilterBar from "../../components/FilterBar";
import OrderDetailPanel from "../../components/OrderDetailPanel";
import { ProductCell } from "../../components/ProductCell";
import StatTile from "../../components/StatTile";
import SubproductInfoLink from "../../components/SubproductInfoLink";
import { DataTable } from "../../components/DataTable";
import { useLibraryData } from "../../data/api";
import {
  applyProductFilters,
  buildDescriptionSnippet,
  buildSuborders,
  collectProductDownloads,
  computeStats,
  countContainedItems,
  getFilterOptions,
  getCompactBundleName,
  isSteamKeyType,
  summarizeAuthors,
  normalizeCategoryLabel,
  normalizeKeyTypeLabel,
  normalizePlatformLabel,
} from "../../data/selectors";
import { Product } from "../../data/types";
import { useFilters } from "../../state/filters";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import PageFiltersButton from "../../components/ui/PageFiltersButton";
import { Tooltip } from "../../components/ui/tooltip";
import {
  RouteErrorState,
  RouteLoadingState,
} from "../../components/ui/RouteState";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatNumber,
} from "../../utils/format";
import { usePageHeaderActions } from "../layout/PageHeaderContext";
import {
  FILTER_PANEL_CLASS,
  INSET_PANEL_CLASS,
  SECTION_CARD_CLASS,
  SECTION_EYEBROW_CLASS,
  SEGMENTED_CONTROL_CLASS,
} from "../../styles/roles";

type PurchaseRow = {
  id: string;
  lookupKey: string;
  productName: string;
  categoryLabel: string;
  authorSummary: string;
  publisherSummary: string;
  descriptionSnippet: string;
  amountSpent: number;
  downloadCount: number;
  keyCount: number;
  totalSize: string;
  includedItemCount: number;
  mediaSummary: string;
  accessLabel: string;
  accessVariant: "downloads" | "keys" | "mixed" | "inactive";
  keyActionLabel: string;
  keyRoute: string;
  dateAcquired: string;
  original: Product;
};

type IncludedItemRow = {
  id: string;
  parentLookupKey: string;
  parentName: string;
  parentCategoryLabel: string;
  itemName: string;
  infoUrl?: string;
  authorSummary: string;
  publisher: string;
  descriptionSnippet: string;
  platformSummary: string;
  downloadCount: number;
  keyCount: number;
  totalSize: string;
  dateAcquired: string;
  searchTerm: string;
  keyActionLabel: string;
  keyRoute: string;
};

const getResolvedKeyCount = (product: Product) => {
  const subproductKeys = (product.subproducts || []).reduce(
    (sum, subproduct) => sum + (subproduct.keys?.length || 0),
    0,
  );
  return subproductKeys > 0 ? subproductKeys : product.keys?.length || 0;
};

const getResolvedKeys = (product: Product) => {
  const subproductKeys = (product.subproducts || []).flatMap(
    (subproduct) => subproduct.keys || [],
  );
  return subproductKeys.length > 0 ? subproductKeys : product.keys || [];
};

const getKeyActionMeta = (keyTypes: Array<string | undefined>) => {
  const hasSteamKeys = keyTypes.some((keyType) => isSteamKeyType(keyType));
  return {
    keyRoute: hasSteamKeys ? "/library/steam-keys" : "/library/other-keys",
    keyActionLabel: hasSteamKeys ? "Steam keys" : "Other Keys",
  };
};

const getAccessSummary = (
  downloadCount: number,
  keyCount: number,
): { label: string; variant: PurchaseRow["accessVariant"] } => {
  if (downloadCount > 0 && keyCount > 0) {
    return { label: "Mixed access", variant: "mixed" };
  }
  if (downloadCount > 0) {
    return { label: "Downloads only", variant: "downloads" };
  }
  if (keyCount > 0) {
    return { label: "Keys only", variant: "keys" };
  }
  return { label: "No attached content", variant: "inactive" };
};

const getMediaSummary = (product: Product) => {
  const labels = Array.from(
    new Set(
      collectProductDownloads(product)
        .map((download) => normalizePlatformLabel(download.platform))
        .filter(Boolean),
    ),
  );

  if (labels.length === 0) return "No download media";
  if (labels.length <= 3) return labels.join(" • ");
  return `${labels.slice(0, 3).join(" • ")} +${labels.length - 3}`;
};

const accessBadgeVariant: Record<
  PurchaseRow["accessVariant"],
  "info" | "success" | "warning" | "surface"
> = {
  mixed: "info",
  downloads: "success",
  keys: "warning",
  inactive: "surface",
};

const getActiveFilterCount = (
  filters: ReturnType<typeof useFilters>["filters"],
) =>
  [
    filters.search,
    filters.category,
    filters.platform,
    filters.keyType,
    filters.keyPresence,
    filters.downloadPresence,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;

const buildActiveScopeChips = (
  filters: ReturnType<typeof useFilters>["filters"],
) =>
  [
    filters.search ? `Search: ${filters.search}` : null,
    filters.category ?
      `Category: ${normalizeCategoryLabel(filters.category)}`
    : null,
    filters.platform ?
      `Platform: ${normalizePlatformLabel(filters.platform)}`
    : null,
    filters.keyType ?
      `Key type: ${normalizeKeyTypeLabel(filters.keyType)}`
    : null,
    filters.keyPresence === "has_keys" ? "Keys: Has keys"
    : filters.keyPresence === "no_keys" ? "Keys: No keys"
    : null,
    filters.downloadPresence === "has_downloads" ? "Downloads: Has downloads"
    : filters.downloadPresence === "no_downloads" ? "Downloads: No downloads"
    : null,
    filters.startDate ? `From: ${formatDate(filters.startDate)}` : null,
    filters.endDate ? `To: ${formatDate(filters.endDate)}` : null,
  ].filter(Boolean) as string[];

/**
 * Purchases view with richer previews and a secondary analytical mode.
 */
export default function Purchases() {
  const { data, isLoading, error } = useLibraryData();
  const { filters, setFilters, clearFilters } = useFilters();
  const [selectedOrderKey, setSelectedOrderKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"purchases" | "items">("purchases");
  const [showFilters, setShowFilters] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    return applyProductFilters(data.products, filters);
  }, [data, filters]);

  const selectedProduct = useMemo(() => {
    if (!selectedOrderKey) return null;
    return (
      filteredProducts.find(
        (product, index) =>
          String(product.gamekey || product.machine_name || index) ===
          selectedOrderKey,
      ) || null
    );
  }, [filteredProducts, selectedOrderKey]);

  const options = useMemo(() => {
    if (!data) return { categories: [], platforms: [], keyTypes: [] };
    return getFilterOptions(data.products);
  }, [data]);
  const activeFilterCount = getActiveFilterCount(filters);
  const activeScopeChips = buildActiveScopeChips(filters);
  const showFiltersPanel = showFilters;

  const purchaseRows: PurchaseRow[] = useMemo(
    () =>
      filteredProducts.map((product, index) => {
        const downloads = collectProductDownloads(product);
        const totalBytes = downloads.reduce(
          (sum, download) => sum + (download.size_bytes || 0),
          0,
        );
        const resolvedKeys = getResolvedKeys(product);
        const keyCount = getResolvedKeyCount(product);
        const access = getAccessSummary(downloads.length, keyCount);
        const { keyActionLabel, keyRoute } = getKeyActionMeta(
          resolvedKeys.map((key) => key.key_type_human_name || key.key_type),
        );
        const lookupKey = String(
          product.gamekey || product.machine_name || index,
        );
        const authors = summarizeAuthors(
          (product.subproducts || []).flatMap(
            (subproduct) => subproduct.page_details?.authors || [],
          ),
          3,
        );
        const publisherSummary = Array.from(
          new Set(
            (product.subproducts || [])
              .map(
                (subproduct) =>
                  subproduct.page_details?.publisher ||
                  subproduct.payee?.human_name ||
                  "",
              )
              .filter(Boolean),
          ),
        )
          .slice(0, 3)
          .join(", ");
        const descriptionSnippet = buildDescriptionSnippet(
          (product.subproducts || [])
            .map((subproduct) => subproduct.page_details?.description)
            .find(Boolean),
          180,
        );

        return {
          id: lookupKey,
          lookupKey,
          productName:
            product.product_name || product.machine_name || "Untitled purchase",
          categoryLabel: normalizeCategoryLabel(product.category),
          authorSummary: authors,
          publisherSummary,
          descriptionSnippet,
          amountSpent: product.amount_spent ?? 0,
          downloadCount: downloads.length,
          keyCount,
          totalSize: formatBytes(totalBytes),
          includedItemCount: countContainedItems(product),
          mediaSummary: getMediaSummary(product),
          accessLabel: access.label,
          accessVariant: access.variant,
          keyActionLabel,
          keyRoute,
          dateAcquired: product.created_at || "",
          original: product,
        };
      }),
    [filteredProducts],
  );

  const includedItemRows: IncludedItemRow[] = useMemo(
    () =>
      buildSuborders(filteredProducts).map((item) => ({
        ...getKeyActionMeta(
          (item.keys || []).map(
            (key) => key.key_type_human_name || key.key_type,
          ),
        ),
        id: item.id,
        parentLookupKey: String(
          item.parentGamekey || item.product.machine_name || item.id,
        ),
        parentName: item.parentName || "Unknown purchase",
        parentCategoryLabel: normalizeCategoryLabel(item.parentCategory),
        itemName: item.subproductName || "Untitled item",
        infoUrl: item.infoUrl,
        authorSummary: item.authorSummary || "",
        publisher: item.publisher || "",
        descriptionSnippet: buildDescriptionSnippet(
          item.descriptionSnippet,
          180,
        ),
        platformSummary:
          item.platformSummary ?
            item.platformSummary
              .split(",")
              .map((part) => normalizePlatformLabel(part.trim()))
              .join(" • ")
          : "No download media",
        downloadCount: item.downloads.length,
        keyCount: item.keys?.length || 0,
        totalSize: formatBytes(item.totalBytes),
        dateAcquired: item.product.created_at || "",
        searchTerm: item.subproductName || item.parentName || "",
      })),
    [filteredProducts],
  );

  const purchaseStats = useMemo(
    () => computeStats(filteredProducts),
    [filteredProducts],
  );
  const mixedAccessCount = useMemo(
    () => purchaseRows.filter((row) => row.accessVariant === "mixed").length,
    [purchaseRows],
  );
  const downloadOnlyCount = useMemo(
    () =>
      purchaseRows.filter((row) => row.accessVariant === "downloads").length,
    [purchaseRows],
  );
  const keysOnlyCount = useMemo(
    () => purchaseRows.filter((row) => row.accessVariant === "keys").length,
    [purchaseRows],
  );
  const headerActions = useMemo(
    () =>
      selectedProduct ? null : (
        <PageFiltersButton
          expanded={showFiltersPanel}
          activeCount={activeFilterCount}
          onClick={() => setShowFilters((current) => !current)}
        />
      ),
    [activeFilterCount, selectedProduct, showFiltersPanel],
  );
  usePageHeaderActions(headerActions);

  const purchaseColumns: ColumnDef<PurchaseRow>[] = [
    {
      accessorKey: "productName",
      header: "Purchase",
      cell: ({ row }) => (
        <div className="min-w-0 space-y-2">
          <ProductCell getValue={() => row.original.productName} />
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="surface" size="compact" casing="ui">
              {row.original.categoryLabel}
            </Badge>
            <Badge
              variant={accessBadgeVariant[row.original.accessVariant]}
              size="compact"
              casing="ui">
              {row.original.accessLabel}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      id: "includes",
      header: "Includes",
      cell: ({ row }) => (
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-card-foreground">
            {row.original.includedItemCount} included item
            {row.original.includedItemCount === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.original.mediaSummary}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.original.totalSize}
          </div>
        </div>
      ),
    },
    {
      id: "highlights",
      header: "Highlights",
      cell: ({ row }) => (
        <div className="min-w-0 space-y-1 whitespace-normal">
          <div className="text-sm text-card-foreground">
            {row.original.authorSummary || "No author metadata yet"}
          </div>
          {row.original.publisherSummary && (
            <div className="text-xs text-muted-foreground">
              {row.original.publisherSummary}
            </div>
          )}
          {row.original.descriptionSnippet && (
            <Tooltip content={row.original.descriptionSnippet}>
              <p className="line-clamp-3 text-xs text-muted-foreground">
                {row.original.descriptionSnippet}
              </p>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      id: "access",
      header: "Access",
      cell: ({ row }) => (
        <div className="space-y-1 text-sm">
          <div className="text-card-foreground">
            {row.original.downloadCount} download
            {row.original.downloadCount === 1 ? "" : "s"}
          </div>
          <div className="text-muted-foreground">
            {row.original.keyCount} key{row.original.keyCount === 1 ? "" : "s"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "dateAcquired",
      header: "Purchased",
      cell: ({ getValue }) => {
        const dateStr = getValue() as string;
        return (
          <Tooltip content={`Purchased: ${formatDate(dateStr)}`}>
            <span className="cursor-help decoration-dotted underline underline-offset-4 decoration-border">
              {formatDate(dateStr)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: "amountSpent",
      header: "Amount",
      cell: ({ getValue }) => (
        <Tooltip content="Total amount spent on this purchase">
          <span>{formatCurrency(getValue() as number)}</span>
        </Tooltip>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setSelectedOrderKey(row.original.lookupKey)}>
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>
          {row.original.downloadCount > 0 ?
            <Button variant="ghost" size="sm" className="h-8 gap-1" asChild>
              <Link
                to={`/library/other-downloads?search=${encodeURIComponent(
                  row.original.productName,
                )}`}>
                <Download className="h-3.5 w-3.5" />
                Downloads
              </Link>
            </Button>
          : <Button variant="ghost" size="sm" className="h-8 gap-1" disabled>
              <Download className="h-3.5 w-3.5" />
              Downloads
            </Button>
          }
          {row.original.keyCount > 0 ?
            <Button variant="ghost" size="sm" className="h-8 gap-1" asChild>
              <Link
                to={`${row.original.keyRoute}?search=${encodeURIComponent(row.original.productName)}`}>
                <Key className="h-3.5 w-3.5" />
                {row.original.keyActionLabel}
              </Link>
            </Button>
          : <Button variant="ghost" size="sm" className="h-8 gap-1" disabled>
              <Key className="h-3.5 w-3.5" />
              Keys
            </Button>
          }
        </div>
      ),
    },
  ];

  const includedItemColumns: ColumnDef<IncludedItemRow>[] = [
    {
      accessorKey: "parentName",
      header: "Purchase",
      cell: ({ row }) => {
        const compact = getCompactBundleName(row.original.parentName);
        return (
          <div className="min-w-0 space-y-1">
            <button
              type="button"
              className="block text-left font-medium text-card-foreground hover:text-status-info-foreground"
              onClick={() => setSelectedOrderKey(row.original.parentLookupKey)}
              title={compact.full}>
              {compact.display}
            </button>
            <div className="text-xs text-muted-foreground">
              {row.original.parentCategoryLabel}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "itemName",
      header: "Included item",
      cell: ({ getValue }) => (
        <Tooltip content={getValue() as string}>
          <span className="block max-w-full font-medium text-card-foreground whitespace-normal break-words">
            {getValue() as string}
          </span>
        </Tooltip>
      ),
    },
    {
      id: "details",
      header: "Details",
      cell: ({ row }) => (
        <div className="min-w-0 space-y-1 whitespace-normal">
          <div className="text-sm text-card-foreground">
            {row.original.authorSummary || "No author metadata yet"}
          </div>
          {row.original.publisher && (
            <div className="text-xs text-muted-foreground">
              {row.original.publisher}
            </div>
          )}
          {row.original.descriptionSnippet && (
            <Tooltip content={row.original.descriptionSnippet}>
              <p className="line-clamp-3 text-xs text-muted-foreground">
                {row.original.descriptionSnippet}
              </p>
            </Tooltip>
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
          label={`Open info page for ${row.original.itemName}`}
        />
      ),
    },
    {
      id: "access",
      header: "Access",
      cell: ({ row }) => (
        <div className="space-y-1 text-sm">
          <div className="text-card-foreground">
            {row.original.platformSummary}
          </div>
          <div className="text-muted-foreground">
            {row.original.downloadCount} download
            {row.original.downloadCount === 1 ? "" : "s"} •{" "}
            {row.original.keyCount} key
            {row.original.keyCount === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.original.totalSize}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "dateAcquired",
      header: "Purchased",
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setSelectedOrderKey(row.original.parentLookupKey)}>
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>
          {row.original.downloadCount > 0 ?
            <Button variant="ghost" size="sm" className="h-8 gap-1" asChild>
              <Link
                to={`/library/other-downloads?search=${encodeURIComponent(row.original.searchTerm)}`}>
                <Download className="h-3.5 w-3.5" />
                Downloads
              </Link>
            </Button>
          : <Button variant="ghost" size="sm" className="h-8 gap-1" disabled>
              <Download className="h-3.5 w-3.5" />
              Downloads
            </Button>
          }
          {row.original.keyCount > 0 ?
            <Button variant="ghost" size="sm" className="h-8 gap-1" asChild>
              <Link
                to={`${row.original.keyRoute}?search=${encodeURIComponent(
                  row.original.searchTerm,
                )}`}>
                <Key className="h-3.5 w-3.5" />
                {row.original.keyActionLabel}
              </Link>
            </Button>
          : <Button variant="ghost" size="sm" className="h-8 gap-1" disabled>
              <Key className="h-3.5 w-3.5" />
              Keys
            </Button>
          }
        </div>
      ),
    },
  ];

  if (isLoading) {
    return <RouteLoadingState label="Loading purchases…" />;
  }

  if (error || !data) {
    return <RouteErrorState message="Failed to load library data." />;
  }

  if (selectedProduct) {
    const selectedLabel =
      selectedProduct.product_name ||
      selectedProduct.machine_name ||
      "Purchase details";

    return (
      <div className="w-full flex flex-col space-y-6">
        <div
          className={`flex flex-col gap-4 ${SECTION_CARD_CLASS} md:flex-row md:items-center md:justify-between`}>
          <div className="min-w-0 space-y-2">
            <Badge variant="surface" size="compact" casing="ui">
              Purchase detail
            </Badge>
            <h2 className="truncate text-3xl font-bold tracking-tight text-card-foreground">
              {selectedLabel}
            </h2>
            <p className="text-sm text-muted-foreground">
              Expanded purchase detail now uses the full content area so you can
              review the order without the cramped side sheet.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setSelectedOrderKey(null)}
            className="gap-2 self-start md:self-auto">
            <ArrowLeft className="h-4 w-4" />
            Back to purchases
          </Button>
        </div>

        <OrderDetailPanel product={selectedProduct} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-6">
      <section className={SECTION_CARD_CLASS}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <Badge variant="surface" size="compact" casing="ui">
              Purchases workspace
            </Badge>
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-card-foreground">
                Review what each purchase contains
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                The default purchases view focuses on ownership comprehension
                first. Switch to the included-item analysis mode only when you
                need row-level inspection across bundle contents.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/library/other-downloads">Review downloads</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/library/steam-keys">Open Steam keys</Link>
            </Button>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {activeScopeChips.map((chip) => (
              <Badge key={chip} variant="surface" size="compact" casing="ui">
                {chip}
              </Badge>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                clearFilters();
                setShowFilters(false);
              }}>
              Clear filters
            </Button>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Purchases in scope"
              value={formatNumber(purchaseStats.totalProducts)}
              subtitle="Filtered purchase rows"
            />
            <StatTile
              label="Included items"
              value={formatNumber(purchaseStats.totalContainedItems)}
              subtitle="Titles or contained groups"
            />
            <StatTile
              label="Mixed-access purchases"
              value={formatNumber(mixedAccessCount)}
              subtitle="Downloads and keys together"
            />
            <StatTile
              label="Download-only purchases"
              value={formatNumber(downloadOnlyCount)}
              subtitle="Download inventory without redemption keys"
            />
            <StatTile
              label="Keys-only purchases"
              value={formatNumber(keysOnlyCount)}
              subtitle="Redemption inventory without downloads"
            />
          </div>

          <div className={INSET_PANEL_CLASS}>
            <p className={SECTION_EYEBROW_CLASS}>View mode</p>
            <div className={`mt-3 ${SEGMENTED_CONTROL_CLASS}`}>
              <Button
                type="button"
                variant={mode === "purchases" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setMode("purchases")}>
                Purchases
              </Button>
              <Button
                type="button"
                variant={mode === "items" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setMode("items")}>
                Included items
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {mode === "purchases" ?
                "Stay in Purchases for the clearest hierarchy-first ownership view before opening detail panels."
              : "Included-item analysis is a secondary deep-inspection mode for comparing contained titles across purchases."
              }
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="surface" size="compact" casing="ui">
                {formatNumber(purchaseRows.length)} purchase row
                {purchaseRows.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="surface" size="compact" casing="ui">
                {formatNumber(includedItemRows.length)} included item row
                {includedItemRows.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {showFiltersPanel && (
        <div className="sticky top-20 z-20 ml-auto w-full max-w-5xl">
          <FilterBar
            categories={options.categories}
            platforms={options.platforms}
            keyTypes={options.keyTypes}
            hideHeader
            isExpanded
            className={`${FILTER_PANEL_CLASS} bg-background/95 shadow-lg backdrop-blur`}
          />
        </div>
      )}

      {mode === "purchases" ?
        <DataTable
          columns={purchaseColumns}
          data={purchaseRows}
          globalFilter={filters.search}
          onGlobalFilterChange={(search) => setFilters({ search })}
          searchPlaceholder="Search purchases, categories, access, or dates"
        />
      : <DataTable
          columns={includedItemColumns}
          data={includedItemRows}
          globalFilter={filters.search}
          onGlobalFilterChange={(search) => setFilters({ search })}
          searchPlaceholder="Search included items, purchases, media, or dates"
        />
      }
    </div>
  );
}
