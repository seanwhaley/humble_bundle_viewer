/**
 * Sales Overview route for comparing live bundles and the current Choice month in one filterable dashboard.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Filter, Loader2, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

import LineChart from "../../components/charts/LineChart";
import PieChart from "../../components/charts/PieChart";
import StatTile from "../../components/StatTile";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { RouteErrorState, RouteLoadingState } from "../../components/ui/RouteState";
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
import {
  ACTION_SURFACE_OUTLINE_BUTTON_CLASS,
  DISCLOSURE_SUMMARY_CHIP_CLASS,
  FEATURE_CARD_CLASS,
  FLOATING_PANEL_CLASS,
  FORM_CHECKBOX_CLASS,
  INSET_PANEL_BODY_TEXT_CLASS,
  SECTION_CHROME_CLASS,
  SECTION_DESCRIPTION_CLASS,
  SECTION_EYEBROW_CLASS,
  SECTION_TEXT_CLASS,
  SECTION_TITLE_LARGE_CLASS,
  SELECTABLE_OPTION_PANEL_CLASS,
  SHORTCUT_CARD_CLASS,
} from "../../styles/roles";
import {
  DISCLOSURE_BODY_PADDED_STACK_CLASS,
  DISCLOSURE_SUMMARY_PADDED_CLASS,
  EMPHASIS_TEXT_CLASS,
  FLOATING_DISCLOSURE_HEADER_CLASS,
  FLOATING_DISCLOSURE_LIST_CLASS,
  FLOATING_DISCLOSURE_PANEL_CLASS,
  GRID_TWO_FOUR_RELAXED_CLASS,
  GRID_TWO_THREE_SIX_COLUMN_CLASS,
  GRID_TWO_XL_SPLIT_CLASS,
  PAGE_STACK_ROOMY_CLASS,
  PANEL_HEADER_TOP_ALIGN_ROW_CLASS,
  PANEL_INTRO_TEXT_CLASS,
  PANEL_LEAD_TEXT_CLASS,
} from "../../styles/page";

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
    route: "/sales/choice",
  },
  {
    id: "games",
    label: "Game bundles",
    description: "Live game bundle tiers",
    route: "/sales/games",
  },
  {
    id: "books",
    label: "Book bundles",
    description: "Live book bundle tiers",
    route: "/sales/books",
  },
  {
    id: "software",
    label: "Software bundles",
    description: "Live software bundle tiers",
    route: "/sales/software",
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

const buildBundleFocusRoute = (bundleType: CurrentBundleType, focus: string) =>
  `/sales/${bundleType}?focus=${focus}`;

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

export default function SalesOverview() {
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
    return <RouteLoadingState label="Loading current sales overview…" />;
  }

  if (bundlesStatusError || choiceStatusError) {
    return <RouteErrorState message="Failed to load current sales status." />;
  }

  if (
    (bundlesStatus?.report_exists && bundlesReportError) ||
    (choiceStatus?.report_exists && choiceReportError)
  ) {
    return <RouteErrorState message="Failed to load one or more current sales reports." />;
  }

  return (
    <div className={PAGE_STACK_ROOMY_CLASS}>
      <Card surface="panel">
        <CardHeader className="p-5 pb-0">
          <div className={PANEL_HEADER_TOP_ALIGN_ROW_CLASS}>
            <div>
              <div className={SECTION_CHROME_CLASS}>
                <Sparkles className="h-4 w-4" />
                <p className={SECTION_EYEBROW_CLASS}>
                  Current sales analysis
                </p>
              </div>
              <p className={PANEL_INTRO_TEXT_CLASS}>
                Compare the current Choice month and live bundle tiers in one
                dashboard, then narrow the analysis to one or more content types
                without leaving the current sales section.
              </p>
            </div>

            <details className="group relative">
              <summary className={DISCLOSURE_SUMMARY_CHIP_CLASS}>
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                Content filter · {filterSummaryLabel}
              </summary>
              <div className={cn(FLOATING_PANEL_CLASS, FLOATING_DISCLOSURE_PANEL_CLASS)}>
                <div className={FLOATING_DISCLOSURE_HEADER_CLASS}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Included sources
                  </p>
                  <button
                    type="button"
                    onClick={setAllTypes}
                    className="text-xs font-medium text-status-info-foreground hover:text-status-info-foreground/80">
                    Select all
                  </button>
                </div>
                <div className={FLOATING_DISCLOSURE_LIST_CLASS}>
                  {CONTENT_TYPE_OPTIONS.map((option) => {
                    const checked = selectedTypes.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className={SELECTABLE_OPTION_PANEL_CLASS}>
                        <input
                          type="checkbox"
                          className={FORM_CHECKBOX_CLASS}
                          checked={checked}
                          onChange={() => toggleType(option.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-card-foreground">
                            {option.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
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
        </CardHeader>

        <CardContent className="p-5 pt-4">
          <div className={GRID_TWO_THREE_SIX_COLUMN_CLASS}>
            {[
              {
                label: "Packages",
                value: formatNumber(totals.packageCount),
                subtitle: "Current Choice plus live bundles in scope",
              },
              {
                label: "Tier levels",
                value: formatNumber(totals.tierCount),
                subtitle: "Bundle tiers and Choice month included",
              },
              {
                label: "Titles in scope",
                value: formatNumber(totals.totalCount),
                subtitle: "All titles currently included in the filter",
              },
              {
                label: "New to you",
                value: formatNumber(totals.newCount),
                subtitle: "Titles you do not already own",
              },
              {
                label: "Owned",
                value: formatNumber(totals.ownedCount),
                subtitle: "Titles already matched to your library",
              },
              {
                label: "New-content share",
                value: formatPercent(totals.newShare),
                subtitle: "Share of in-scope titles that are new to you",
              },
            ].map((item) => (
              <StatTile
                key={item.label}
                label={item.label}
                value={item.value}
                subtitle={item.subtitle}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {filteredBundles.length === 0 ?
        <Card surface="panel">
          <CardHeader className="p-6 pb-0">
            <h2 className={SECTION_TITLE_LARGE_CLASS}>
              No bundle data in the current filter
            </h2>
            <p className={PANEL_INTRO_TEXT_CLASS}>
              The totals above still include Current Choice when selected, but the
              aggregate bundle analysis below only renders when at least one
              bundle type with saved data is in scope.
            </p>
          </CardHeader>
        </Card>
      : <>
          <Card surface="panel">
            <CardHeader className="p-6 pb-0">
              <div className={SECTION_CHROME_CLASS}>
                <Sparkles className="h-4 w-4" />
                <p className={SECTION_EYEBROW_CLASS}>
                  Included sources
                </p>
              </div>
              <p className={PANEL_LEAD_TEXT_CLASS}>
                Keep the current filter grounded with concise source summaries and
                direct links, without repeating another full layer of duplicate
                metric cards.
              </p>
            </CardHeader>

            <CardContent className="p-6 pt-5">
              <div className={GRID_TWO_FOUR_RELAXED_CLASS}>
                {filteredSourceSummaries.map((summary) => (
                  <Link
                    key={summary.id}
                    to={summary.route}
                    className={FEATURE_CARD_CLASS}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {summary.label}
                        </p>
                        <p className={SECTION_DESCRIPTION_CLASS}>
                          {summary.description}
                        </p>
                      </div>
                      <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                    </div>
                    <p className={INSET_PANEL_BODY_TEXT_CLASS}>
                      {summary.headline}
                    </p>
                    <p className={SECTION_DESCRIPTION_CLASS}>
                      {summary.helper}
                    </p>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card surface="panel">
            <CardHeader className="p-6 pb-0">
              <div className={SECTION_CHROME_CLASS}>
                <Sparkles className="h-4 w-4" />
                <p className={SECTION_EYEBROW_CLASS}>
                  Decision shortcuts
                </p>
              </div>
              <div className="mt-3 space-y-2 text-sm text-card-foreground">
                <p>
                  Start with the four high-signal bundle questions below, then
                  jump directly into the matching bundle-type route when you know
                  what kind of decision you need to make next.
                </p>
                <p className="text-muted-foreground">
                  Current Choice still stays in the summary totals above when
                  selected, but these shortcut cards stay bundle-only because the
                  criteria depend on bundle tier overlap, expiry countdowns, and
                  tracked tier savings.
                </p>
              </div>
            </CardHeader>

            <CardContent className="p-6 pt-5">
              <div className={GRID_TWO_FOUR_RELAXED_CLASS}>
                {bundleCriteriaCards.map((card) => (
                  <section
                    key={card.id}
                    className={SHORTCUT_CARD_CLASS}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {card.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-card-foreground">
                      {formatNumber(card.count)}
                      <span className="ml-2 text-sm font-medium text-muted-foreground">
                        / {formatNumber(card.total)} bundles
                      </span>
                    </p>
                    <p className={INSET_PANEL_BODY_TEXT_CLASS}>
                      {formatPercent(card.percent)} of the selected bundles match
                      this criterion.
                    </p>
                    <p className={SECTION_DESCRIPTION_CLASS}>
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
                            className={ACTION_SURFACE_OUTLINE_BUTTON_CLASS}>
                            <Link to={route.route}>Review {route.label}</Link>
                          </Button>
                        ))
                      : <span className="text-xs text-muted-foreground">
                          No matching bundle-type routes in the current source
                          filter.
                        </span>
                      }
                    </div>
                  </section>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className={GRID_TWO_XL_SPLIT_CLASS}>
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

          <Card surface="panel">
            <CardContent className="p-0">
              <details>
                <summary className={DISCLOSURE_SUMMARY_PADDED_CLASS}>
                  <div className={SECTION_CHROME_CLASS}>
                    <Sparkles className="h-4 w-4" />
                    <p className={SECTION_EYEBROW_CLASS}>
                      How to read the charts
                    </p>
                  </div>
                  <p className="mt-3 max-w-3xl pb-6 text-sm text-muted-foreground">
                    Open this guide only when you need the extra interpretation
                    details.
                  </p>
                </summary>
                <div className={DISCLOSURE_BODY_PADDED_STACK_CLASS}>
                  <p>
                    <span className={EMPHASIS_TEXT_CLASS}>
                      The first two pie charts partition the selected bundles
                    </span>{" "}
                    into bundle-type matches plus a remaining{" "}
                    <span className={EMPHASIS_TEXT_CLASS}>Not matching</span>{" "}
                    slice, so each one still represents the whole filtered bundle
                    set.
                  </p>
                  <p>
                    <span className={EMPHASIS_TEXT_CLASS}>
                      All-new bundles
                    </span>{" "}
                    and{" "}
                    <span className={EMPHASIS_TEXT_CLASS}>
                      Partial-overlap bundles
                    </span>{" "}
                    come directly from the top included tier for each bundle.
                  </p>
                  <p>
                    <span className={EMPHASIS_TEXT_CLASS}>
                      Bundle expiry timeline
                    </span>{" "}
                    now runs from the farthest saved expiry on the left toward day 0
                    on the right, so the chart reads like a countdown instead of a
                    category pie.
                  </p>
                  <p>
                    <span className={EMPHASIS_TEXT_CLASS}>
                      Tracked savings distribution curve
                    </span>{" "}
                    now starts just below the current minimum tracked savings and
                    uses tighter percentage bands so you can read the shape of the
                    live discount spread instead of staring at a single
                    deep-discount threshold.
                  </p>
                  <p>
                    <span className={EMPHASIS_TEXT_CLASS}>Hover popups</span>{" "}
                    now focus on bundle counts, product counts, top-tier spend,
                    tracked retail, and savings context instead of listing package
                    titles.
                  </p>
                  <p>
                    <span className={EMPHASIS_TEXT_CLASS}>Current Choice</span>{" "}
                    still contributes to the totals in the summary strip above when
                    selected, but it is intentionally excluded from these
                    bundle-only match charts because it is not part of the
                    games/books/software bundle-type breakdown.
                  </p>
                </div>
              </details>
            </CardContent>
          </Card>
        </>
      }
    </div>
  );
}
