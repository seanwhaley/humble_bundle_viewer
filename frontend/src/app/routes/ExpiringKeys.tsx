/**
 * Expiring keys route with urgency highlighting.
 */
import { useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../components/DataTable";
import KeyInventorySummaryStrip from "../../components/KeyInventorySummaryStrip";
import { ProductCell } from "../../components/ProductCell";
import KeyValueCell from "../../components/KeyValueCell";
import RedemptionLinksButton from "../../components/RedemptionLinksButton";
import FilterBar, { type FilterBarField } from "../../components/FilterBar";
import { Button } from "../../components/ui/button";
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
          <span className={val < 30 ? "text-orange-500 font-bold" : ""}>
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
        : <span className="text-xs text-slate-500">
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
        <h2 className="text-3xl font-bold tracking-tight text-orange-500 flex items-center gap-2">
          <AlertTriangle className="h-8 w-8" />
          Urgent key triage
        </h2>
        <p className="text-muted-foreground">
          {expiringKeys.length} keys with expiration info —{" "}
          {expirationStats.expired} expired, {expirationStats.expiring} still on
          a countdown, {actionSummary.openActionCount} open actions,{" "}
          {summary.revealed} revealed.
        </p>
        <p className="text-sm text-muted-foreground/90 mt-2">
          Start with still-open windows first. Expired rows stay visible for
          reference, but quick scopes and row actions now prioritize the keys
          that can still be claimed.
        </p>
      </div>

      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-300">
              Active redemption window
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              {actionSummary.openActionCount} unexpired key
              {actionSummary.openActionCount === 1 ? "" : "s"} still need action
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {actionSummary.nextExpiringDaysRemaining !== null ?
                `Next deadline closes in ${actionSummary.nextExpiringDaysRemaining} day${actionSummary.nextExpiringDaysRemaining === 1 ? "" : "s"}.`
              : "No active countdowns remain in the current filter set."}{" "}
              {actionSummary.expiredReferenceCount > 0 ?
                `${actionSummary.expiredReferenceCount} expired row${actionSummary.expiredReferenceCount === 1 ? "" : "s"} remain below as reference.`
              : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant={triageScope === "needs_action" ? "secondary" : "outline"}
            onClick={() => setTriageScope("needs_action")}>
            Focus open actions
            <span className="ml-1 text-xs text-slate-300">
              {triageCounts.needs_action}
            </span>
          </Button>
        </div>
      </div>

      <KeyInventorySummaryStrip
        items={[
          {
            label: "Keys in triage",
            value: summary.total,
            hint: "Expired or dated key rows after current library filters",
          },
          {
            label: "Open actions",
            value: actionSummary.openActionCount,
            hint: "Unexpired rows still worth claiming under the current reveal policy",
          },
          {
            label: "Needs reveal",
            value: triageCounts.needs_reveal,
            hint: "Unexpired rows where Humble still hides the key value",
          },
          {
            label: "Expired",
            value: actionSummary.expiredReferenceCount,
            hint: "Reference rows already past the redemption window",
          },
        ]}
      />

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
              <span className="ml-1 text-xs text-slate-300">{count}</span>
            </Button>
          );
        })}
      </div>

      <FilterBar
        categories={options.categories}
        platforms={options.platforms}
        keyTypes={options.keyTypes}
        fields={EXPIRING_KEY_FILTER_FIELDS}
      />

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
