/**
 * Non-Steam key inventory route with reveal-on-demand behavior.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { Button } from "../../components/ui/button";
import FilterBar, { type FilterBarField } from "../../components/FilterBar";
import BarChart from "../../components/charts/BarChart";
import { DataTable } from "../../components/DataTable";
import KeyInventorySummaryStrip from "../../components/KeyInventorySummaryStrip";
import { ProductCell } from "../../components/ProductCell";
import KeyValueCell from "../../components/KeyValueCell";
import RedemptionLinksButton from "../../components/RedemptionLinksButton";
import { useLibraryData } from "../../data/api";
import {
  applyProductFilters,
  buildKeyInventorySummary,
  type KeyInventoryScope,
  filterKeyInventoryByScope,
  flattenKeys,
  getFilterOptions,
  groupSmallValues,
  isSteamKeyType,
  normalizeKeyTypeLabel,
  normalizeKeyTypeValue,
  sortKeyInventoryForTriage,
} from "../../data/selectors";
import { useFilters } from "../../state/filters";
import { FlattenedKey } from "../../data/types";
import { formatDate } from "../../utils/format";

/**
 * Tabular view of non-Steam keys with type breakdowns and redeem actions.
 */
const NON_STEAM_KEY_FILTER_FIELDS: FilterBarField[] = [
  "category",
  "keyType",
  "dateRange",
];

export default function NonSteamKeys() {
  const { data, isLoading, error } = useLibraryData();
  const { filters, setFilters } = useFilters();
  const [scope, setScope] = useState<KeyInventoryScope>("all");

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    return applyProductFilters(data.products, filters, {
      keyType: null,
      keyPresence: null,
      downloadPresence: null,
      platform: null,
    });
  }, [data, filters]);

  const options = useMemo(() => {
    if (!data) return { categories: [], platforms: [], keyTypes: [] };
    const baseOptions = getFilterOptions(data.products);
    return {
      ...baseOptions,
      keyTypes: baseOptions.keyTypes.filter(
        (keyType) => !isSteamKeyType(keyType),
      ),
    };
  }, [data]);

  const nonSteamKeys = useMemo(
    () =>
      sortKeyInventoryForTriage(
        flattenKeys(filteredProducts).filter(
          (key) => !isSteamKeyType(key.keyType),
        ),
      ),
    [filteredProducts],
  );

  const summary = useMemo(
    () => buildKeyInventorySummary(nonSteamKeys),
    [nonSteamKeys],
  );

  const keys = useMemo(() => {
    const scoped = filterKeyInventoryByScope(nonSteamKeys, scope);
    if (!filters.keyType) return scoped;
    const selectedType = normalizeKeyTypeValue(filters.keyType || undefined);
    return scoped.filter(
      (key) => normalizeKeyTypeValue(key.keyType) === selectedType,
    );
  }, [filters.keyType, nonSteamKeys, scope]);

  const keyTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    nonSteamKeys.forEach((key) => {
      const id = normalizeKeyTypeValue(key.keyType);
      counts.set(id, (counts.get(id) || 0) + 1);
    });

    return groupSmallValues(
      Array.from(counts.entries()).map(([id, value]) => ({
        id,
        label: normalizeKeyTypeLabel(id),
        value,
      })),
    );
  }, [nonSteamKeys]);

  const columns: ColumnDef<FlattenedKey>[] = [
    { accessorKey: "keyName", header: "Item Name" },
    {
      accessorKey: "productName",
      header: "Source Bundle",
      cell: ProductCell,
    },
    {
      accessorKey: "dateAcquired",
      header: "Date Acquired",
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      accessorKey: "numDaysUntilExpired",
      header: "Expires In",
      cell: ({ getValue }) => {
        const val = getValue() as number | undefined;
        if (val === 0) {
          return <span className="text-destructive font-bold">Expired</span>;
        }
        if (val === undefined || val === -1) {
          return <span className="text-muted-foreground">–</span>;
        }
        return (
          <span className={val <= 30 ? "text-orange-500 font-bold" : ""}>
            {val} days
          </span>
        );
      },
    },
    {
      accessorKey: "keyType",
      header: "Key type",
      cell: ({ getValue }) => normalizeKeyTypeLabel(getValue() as string),
    },
    {
      id: "isClaimed",
      header: "Revealed",
      accessorFn: (row) => !!row.keyValue,
      cell: ({ getValue }) => {
        const revealed = getValue() as boolean;
        return (
          <span
            className={
              revealed ? "text-green-600 font-medium" : "text-muted-foreground"
            }>
            {revealed ? "Yes" : "No"}
          </span>
        );
      },
    },
    {
      accessorKey: "keyValue",
      header: "Key",
      meta: { filterKind: "keyValue" },
      cell: ({ getValue }) => <KeyValueCell value={getValue() as string} />,
    },
    {
      accessorKey: "redemptionLinks",
      header: "Redeem",
      cell: ({ row }) => (
        <RedemptionLinksButton
          links={row.original.redemptionLinks}
          compact
          label="Redeem"
        />
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => (getValue() as string[]).join(" · "),
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
        <h2 className="text-3xl font-bold tracking-tight">Non-Steam Keys</h2>
        <p className="text-muted-foreground">
          Track Epic, GOG, and other non-Steam redemption inventory across your
          library.
        </p>
      </div>

      <KeyInventorySummaryStrip
        items={[
          {
            label: "Keys in inventory",
            value: summary.total,
            hint: "Non-Steam inventory rows after current library filters",
          },
          {
            label: "Needs reveal",
            value: summary.needsReveal,
            hint: "Rows without visible key values",
          },
          {
            label: "Redeemable",
            value: summary.redeemable,
            hint: "Rows with a direct redeem link",
          },
          {
            label: "Instructions",
            value: summary.instructions,
            hint: "Rows with instructions-first flows",
          },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {[
          ["all", "All", summary.total],
          ["needs_reveal", "Needs reveal", summary.needsReveal],
          ["revealed", "Revealed", summary.revealed],
          ["redeemable", "Redeemable", summary.redeemable],
          ["instructions", "Instructions", summary.instructions],
          ["expiring", "Expiring", summary.expiring],
        ].map(([value, label, count]) => {
          const selected = scope === value;
          return (
            <Button
              key={value}
              size="sm"
              variant={selected ? "secondary" : "outline"}
              onClick={() => setScope(value as KeyInventoryScope)}>
              {label}
              <span className="ml-1 text-xs text-slate-300">{count}</span>
            </Button>
          );
        })}
      </div>

      <FilterBar
        categories={options.categories}
        platforms={options.platforms}
        keyTypes={options.keyTypes}
        fields={NON_STEAM_KEY_FILTER_FIELDS}
      />

      <BarChart
        title="Key types"
        data={keyTypeCounts}
        selected={filters.keyType}
        onSelect={(value) =>
          setFilters({ keyType: filters.keyType === value ? null : value })
        }
      />

      <DataTable
        columns={columns}
        data={keys}
        globalFilter={filters.search}
        onGlobalFilterChange={(search) => setFilters({ search })}
        searchPlaceholder="Search non-Steam keys, bundles, status, or app IDs"
      />
    </div>
  );
}
