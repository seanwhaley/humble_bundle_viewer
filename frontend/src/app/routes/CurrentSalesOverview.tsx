/**
 * Sales Overview route for comparing live bundles and the current Choice month in one filterable dashboard.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Filter, Loader2, Sparkles } from "lucide-react";

import LineChart from "../../components/charts/LineChart";
import PieChart from "../../components/charts/PieChart";
import { Button } from "../../components/ui/button";
import {
  type CurrentBundleSummary,
  type CurrentBundleTierOverlap,
  type CurrentBundleType,
  useCurrentBundlesReport,
  useCurrentBundlesStatus,
  useCurrentChoiceReport,
  useCurrentChoiceStatus,
} from "../../data/api";
import { formatCurrency, formatNumber } from "../../utils/format";

type SalesContentType = "choice" | CurrentBundleType;

type BundleCriteriaCard = {
  id: string;
  label: string;
  description: string;
  count: number;
  total: number;
  percent: number;
  chartTitle: string;
  chartData: Array<{
    id: string;
    label: string;
    value: number;
    details?: string;
  }>;
  matchingRoutes: Array<{
    id: CurrentBundleType;
    label: string;
    route: string;
  }>;
};

type SourceSummary = {
  id: SalesContentType;
  label: string;
  description: string;
  route: string;
  available: boolean;
  headline: string;
  helper: string;
};

type BundleAggregateStats = {
  bundleCount: number;
  productCount: number;
  spendTotal: number;
  trackedRetailTotal: number;
  trackedRetailBundleCount: number;
};

const CONTENT_TYPE_OPTIONS: Array<{
  id: SalesContentType;
  label: string;
  description: string;
  route: string;
}> = [
  {
    id: "choice",
    label: "Current Choice",
    description: "Current month package",
    route: "/venue/choice",
  },
  {
    id: "games",
    label: "Game bundles",
    description: "Live game bundle tiers",
    route: "/venue/bundles/games",
  },
  {
    id: "books",
    label: "Book bundles",
    description: "Live book bundle tiers",
    route: "/venue/bundles/books",
  },
  {
    id: "software",
    label: "Software bundles",
    description: "Live software bundle tiers",
    route: "/venue/bundles/software",
  },
];

const ALL_CONTENT_TYPES = CONTENT_TYPE_OPTIONS.map((option) => option.id);

const formatPercent = (value: number) =>
  value % 1 === 0 ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`;

const isBundleType = (value: SalesContentType): value is CurrentBundleType =>
  value !== "choice";

const getBundleTopTier = (
  bundle: CurrentBundleSummary,
): CurrentBundleTierOverlap | null =>
  bundle.tiers[bundle.tiers.length - 1] ?? null;

const getBundleTypeLabel = (bundleType: CurrentBundleType) =>
  CONTENT_TYPE_OPTIONS.find((option) => option.id === bundleType)?.label ??
  bundleType;

const formatDaysLabel = (days: number) => `${days} day${days === 1 ? "" : "s"}`;

const buildBundleFocusRoute = (
  bundleType: CurrentBundleType,
  focus: string,
) => `/venue/bundles/${bundleType}?focus=${focus}`;

const getTopTiers = (bundles: CurrentBundleSummary[]) =>
  bundles.map(getBundleTopTier).filter(Boolean) as CurrentBundleTierOverlap[];

const summarizeBundles = (
  bundles: CurrentBundleSummary[],
): BundleAggregateStats => {
  const topTiers = getTopTiers(bundles);

  return {
    bundleCount: bundles.length,
    productCount: topTiers.reduce((total, tier) => total + tier.total_items, 0),
    spendTotal: topTiers.reduce((total, tier) => total + tier.price_value, 0),
    trackedRetailTotal: topTiers.reduce(
      (total, tier) => total + (tier.msrp_total ?? 0),
      0,
    ),
    trackedRetailBundleCount: topTiers.filter(
      (tier) => tier.msrp_total !== null,
    ).length,
  };
};

const buildBundleStatsDetails = (
  bundles: CurrentBundleSummary[],
  extraLines: Array<string | null> = [],
) => {
  const stats = summarizeBundles(bundles);

  return [
    `${formatNumber(stats.bundleCount)} bundle${stats.bundleCount === 1 ? "" : "s"} · ${formatNumber(stats.productCount)} product${stats.productCount === 1 ? "" : "s"}`,
    `Top-tier spend: ${formatCurrency(stats.spendTotal)}`,
    stats.trackedRetailBundleCount > 0 ?
      `Tracked retail: ${formatCurrency(stats.trackedRetailTotal)} across ${formatNumber(stats.trackedRetailBundleCount)} bundle${stats.trackedRetailBundleCount === 1 ? "" : "s"}`
    : "Tracked retail: unavailable for these bundles",
    ...extraLines,
  ]
    .filter(Boolean)
    .join("\n");
};

const buildBundleBreakdown = (
  bundles: CurrentBundleSummary[],
  bundleTypes: CurrentBundleType[],
  predicate: (bundle: CurrentBundleSummary) => boolean,
) => {
  const matchingCount = bundles.filter(predicate).length;
  const slices = bundleTypes
    .map((bundleType) => {
      const matchingBundles = bundles.filter(
        (bundle) => bundle.category === bundleType && predicate(bundle),
      );
      const count = matchingBundles.length;

      if (count === 0) {
        return null;
      }

      return {
        id: bundleType,
        label: getBundleTypeLabel(bundleType),
        value: count,
        details: buildBundleStatsDetails(matchingBundles, [
          `${formatNumber(count)} bundle${count === 1 ? "" : "s"} from ${getBundleTypeLabel(bundleType).toLowerCase()} match this criterion.`,
        ]),
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    label: string;
    value: number;
    details?: string;
  }>;

  const remainingCount = Math.max(0, bundles.length - matchingCount);
  if (remainingCount > 0) {
    const remainingBundles = bundles.filter((bundle) => !predicate(bundle));
    slices.push({
      id: "not-matching",
      label: "Not matching",
      value: remainingCount,
      details: buildBundleStatsDetails(remainingBundles, [
        `${formatNumber(remainingCount)} bundle${remainingCount === 1 ? "" : "s"} stay outside this criterion.`,
      ]),
    });
  }

  return {
    count: matchingCount,
    chartData: slices,
  };
};

export default function CurrentSalesOverview() {
  const {
    data: bundlesStatus,
    isLoading: isBundlesStatusLoading,
    error: bundlesStatusError,
  } = useCurrentBundlesStatus();
  const {
    data: bundlesReport,
    isLoading: isBundlesReportLoading,
    error: bundlesReportError,
  } = useCurrentBundlesReport(bundlesStatus?.report_exists === true);
  const {
    data: choiceStatus,
    isLoading: isChoiceStatusLoading,
    error: choiceStatusError,
  } = useCurrentChoiceStatus();
  const {
    data: choiceReport,
    isLoading: isChoiceReportLoading,
    error: choiceReportError,
  } = useCurrentChoiceReport(choiceStatus?.report_exists === true);

  const [selectedTypes, setSelectedTypes] =
    useState<SalesContentType[]>(ALL_CONTENT_TYPES);

  const selectedBundleTypes = useMemo(
    () => selectedTypes.filter(isBundleType),
    [selectedTypes],
  );
  const includeChoice = selectedTypes.includes("choice");

  const allBundles = bundlesReport?.bundles ?? [];
  const filteredBundles = useMemo(
    () =>
      allBundles.filter(
        (bundle) =>
          isBundleType(bundle.category as SalesContentType) &&
          selectedBundleTypes.includes(bundle.category as CurrentBundleType),
      ),
    [allBundles, selectedBundleTypes],
  );

  const totals = useMemo(() => {
    const bundleTopTiers = filteredBundles
      .map(getBundleTopTier)
      .filter(Boolean) as CurrentBundleTierOverlap[];

    const bundlePackageCount = filteredBundles.length;
    const bundleTierCount = filteredBundles.reduce(
      (total, bundle) => total + bundle.tiers.length,
      0,
    );
    const bundleTotalCount = bundleTopTiers.reduce(
      (total, tier) => total + tier.total_items,
      0,
    );
    const bundleOwnedCount = bundleTopTiers.reduce(
      (total, tier) => total + tier.owned_items,
      0,
    );
    const bundleNewCount = bundleTopTiers.reduce(
      (total, tier) => total + tier.new_items,
      0,
    );

    const choicePackageCount = includeChoice && choiceReport ? 1 : 0;
    const choiceTierCount = includeChoice && choiceReport ? 1 : 0;
    const choiceTotalCount =
      includeChoice && choiceReport ? choiceReport.total_titles : 0;
    const choiceOwnedCount =
      includeChoice && choiceReport ? choiceReport.owned_titles : 0;
    const choiceNewCount =
      includeChoice && choiceReport ? choiceReport.new_titles : 0;

    const packageCount = bundlePackageCount + choicePackageCount;
    const tierCount = bundleTierCount + choiceTierCount;
    const totalCount = bundleTotalCount + choiceTotalCount;
    const ownedCount = bundleOwnedCount + choiceOwnedCount;
    const newCount = bundleNewCount + choiceNewCount;

    return {
      packageCount,
      tierCount,
      totalCount,
      ownedCount,
      newCount,
      newShare: totalCount > 0 ? (newCount / totalCount) * 100 : 0,
    };
  }, [choiceReport, filteredBundles, includeChoice]);

  const filteredSourceSummaries = useMemo<SourceSummary[]>(() => {
    return CONTENT_TYPE_OPTIONS.filter((option) =>
      selectedTypes.includes(option.id),
    ).map((option) => {
      if (option.id === "choice") {
        return {
          id: option.id,
          label: option.label,
          description: option.description,
          route: option.route,
          available: Boolean(choiceReport),
          headline:
            choiceReport ?
              `${formatNumber(choiceReport.total_titles)} titles in ${choiceReport.month_label}`
            : "No saved Choice report",
          helper:
            choiceReport ?
              `${formatPercent(choiceReport.new_percent)} new to you`
            : "Run the Choice analysis to populate this source.",
        };
      }

      const bundlesForType = filteredBundles.filter(
        (bundle) => bundle.category === option.id,
      );
      const topTiers = bundlesForType
        .map(getBundleTopTier)
        .filter(Boolean) as CurrentBundleTierOverlap[];
      const totalTitles = topTiers.reduce(
        (total, tier) => total + tier.total_items,
        0,
      );
      const newTitles = topTiers.reduce(
        (total, tier) => total + tier.new_items,
        0,
      );

      return {
        id: option.id,
        label: option.label,
        description: option.description,
        route: option.route,
        available: bundlesForType.length > 0,
        headline:
          bundlesForType.length > 0 ?
            `${formatNumber(bundlesForType.length)} bundles · ${formatNumber(totalTitles)} titles`
          : "No saved bundles in scope",
        helper:
          bundlesForType.length > 0 ?
            `${formatPercent(totalTitles > 0 ? (newTitles / totalTitles) * 100 : 0)} new to you`
          : "Broaden the filter or refresh this source.",
      };
    });
  }, [choiceReport, filteredBundles, selectedTypes]);

  const bundleCriteriaCards = useMemo<BundleCriteriaCard[]>(() => {
    const totalBundles = filteredBundles.length;
    const criteria = [
      {
        id: "all-new",
        label: "All-new bundles",
        description: "Top included tier has no owned overlap.",
        chartTitle: "All-new bundles by bundle type",
        predicate: (bundle: CurrentBundleSummary) =>
          bundle.top_tier_status === "only_new",
      },
      {
        id: "partial-overlap",
        label: "Partial-overlap bundles",
        description: "Top included tier still mixes owned and new titles.",
        chartTitle: "Partial-overlap bundles by bundle type",
        predicate: (bundle: CurrentBundleSummary) =>
          bundle.top_tier_status === "partial_overlap",
      },
      {
        id: "expiring-soon",
        label: "Expiring within 7 days",
        description: "Saved bundle countdown is down to one week or less.",
        chartTitle: "Expiring-soon bundles by bundle type",
        predicate: (bundle: CurrentBundleSummary) =>
          bundle.offer_ends_in_days !== null && bundle.offer_ends_in_days <= 7,
      },
      {
        id: "deep-discount",
        label: "90%+ tracked savings",
        description: "Top included tier is at least 90% off tracked retail.",
        chartTitle: "Deep-discount bundles by bundle type",
        predicate: (bundle: CurrentBundleSummary) => {
          const topTier = getBundleTopTier(bundle);
          return (topTier?.savings_percent ?? -1) >= 90;
        },
      },
    ];

    return criteria.map((criterion) => {
      const breakdown = buildBundleBreakdown(
        filteredBundles,
        selectedBundleTypes,
        criterion.predicate,
      );

      return {
        id: criterion.id,
        label: criterion.label,
        description: criterion.description,
        count: breakdown.count,
        total: totalBundles,
        percent: totalBundles > 0 ? (breakdown.count / totalBundles) * 100 : 0,
        chartTitle: criterion.chartTitle,
        chartData: breakdown.chartData,
        matchingRoutes: selectedBundleTypes
          .filter((bundleType) =>
            filteredBundles.some(
              (bundle) =>
                bundle.category === bundleType && criterion.predicate(bundle),
            ),
          )
          .map((bundleType) => ({
            id: bundleType,
            label: getBundleTypeLabel(bundleType),
            route: buildBundleFocusRoute(bundleType, criterion.id),
          })),
      };
    });
  }, [filteredBundles, selectedBundleTypes]);

  const expiryTimelineData = useMemo(() => {
    const bundlesWithCountdowns = filteredBundles
      .filter((bundle) => bundle.offer_ends_in_days !== null)
      .sort(
        (left, right) =>
          (left.offer_ends_in_days ?? Number.MAX_SAFE_INTEGER) -
          (right.offer_ends_in_days ?? Number.MAX_SAFE_INTEGER),
      );

    const grouped = new Map<number, CurrentBundleSummary[]>();
    bundlesWithCountdowns.forEach((bundle) => {
      const days = bundle.offer_ends_in_days ?? 0;
      const current = grouped.get(days) ?? [];
      current.push(bundle);
      grouped.set(days, current);
    });

    return Array.from(grouped.entries())
      .sort(([left], [right]) => right - left)
      .map(([days, bundles]) => ({
        id: String(days),
        label: formatDaysLabel(days),
        value: bundles.length,
        details: buildBundleStatsDetails(bundles, [
          `Countdown bucket: ${formatDaysLabel(days)} remaining.`,
        ]),
      }));
  }, [filteredBundles]);

  const savingsDistributionData = useMemo(() => {
    const savingsBundles = filteredBundles
      .map((bundle) => {
        const topTier = getBundleTopTier(bundle);
        return {
          bundle,
          savingsPercent: topTier?.savings_percent ?? null,
        };
      })
      .filter(
        (
          entry,
        ): entry is { bundle: CurrentBundleSummary; savingsPercent: number } =>
          entry.savingsPercent !== null,
      );

    if (savingsBundles.length === 0) {
      return [];
    }

    const bandSize = 3;
    const minSavings = Math.min(
      ...savingsBundles.map((entry) => entry.savingsPercent),
    );
    const maxSavings = Math.max(
      ...savingsBundles.map((entry) => entry.savingsPercent),
    );
    const bandStart = Math.max(0, Math.floor(minSavings - 5));
    const bandEndExclusive = Math.max(
      bandStart + bandSize,
      Math.ceil(maxSavings) + 1,
    );

    const bands = [] as Array<{
      id: string;
      label: string;
      min: number;
      max: number;
    }>;

    for (
      let currentMin = bandStart;
      currentMin < bandEndExclusive;
      currentMin += bandSize
    ) {
      const currentMax = currentMin + bandSize;
      bands.push({
        id: `${currentMin}-${currentMax}`,
        label: `${currentMin}–${currentMax - 1}%`,
        min: currentMin,
        max: currentMax,
      });
    }

    return bands.map((band) => {
      const matches = savingsBundles.filter(({ savingsPercent }) => {
        return savingsPercent >= band.min && savingsPercent < band.max;
      });

      const averageSavings =
        matches.length > 0 ?
          matches.reduce((total, entry) => total + entry.savingsPercent, 0) /
          matches.length
        : null;

      return {
        id: band.id,
        label: band.label,
        value: matches.length,
        details: buildBundleStatsDetails(
          matches.map((entry) => entry.bundle),
          [
            averageSavings !== null ?
              `Average tracked savings: ${formatPercent(averageSavings)}.`
            : "No bundles in this savings band.",
          ],
        ),
      };
    });
  }, [filteredBundles]);

  const filterSummaryLabel =
    selectedTypes.length === ALL_CONTENT_TYPES.length ?
      "All content"
    : `${selectedTypes.length} type${selectedTypes.length === 1 ? "" : "s"} selected`;

  const setAllTypes = () => setSelectedTypes(ALL_CONTENT_TYPES);
  const toggleType = (type: SalesContentType) => {
    setSelectedTypes((current) => {
      if (current.includes(type)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((entry) => entry !== type);
      }

      const next = [...current, type];
      return CONTENT_TYPE_OPTIONS.map((option) => option.id).filter((option) =>
        next.includes(option),
      );
    });
  };

  if (
    isBundlesStatusLoading ||
    isChoiceStatusLoading ||
    (bundlesStatus?.report_exists && isBundlesReportLoading) ||
    (choiceStatus?.report_exists && isChoiceReportLoading)
  ) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (bundlesStatusError || choiceStatusError) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        Failed to load current sales status.
      </div>
    );
  }

  if (
    (bundlesStatus?.report_exists && bundlesReportError) ||
    (choiceStatus?.report_exists && choiceReportError)
  ) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        Failed to load one or more current sales reports.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-300">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Current sales analysis
              </p>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Compare the current Choice month and live bundle tiers in one
              dashboard, then narrow the analysis to one or more content types
              without leaving the current sales section.
            </p>
          </div>

          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-indigo-500/40 hover:text-white">
              <Filter className="h-3.5 w-3.5 text-indigo-300" />
              Content filter · {filterSummaryLabel}
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-800 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Included sources
                </p>
                <button
                  type="button"
                  onClick={setAllTypes}
                  className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                  Select all
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {CONTENT_TYPE_OPTIONS.map((option) => {
                  const checked = selectedTypes.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-400"
                        checked={checked}
                        onChange={() => toggleType(option.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-white">
                          {option.label}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </details>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Packages", value: formatNumber(totals.packageCount) },
            { label: "Tier levels", value: formatNumber(totals.tierCount) },
            {
              label: "Titles in scope",
              value: formatNumber(totals.totalCount),
            },
            { label: "New to you", value: formatNumber(totals.newCount) },
            { label: "Owned", value: formatNumber(totals.ownedCount) },
            {
              label: "New-content share",
              value: formatPercent(totals.newShare),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300">
              <span>{item.label}:</span>{" "}
              <span className="font-semibold text-slate-100">{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      {filteredBundles.length === 0 ?
        <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
          <h2 className="text-xl font-semibold text-white">
            No bundle data in the current filter
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            The totals above still include Current Choice when selected, but the
            aggregate bundle analysis below only renders when at least one
            bundle type with saved data is in scope.
          </p>
        </section>
      : <>
          <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
            <div className="flex items-center gap-2 text-indigo-300">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Included sources
              </p>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              Keep the current filter grounded with concise source summaries and
              direct links, without repeating another full layer of duplicate
              metric cards.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {filteredSourceSummaries.map((summary) => (
                <Link
                  key={summary.id}
                  to={summary.route}
                  className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-indigo-500/40 hover:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
                        {summary.label}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {summary.description}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 text-slate-500 transition group-hover:text-indigo-300" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-white">
                    {summary.headline}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {summary.helper}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
            <div className="flex items-center gap-2 text-indigo-300">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Decision shortcuts
              </p>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p>
                Start with the four high-signal bundle questions below, then
                jump directly into the matching bundle-type route when you know
                what kind of decision you need to make next.
              </p>
              <p className="text-slate-400">
                Current Choice still stays in the summary totals above when
                selected, but these shortcut cards stay bundle-only because the
                criteria depend on bundle tier overlap, expiry countdowns, and
                tracked tier savings.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {bundleCriteriaCards.map((card) => (
                <section
                  key={card.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {formatNumber(card.count)}
                    <span className="ml-2 text-sm font-medium text-slate-500">
                      / {formatNumber(card.total)} bundles
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    {formatPercent(card.percent)} of the selected bundles match
                    this criterion.
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {card.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {card.matchingRoutes.length > 0 ?
                      card.matchingRoutes.map((route) => (
                        <Button
                          key={`${card.id}-${route.id}`}
                          asChild
                          size="sm"
                          variant="outline"
                          className="border-slate-700 bg-slate-950/40 text-slate-100 hover:border-indigo-500/40 hover:bg-slate-900">
                          <Link to={route.route}>Review {route.label}</Link>
                        </Button>
                      ))
                    : <span className="text-xs text-slate-500">
                        No matching bundle-type routes in the current source filter.
                      </span>}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            {bundleCriteriaCards.slice(0, 2).map((card) => (
              <PieChart
                key={card.id}
                title={card.chartTitle}
                data={card.chartData}
                emptyMessage="No bundles are currently in scope for this breakdown."
                labelFormatter={({ label, value }) =>
                  `${label}: ${formatPercent(
                    card.total > 0 ? (value / card.total) * 100 : 0,
                  )}`
                }
                tooltipFormatter={({ label, value, details }) => {
                  const percent =
                    card.total > 0 ? (value / card.total) * 100 : 0;
                  return [
                    `${label}: ${formatNumber(value)} bundle${value === 1 ? "" : "s"}`,
                    `${formatPercent(percent)} of the ${formatNumber(card.total)} selected bundles.`,
                    card.description,
                    details?.replace(/\n/g, "<br/>") ?? "",
                  ].join("<br/>");
                }}
              />
            ))}

            <LineChart
              title="Bundle expiry timeline by days remaining"
              data={expiryTimelineData}
              emptyMessage="No saved countdowns are available for the selected bundles."
              valueLabel="Bundles"
              tooltipFormatter={({ label, value, details }) =>
                [
                  `${label}: ${formatNumber(value)} bundle${value === 1 ? "" : "s"}`,
                  details?.replace(/\n/g, "<br/>") ?? "",
                ]
                  .filter(Boolean)
                  .join("<br/>")
              }
            />

            <LineChart
              title="Tracked savings distribution curve"
              data={savingsDistributionData}
              emptyMessage="No tracked MSRP savings are available for the selected bundles."
              valueLabel="Bundles"
              tooltipFormatter={({ label, value, details }) =>
                [
                  `${label}: ${formatNumber(value)} bundle${value === 1 ? "" : "s"}`,
                  details?.replace(/\n/g, "<br/>") ?? "",
                ]
                  .filter(Boolean)
                  .join("<br/>")
              }
            />
          </div>

          <details className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center gap-2 text-indigo-300">
                <Sparkles className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                  How to read the charts
                </p>
              </div>
              <p className="mt-3 max-w-3xl text-sm text-slate-400">
                Open this guide only when you need the extra interpretation details.
              </p>
            </summary>
            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <p>
                <span className="font-semibold text-white">
                  The first two pie charts partition the selected bundles
                </span>{" "}
                into bundle-type matches plus a remaining{" "}
                <span className="font-semibold text-white">Not matching</span>{" "}
                slice, so each one still represents the whole filtered bundle
                set.
              </p>
              <p>
                <span className="font-semibold text-white">
                  All-new bundles
                </span>{" "}
                and{" "}
                <span className="font-semibold text-white">
                  Partial-overlap bundles
                </span>{" "}
                come directly from the top included tier for each bundle.
              </p>
              <p>
                <span className="font-semibold text-white">
                  Bundle expiry timeline
                </span>{" "}
                now runs from the farthest saved expiry on the left toward day 0
                on the right, so the chart reads like a countdown instead of a
                category pie.
              </p>
              <p>
                <span className="font-semibold text-white">
                  Tracked savings distribution curve
                </span>{" "}
                now starts just below the current minimum tracked savings and
                uses tighter percentage bands so you can read the shape of the
                live discount spread instead of staring at a single
                deep-discount threshold.
              </p>
              <p>
                <span className="font-semibold text-white">Hover popups</span>{" "}
                now focus on bundle counts, product counts, top-tier spend,
                tracked retail, and savings context instead of listing package
                titles.
              </p>
              <p>
                <span className="font-semibold text-white">Current Choice</span>{" "}
                still contributes to the totals in the summary strip above when
                selected, but it is intentionally excluded from these
                bundle-only match charts because it is not part of the
                games/books/software bundle-type breakdown.
              </p>
            </div>
          </details>
        </>
      }
    </div>
  );
}
