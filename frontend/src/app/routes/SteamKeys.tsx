/**
 * Steam key inventory route with reveal-on-demand behavior.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { Button } from "../../components/ui/button";
import FilterBar, { type FilterBarField } from "../../components/FilterBar";
import { DataTable } from "../../components/DataTable";
import { ProductCell } from "../../components/ProductCell";
import KeyValueCell from "../../components/KeyValueCell";
import KeyInventorySummaryStrip from "../../components/KeyInventorySummaryStrip";
import RedemptionLinksButton from "../../components/RedemptionLinksButton";
import { useLibraryData } from "../../data/api";
import {
  applyProductFilters,
  buildKeyInventorySummary,
  type KeyInventoryScope,
  filterKeyInventoryByScope,
  flattenKeys,
  getFilterOptions,
  isSteamKeyType,
  sortKeyInventoryForTriage,
} from "../../data/selectors";
import { useFilters } from "../../state/filters";
import { FlattenedKey } from "../../data/types";
import { formatDate } from "../../utils/format";

/**
 * Tabular view of Steam keys with reveal status and redeem actions.
 */
const STEAM_KEY_FILTER_FIELDS: FilterBarField[] = ["category", "dateRange"];

export default function SteamKeys() {
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
    return getFilterOptions(data.products);
  }, [data]);

  const steamKeys = useMemo(
    () =>
      sortKeyInventoryForTriage(
        flattenKeys(filteredProducts).filter((key) =>
          isSteamKeyType(key.keyType),
        ),
      ),
    [filteredProducts],
  );

  const summary = useMemo(
    () => buildKeyInventorySummary(steamKeys),
    [steamKeys],
  );

  const keys = useMemo(
    () => filterKeyInventoryByScope(steamKeys, scope),
    [scope, steamKeys],
  );

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
    { accessorKey: "steamAppId", header: "Steam App ID" },
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
        <h2 className="text-3xl font-bold tracking-tight">Steam Keys</h2>
        <p className="text-muted-foreground">
          Review Steam redemption inventory, reveal status, and quick redeem
          actions.
        </p>
      </div>

      <KeyInventorySummaryStrip
        items={[
          {
            label: "Keys in inventory",
            value: summary.total,
            hint: "Steam inventory rows after current library filters",
          },
          {
            label: "Needs reveal",
            value: summary.needsReveal,
            hint: "Rows without visible key values",
          },
          {
            label: "Redeemable",
            value: summary.redeemable,
            hint: "Rows with a direct redeem destination",
          },
          {
            label: "Expiring",
            value: summary.expiring,
            hint: "Expired or within 30 days",
          },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {[
          ["all", "All", summary.total],
          ["needs_reveal", "Needs reveal", summary.needsReveal],
          ["revealed", "Revealed", summary.revealed],
          ["redeemable", "Redeemable", summary.redeemable],
          ["expiring", "Expiring", summary.expiring],
          ["direct_redeem", "Direct redeem", summary.directRedeem],
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
        fields={STEAM_KEY_FILTER_FIELDS}
      />

      <DataTable
        columns={columns}
        data={keys}
        globalFilter={filters.search}
        onGlobalFilterChange={(search) => setFilters({ search })}
        searchPlaceholder="Search Steam keys, bundles, status, or Steam IDs"
      />
    </div>
  );
}
