/**
 * Overview dashboard route with high-level stats and charts.
 */
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Clock,
  KeyRound,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import FilterBar from "../../components/FilterBar";
import StatTile from "../../components/StatTile";
import BarChart from "../../components/charts/BarChart";
import WordCloudChart from "../../components/charts/WordCloudChart";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import {
  useCurrentBundlesStatus,
  useCurrentChoiceStatus,
  useLibraryData,
} from "../../data/api";
import {
  applyProductFilters,
  buildCategoryCounts,
  buildKeyTypeCounts,
  buildPlatformCounts,
  buildPublisherCounts,
  buildHistoryData,
  buildRecentPurchases,
  buildRecentPurchaseThemes,
  computeStats,
  getCompactBundleName,
  getFilterOptions,
  normalizeCategoryLabel,
  normalizeKeyTypeLabel,
  normalizePlatformLabel,
} from "../../data/selectors";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "../../utils/format";
import { useFilters } from "../../state/filters";
import { cn } from "../../lib/utils";

const sectionEyebrowClass = "text-xs font-semibold uppercase tracking-[0.18em]";
const surfaceChipClass =
  "rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground";

const OverviewSection = ({
  action,
  children,
  className,
  description,
  descriptionClassName,
  eyebrow,
  headerClassName,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description: string;
  descriptionClassName?: string;
  eyebrow: string;
  headerClassName?: string;
  icon?: LucideIcon;
  title: string;
}) => (
  <Card className={cn("bg-card/60", className)}>
    <CardHeader className={cn("p-6 pb-0", headerClassName)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground">
            {Icon && <Icon className="h-4 w-4" />}
            <p className={sectionEyebrowClass}>{eyebrow}</p>
          </div>
          <h3 className="mt-3 text-xl font-semibold text-card-foreground">
            {title}
          </h3>
          <p
            className={cn(
              "mt-2 max-w-3xl text-sm text-muted-foreground",
              descriptionClassName,
            )}>
            {description}
          </p>
        </div>
        {action}
      </div>
    </CardHeader>
    <CardContent className="p-6 pt-5">{children}</CardContent>
  </Card>
);

/**
 * Dashboard view showing aggregated stats and filterable charts.
 */
export default function Overview() {
  const { data, isLoading, error } = useLibraryData();
  const { data: currentBundlesStatus } = useCurrentBundlesStatus();
  const { data: currentChoiceStatus } = useCurrentChoiceStatus();
  const { filters, setFilters, clearFilters } = useFilters();
  const [showOverviewFilters, setShowOverviewFilters] = useState(false);
  const [timeScale, setTimeScale] = useState<
    "day" | "month" | "quarter" | "year"
  >("month");

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

  // Apply all UI filters before computing aggregates.
  const filteredProducts = applyProductFilters(data.products, filters);
  const options = getFilterOptions(data.products);
  // Aggregations used by tiles and charts.
  const stats = computeStats(filteredProducts);
  const categoryCounts = buildCategoryCounts(filteredProducts);
  const platformCounts = buildPlatformCounts(filteredProducts);
  const keyTypeCounts = buildKeyTypeCounts(filteredProducts);
  const publisherCounts = buildPublisherCounts(filteredProducts);
  const history = buildHistoryData(filteredProducts, timeScale);
  const recentPurchases = buildRecentPurchases(filteredProducts, 5);
  const recentPurchaseThemes = buildRecentPurchaseThemes(
    filteredProducts,
    12,
    18,
  );
  const activeFilterCount = [
    filters.search,
    filters.category,
    filters.platform,
    filters.keyType,
    filters.keyPresence,
    filters.downloadPresence,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;
  const isFiltered = activeFilterCount > 0;
  const filteredLabel =
    isFiltered ?
      `Showing ${formatNumber(stats.totalProducts)} of ${formatNumber(
        data.products.length,
      )} purchases in the current filter scope.`
    : `Showing all ${formatNumber(data.products.length)} captured purchases.`;
  const activeScopeChips = [
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

  return (
    <div className="w-full flex flex-col space-y-6">
      <Card className="rounded-md bg-card/70">
        <CardContent className="px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">Current scope</Badge>
              {isFiltered && (
                <span className={surfaceChipClass}>
                  {activeFilterCount} active filter
                  {activeFilterCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p
              className="mt-2 text-sm font-medium text-foreground"
              data-doc-id="overview-current-scope-label">
              {filteredLabel}
            </p>
            <p
              className="mt-1 text-xs text-muted-foreground"
              data-doc-id="overview-current-scope-description">
              Open filters when you need field-by-field control, or use the
              tiles and charts below to narrow the dashboard without spending
              the whole top fold on controls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={showOverviewFilters ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-2 text-xs"
              aria-expanded={showOverviewFilters}
              onClick={() => setShowOverviewFilters((current) => !current)}>
              {showOverviewFilters ?
                <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full border border-border bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {isFiltered && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={clearFilters}>
                Clear overview filters
              </Button>
            )}
          </div>
        </div>

        {isFiltered && (
          <div className="mt-3 flex flex-wrap gap-2">
            {activeScopeChips.map((chip) => (
              <span
                key={chip}
                className={surfaceChipClass}>
                {chip}
              </span>
            ))}
          </div>
        )}
        </CardContent>
      </Card>

      {showOverviewFilters && (
        <FilterBar
          categories={options.categories}
          platforms={options.platforms}
          keyTypes={options.keyTypes}
          hideHeader
          isExpanded
          className="rounded-lg border-border bg-card px-4 py-4"
        />
      )}

      <OverviewSection
        eyebrow="Current sales"
        icon={Sparkles}
        title="Track live bundles and this month’s Choice against what you already own"
        description="Put the active buying view first: check today’s live bundles and the current Humble Choice month before you drop into the deeper ownership and library charts below.">
        <p className="text-xs text-muted-foreground">
          Use the sidebar’s <span className="font-medium text-foreground">Current sales</span>{" "}
          section when you want the full Sales Overview, Current Choice, or
          bundle-specific pages.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Card className="rounded-xl bg-muted/30 shadow-none">
            <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Last generated
            </p>
            <p
              className="mt-2 font-medium text-card-foreground"
              data-doc-id="overview-current-sales-last-generated">
              {currentBundlesStatus?.generated_at ?
                formatDateTime(currentBundlesStatus.generated_at)
              : "Not generated yet"}
            </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl bg-muted/30 shadow-none">
            <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Bundle types
            </p>
            <p
              className="mt-2 font-medium text-card-foreground"
              data-doc-id="overview-current-sales-bundle-types">
              {currentBundlesStatus?.bundle_types?.length ?
                currentBundlesStatus.bundle_types.join(", ")
              : "games, books, software"}
            </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl bg-muted/30 shadow-none">
            <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Bundles analyzed
            </p>
            <p
              className="mt-2 font-medium text-card-foreground"
              data-doc-id="overview-current-sales-bundles-analyzed">
              {(
                currentBundlesStatus?.bundle_count !== null &&
                currentBundlesStatus?.bundle_count !== undefined
              ) ?
                formatNumber(currentBundlesStatus.bundle_count)
              : "Refresh required"}
            </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl bg-muted/30 shadow-none">
            <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Current Choice
            </p>
            <p
              className="mt-2 font-medium text-card-foreground"
              data-doc-id="overview-current-sales-choice-month">
              {currentChoiceStatus?.month_label || "Not generated yet"}
            </p>
            <p
              className="mt-1 text-sm text-muted-foreground"
              data-doc-id="overview-current-sales-choice-helper">
              {(
                currentChoiceStatus?.game_count !== null &&
                currentChoiceStatus?.game_count !== undefined
              ) ?
                `${formatNumber(currentChoiceStatus.game_count)} games captured`
              : "Refresh required"}
            </p>
            </CardContent>
          </Card>
        </div>
      </OverviewSection>

      <OverviewSection
        eyebrow="At a glance"
        icon={Sparkles}
        title="Core library metrics for the current scope"
        description="Keep the first scan focused on the six numbers that explain what is in scope right now. Downloads and Keys can narrow the scope directly, while Purchases resets back to the full view when filters are active.">
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatTile
            label="Purchases"
            value={formatNumber(stats.totalProducts)}
            subtitle={isFiltered ? "Click to reset scope" : "Visible purchases"}
            onClick={isFiltered ? clearFilters : undefined}
            docId="overview-stat-purchases"
          />
          <StatTile
            label="Included items"
            value={formatNumber(stats.totalContainedItems)}
            subtitle="Titles or item groups"
            docId="overview-stat-included-items"
          />
          <StatTile
            label="Downloads"
            value={formatNumber(stats.totalDownloads)}
            subtitle={
              filters.downloadPresence === "has_downloads" ?
                "Showing purchases with downloads"
              : `Click to show purchases with downloads · ${formatBytes(stats.totalBytes)}`
            }
            onClick={() =>
              setFilters({
                downloadPresence:
                  filters.downloadPresence === "has_downloads" ?
                    null
                  : "has_downloads",
              })
            }
            docId="overview-stat-downloads"
          />
          <StatTile
            label="Keys"
            value={formatNumber(stats.totalKeys)}
            subtitle={
              filters.keyPresence === "has_keys" ?
                "Showing purchases with keys"
              : "Click to show purchases with keys"
            }
            onClick={() =>
              setFilters({
                keyPresence:
                  filters.keyPresence === "has_keys" ? null : "has_keys",
              })
            }
            docId="overview-stat-keys"
          />
          <StatTile
            label="Download size"
            value={formatBytes(stats.totalBytes)}
            subtitle="Combined visible file size"
            docId="overview-stat-download-size"
          />
          <StatTile
            label="Estimated spend"
            value={formatCurrency(stats.totalCost)}
            subtitle="Across visible purchases"
            docId="overview-stat-estimated-spend"
          />
        </div>
      </OverviewSection>

      <div className="grid gap-4 xl:grid-cols-[1.5fr,1fr]">
        <OverviewSection
          eyebrow="Recent purchases"
          title="Latest additions in the current scope"
          description="Review your newest captured purchases before drilling into charts and tables."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/orders">Open purchases</Link>
            </Button>
          }>
          <div className="mt-5 space-y-3">
            {recentPurchases.length === 0 ?
              <Card className="rounded-xl bg-muted/30 shadow-none">
                <CardContent className="p-4 text-sm text-muted-foreground">
                No purchases match the current filters.
                </CardContent>
              </Card>
            : recentPurchases.map((purchase) => {
                const compactName = getCompactBundleName(purchase.name);
                return (
                  <Card
                    key={purchase.id}
                    className="rounded-xl bg-muted/30 shadow-none">
                    <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p
                          className="truncate font-medium text-card-foreground"
                          title={compactName.full}>
                          {compactName.display}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{purchase.categoryLabel}</span>
                          <span>•</span>
                          <span>{formatDate(purchase.createdAt)}</span>
                        </div>
                      </div>
                      <div className="text-sm font-medium text-foreground">
                        {formatCurrency(purchase.amountSpent)}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className={surfaceChipClass}>
                        {purchase.includedItemCount} included item
                        {purchase.includedItemCount === 1 ? "" : "s"}
                      </span>
                      <span className={surfaceChipClass}>
                        {purchase.downloadCount} download
                        {purchase.downloadCount === 1 ? "" : "s"}
                      </span>
                      <span className={surfaceChipClass}>
                        {purchase.keyCount} key
                        {purchase.keyCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    </CardContent>
                  </Card>
                );
              })
            }
          </div>
        </OverviewSection>

        <OverviewSection
          eyebrow="Purchase themes"
          icon={KeyRound}
          title="Weighted tag cloud for recent subproduct themes"
          description="This style is often called a tag cloud: words from recent subproduct titles and descriptions grow larger and bolder as they appear more often, while filler words are filtered out."
          descriptionClassName="max-w-none">
          <p className="sr-only">
            This style is often called a{" "}
            <span>tag cloud</span>: words from recent subproduct titles and
            descriptions grow larger and bolder as they appear more often,
            while filler words are filtered out.
          </p>

          {recentPurchaseThemes.length === 0 ?
            <Card className="mt-5 rounded-xl bg-muted/30 shadow-none">
              <CardContent className="p-4 text-sm text-muted-foreground">
              Add more captured purchase detail to see the recent-theme cloud.
              </CardContent>
            </Card>
          : <div className="mt-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={surfaceChipClass}>
                  Click a theme to set the overview search
                </span>
                {filters.search && (
                  <span className="rounded-full border border-border bg-accent/40 px-2.5 py-1 text-accent-foreground">
                    Current search: {filters.search}
                  </span>
                )}
              </div>

              <WordCloudChart
                data={recentPurchaseThemes}
                selected={filters.search}
                onSelect={(value) =>
                  setFilters({
                    search:
                      (
                        filters.search.trim().toLowerCase() ===
                        value.trim().toLowerCase()
                      ) ?
                        ""
                      : value,
                  })
                }
              />
            </div>
          }
        </OverviewSection>
      </div>

      <OverviewSection
        eyebrow="Inventory mix"
        icon={Sparkles}
        title="See how the current scope breaks down"
        description="Keep the main categorical splits together so category and platform answers can be compared at the same glance.">
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
      </OverviewSection>

      <OverviewSection
        eyebrow="Activity trends"
        icon={Sparkles}
        title="Track order volume and spend over time"
        description="Keep the time grouping control with the charts it changes so trend reading stays self-explanatory."
        action={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Group by
            </span>
            <div className="flex rounded-lg border border-border bg-background/70 p-1">
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
            title={`Orders over time (${timeScale})`}
            data={history.orders}
          />
          <BarChart
            title={`Spending over time (${timeScale})`}
            data={history.spending}
          />
        </div>
      </OverviewSection>

      <OverviewSection
        eyebrow="Supporting breakdowns"
        icon={Sparkles}
        title="Publisher and key mix"
        description="Keep secondary inventory breakdowns together so the page gets progressively more detailed as you scroll.">
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <BarChart title="Top Publishers" data={publisherCounts} />
          <BarChart
            title="Key type"
            data={keyTypeCounts}
            selected={filters.keyType}
            onSelect={(value) =>
              setFilters({ keyType: filters.keyType === value ? null : value })
            }
          />
        </div>
      </OverviewSection>

      <Card className="bg-card/60">
        <CardHeader className="p-6 pb-0">
        <h3 className="text-lg font-semibold tracking-tight text-card-foreground">
          Browse by category
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Jump into category-specific detail views after using the overview to
          narrow your scope.
        </p>
        </CardHeader>
        <CardContent className="p-6 pt-4">
        <div className="mt-4 flex flex-wrap gap-2">
          {options.categories.map((category) => (
            <Button
              key={category}
              asChild
              variant="outline"
              size="sm"
              className="h-auto py-2">
              <Link to={`/category/${category}`}>{normalizeCategoryLabel(category)}</Link>
            </Button>
          ))}
        </div>
        </CardContent>
      </Card>
    </div>
  );
}
