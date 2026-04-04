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
import RedemptionLinksButton from "../../components/RedemptionLinksButton";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import PageFiltersButton from "../../components/ui/PageFiltersButton";
import PaneHeader from "../../components/ui/PaneHeader";
import { RouteErrorState, RouteLoadingState } from "../../components/ui/RouteState";
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
import {
  FILTER_PANEL_CLASS,
  INSET_PANEL_COMPACT_CLASS,
  SECTION_EYEBROW_CLASS,
} from "../../styles/roles";
import { usePageHeaderActions } from "../layout/PageHeaderContext";

/**
 * Tabular view of Steam keys with reveal status and redeem actions.
 */
const STEAM_KEY_FILTER_FIELDS: FilterBarField[] = ["category", "dateRange"];

export default function SteamKeys() {
  const { data, isLoading, error } = useLibraryData();
  const { filters, setFilters } = useFilters();
  const [scope, setScope] = useState<KeyInventoryScope>("all");
  const [showFilters, setShowFilters] = useState(false);

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
  const activeFilterCount = [
    filters.category,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;
  const filtersPanelOpen = showFilters || activeFilterCount > 0;
  const headerActions = useMemo(
    () => (
      <PageFiltersButton
        expanded={filtersPanelOpen}
        activeCount={activeFilterCount}
        onClick={() => setShowFilters((current) => !current)}
      />
    ),
    [activeFilterCount, filtersPanelOpen],
  );
  usePageHeaderActions(headerActions);

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
          <span
            className={val <= 30 ? "font-bold text-status-warning-foreground" : ""}>
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
              revealed ?
                "font-medium text-status-success-foreground"
              : "text-muted-foreground"
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
    return <RouteLoadingState label="Loading Steam keys…" />;
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
            title="Work through the Steam redemption queue from one focused view"
            description="Check what is still hidden, what can be redeemed directly, and what needs follow-up without bouncing between separate key pages. Use the quick scopes to narrow the queue before opening rows."
            eyebrow={<Badge variant="info">Steam redemption</Badge>}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>Keys in scope</p>
              <p className="mt-2 text-sm text-card-foreground">
                {summary.total} Steam key row{summary.total === 1 ? "" : "s"} match the current library filters.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>Still hidden</p>
              <p className="mt-2 text-sm text-card-foreground">
                {summary.needsReveal} key value{summary.needsReveal === 1 ? "" : "s"} are still hidden by Humble.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>Direct redeem</p>
              <p className="mt-2 text-sm text-card-foreground">
                {summary.directRedeem} row{summary.directRedeem === 1 ? "" : "s"} have a direct Steam redemption path.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>Expiring</p>
              <p className="mt-2 text-sm text-card-foreground">
                {summary.expiring} row{summary.expiring === 1 ? "" : "s"} are expired or inside the warning window.
              </p>
            </div>
          </div>

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
                  <span className="ml-1 text-xs text-muted-foreground">{count}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {filtersPanelOpen && (
        <FilterBar
          categories={options.categories}
          platforms={options.platforms}
          keyTypes={options.keyTypes}
          fields={STEAM_KEY_FILTER_FIELDS}
          hideHeader
          isExpanded
          className={FILTER_PANEL_CLASS}
        />
      )}

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
