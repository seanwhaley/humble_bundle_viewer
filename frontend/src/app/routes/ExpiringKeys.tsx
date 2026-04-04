/**
 * Expiring keys route with urgency highlighting.
 */
import { useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../components/DataTable";
import { ProductCell } from "../../components/ProductCell";
import KeyValueCell from "../../components/KeyValueCell";
import RedemptionLinksButton from "../../components/RedemptionLinksButton";
import FilterBar, { type FilterBarField } from "../../components/FilterBar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import PageFiltersButton from "../../components/ui/PageFiltersButton";
import PaneHeader from "../../components/ui/PaneHeader";
import { RouteErrorState, RouteLoadingState } from "../../components/ui/RouteState";
import { useLibraryData, useViewerConfig } from "../../data/api";
import {
  applyProductFilters,
  buildExpiringKeyActionSummary,
  buildExpiringKeyScopeCounts,
  buildKeyInventorySummary,
  type ExpiringKeyScope,
  filterExpiringKeysByScope,
  flattenKeys,
  getFilterOptions,
  getKeyRedemptionActionLabel,
  shouldShowExpiringKeyAction,
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
 * Table focused on keys that are expired or approaching expiration.
 */
const EXPIRING_KEY_FILTER_FIELDS: FilterBarField[] = [
  "category",
  "keyType",
  "dateRange",
];

export default function ExpiringKeys() {
  const { data, isLoading, error } = useLibraryData();
  const { data: viewerConfig } = useViewerConfig();
  const { filters, setFilters } = useFilters();
  const [triageScope, setTriageScope] = useState<ExpiringKeyScope>("all");
  const [showFilters, setShowFilters] = useState(false);

  const revealPolicy = useMemo(
    () => ({
      assume_revealed_keys_redeemed:
        viewerConfig?.assume_revealed_keys_redeemed,
      ignore_revealed_status_for_expired_keys:
        viewerConfig?.ignore_revealed_status_for_expired_keys,
      ignore_revealed_status_for_unexpired_keys:
        viewerConfig?.ignore_revealed_status_for_unexpired_keys,
    }),
    [viewerConfig],
  );

  const options = useMemo(() => {
    if (!data) return { categories: [], platforms: [], keyTypes: [] };
    return getFilterOptions(data.products);
  }, [data]);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    return applyProductFilters(data.products, filters, {
      keyPresence: null,
      downloadPresence: null,
      platform: null,
    });
  }, [data, filters]);

  const expiringKeys = useMemo(() => {
    const allKeys = flattenKeys(filteredProducts);
    return allKeys
      .filter((key) => {
        // Condition: (Expired OR Has Expiration Date)
        // Note: flattening logic puts "Expired" in status if is_expired is true.
        const isExpired = key.status.includes("Expired");
        const hasExpirationDate =
          key.numDaysUntilExpired !== undefined && key.numDaysUntilExpired > -1;

        return isExpired || hasExpirationDate;
      })
      .sort((a, b) => {
        const aExpired =
          a.status.includes("Expired") || a.numDaysUntilExpired === 0;
        const bExpired =
          b.status.includes("Expired") || b.numDaysUntilExpired === 0;
        const aDays = aExpired ? -1 : (a.numDaysUntilExpired ?? 9999);
        const bDays = bExpired ? -1 : (b.numDaysUntilExpired ?? 9999);

        if (aDays !== bDays) return aDays - bDays;

        const aNeedsReveal = !a.keyValue;
        const bNeedsReveal = !b.keyValue;
        if (aNeedsReveal !== bNeedsReveal) return aNeedsReveal ? -1 : 1;

        return (a.keyName || "").localeCompare(b.keyName || "");
      });
  }, [filteredProducts]);

  const triageCounts = useMemo(
    () => buildExpiringKeyScopeCounts(expiringKeys, revealPolicy),
    [expiringKeys, revealPolicy],
  );

  const summary = useMemo(
    () => buildKeyInventorySummary(expiringKeys),
    [expiringKeys],
  );

  const actionSummary = useMemo(
    () => buildExpiringKeyActionSummary(filteredProducts, 30, revealPolicy),
    [filteredProducts, revealPolicy],
  );

  const scopedKeys = useMemo(
    () => filterExpiringKeysByScope(expiringKeys, triageScope, revealPolicy),
    [expiringKeys, triageScope, revealPolicy],
  );
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

  const expirationStats = useMemo(() => {
    let expired = 0;
    let expiring = 0;

    expiringKeys.forEach((key) => {
      const isExpired =
        key.status.includes("Expired") || key.numDaysUntilExpired === 0;
      const hasExpirationDate =
        key.numDaysUntilExpired !== undefined && key.numDaysUntilExpired > -1;
      if (isExpired) {
        expired += 1;
      } else if (hasExpirationDate) {
        expiring += 1;
      }
    });

    return { expired, expiring };
  }, [expiringKeys]);

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
      cell: ({ getValue, row }) => {
        const val = getValue() as number | undefined;
        const isExpired =
          row.getValue("status") === "Expired" ||
          (row.original.status && row.original.status.includes("Expired"));

        if (isExpired) {
          return (
            <span className="text-destructive font-bold flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Expired
            </span>
          );
        }

        if (val === undefined || val === -1)
          return <span className="text-muted-foreground">–</span>;

        return (
          <span
            className={
              val < 30 ? "font-semibold text-status-warning-foreground" : ""
            }>
            {val} days
          </span>
        );
      },
    },
    { accessorKey: "keyType", header: "Key type" },
    {
      accessorKey: "keyValue",
      header: "Key",
      meta: { filterKind: "keyValue" },
      cell: ({ getValue }) => <KeyValueCell value={getValue() as string} />,
    },
    {
      accessorKey: "redemptionLinks",
      header: "Action",
      cell: ({ row }) =>
        shouldShowExpiringKeyAction(row.original, revealPolicy) ?
          <RedemptionLinksButton
            links={row.original.redemptionLinks}
            compact
            label={getKeyRedemptionActionLabel(row.original)}
          />
        : <span className="text-xs text-muted-foreground">
            {row.original.status.includes("Expired") ? "Closed" : "Handled"}
          </span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => (getValue() as string[]).join(" · "),
    },
  ];

  if (isLoading) {
    return <RouteLoadingState label="Loading expiring keys…" />;
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
            title="Prioritize the keys that still have a redemption window"
            note={`${expiringKeys.length} keys with expiration info — ${expirationStats.expired} expired, ${expirationStats.expiring} still on a countdown, ${actionSummary.openActionCount} open actions, ${summary.revealed} revealed.`}
            description="Start with open windows, reveal-sensitive rows, and near-term deadlines first. Expired rows stay visible for reference, but the quick scopes keep the queue centered on claimable work."
            eyebrow={<Badge variant="warning">Key deadlines</Badge>}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                Keys in triage
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {summary.total} expired or dated key rows in the current filter scope.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                Open actions
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {actionSummary.openActionCount} unexpired key
                {actionSummary.openActionCount === 1 ? "" : "s"} still need action.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                Needs reveal
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {triageCounts.needs_reveal} unexpired row
                {triageCounts.needs_reveal === 1 ? "" : "s"} still hide the key value.
              </p>
            </div>
            <div className={INSET_PANEL_COMPACT_CLASS}>
              <p className={SECTION_EYEBROW_CLASS}>
                Expired reference
              </p>
              <p className="mt-2 text-sm text-card-foreground">
                {actionSummary.expiredReferenceCount} expired row
                {actionSummary.expiredReferenceCount === 1 ? "" : "s"} remain visible below for reference.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Active redemption window
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {actionSummary.nextExpiringDaysRemaining !== null ?
                  `Next deadline closes in ${actionSummary.nextExpiringDaysRemaining} day${actionSummary.nextExpiringDaysRemaining === 1 ? "" : "s"}.`
                : "No active countdowns remain in the current filter set."}
              </p>
            </div>
            <Button
              size="sm"
              variant={triageScope === "needs_action" ? "secondary" : "outline"}
              onClick={() => setTriageScope("needs_action")}>
              Focus open actions
              <span className="ml-1 text-xs text-muted-foreground">
                {triageCounts.needs_action}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {[
          ["all", "All", triageCounts.all],
          ["needs_action", "Needs action", triageCounts.needs_action],
          ["expired", "Expired", triageCounts.expired],
          ["next_7_days", "Next 7 days", triageCounts.next_7_days],
          ["next_30_days", "Next 30 days", triageCounts.next_30_days],
          ["needs_reveal", "Needs reveal", triageCounts.needs_reveal],
        ].map(([value, label, count]) => {
          const selected = triageScope === value;
          return (
            <Button
              key={value}
              size="sm"
              variant={selected ? "secondary" : "outline"}
              onClick={() => setTriageScope(value as ExpiringKeyScope)}>
              {label}
              <span className="ml-1 text-xs text-muted-foreground">{count}</span>
            </Button>
          );
        })}
      </div>

      {filtersPanelOpen && (
        <Card surface="panel" className={FILTER_PANEL_CLASS}>
          <CardHeader className="pb-3">
            <h3 className="text-base font-semibold text-card-foreground">
              Filter the triage queue
            </h3>
            <p className="text-sm text-muted-foreground">
              Narrow by category, key type, or acquisition date when you want the
              triage table to focus on a smaller set of deadlines.
            </p>
          </CardHeader>
          <CardContent>
            <FilterBar
              categories={options.categories}
              platforms={options.platforms}
              keyTypes={options.keyTypes}
              fields={EXPIRING_KEY_FILTER_FIELDS}
              hideHeader
              isExpanded
            />
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={scopedKeys}
        globalFilter={filters.search}
        onGlobalFilterChange={(search) => setFilters({ search })}
        searchPlaceholder="Search expiring keys, bundles, or statuses"
      />
    </div>
  );
}
