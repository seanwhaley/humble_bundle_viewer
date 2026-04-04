/**
 * Viewer home route.
 */
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import BarChart from "../../components/charts/BarChart";
import StatTile from "../../components/StatTile";
import { Badge, type BadgeProps } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import PageFiltersButton from "../../components/ui/PageFiltersButton";
import PaneHeader from "../../components/ui/PaneHeader";
import { RouteErrorState, RouteLoadingState } from "../../components/ui/RouteState";
import {
  type CurrentBundleSummary,
  type CurrentBundleType,
  useCurrentBundlesReport,
  useCurrentBundlesStatus,
  useCurrentChoiceStatus,
  useLibraryStatus,
  useOptionalLibraryData,
  useViewerConfig,
} from "../../data/api";
import {
  applyProductFilters,
  buildCategoryCounts,
  buildHistoryData,
  buildKeyTypeCounts,
  buildPlatformCounts,
  buildPublisherCounts,
  collectProductDownloads,
  computeStats,
  getFilterOptions,
  normalizeCategoryLabel,
  normalizeKeyTypeLabel,
  normalizePlatformLabel,
} from "../../data/selectors";
import { cn } from "../../lib/utils";
import { useFilters } from "../../state/filters";
import { getLinkExpirationSummary } from "../../utils/downloads";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "../../utils/format";
import { usePageHeaderActions } from "../layout/PageHeaderContext";
import {
  CHECKBOX_PANEL_CLASS,
  FIELD_LABEL_CLASS,
  FEATURE_CARD_CLASS,
  FEATURE_CARD_DIVIDER_CLASS,
  FORM_SELECT_CLASS,
  INLINE_TOGGLE_PANEL_CLASS,
  METRIC_LABEL_CLASS,
  SECTION_EYEBROW_CLASS,
  SEGMENTED_CONTROL_CLASS,
  TOGGLE_PANEL_CLASS,
} from "../../styles/roles";

type RefreshTone = "neutral" | "success" | "warning" | "error";

type RefreshMeta = {
  label: string;
  helper: string;
  tone: RefreshTone;
};

type SourceCardModel = {
  id: string;
  title: string;
  href: string;
  primaryLine: ReactNode;
  secondaryLine?: ReactNode;
};

const bundleTypeLabel: Record<CurrentBundleType, string> = {
  games: "Games",
  books: "Books",
  software: "Software",
};

const allLiveBundleTypes = Object.keys(bundleTypeLabel) as CurrentBundleType[];

const getActiveFilterCount = (
  filters: ReturnType<typeof useFilters>["filters"],
) =>
  [
    filters.search,
    filters.category,
    filters.platform,
    filters.keyType,
    filters.keyPresence,
    filters.downloadPresence,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;

const buildActiveScopeChips = (
  filters: ReturnType<typeof useFilters>["filters"],
) =>
  [
    filters.search ? `Search: ${filters.search}` : null,
    filters.category ?
      `Category: ${normalizeCategoryLabel(filters.category)}`
    : null,
    filters.platform ?
      `Platform: ${normalizePlatformLabel(filters.platform)}`
    : null,
    filters.keyType ?
      `Key type: ${normalizeKeyTypeLabel(filters.keyType)}`
    : null,
    filters.keyPresence === "has_keys" ? "Keys: Has keys"
    : filters.keyPresence === "no_keys" ? "Keys: No keys"
    : null,
    filters.downloadPresence === "has_downloads" ? "Downloads: Has downloads"
    : filters.downloadPresence === "no_downloads" ? "Downloads: No downloads"
    : null,
    filters.startDate ? `From: ${formatDate(filters.startDate)}` : null,
    filters.endDate ? `To: ${formatDate(filters.endDate)}` : null,
  ].filter(Boolean) as string[];

const inlineBadgeClass =
  "px-2.5 py-1 text-xs font-medium normal-case tracking-normal";

const SUMMARY_HEADER_META_CLASS =
  "flex flex-wrap gap-2 text-xs lg:max-w-[28rem] lg:justify-self-end lg:justify-end";

function SurfaceBadge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: BadgeProps["variant"];
}) {
  return (
    <Badge variant={variant} className={inlineBadgeClass}>
      {children}
    </Badge>
  );
}

const HomeSection = ({
  action,
  children,
  className,
  description,
  icon: Icon,
  title,
  eyebrow,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description: string;
  icon?: LucideIcon;
  title: string;
  eyebrow: string;
}) => (
  <Card surface="panel" className={className}>
    <CardHeader className="p-5 pb-0">
      <PaneHeader
        titleAs="h2"
        title={title}
        description={description}
        titleClassName="text-xl"
        descriptionClassName="leading-6"
        eyebrow={
          <div className="flex items-center gap-2 text-muted-foreground">
            {Icon && <Icon className="h-4 w-4" />}
            <p className={SECTION_EYEBROW_CLASS}>{eyebrow}</p>
          </div>
        }
        topRight={action}
        topRightClassName="shrink-0 text-inherit"
      />
    </CardHeader>
    <CardContent className="p-5 pt-4">{children}</CardContent>
  </Card>
);

const getFreshnessMeta = (generatedAt: string | null): RefreshMeta => {
  if (!generatedAt) {
    return {
      label: "Missing",
      helper: "No saved snapshot yet.",
      tone: "error",
    };
  }

  const generatedDate = new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) {
    return {
      label: "Saved",
      helper: "Snapshot is available, but its timestamp could not be read.",
      tone: "neutral",
    };
  }

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfGeneratedDay = new Date(
    generatedDate.getFullYear(),
    generatedDate.getMonth(),
    generatedDate.getDate(),
  );
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfGeneratedDay.getTime()) /
      (24 * 60 * 60 * 1000),
  );

  if (diffDays <= 0) {
    return {
      label: "Updated today",
      helper: `Saved ${formatDateTime(generatedAt)}.`,
      tone: "success",
    };
  }

  if (diffDays === 1) {
    return {
      label: "Updated yesterday",
      helper: `Saved ${formatDateTime(generatedAt)}.`,
      tone: "neutral",
    };
  }

  return {
    label: `${diffDays} days old`,
    helper: `Saved ${formatDateTime(generatedAt)}.`,
    tone: "error",
  };
};

const currentChoiceExpectedLabel = () => {
  const now = new Date();
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(now);
};

const matchesCurrentChoiceMonth = (monthLabel: string | null) => {
  if (!monthLabel) {
    return false;
  }

  const expected = currentChoiceExpectedLabel().toLowerCase();
  const normalized = monthLabel.toLowerCase();
  const [expectedMonth, expectedYear] = expected.split(" ");
  const hasYear = /\b\d{4}\b/.test(normalized);

  if (!normalized.includes(expectedMonth)) {
    return false;
  }

  return hasYear ? normalized.includes(expectedYear) : true;
};

const getCurrentChoiceMeta = (
  monthLabel: string | null,
  generatedAt: string | null,
) => {
  if (!monthLabel) {
    return {
      label: "Missing",
      helper: `Refresh this monthly snapshot when ${currentChoiceExpectedLabel()} goes live.`,
      tone: "warning" as const,
    };
  }

  if (matchesCurrentChoiceMonth(monthLabel)) {
    return {
      label: "Current month",
      helper:
        generatedAt ?
          `Saved ${formatDateTime(generatedAt)}.`
        : "Saved for this month.",
      tone: "success" as const,
    };
  }

  return {
    label: "Refresh needed",
    helper: `Saved month is ${monthLabel}; refresh for ${currentChoiceExpectedLabel()}.`,
    tone: "warning" as const,
  };
};

const choiceMonthNameLookup = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const resolveChoiceMonthDate = (
  monthLabel: string | null,
  generatedAt: string | null,
) => {
  if (!monthLabel) {
    return null;
  }

  const [monthToken, yearToken] = monthLabel.trim().split(/\s+/);
  const monthIndex = choiceMonthNameLookup.findIndex(
    (monthName) => monthName === monthToken?.toLowerCase(),
  );

  if (monthIndex < 0) {
    return null;
  }

  const generatedDate = generatedAt ? new Date(generatedAt) : null;
  const fallbackYear =
    generatedDate && !Number.isNaN(generatedDate.getTime()) ?
      generatedDate.getFullYear()
    : new Date().getFullYear();
  const parsedYear =
    yearToken && /^\d{4}$/.test(yearToken) ? Number(yearToken) : fallbackYear;

  return new Date(parsedYear, monthIndex, 1);
};

const getCurrentChoiceCountdownLabel = (
  monthLabel: string | null,
  generatedAt: string | null,
) => {
  const choiceMonthDate = resolveChoiceMonthDate(monthLabel, generatedAt);
  if (!choiceMonthDate) {
    return null;
  }

  const nextMonthDate = new Date(
    choiceMonthDate.getFullYear(),
    choiceMonthDate.getMonth() + 1,
    1,
  );
  const diffMs = nextMonthDate.getTime() - Date.now();

  if (diffMs <= 0) {
    return {
      label: "Refresh now",
      helper: null,
    };
  }

  const diffHours = diffMs / (60 * 60 * 1000);
  if (diffHours < 24) {
    return {
      label: "Under 1 day left",
      helper: "until next month available",
    };
  }

  const diffDays = Math.ceil(diffHours / 24);
  return {
    label: `${diffDays} ${diffDays === 1 ? "Day Left" : "Days Left"}`,
    helper: "until next month available",
  };
};

const getCountdownHours = (bundle: CurrentBundleSummary) => {
  const detail = bundle.offer_ends_detail?.toLowerCase() ?? "";
  const dayMatch = detail.match(/(?<days>\d+)\s+days?/i);
  const hourMatch = detail.match(/(?<hours>\d+)\s+hours?/i);
  const detailDays =
    dayMatch?.groups?.days ? Number(dayMatch.groups.days) : null;
  const detailHours =
    hourMatch?.groups?.hours ? Number(hourMatch.groups.hours) : null;

  if (detailDays !== null && !Number.isNaN(detailDays)) {
    return (
      detailDays * 24 +
      (detailHours && !Number.isNaN(detailHours) ? detailHours : 0)
    );
  }

  if (detailHours !== null && !Number.isNaN(detailHours)) {
    return detailHours;
  }

  if (bundle.offer_ends_in_days !== null) {
    return bundle.offer_ends_in_days * 24;
  }

  return null;
};

const formatCountdownLabel = (bundle: CurrentBundleSummary | null) => {
  if (!bundle) {
    return "No saved countdown";
  }

  if (bundle.offer_ends_text) {
    if (/^\s*0+\s+days?\s+left\s*$/i.test(bundle.offer_ends_text)) {
      return "Under 1 day left";
    }
    return bundle.offer_ends_text;
  }

  const countdownHours = getCountdownHours(bundle);
  if (countdownHours === null) {
    return "No saved countdown";
  }

  if (countdownHours < 24) {
    return "Under 1 day left";
  }

  const countdownDays = Math.floor(countdownHours / 24);
  return `${countdownDays} ${countdownDays === 1 ? "Day Left" : "Days Left"}`;
};

const getEarliestExpiringBundle = (bundles: CurrentBundleSummary[]) => {
  return bundles.reduce<CurrentBundleSummary | null>((earliest, bundle) => {
    const currentHours = getCountdownHours(bundle);
    if (currentHours === null) {
      return earliest;
    }

    const earliestHours = earliest ? getCountdownHours(earliest) : null;
    if (earliestHours === null || currentHours < earliestHours) {
      return bundle;
    }

    return earliest;
  }, null);
};

const getEarliestExpiringBundleGroup = (bundles: CurrentBundleSummary[]) => {
  const earliestBundle = getEarliestExpiringBundle(bundles);
  if (!earliestBundle) {
    return null;
  }

  const earliestLabel = formatCountdownLabel(earliestBundle);
  const matchingCount = bundles.filter(
    (bundle) => formatCountdownLabel(bundle) === earliestLabel,
  ).length;

  return {
    earliestBundle,
    matchingCount,
    label: earliestLabel,
  };
};

const formatAvailableOffersSummary = (count: number) =>
  `available offer${count === 1 ? "" : "s"}`;

const getChoiceMonthDisplay = (monthLabel: string | null) => {
  if (!monthLabel) {
    return "saved month";
  }

  return monthLabel.trim().split(/\s+/)[0] ?? monthLabel;
};

const getDownloadExpiryMeta = (
  urls: Array<string | undefined>,
  expiringSoonMs: number,
) => {
  const summary = getLinkExpirationSummary(urls, expiringSoonMs);
  switch (summary.state) {
    case "upcoming":
      return {
        label: "Download expiry tracked",
        tone: "neutral" as const,
      };
    case "expiring":
      return {
        label: "Download links expiring soon",
        tone: "warning" as const,
      };
    case "partialExpired":
      return {
        label: "Some download links expired",
        tone: "warning" as const,
      };
    case "allExpired":
      return {
        label: "All known download links expired",
        tone: "error" as const,
      };
    case "unknown":
    default:
      return {
        label: "Download expiry unknown",
        tone: "neutral" as const,
      };
  }
};

function SourceCard({ card }: { card: SourceCardModel }) {
  return (
    <Link to={card.href} className="group block">
      <Card className={cn(FEATURE_CARD_CLASS, "h-full") }>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className={METRIC_LABEL_CLASS}>{card.title}</h3>
            <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
          </div>

          <div className="mt-4">{card.primaryLine}</div>
          {card.secondaryLine && (
            <div className={FEATURE_CARD_DIVIDER_CLASS}>
              {card.secondaryLine}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function FilterToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={TOGGLE_PANEL_CLASS}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-border bg-background text-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-card-foreground">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground [text-wrap:pretty]">
          {description}
        </span>
      </span>
    </label>
  );
}

/**
 * Viewer home route using the approved homepage design.
 */
export default function Home() {
  const {
    data: libraryStatus,
    isLoading: isLibraryStatusLoading,
    error: libraryStatusError,
  } = useLibraryStatus();
  const {
    data,
    isLoading: isLibraryLoading,
    error,
  } = useOptionalLibraryData(libraryStatus?.exists === true);
  const { data: viewerConfig } = useViewerConfig();
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
  const { filters, setFilters, clearFilters } = useFilters();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLiveBundleTypes, setSelectedLiveBundleTypes] =
    useState<CurrentBundleType[]>(allLiveBundleTypes);
  const [showDeeperAnalytics, setShowDeeperAnalytics] = useState(false);
  const [timeScale, setTimeScale] = useState<
    "day" | "month" | "quarter" | "year"
  >("month");

  const hasLibraryData = libraryStatus?.exists === true && Boolean(data);
  const activeLibraryFilterCount = hasLibraryData ? getActiveFilterCount(filters) : 0;
  const activeFilterCount =
    activeLibraryFilterCount +
    (selectedLiveBundleTypes.length === allLiveBundleTypes.length ? 0 : 1);
  const headerActions = useMemo(
    () => (
      <PageFiltersButton
        expanded={showFilters}
        activeCount={activeFilterCount}
        onClick={() => setShowFilters((current) => !current)}
      />
    ),
    [activeFilterCount, showFilters],
  );
  usePageHeaderActions(headerActions);

  if (
    isLibraryStatusLoading ||
    (libraryStatus?.exists === true && isLibraryLoading) ||
    isBundlesStatusLoading ||
    isChoiceStatusLoading ||
    (bundlesStatus?.report_exists && isBundlesReportLoading)
  ) {
    return <RouteLoadingState label="Loading viewer home…" />;
  }

  if (libraryStatusError || bundlesStatusError || choiceStatusError) {
    return <RouteErrorState message="Failed to load viewer home data." />;
  }

  if (error && hasLibraryData) {
    return <RouteErrorState message="Failed to load viewer home data." />;
  }

  if (bundlesStatus?.report_exists && bundlesReportError) {
    return <RouteErrorState message="Failed to load the current bundle data for viewer home." />;
  }

  const libraryProducts = data?.products ?? [];
  const filteredProducts =
    hasLibraryData ? applyProductFilters(libraryProducts, filters) : [];
  const totalStats = computeStats(libraryProducts);
  const stats = computeStats(filteredProducts);
  const options = getFilterOptions(libraryProducts);
  const categoryCounts = buildCategoryCounts(filteredProducts);
  const platformCounts = buildPlatformCounts(filteredProducts);
  const keyTypeCounts = buildKeyTypeCounts(filteredProducts);
  const publisherCounts = buildPublisherCounts(filteredProducts);
  const history = buildHistoryData(filteredProducts, timeScale);
  const isLibraryFiltered = hasLibraryData && activeLibraryFilterCount > 0;
  const activeScopeChips = buildActiveScopeChips(filters);
  const expiringSoonMs =
    (viewerConfig?.link_expiry_warning_hours ?? 24) * 60 * 60 * 1000;
  const downloadExpiryMeta = getDownloadExpiryMeta(
    libraryProducts.flatMap((product) =>
      collectProductDownloads(product).map((download) => download.url),
    ),
    expiringSoonMs,
  );
  const libraryFreshness = getFreshnessMeta(data?.captured_at ?? null);
  const bundleCounts = {
    games:
      bundlesReport?.bundles.filter((bundle) => bundle.category === "games")
        .length ?? 0,
    books:
      bundlesReport?.bundles.filter((bundle) => bundle.category === "books")
        .length ?? 0,
    software:
      bundlesReport?.bundles.filter((bundle) => bundle.category === "software")
        .length ?? 0,
  } satisfies Record<CurrentBundleType, number>;
  const bundleFreshness = getFreshnessMeta(bundlesStatus?.generated_at ?? null);
  const sourceCards = selectedLiveBundleTypes.map((bundleType) => {
    const bundlesForType =
      bundlesReport?.bundles.filter(
        (bundle) => bundle.category === bundleType,
      ) ?? [];
    const earliestExpiryGroup = getEarliestExpiringBundleGroup(bundlesForType);
    return {
      id: bundleType,
      title: bundleTypeLabel[bundleType],
      href: `/sales/${bundleType}`,
      primaryLine: (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-3xl font-semibold tracking-tight text-card-foreground md:text-[2rem]">
            {formatNumber(bundleCounts[bundleType])}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {formatAvailableOffersSummary(bundleCounts[bundleType])}
          </span>
        </div>
      ),
      secondaryLine:
        bundleCounts[bundleType] > 0 && earliestExpiryGroup ?
          <p className="text-sm leading-6 [text-wrap:pretty]">
            <span className="font-semibold text-card-foreground">
              {earliestExpiryGroup.label}
            </span>{" "}
            <span className="text-xs font-medium text-muted-foreground">
              until {formatNumber(earliestExpiryGroup.matchingCount)} package
              {earliestExpiryGroup.matchingCount === 1 ? "" : "s"}{" "}
              {earliestExpiryGroup.matchingCount === 1 ? "expires" : "expire"}
            </span>
          </p>
        : <p className="text-sm leading-6 text-muted-foreground [text-wrap:pretty]">
            {bundlesStatus?.report_exists ?
              `No ${bundleTypeLabel[bundleType].toLowerCase()} bundles were captured in the saved snapshot.`
            : "Run the current-bundles workflow to populate this card."}
          </p>,
    } satisfies SourceCardModel;
  });
  const choiceMonthDisplay = getChoiceMonthDisplay(
    choiceStatus?.month_label ?? null,
  );
  const currentChoiceMeta = getCurrentChoiceMeta(
    choiceStatus?.month_label ?? null,
    choiceStatus?.generated_at ?? null,
  );
  const currentChoiceCountdownLabel = getCurrentChoiceCountdownLabel(
    choiceStatus?.month_label ?? null,
    choiceStatus?.generated_at ?? null,
  );
  sourceCards.push({
    id: "choice",
    title: "Current Choice",
    href: "/sales/choice",
    primaryLine:
      (
        choiceStatus?.game_count !== null &&
        choiceStatus?.game_count !== undefined
      ) ?
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-3xl font-semibold tracking-tight text-card-foreground">
            {formatNumber(choiceStatus.game_count)}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            games for {choiceMonthDisplay}
          </span>
        </div>
      : <p className="text-sm font-medium text-muted-foreground">
          No saved monthly snapshot
        </p>,
    secondaryLine:
      (
        choiceStatus?.game_count !== null &&
        choiceStatus?.game_count !== undefined
      ) ?
        currentChoiceCountdownLabel ?
          <p className="text-sm leading-6 [text-wrap:pretty]">
            <span className="font-semibold text-card-foreground">
              {currentChoiceCountdownLabel.label}
            </span>
            {currentChoiceCountdownLabel.helper && (
              <span className="text-xs font-medium text-muted-foreground">
                {" "}
                {currentChoiceCountdownLabel.helper}
              </span>
            )}
          </p>
        : undefined
      : <p className="text-sm leading-6 text-muted-foreground [text-wrap:pretty]">
          {currentChoiceMeta.helper}
        </p>,
  });

  const currentLibrarySummary =
    isLibraryFiltered ?
      `Showing ${formatNumber(stats.totalProducts)} of ${formatNumber(totalStats.totalProducts)} captured purchases.`
    : `Showing all ${formatNumber(totalStats.totalProducts)} captured purchases.`;
  const liveSourceSummary =
    selectedLiveBundleTypes.length > 0 ?
      `${selectedLiveBundleTypes.map((type) => bundleTypeLabel[type]).join(", ")} bundle cards are in view.`
    : "Bundle cards are hidden; Current Choice still stays visible.";
  const toggleLiveBundleType = (
    bundleType: CurrentBundleType,
    checked: boolean,
  ) => {
    setSelectedLiveBundleTypes((current) => {
      if (checked) {
        return allLiveBundleTypes.filter(
          (type) => type === bundleType || current.includes(type),
        );
      }

      return current.filter((type) => type !== bundleType);
    });
  };
  const clearHomeFilters = () => {
    clearFilters();
    setSelectedLiveBundleTypes(allLiveBundleTypes);
  };
  const choiceStatusChipLabel =
    choiceStatus?.month_label ?
      `Current Choice ${currentChoiceMeta.label.toLowerCase()} · ${choiceStatus.month_label}`
    : `Current Choice ${currentChoiceMeta.label.toLowerCase()}`;

  return (
    <div className="flex w-full flex-col space-y-5">
      {showFilters && (
        <Card surface="panel">
          <CardContent className="p-4 md:p-5">
            <div className="grid gap-4 lg:grid-cols-3">
              {hasLibraryData && (
                <>
                  <div className={CHECKBOX_PANEL_CLASS}>
                    <label className={FIELD_LABEL_CLASS}>
                      Search
                    </label>
                    <Input
                      className="mt-2"
                      placeholder="Search..."
                      value={filters.search}
                      onChange={(event) =>
                        setFilters({ search: event.target.value })
                      }
                    />
                  </div>

                  <div className={CHECKBOX_PANEL_CLASS}>
                    <label className={FIELD_LABEL_CLASS}>
                      Category
                    </label>
                    <select
                      className={cn("mt-2", FORM_SELECT_CLASS)}
                      title="Category"
                      value={filters.category ?? ""}
                      onChange={(event) =>
                        setFilters({ category: event.target.value || null })
                      }>
                      <option value="">All</option>
                      {options.categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={CHECKBOX_PANEL_CLASS}>
                    <label className={FIELD_LABEL_CLASS}>
                      Platform
                    </label>
                    <select
                      className={cn("mt-2", FORM_SELECT_CLASS)}
                      title="Platform"
                      value={filters.platform ?? ""}
                      onChange={(event) =>
                        setFilters({ platform: event.target.value || null })
                      }>
                      <option value="">All</option>
                      {options.platforms.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={CHECKBOX_PANEL_CLASS}>
                    <p className="text-sm font-medium text-card-foreground">
                      Library toggles
                    </p>
                    <div className="mt-3 space-y-3">
                      <FilterToggle
                        checked={filters.keyPresence === "has_keys"}
                        label="Only show purchases with keys"
                        description="Use the key inventory to narrow the library totals and charts."
                        onChange={(checked) =>
                          setFilters({ keyPresence: checked ? "has_keys" : null })
                        }
                      />
                      <FilterToggle
                        checked={filters.downloadPresence === "has_downloads"}
                        label="Only show purchases with downloads"
                        description="Focus the library totals on products you can still download or manage."
                        onChange={(checked) =>
                          setFilters({
                            downloadPresence: checked ? "has_downloads" : null,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className={CHECKBOX_PANEL_CLASS}>
                    <p className="text-sm font-medium text-card-foreground">
                      Purchase date range
                    </p>
                    <div className="mt-3 grid gap-3">
                      <div>
                        <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          Start date
                        </label>
                        <Input
                          className="mt-2"
                          type="date"
                          value={filters.startDate ?? ""}
                          onChange={(event) =>
                            setFilters({ startDate: event.target.value || null })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          End date
                        </label>
                        <Input
                          className="mt-2"
                          type="date"
                          value={filters.endDate ?? ""}
                          onChange={(event) =>
                            setFilters({ endDate: event.target.value || null })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className={CHECKBOX_PANEL_CLASS}>
                <p className="text-sm font-medium text-card-foreground">
                  Live bundle types
                </p>
                <div className="mt-3 space-y-3">
                  {allLiveBundleTypes.map((bundleType) => (
                    <FilterToggle
                      key={bundleType}
                      checked={selectedLiveBundleTypes.includes(bundleType)}
                      label={bundleTypeLabel[bundleType]}
                      description={`Show the ${bundleTypeLabel[bundleType].toLowerCase()} card in the live content row.`}
                      onChange={(checked) =>
                        toggleLiveBundleType(bundleType, checked)
                      }
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground [text-wrap:pretty]">
                  Current Choice stays visible as the monthly snapshot card.
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={clearHomeFilters}>
                Clear all homepage filters
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {hasLibraryData ? (
        <Card surface="panel">
          <CardHeader className="p-5 pb-0">
            <PaneHeader
              titleAs="h2"
              title="Start with the library currently in view"
              description="Review the current purchase scope first, then use downloads, keys, and dates to narrow the library before jumping into route-specific workflows."
              titleClassName="text-xl"
              descriptionClassName="leading-6"
              eyebrow={
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Library in scope
                  </p>
                </div>
              }
              topRight={
                <>
                  {activeLibraryFilterCount > 0 && (
                    <SurfaceBadge>{currentLibrarySummary}</SurfaceBadge>
                  )}
                  <SurfaceBadge>
                    Library snapshot {libraryFreshness.label.toLowerCase()}
                  </SurfaceBadge>
                  <SurfaceBadge>
                    {downloadExpiryMeta.label}
                  </SurfaceBadge>
                  {activeLibraryFilterCount > 0 && (
                    <SurfaceBadge>
                      {activeLibraryFilterCount} active library filter
                      {activeLibraryFilterCount === 1 ? "" : "s"}
                    </SurfaceBadge>
                  )}
                </>
              }
              topRightClassName={SUMMARY_HEADER_META_CLASS}
            />
          </CardHeader>

          <CardContent className="p-5 pt-4">
            {isLibraryFiltered && (
              <div className="flex flex-wrap items-center gap-2">
                {activeScopeChips.map((chip) => (
                  <SurfaceBadge key={chip}>{chip}</SurfaceBadge>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={clearFilters}>
                  Clear library filters
                </Button>
              </div>
            )}

            <div
              className={cn(
                "grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
                isLibraryFiltered && "mt-4",
              )}>
              <StatTile
                label="Purchases"
                value={
                  isLibraryFiltered ?
                    `${formatNumber(stats.totalProducts)} / ${formatNumber(totalStats.totalProducts)}`
                  : formatNumber(totalStats.totalProducts)
                }
                subtitle={
                  isLibraryFiltered ?
                    "Captured purchases in scope / total library"
                  : "Captured purchases"
                }
                onClick={isLibraryFiltered ? clearFilters : undefined}
                docId="viewer-home-purchases"
              />
              <StatTile
                label="Included items"
                value={
                  isLibraryFiltered ?
                    `${formatNumber(stats.totalContainedItems)} / ${formatNumber(totalStats.totalContainedItems)}`
                  : formatNumber(totalStats.totalContainedItems)
                }
                subtitle={
                  isLibraryFiltered ?
                    "Titles and groups in scope / total library"
                  : "Titles and item groups"
                }
                docId="viewer-home-included-items"
              />
              <StatTile
                label="Downloads"
                value={
                  isLibraryFiltered ?
                    `${formatNumber(stats.totalDownloads)} / ${formatNumber(totalStats.totalDownloads)}`
                  : formatNumber(totalStats.totalDownloads)
                }
                subtitle={
                  filters.downloadPresence === "has_downloads" ?
                    "Direct download links across filtered purchases"
                  : isLibraryFiltered ?
                    "Direct download links in scope / total library"
                  : "Direct download links"
                }
                onClick={() =>
                  setFilters({
                    downloadPresence:
                      filters.downloadPresence === "has_downloads" ?
                        null
                      : "has_downloads",
                  })
                }
                docId="viewer-home-downloads"
              />
              <StatTile
                label="Keys"
                value={
                  isLibraryFiltered ?
                    `${formatNumber(stats.totalKeys)} / ${formatNumber(totalStats.totalKeys)}`
                  : formatNumber(totalStats.totalKeys)
                }
                subtitle={
                  filters.keyPresence === "has_keys" ?
                    "External redemption titles across filtered purchases"
                  : isLibraryFiltered ?
                    "External redemption titles in scope / total library"
                  : "External redemption titles"
                }
                onClick={() =>
                  setFilters({
                    keyPresence:
                      filters.keyPresence === "has_keys" ? null : "has_keys",
                  })
                }
                docId="viewer-home-keys"
              />
              <StatTile
                label="Download size"
                value={
                  isLibraryFiltered ?
                    `${formatBytes(stats.totalBytes)} / ${formatBytes(totalStats.totalBytes)}`
                  : formatBytes(totalStats.totalBytes)
                }
                subtitle={
                  isLibraryFiltered ?
                    "Direct-download size in scope / total library"
                  : "Total direct-download size"
                }
                docId="viewer-home-download-size"
              />
              <StatTile
                label="Estimated spend"
                value={
                  isLibraryFiltered ?
                    `${formatCurrency(stats.totalCost)} / ${formatCurrency(totalStats.totalCost)}`
                  : formatCurrency(totalStats.totalCost)
                }
                subtitle={
                  isLibraryFiltered ?
                    "Estimated spend in scope / total library"
                  : "Estimated purchase total"
                }
                docId="viewer-home-estimated-spend"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card surface="panel">
          <CardHeader className="p-5 pb-0">
            <PaneHeader
              titleAs="h2"
              title="No library is selected yet"
              description={
                <>
                  Load an existing <code>library_products.json</code> or run a
                  fresh capture when you want ownership totals, downloads, keys,
                  and the library analytics sections. Until then, Home
                  stays focused on the live bundle and Choice snapshots.
                </>
              }
              titleClassName="text-xl"
              descriptionClassName="leading-6"
              eyebrow={
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Live-only startup
                  </p>
                </div>
              }
              topRight={
                <>
                  <SurfaceBadge variant="warning">
                    Library analytics unavailable
                  </SurfaceBadge>
                  <SurfaceBadge>
                    Live bundles and Current Choice still load without a selected library
                  </SurfaceBadge>
                </>
              }
              topRightClassName={SUMMARY_HEADER_META_CLASS}
            />
          </CardHeader>

          <CardContent className="flex flex-wrap gap-2 p-5 pt-4">
            <Button asChild size="sm">
              <Link to="/setup">Open setup</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/sales">Open sales overview</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/command-center">Open command center</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card surface="panel">
        <CardHeader className="p-5 pb-0">
          <PaneHeader
            titleAs="h2"
            title="Check live bundles and this month’s Choice before you branch out"
            description="Use these cards to jump straight into the saved bundle snapshot or the monthly Choice view that needs attention next."
            titleClassName="text-xl"
            descriptionClassName="leading-6"
            eyebrow={
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                  Live right now
                </p>
              </div>
            }
            topRight={
              <>
                <SurfaceBadge>
                  Bundle snapshot {bundleFreshness.label.toLowerCase()}
                </SurfaceBadge>
                <SurfaceBadge>
                  {choiceStatusChipLabel}
                </SurfaceBadge>
              </>
            }
            topRightClassName={SUMMARY_HEADER_META_CLASS}
          />
        </CardHeader>

        <CardContent className="p-5 pt-4">
          {selectedLiveBundleTypes.length !== allLiveBundleTypes.length && (
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <SurfaceBadge>{liveSourceSummary}</SurfaceBadge>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {sourceCards.map((card) => (
              <SourceCard key={card.id} card={card} />
            ))}
          </div>
        </CardContent>
      </Card>

      {hasLibraryData && (
        <>
          <HomeSection
            eyebrow="Deep dive"
            icon={Sparkles}
            title="Use deeper analytics when you need breakdowns and trends"
            description="The top half stays focused on library scope and live sales. The sections below keep category, platform, publisher, key, and trend analysis on the homepage without crowding the first scan."
            action={
              <Button
                type="button"
                size="sm"
                variant={showDeeperAnalytics ? "secondary" : "outline"}
                onClick={() => setShowDeeperAnalytics((current) => !current)}>
                {showDeeperAnalytics ?
                  <ChevronDown className="mr-2 h-4 w-4" />
                : <ChevronRight className="mr-2 h-4 w-4" />}
                {showDeeperAnalytics ?
                  "Hide deeper analytics"
                : "Show deeper analytics"}
              </Button>
            }>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <SurfaceBadge>
                Click category, platform, and key-type bars to filter the dashboard
              </SurfaceBadge>
              <SurfaceBadge>
                Use the grouped breakdowns below after the top-of-page buyer view
                answers the urgent question
              </SurfaceBadge>
            </div>
          </HomeSection>

          {showDeeperAnalytics && (
            <>
          <HomeSection
            eyebrow="Inventory mix"
            icon={Sparkles}
            title="See how the current scope breaks down"
            description="Compare the two biggest breakdowns side by side so category and platform answers stay easy to scan.">
            <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <SurfaceBadge>
                Click a category or platform bar to update the current scope
              </SurfaceBadge>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <div className="col-span-4">
                <BarChart
                  title="Purchase categories"
                  data={categoryCounts}
                  selected={filters.category}
                  onSelect={(value) =>
                    setFilters({
                      category: filters.category === value ? null : value,
                    })
                  }
                />
              </div>
              <div className="col-span-3">
                <BarChart
                  title="Download platform"
                  data={platformCounts}
                  selected={filters.platform}
                  onSelect={(value) =>
                    setFilters({
                      platform: filters.platform === value ? null : value,
                    })
                  }
                />
              </div>
            </div>
          </HomeSection>

          <HomeSection
            eyebrow="Activity trends"
            icon={Sparkles}
            title="Track purchase volume and spend over time"
            description="Keep the time grouping control next to the charts it changes so trend reading stays self-explanatory."
            action={
              <div className={INLINE_TOGGLE_PANEL_CLASS}>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Group by
                </span>
                <div className={SEGMENTED_CONTROL_CLASS}>
                  <Button
                    variant={timeScale === "day" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setTimeScale("day")}
                    title="Daily">
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={timeScale === "month" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setTimeScale("month")}
                    title="Monthly">
                    <Calendar className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={timeScale === "quarter" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setTimeScale("quarter")}
                    title="Quarterly">
                    <CalendarRange className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={timeScale === "year" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setTimeScale("year")}
                    title="Annually">
                    <Clock className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            }>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <BarChart
                title={`Purchases over time (${timeScale})`}
                data={history.orders}
              />
              <BarChart
                title={`Spending over time (${timeScale})`}
                data={history.spending}
              />
            </div>
          </HomeSection>

          <HomeSection
            eyebrow="Supporting breakdowns"
            icon={Sparkles}
            title="Publisher and key mix"
            description="Group the secondary breakdowns together so the page gets progressively more detailed as you scroll.">
            <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <SurfaceBadge>
                Key type bars also narrow the current dashboard scope
              </SurfaceBadge>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <BarChart title="Top Publishers" data={publisherCounts} />
              <BarChart
                title="Key type"
                data={keyTypeCounts}
                selected={filters.keyType}
                onSelect={(value) =>
                  setFilters({
                    keyType: filters.keyType === value ? null : value,
                  })
                }
              />
            </div>
          </HomeSection>

          <Card surface="panel">
            <CardHeader className="p-5 pb-0">
              <h3 className="text-lg font-semibold tracking-tight text-card-foreground">
                Browse by category
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Jump into category-specific detail views after using the
                homepage analytics to narrow your scope.
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-4">
              <div className="mt-3 flex flex-wrap gap-2">
                {options.categories.map((category) => (
                  <Button
                    key={category}
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-auto py-2">
                    <Link to={`/library/category/${category}`}>
                      {normalizeCategoryLabel(category)}
                    </Link>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
