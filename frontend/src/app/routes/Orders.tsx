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
  normalizePlatformLabel,
} from "../../data/selectors";
import { Product } from "../../data/types";
import { useFilters } from "../../state/filters";
import { Button } from "../../components/ui/button";
import { Tooltip } from "../../components/ui/tooltip";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatNumber,
} from "../../utils/format";

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
    keyRoute: hasSteamKeys ? "/steam-keys" : "/non-steam-keys",
    keyActionLabel: hasSteamKeys ? "Steam keys" : "Non-Steam keys",
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

const accessBadgeClass: Record<PurchaseRow["accessVariant"], string> = {
  mixed: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  downloads: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  keys: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  inactive: "border-slate-700 bg-slate-900 text-slate-300",
};

/**
 * Purchases view with richer previews and a secondary analytical mode.
 */
export default function Orders() {
  const { data, isLoading, error } = useLibraryData();
  const { filters, setFilters } = useFilters();
  const [selectedOrderKey, setSelectedOrderKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"purchases" | "items">("purchases");

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
  const keysOnlyCount = useMemo(
    () => purchaseRows.filter((row) => row.accessVariant === "keys").length,
    [purchaseRows],
  );

  const purchaseColumns: ColumnDef<PurchaseRow>[] = [
    {
      accessorKey: "productName",
      header: "Purchase",
      cell: ({ row }) => (
        <div className="min-w-0 space-y-2">
          <ProductCell getValue={() => row.original.productName} />
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-300">
              {row.original.categoryLabel}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 ${accessBadgeClass[row.original.accessVariant]}`}>
              {row.original.accessLabel}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "includes",
      header: "Includes",
      cell: ({ row }) => (
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-slate-100">
            {row.original.includedItemCount} included item
            {row.original.includedItemCount === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-slate-400">
            {row.original.mediaSummary}
          </div>
          <div className="text-xs text-slate-500">{row.original.totalSize}</div>
        </div>
      ),
    },
    {
      id: "highlights",
      header: "Highlights",
      cell: ({ row }) => (
        <div className="min-w-0 space-y-1 whitespace-normal">
          <div className="text-sm text-slate-100">
            {row.original.authorSummary || "No author metadata yet"}
          </div>
          {row.original.publisherSummary && (
            <div className="text-xs text-slate-400">
              {row.original.publisherSummary}
            </div>
          )}
          {row.original.descriptionSnippet && (
            <Tooltip content={row.original.descriptionSnippet}>
              <p className="line-clamp-3 text-xs text-slate-400">
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
          <div className="text-slate-100">
            {row.original.downloadCount} download
            {row.original.downloadCount === 1 ? "" : "s"}
          </div>
          <div className="text-slate-400">
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
            <span className="cursor-help decoration-dotted underline underline-offset-4 decoration-slate-700">
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
                to={`/downloads?search=${encodeURIComponent(
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
              className="block text-left font-medium text-white hover:text-indigo-300"
              onClick={() => setSelectedOrderKey(row.original.parentLookupKey)}
              title={compact.full}>
              {compact.display}
            </button>
            <div className="text-xs text-slate-400">
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
          <span className="block max-w-full font-medium text-slate-100 whitespace-normal break-words">
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
          <div className="text-sm text-slate-100">
            {row.original.authorSummary || "No author metadata yet"}
          </div>
          {row.original.publisher && (
            <div className="text-xs text-slate-400">
              {row.original.publisher}
            </div>
          )}
          {row.original.descriptionSnippet && (
            <Tooltip content={row.original.descriptionSnippet}>
              <p className="line-clamp-3 text-xs text-slate-400">
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
          <div className="text-slate-100">{row.original.platformSummary}</div>
          <div className="text-slate-400">
            {row.original.downloadCount} download
            {row.original.downloadCount === 1 ? "" : "s"} •{" "}
            {row.original.keyCount} key
            {row.original.keyCount === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-slate-500">{row.original.totalSize}</div>
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
                to={`/downloads?search=${encodeURIComponent(row.original.searchTerm)}`}>
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

  if (selectedProduct) {
    const selectedLabel =
      selectedProduct.product_name ||
      selectedProduct.machine_name ||
      "Purchase details";

    return (
      <div className="w-full flex flex-col space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-2">
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300">
              Purchase detail
            </span>
            <h2 className="truncate text-3xl font-bold tracking-tight text-white">
              {selectedLabel}
            </h2>
            <p className="text-sm text-slate-400">
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
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300">
              Purchases workspace
            </span>
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Review what each purchase contains
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                The default purchases view focuses on ownership comprehension
                first. Switch to the included-item analysis mode only when you
                need row-level inspection across bundle contents.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/downloads">Review downloads</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/steam-keys">Open Steam keys</Link>
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Purchases in scope
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {formatNumber(purchaseStats.totalProducts)}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Filtered purchase rows
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Included items
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {formatNumber(purchaseStats.totalContainedItems)}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Titles or contained groups
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Mixed-access purchases
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {formatNumber(mixedAccessCount)}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Downloads and keys together
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Keys-only purchases
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {formatNumber(keysOnlyCount)}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Redemption inventory without downloads
            </p>
          </div>
        </div>
      </section>

      <FilterBar
        categories={options.categories}
        platforms={options.platforms}
        keyTypes={options.keyTypes}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("purchases")}
          className={`rounded-2xl border p-5 text-left transition-colors ${
            mode === "purchases" ?
              "border-indigo-500/40 bg-indigo-500/10"
            : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
          }`}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Primary mode
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">Purchases</h3>
          <p className="mt-2 text-sm text-slate-400">
            Best for understanding what each purchase contains before opening
            details.
          </p>
          <p className="mt-3 text-sm text-slate-300">
            {formatNumber(purchaseRows.length)} purchase row
            {purchaseRows.length === 1 ? "" : "s"}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("items")}
          className={`rounded-2xl border p-5 text-left transition-colors ${
            mode === "items" ?
              "border-indigo-500/40 bg-indigo-500/10"
            : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
          }`}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Secondary mode
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">
            Included-item analysis
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            Use this when you need row-level inspection of contained bundle
            items across purchases.
          </p>
          <p className="mt-3 text-sm text-slate-300">
            {formatNumber(includedItemRows.length)} included item row
            {includedItemRows.length === 1 ? "" : "s"}
          </p>
        </button>
      </div>

      {mode === "items" && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-5 py-4 text-sm text-slate-300">
          Included-item analysis is a secondary view for deep inspection. Use
          the purchases table when you want the clearest ownership summary.
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
