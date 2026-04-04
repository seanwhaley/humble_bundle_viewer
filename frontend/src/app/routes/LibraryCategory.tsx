/**
 * Library category route for exploring a single product category.
 */
import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import FilterBar from "../../components/FilterBar";
import BarChart from "../../components/charts/BarChart";
import StatTile from "../../components/StatTile";
import { DataTable } from "../../components/DataTable";
import { ProductCell } from "../../components/ProductCell";
import SubproductInfoLink from "../../components/SubproductInfoLink";
import { PageIntro } from "../../components/ui/PageIntro";
import {
  RouteErrorState,
  RouteLoadingState,
} from "../../components/ui/RouteState";
import { useLibraryData } from "../../data/api";
import {
  applyProductFilters,
  buildFileTypeCounts,
  buildKeyTypeCounts,
  buildPlatformCounts,
  buildSuborders,
  computeStats,
  getFilterOptions,
} from "../../data/selectors";
import { formatBytes, formatDate, formatNumber } from "../../utils/format";
import { useFilters } from "../../state/filters";

type LibraryCategoryRow = {
  id: string;
  product_name: string;
  source_bundle: string;
  info_url?: string;
  amount_spent: number;
  download_count: number;
  total_size: string;
  dateAcquired: string;
};

/**
 * Library category view with charts and a subproduct table.
 */
export default function LibraryCategory() {
  const { category } = useParams();
  const { data, isLoading, error } = useLibraryData();
  const { filters, setFilters } = useFilters();
  const categoryLabel = normalizeCategoryLabel(category ?? "unknown");

  useEffect(() => {
    if (category) {
      setFilters({ category });
    }
    return () => {
      setFilters({ category: null });
    };
  }, [category, setFilters]);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    return applyProductFilters(data.products, filters);
  }, [data, filters]);

  const options = useMemo(() => {
    if (!data) return { categories: [], platforms: [], keyTypes: [] };
    return getFilterOptions(data.products);
  }, [data]);

  const stats = computeStats(filteredProducts);
  const platformCounts = buildPlatformCounts(filteredProducts);
  const keyTypeCounts = buildKeyTypeCounts(filteredProducts);
  const fileTypeCounts = buildFileTypeCounts(filteredProducts);

  // Build subproduct rows as the primary category view model.
  const subproductRows: LibraryCategoryRow[] = useMemo(() => {
    const suborders = buildSuborders(filteredProducts);
    return suborders.map((item) => {
      return {
        id: item.id,
        product_name: item.subproductName || "Unknown Item",
        source_bundle: item.parentName || "Unknown",
        info_url: item.infoUrl,
        amount_spent: 0, // Individual items don't have cost in this model
        download_count: item.downloads.length,
        total_size: formatBytes(item.totalBytes),
        dateAcquired: item.product.created_at || "",
      };
    });
  }, [filteredProducts]);

  const columns: ColumnDef<LibraryCategoryRow>[] = [
    { accessorKey: "product_name", header: "Item Name" },
    {
      accessorKey: "info_url",
      header: "Info",
      cell: ({ getValue, row }) => (
        <SubproductInfoLink
          url={getValue() as string | undefined}
          label={`Open info page for ${row.original.product_name}`}
        />
      ),
    },
    {
      accessorKey: "source_bundle",
      header: "Source Bundle",
      cell: ProductCell,
    },
    {
      accessorKey: "dateAcquired",
      header: "Date Acquired",
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    { accessorKey: "download_count", header: "Downloads" },
    { accessorKey: "total_size", header: "Total Size" },
  ];

  if (isLoading) {
    return <RouteLoadingState label="Loading category view…" />;
  }

  if (error || !data) {
    return <RouteErrorState message="Failed to load library data." />;
  }

  return (
    <div className="w-full flex flex-col space-y-4">
      <PageIntro
        title={`${categoryLabel} category`}
        description="Drill into purchases, downloads, and key types within this category."
      />

      <FilterBar
        categories={options.categories}
        platforms={options.platforms}
        keyTypes={options.keyTypes}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Purchases"
          value={formatNumber(stats.totalProducts)}
          subtitle="Filtered"
        />
        <StatTile
          label="Downloads"
          value={formatNumber(stats.totalDownloads)}
          subtitle={formatBytes(stats.totalBytes)}
        />
        <StatTile
          label="Keys"
          value={formatNumber(stats.totalKeys)}
          subtitle="Across purchases"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart
          title="Platforms"
          data={platformCounts}
          selected={filters.platform}
          onSelect={(value) =>
            setFilters({ platform: filters.platform === value ? null : value })
          }
        />
        <BarChart
          title="Key types"
          data={keyTypeCounts}
          selected={filters.keyType}
          onSelect={(value) =>
            setFilters({ keyType: filters.keyType === value ? null : value })
          }
        />
        <BarChart title="File types" data={fileTypeCounts} />
      </div>

      <DataTable
        columns={columns}
        data={subproductRows}
        globalFilter={filters.search}
        onGlobalFilterChange={(search) => setFilters({ search })}
        searchPlaceholder="Search included items or source bundles"
      />
    </div>
  );
}
