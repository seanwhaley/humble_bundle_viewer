/**
 * Current sales route for reviewing one current bundle category against the local library.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Star, X } from "lucide-react";

import StatTile from "../../components/StatTile";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import {
  stickyTableHeaderSurfaceClass,
  tableHeaderCellClass,
} from "../../components/ui/table";
import {
  type CurrentBundleSummary,
  type CurrentBundleItem,
  type CurrentBundleTierOverlap,
  type CurrentBundleType,
  useCurrentBundlesReport,
  useCurrentBundlesStatus,
} from "../../data/api";
import { formatNumber } from "../../utils/format";
import {
  INSET_PANEL_CLASS,
  SELECTABLE_OPTION_PANEL_CLASS,
  TABLE_FRAME_CLASS,
} from "../../styles/roles";
import { cn } from "../../lib/utils";

type SalesBundlePageProps = {
  bundleType: CurrentBundleType;
};

type SelectedTierState = {
  bundleTitle: string;
  bundleUrl: string;
  bundleTypeLabel: string;
  offerEndsText: string | null;
  offerEndsDetail: string | null;
  bundleItems: CurrentBundleItem[];
  tierIndex: number;
  tier: CurrentBundleTierOverlap;
};

type BundleDisplayItem = CurrentBundleItem & {
  marked: boolean;
};

type BundleQuickFocus =
  | "all"
  | "all-new"
  | "partial-overlap"
  | "expiring-soon"
  | "deep-discount";

const CATEGORY_LABELS: Record<CurrentBundleType, string> = {
  games: "Games",
  books: "Books",
  software: "Software",
};

const CATEGORY_PAGE_LABELS: Record<CurrentBundleType, string> = {
  games: "Game",
  books: "Book",
  software: "Software",
};

const BUNDLE_QUICK_FOCUS_OPTIONS: Array<{
  id: BundleQuickFocus;
  label: string;
  description: string;
}> = [
  {
    id: "all",
    label: "All bundles",
    description: "Everything in the saved report for this category.",
  },
  {
    id: "all-new",
    label: "All-new",
    description: "Top tier has no owned overlap.",
  },
  {
    id: "partial-overlap",
    label: "Partial overlap",
    description: "Top tier mixes owned and new titles.",
  },
  {
    id: "expiring-soon",
    label: "Expiring ≤ 7 days",
    description: "Saved countdown is one week or less.",
  },
  {
    id: "deep-discount",
    label: "90%+ savings",
    description: "Tracked top-tier savings are at least 90%.",
  },
];

const formatTierPrice = (value: number) =>
  "$" +
  (value % 1 === 0 ?
    value.toFixed(0)
  : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

const sortTitles = (titles: string[]) =>
  [...titles].sort((left, right) => left.localeCompare(right));

const formatPercent = (value: number) =>
  value % 1 === 0 ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`;

const formatMultiple = (value: number) =>
  value % 1 === 0 ? `${value.toFixed(0)}×` : `${value.toFixed(1)}×`;

const getBundleTopTier = (bundle: CurrentBundleSummary) =>
  bundle.tiers[bundle.tiers.length - 1] ?? null;

const formatOfferCountdown = (value: string | null, detail?: string | null) => {
  if (value) {
    return value;
  }
  if (!detail) {
    return null;
  }

  const match = detail.match(/(?<days>\d+)\s+days?/i);
  if (!match?.groups?.days) {
    return null;
  }

  const days = Number(match.groups.days);
  if (Number.isNaN(days)) {
    return null;
  }

  return `${days} ${days === 1 ? "Day Left" : "Days Left"}`;
};

const titleKey = (value: string) => value.trim().toLocaleLowerCase();

const truncateText = (value: string, maxLength = 220) =>
  value.length <= maxLength ?
    value
  : `${value.slice(0, maxLength - 1).trimEnd()}…`;

const resolveBundleQuickFocus = (value: string | null): BundleQuickFocus => {
  return BUNDLE_QUICK_FOCUS_OPTIONS.some((option) => option.id === value) ?
      (value as BundleQuickFocus)
    : "all";
};

const matchesBundleQuickFocus = (
  bundle: CurrentBundleSummary,
  focus: BundleQuickFocus,
) => {
  if (focus === "all") {
    return true;
  }

  if (focus === "all-new") {
    return bundle.top_tier_status === "only_new";
  }

  if (focus === "partial-overlap") {
    return bundle.top_tier_status === "partial_overlap";
  }

  if (focus === "expiring-soon") {
    return bundle.offer_ends_in_days !== null && bundle.offer_ends_in_days <= 7;
  }

  const topTier = getBundleTopTier(bundle);
  return (topTier?.savings_percent ?? -1) >= 90;
};

const resolveBundleItems = (
  titles: string[],
  bundleItems: CurrentBundleItem[],
  markedTitles?: ReadonlySet<string>,
): BundleDisplayItem[] => {
  const itemLookup = new Map(
    bundleItems.map((item) => [titleKey(item.title), item]),
  );

  return sortTitles(titles).map((title) => {
    const match = itemLookup.get(titleKey(title));
    return {
      title,
      price_label: match?.price_label ?? "",
      price_value: match?.price_value ?? 0,
      price_kind: match?.price_kind ?? "at least",
      msrp_label: match?.msrp_label ?? null,
      msrp_value: match?.msrp_value ?? null,
      flavor_text: match?.flavor_text ?? null,
      description: match?.description ?? null,
      marked: markedTitles?.has(titleKey(title)) ?? false,
    };
  });
};

function TitleList({
  items,
  emptyMessage,
  markerLabel,
}: {
  items: BundleDisplayItem[];
  emptyMessage: string;
  markerLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="mt-2 grid gap-2 text-sm text-card-foreground sm:grid-cols-2 2xl:grid-cols-3">
      {items.map((item) => {
        const descriptionPreview =
          item.description ? truncateText(item.description) : null;
        const hasLongDescription = Boolean(
          item.description && descriptionPreview !== item.description,
        );

        return (
          <li
            key={item.title}
            className={cn(SELECTABLE_OPTION_PANEL_CLASS, "py-3")}>
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium text-card-foreground">
                {item.title}
              </span>
              {item.marked && (
                <Badge
                  variant="warning"
                  size="tiny"
                  casing="ui"
                  className="shrink-0 gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  {markerLabel || "Added this step"}
                </Badge>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <Badge variant="muted" size="compact" casing="ui">
                Unlocks at {formatTierPrice(item.price_value)}
              </Badge>
              {item.msrp_label && (
                <Badge variant="success" size="compact" casing="ui">
                  {item.msrp_label}
                </Badge>
              )}
              {item.flavor_text && (
                <Badge variant="muted" size="compact" casing="ui">
                  {item.flavor_text}
                </Badge>
              )}
            </div>

            {descriptionPreview && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {descriptionPreview}
              </p>
            )}

            {hasLongDescription && item.description && (
              <details className="mt-2 rounded-lg border border-border bg-surface-inset px-3 py-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium text-card-foreground hover:text-status-info-foreground">
                  Read full description
                </summary>
                <p className="mt-2 whitespace-pre-wrap leading-5 text-muted-foreground">
                  {item.description}
                </p>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TierContentsPanel({
  selectedTier,
  onClear,
}: {
  selectedTier: SelectedTierState | null;
  onClear: () => void;
}) {
  if (!selectedTier) {
    return null;
  }

  const { bundleItems, bundleTitle, bundleTypeLabel, tierIndex, tier } =
    selectedTier;
  const offerCountdown = formatOfferCountdown(
    selectedTier.offerEndsText,
    selectedTier.offerEndsDetail,
  );
  const addedTitles = sortTitles(tier.added_titles);
  const showStepUpMarkers = tierIndex > 0 && addedTitles.length > 0;
  const addedTitleSet = new Set(addedTitles.map(titleKey));
  const ownedItems = resolveBundleItems(
    tier.owned_titles,
    bundleItems,
    showStepUpMarkers ? addedTitleSet : undefined,
  );
  const newItems = resolveBundleItems(
    tier.new_titles,
    bundleItems,
    showStepUpMarkers ? addedTitleSet : undefined,
  );
  const hasEnrichedMetadata = bundleItems.some(
    (item) => item.msrp_label || item.flavor_text || item.description,
  );
  const summaryChips = [
    { label: "Tier price", value: formatTierPrice(tier.price_value) },
    { label: "Total items", value: String(tier.total_items) },
    { label: "Already owned", value: String(tier.owned_items) },
    { label: "New to you", value: String(tier.new_items) },
    ...(tier.msrp_total !== null ?
      [
        { label: "Tracked retail", value: formatTierPrice(tier.msrp_total) },
        {
          label: "Retail coverage",
          value: `${tier.msrp_known_items}/${tier.total_items}`,
        },
      ]
    : []),
    ...(tier.savings_percent !== null ?
      [{ label: "Tracked savings", value: formatPercent(tier.savings_percent) }]
    : []),
    ...(tier.value_multiple !== null ?
      [{ label: "Value multiple", value: formatMultiple(tier.value_multiple) }]
    : []),
  ];

  return (
    <aside
      className={cn(
        "h-[clamp(15rem,36vh,26rem)] w-full overflow-hidden backdrop-blur",
        SECTION_CARD_CLASS,
      )}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {bundleTypeLabel} · Tier {tierIndex + 1}
              </span>
              {offerCountdown && (
                <Badge variant="warning" size="compact" casing="ui">
                  Ends in {offerCountdown}
                </Badge>
              )}
              <Badge
                variant="surface"
                size="compact"
                casing="ui"
                className="text-card-foreground">
                {tier.missing_percent.toFixed(
                  tier.missing_percent % 1 === 0 ? 0 : 1,
                )}
                % new content
              </Badge>
              {showStepUpMarkers && (
                <Badge
                  variant="warning"
                  size="tiny"
                  casing="ui"
                  className="gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  step-up titles marked below
                </Badge>
              )}
            </div>
            <h4 className="mt-2 truncate text-lg font-semibold text-card-foreground">
              {bundleTitle}
            </h4>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            aria-label="Clear selected tier details">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2 text-xs">
            {summaryChips.map((item) => (
              <Badge
                key={item.label}
                variant="muted"
                size="compact"
                casing="ui"
                className="gap-2 px-3 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="text-sm font-semibold text-card-foreground">
                  {item.value}
                </p>
              </Badge>
            ))}
          </div>

          {!hasEnrichedMetadata && (
            <p className="text-xs text-muted-foreground">
              Refresh current sales analysis in Command Center to populate
              tracked MSRP and descriptions from the saved bundle pages.
            </p>
          )}

          <section className={INSET_PANEL_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h5 className="text-sm font-semibold uppercase tracking-[0.18em] text-card-foreground">
                Everything in this tier
              </h5>
              {showStepUpMarkers && (
                <Badge
                  variant="warning"
                  size="compact"
                  casing="ui"
                  className="gap-2 px-3 py-1">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  Added at this step-up from Tier {tierIndex} to Tier{" "}
                  {tierIndex + 1}
                </Badge>
              )}
            </div>

            <div className="mt-3 grid gap-4 2xl:grid-cols-2">
              <section className="rounded-2xl border border-status-success/40 bg-status-success/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="text-sm font-semibold uppercase tracking-[0.18em] text-status-success-foreground">
                    Owned in this tier
                  </h5>
                  <Badge
                    variant="surface"
                    size="compact"
                    casing="ui"
                    className="text-status-success-foreground">
                    {ownedItems.length}
                  </Badge>
                </div>
                <TitleList
                  items={ownedItems}
                  emptyMessage="Nothing in this tier is already in your library."
                  markerLabel="Added this step"
                />
              </section>

              <section className="rounded-2xl border border-status-info/40 bg-status-info/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="text-sm font-semibold uppercase tracking-[0.18em] text-status-info-foreground">
                    New in this tier
                  </h5>
                  <Badge
                    variant="surface"
                    size="compact"
                    casing="ui"
                    className="text-status-info-foreground">
                    {newItems.length}
                  </Badge>
                </div>
                <TitleList
                  items={newItems}
                  emptyMessage="You already own everything in this tier."
                  markerLabel="Added this step"
                />
              </section>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}

export default function SalesBundlePage({ bundleType }: SalesBundlePageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: status,
    isLoading: isStatusLoading,
    error: statusError,
  } = useCurrentBundlesStatus();
  const {
    data: report,
    isLoading: isReportLoading,
    error: reportError,
  } = useCurrentBundlesReport(status?.report_exists === true);
  const splitSectionRef = useRef<HTMLElement | null>(null);
  const tablePaneRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const [selectedTier, setSelectedTier] = useState<SelectedTierState | null>(
    null,
  );

  const bundles = useMemo(
    () =>
      (report?.bundles || []).filter(
        (bundle) => bundle.category === bundleType,
      ),
    [bundleType, report],
  );
  const activeFocus = resolveBundleQuickFocus(searchParams.get("focus"));
  const visibleBundles = useMemo(
    () =>
      bundles.filter((bundle) => matchesBundleQuickFocus(bundle, activeFocus)),
    [activeFocus, bundles],
  );
  const quickFocusCounts = useMemo(
    () =>
      Object.fromEntries(
        BUNDLE_QUICK_FOCUS_OPTIONS.map((option) => [
          option.id,
          bundles.filter((bundle) => matchesBundleQuickFocus(bundle, option.id))
            .length,
        ]),
      ) as Record<BundleQuickFocus, number>,
    [bundles],
  );
  const maxTierCount = useMemo(
    () => Math.max(...visibleBundles.map((bundle) => bundle.tiers.length), 0),
    [visibleBundles],
  );
  const summary = useMemo(() => {
    const earliestExpiringBundle = visibleBundles
      .filter((bundle) => bundle.offer_ends_in_days !== null)
      .sort(
        (left, right) =>
          (left.offer_ends_in_days ?? Number.MAX_SAFE_INTEGER) -
          (right.offer_ends_in_days ?? Number.MAX_SAFE_INTEGER),
      )[0];

    return {
      onlyNew: visibleBundles.filter(
        (bundle) => bundle.top_tier_status === "only_new",
      ).length,
      topTierNewTitles: visibleBundles.reduce(
        (total, bundle) =>
          total + (bundle.tiers[bundle.tiers.length - 1]?.new_items ?? 0),
        0,
      ),
      avgTopTierNewShare:
        visibleBundles.length > 0 ?
          visibleBundles.reduce(
            (total, bundle) =>
              total +
              (bundle.tiers[bundle.tiers.length - 1]?.missing_percent ?? 0),
            0,
          ) / visibleBundles.length
        : 0,
      earliestOfferCountdown: formatOfferCountdown(
        earliestExpiringBundle?.offer_ends_text ?? null,
        earliestExpiringBundle?.offer_ends_detail ?? null,
      ),
    };
  }, [visibleBundles]);

  const activeFocusMeta =
    BUNDLE_QUICK_FOCUS_OPTIONS.find((option) => option.id === activeFocus) ??
    BUNDLE_QUICK_FOCUS_OPTIONS[0];

  const setActiveFocus = (focus: BundleQuickFocus) => {
    const nextParams = new URLSearchParams(searchParams);
    if (focus === "all") {
      nextParams.delete("focus");
    } else {
      nextParams.set("focus", focus);
    }
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (
      selectedTier &&
      !visibleBundles.some((bundle) => bundle.url === selectedTier.bundleUrl)
    ) {
      setSelectedTier(null);
    }
  }, [selectedTier, visibleBundles]);

  useEffect(() => {
    const sectionElement = splitSectionRef.current;
    if (!selectedTier || !sectionElement) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      sectionElement.scrollIntoView({ block: "start" });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [selectedTier]);

  useEffect(() => {
    const tablePane = tablePaneRef.current;
    const rowElement =
      selectedTier ? rowRefs.current[selectedTier.bundleUrl] : null;

    if (!selectedTier || !tablePane || !rowElement) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      tablePane.scrollTo({
        top: Math.max(0, rowElement.offsetTop),
        behavior: "smooth",
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [selectedTier]);

  useEffect(() => {
    const sectionElement = splitSectionRef.current;
    if (!sectionElement) {
      return;
    }

    if (!selectedTier) {
      sectionElement.style.height = "";
      sectionElement.style.maxHeight = "";
      return;
    }

    const updateSplitHeight = () => {
      const rect = sectionElement.getBoundingClientRect();
      const availableHeight = Math.max(420, window.innerHeight - rect.top - 16);
      sectionElement.style.height = `${availableHeight}px`;
      sectionElement.style.maxHeight = `${availableHeight}px`;
    };

    updateSplitHeight();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ?
        new ResizeObserver(() => updateSplitHeight())
      : null;

    resizeObserver?.observe(sectionElement);
    window.addEventListener("resize", updateSplitHeight);
    const timeoutId = window.setTimeout(updateSplitHeight, 100);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateSplitHeight);
      window.clearTimeout(timeoutId);
    };
  }, [selectedTier]);

  useEffect(() => {
    if (!selectedTier) {
      return;
    }

    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    const previousHtmlOverflow = htmlElement.style.overflow;
    const previousBodyOverflow = bodyElement.style.overflow;

    htmlElement.style.overflow = "hidden";
    bodyElement.style.overflow = "hidden";

    return () => {
      htmlElement.style.overflow = previousHtmlOverflow;
      bodyElement.style.overflow = previousBodyOverflow;
    };
  }, [selectedTier]);

  if (isStatusLoading || (status?.report_exists && isReportLoading)) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        Failed to load current bundle status.
      </div>
    );
  }

  if (status?.report_exists && reportError) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        Failed to load the current bundle overlap report.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-6">
      <Card surface="panel">
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {BUNDLE_QUICK_FOCUS_OPTIONS.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={activeFocus === option.id ? "secondary" : "outline"}
                className={cn(
                  activeFocus === option.id ?
                    "border-status-info/40 bg-status-info/10 text-status-info-foreground"
                  : "border-border bg-surface-overlay text-card-foreground hover:bg-surface-inset",
                )}
                onClick={() => setActiveFocus(option.id)}>
                {option.label} ({quickFocusCounts[option.id]})
              </Button>
            ))}
          </div>
          <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
            Start with a quick view, then inspect populated tier cells to see
            the exact owned-versus-new breakdown for each bundle.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: `Visible ${CATEGORY_PAGE_LABELS[bundleType].toLowerCase()} bundles`,
                value: `${formatNumber(visibleBundles.length)} of ${formatNumber(bundles.length)}`,
                subtitle: "Bundles included in the current quick view",
              },
              {
                label: "All-new bundles",
                value: formatNumber(summary.onlyNew),
                subtitle: "Top-tier bundles with no owned overlap",
              },
              {
                label: "Top-tier new titles",
                value: formatNumber(summary.topTierNewTitles),
                subtitle: "New titles exposed by the visible top tiers",
              },
              {
                label: "Avg. top-tier new share",
                value: formatPercent(summary.avgTopTierNewShare),
                subtitle: "Average new-content share across visible top tiers",
              },
              {
                label: "Earliest expiry",
                value: summary.earliestOfferCountdown ?? "No saved countdown",
                subtitle: "Soonest saved offer deadline in this category",
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
          <p className="mt-3 text-xs text-muted-foreground">
            Current quick view: {activeFocusMeta.label}.{" "}
            {activeFocusMeta.description}
          </p>
        </CardContent>
      </Card>

      {!status?.report_exists && !report ?
        <Card surface="panel">
          <CardHeader className="p-6 pb-0">
            <h3 className="text-xl font-semibold text-card-foreground">
              No current bundle report yet
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Run the current sales bundle analysis from Command Center to
              capture the live Humble bundle index and compare each cumulative
              tier against your active library.
            </p>
          </CardHeader>
        </Card>
      : bundles.length === 0 ?
        <Card surface="panel">
          <CardHeader className="p-6 pb-0">
            <h3 className="text-xl font-semibold text-card-foreground">
              No {CATEGORY_PAGE_LABELS[bundleType].toLowerCase()} bundles in the
              saved report
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              The current artifact does not include the{" "}
              {CATEGORY_PAGE_LABELS[bundleType].toLowerCase()} bundle category.
              Run current sales analysis in Command Center or use the CLI if you
              want a fresh capture.
            </p>
          </CardHeader>
        </Card>
      : visibleBundles.length === 0 ?
        <Card surface="panel">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-card-foreground">
                  No {CATEGORY_PAGE_LABELS[bundleType].toLowerCase()} bundles
                  match this quick view
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {activeFocusMeta.label} is useful for fast triage, but nothing
                  in the saved {CATEGORY_PAGE_LABELS[bundleType].toLowerCase()}{" "}
                  bundle report matches it right now.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveFocus("all")}>
                  Show all bundles
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/sales">Open Sales Overview</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      : <Card
          ref={splitSectionRef}
          surface="panel"
          className={cn(
            "scroll-mt-20",
            selectedTier && "flex min-h-0 flex-col overflow-hidden",
          )}>
          <CardHeader className="p-6 pb-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-card-foreground">
                  {CATEGORY_PAGE_LABELS[bundleType]} bundle tier value table
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Click any populated tier cell to lock this section into
                  separate upper and lower panes while keeping the selected
                  bundle row in view.
                </p>
              </div>
              <Badge
                variant="surface"
                size="compact"
                casing="ui"
                className="px-3 py-1">
                {formatNumber(visibleBundles.length)} visible bundle
                {visibleBundles.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-6 pt-6">
            <div
              className={cn(
                "mt-6",
                selectedTier ?
                  "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
                : "space-y-6",
              )}>
              <div
                ref={tablePaneRef}
                className={cn(
                  TABLE_FRAME_CLASS,
                  selectedTier ?
                    "min-h-0 flex-1 overflow-auto"
                  : "overflow-x-auto",
                )}>
                <table className="min-w-full table-fixed border-collapse text-left text-sm">
                  <thead className={stickyTableHeaderSurfaceClass}>
                    <tr>
                      <th
                        className={`w-[28%] px-4 py-3 ${tableHeaderCellClass}`}>
                        Bundle
                      </th>
                      <th
                        className={`w-[12%] px-4 py-3 ${tableHeaderCellClass}`}>
                        Type
                      </th>
                      {Array.from(
                        { length: maxTierCount },
                        (_unused, index) => (
                          <th
                            key={index}
                            className={`px-4 py-3 ${tableHeaderCellClass}`}>
                            Tier {index + 1}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBundles.map((bundle) => (
                      <tr
                        key={bundle.url}
                        ref={(node) => {
                          rowRefs.current[bundle.url] = node;
                        }}
                        className="border-t border-border align-top">
                        <td className="px-4 py-4 text-card-foreground">
                          <div className="font-medium text-card-foreground">
                            {bundle.display_title || bundle.title}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge
                              variant="surface"
                              size="compact"
                              casing="ui"
                              className="gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-status-success-foreground" />
                              {bundle.top_tier_status.replaceAll("_", " ")}
                            </Badge>
                            {formatOfferCountdown(
                              bundle.offer_ends_text,
                              bundle.offer_ends_detail,
                            ) && (
                              <Badge
                                variant="warning"
                                size="compact"
                                casing="ui">
                                {formatOfferCountdown(
                                  bundle.offer_ends_text,
                                  bundle.offer_ends_detail,
                                )}
                              </Badge>
                            )}
                            <a
                              href={bundle.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-status-info-foreground transition-colors hover:text-status-info-foreground/80">
                              Open bundle page
                              <ArrowRight className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {bundle.display_type || bundle.bundle_type}
                        </td>
                        {Array.from(
                          { length: maxTierCount },
                          (_unused, index) => {
                            const tier = bundle.tiers[index];
                            const isSelected =
                              selectedTier?.bundleUrl === bundle.url &&
                              selectedTier.tierIndex === index;

                            return (
                              <td
                                key={index}
                                className="px-4 py-4 text-card-foreground">
                                {tier ?
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedTier({
                                        bundleTitle:
                                          bundle.display_title || bundle.title,
                                        bundleUrl: bundle.url,
                                        bundleTypeLabel:
                                          bundle.display_type ||
                                          bundle.bundle_type,
                                        offerEndsText: bundle.offer_ends_text,
                                        offerEndsDetail:
                                          bundle.offer_ends_detail,
                                        bundleItems: bundle.items,
                                        tierIndex: index,
                                        tier,
                                      })
                                    }
                                    className={cn(
                                      "w-full rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                      isSelected ?
                                        "border-status-info/50 bg-status-info/10 shadow-sm"
                                      : "border-border bg-surface-overlay hover:border-status-info/40 hover:bg-surface-inset",
                                    )}
                                    aria-label={`Inspect ${bundle.display_title || bundle.title} tier ${index + 1} details`}>
                                    <div className="space-y-1">
                                      <div className="font-medium text-card-foreground">
                                        {formatTierPrice(tier.price_value)}
                                      </div>
                                      <div>
                                        {tier.owned_items} already owned
                                      </div>
                                      <div>
                                        {tier.new_items} new item
                                        {tier.new_items === 1 ? "" : "s"}
                                      </div>
                                      <div>
                                        {tier.missing_percent.toFixed(
                                          tier.missing_percent % 1 === 0 ?
                                            0
                                          : 1,
                                        )}
                                        % new content
                                      </div>
                                      {tier.savings_percent !== null && (
                                        <div className="text-xs text-status-success-foreground">
                                          {formatPercent(tier.savings_percent)}{" "}
                                          off tracked retail
                                        </div>
                                      )}
                                      <div className="pt-1 text-xs font-medium text-status-info-foreground">
                                        {isSelected ?
                                          "Showing details"
                                        : "Inspect tier"}
                                      </div>
                                    </div>
                                  </button>
                                : <span className="text-muted-foreground">
                                    —
                                  </span>
                                }
                              </td>
                            );
                          },
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedTier ?
                <div className="shrink-0 border-t border-border pt-4">
                  <TierContentsPanel
                    selectedTier={selectedTier}
                    onClear={() => setSelectedTier(null)}
                  />
                </div>
              : <div
                  className={cn(
                    INSET_PANEL_CLASS,
                    "px-4 py-3 text-sm text-muted-foreground",
                  )}>
                  Select any populated tier cell to split this section into a
                  scrollable table pane above and a scrollable details pane
                  below.
                </div>
              }
            </div>
          </CardContent>
        </Card>
      }
    </div>
  );
}
