/**
 * Other Keys inventory route with reveal-on-demand behavior.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { Button } from "../../components/ui/button";
import FilterBar, { type FilterBarField } from "../../components/FilterBar";
import BarChart from "../../components/charts/BarChart";
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
  groupSmallValues,
  isSteamKeyType,
  normalizeKeyTypeLabel,
  normalizeKeyTypeValue,
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
 * Tabular view of Other Keys with type breakdowns and redeem actions.
 */
const OTHER_KEY_FILTER_FIELDS: FilterBarField[] = [
  "category",
  "keyType",
  "dateRange",
];

export default function OtherKeys() {
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
    const baseOptions = getFilterOptions(data.products);
    return {
      ...baseOptions,
      keyTypes: baseOptions.keyTypes.filter(
        (keyType) => !isSteamKeyType(keyType),
      ),
    };
  }, [data]);

  const otherKeys = useMemo(
    () =>
      sortKeyInventoryForTriage(
        flattenKeys(filteredProducts).filter(
          (key) => !isSteamKeyType(key.keyType),
        ),
      ),
    [filteredProducts],
  );

  const summary = useMemo(() => buildKeyInventorySummary(otherKeys), [otherKeys]);

  const keys = useMemo(() => {
    const scoped = filterKeyInventoryByScope(otherKeys, scope);
    if (!filters.keyType) return scoped;
    const selectedType = normalizeKeyTypeValue(filters.keyType || undefined);
    return scoped.filter(
      (key) => normalizeKeyTypeValue(key.keyType) === selectedType,
    );
  }, [filters.keyType, otherKeys, scope]);

  const keyTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    otherKeys.forEach((key) => {
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
  }, [otherKeys]);
  const activeFilterCount = [
    filters.category,
    filters.keyType,
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
  ];

  if (isLoading) {
    return <RouteLoadingState label="Loading Other Keys…" />;
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
            title="Keep Other Keys claims in one focused queue"
            description="Track Epic, GOG, launcher instructions, and other redemption paths without jumping between separate views. Use quick scopes and the key-type chart to narrow the current claim work."
            eyebrow={<Badge variant="info">Claim workflows</Badge>}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>Keys in scope</p>
              <p className="mt-2 text-sm text-card-foreground">
                {summary.total} other-key row{summary.total === 1 ? "" : "s"} match the current library filters.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>Still hidden</p>
              <p className="mt-2 text-sm text-card-foreground">
                {summary.needsReveal} key value{summary.needsReveal === 1 ? "" : "s"} still need to be revealed.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>Ready to claim</p>
              <p className="mt-2 text-sm text-card-foreground">
                {summary.redeemable} row{summary.redeemable === 1 ? "" : "s"} include a direct claim or redeem destination.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>Instruction-first</p>
              <p className="mt-2 text-sm text-card-foreground">
                {summary.instructions} row{summary.instructions === 1 ? "" : "s"} rely on instructions before redemption.
              </p>
            </div>
          </div>

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
          fields={OTHER_KEY_FILTER_FIELDS}
          hideHeader
          isExpanded
          className={FILTER_PANEL_CLASS}
        />
      )}

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
        searchPlaceholder="Search Other Keys, bundles, status, or app IDs"
      />
    </div>
  );
}
