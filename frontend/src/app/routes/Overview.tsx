/**
 * Overview dashboard route with high-level stats and charts.
 */
import { useState } from "react";
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
} from "lucide-react";

import FilterBar from "../../components/FilterBar";
import StatTile from "../../components/StatTile";
import BarChart from "../../components/charts/BarChart";
import WordCloudChart from "../../components/charts/WordCloudChart";
import { Button } from "../../components/ui/button";
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

/**
 * Dashboard view showing aggregated stats and filterable charts.
 */
export default function Overview() {
  const { data, isLoading, error } = useLibraryData();
  const { data: currentBundlesStatus } = useCurrentBundlesStatus();
  const { data: currentChoiceStatus } = useCurrentChoiceStatus();
  const { filters, setFilters, clearFilters } = useFilters();
  const [showOverviewFilters, setShowOverviewFilters] = useState(false);
  const [timeScale, setTimeScale] = useState<"day" | "month" | "quarter" | "year">("month");

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
  const recentPurchaseThemes = buildRecentPurchaseThemes(filteredProducts, 12, 18);
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
  const filteredLabel = isFiltered
    ? `Showing ${formatNumber(stats.totalProducts)} of ${formatNumber(
        data.products.length
      )} purchases in the current filter scope.`
    : `Showing all ${formatNumber(data.products.length)} captured purchases.`;
  const activeScopeChips = [
    filters.search ? `Search: ${filters.search}` : null,
    filters.category ? `Category: ${normalizeCategoryLabel(filters.category)}` : null,
    filters.platform ? `Platform: ${normalizePlatformLabel(filters.platform)}` : null,
    filters.keyType ? `Key type: ${normalizeKeyTypeLabel(filters.keyType)}` : null,
    filters.keyPresence === "has_keys"
      ? "Keys: Has keys"
      : filters.keyPresence === "no_keys"
        ? "Keys: No keys"
        : null,
    filters.downloadPresence === "has_downloads"
      ? "Downloads: Has downloads"
      : filters.downloadPresence === "no_downloads"
        ? "Downloads: No downloads"
        : null,
    filters.startDate ? `From: ${formatDate(filters.startDate)}` : null,
    filters.endDate ? `To: ${formatDate(filters.endDate)}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="w-full flex flex-col space-y-6">
      <section className="rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300">
                Current scope
              </span>
              {isFiltered && (
                <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-slate-300">
                  {activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-medium text-slate-100">{filteredLabel}</p>
            <p className="mt-1 text-xs text-slate-400">
              Open filters when you need field-by-field control, or use the tiles and charts below to narrow the dashboard without spending the whole top fold on controls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={showOverviewFilters ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-2 text-xs"
              aria-expanded={showOverviewFilters}
              onClick={() => setShowOverviewFilters((current) => !current)}
            >
              {showOverviewFilters ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-200">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {isFiltered && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={clearFilters}
              >
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
                className="rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-xs text-slate-300"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </section>

      {showOverviewFilters && (
        <FilterBar
          categories={options.categories}
          platforms={options.platforms}
          keyTypes={options.keyTypes}
          hideHeader
          isExpanded
          className="rounded-lg border-slate-800 bg-slate-900 px-4 py-4"
        />
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
        <div>
          <div>
            <div className="flex items-center gap-2 text-indigo-300">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Current sales
              </p>
            </div>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Track live bundles and this month’s Choice against what you already own
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Put the active buying view first: check today’s live bundles and the current Humble Choice month before you drop into the deeper ownership and library charts below.
            </p>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Use the sidebar’s <span className="font-medium text-slate-300">Current sales</span> section when you want the full Sales Overview, Current Choice, or bundle-specific pages.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last generated</p>
            <p className="mt-2 font-medium text-white">
              {currentBundlesStatus?.generated_at
                ? formatDateTime(currentBundlesStatus.generated_at)
                : "Not generated yet"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Bundle types</p>
            <p className="mt-2 font-medium text-white">
              {currentBundlesStatus?.bundle_types?.length
                ? currentBundlesStatus.bundle_types.join(", ")
                : "games, books, software"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Bundles analyzed</p>
            <p className="mt-2 font-medium text-white">
              {currentBundlesStatus?.bundle_count !== null &&
              currentBundlesStatus?.bundle_count !== undefined
                ? formatNumber(currentBundlesStatus.bundle_count)
                : "Refresh required"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Choice</p>
            <p className="mt-2 font-medium text-white">
              {currentChoiceStatus?.month_label || "Not generated yet"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {currentChoiceStatus?.game_count !== null &&
              currentChoiceStatus?.game_count !== undefined
                ? `${formatNumber(currentChoiceStatus.game_count)} games captured`
                : "Refresh required"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
        <div>
          <div>
            <div className="flex items-center gap-2 text-indigo-300">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                At a glance
              </p>
            </div>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Core library metrics for the current scope
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Keep the first scan focused on the six numbers that explain what is in scope right now. Downloads and Keys can narrow the scope directly, while Purchases resets back to the full view when filters are active.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatTile
            label="Purchases"
            value={formatNumber(stats.totalProducts)}
            subtitle={isFiltered ? "Click to reset scope" : "Visible purchases"}
            onClick={isFiltered ? clearFilters : undefined}
          />
          <StatTile
            label="Included items"
            value={formatNumber(stats.totalContainedItems)}
            subtitle="Titles or item groups"
          />
          <StatTile
            label="Downloads"
            value={formatNumber(stats.totalDownloads)}
            subtitle={
              filters.downloadPresence === "has_downloads"
                ? "Showing purchases with downloads"
                : `Click to show purchases with downloads · ${formatBytes(stats.totalBytes)}`
            }
            onClick={() =>
              setFilters({
                downloadPresence:
                  filters.downloadPresence === "has_downloads"
                    ? null
                    : "has_downloads",
              })
            }
          />
          <StatTile
            label="Keys"
            value={formatNumber(stats.totalKeys)}
            subtitle={
              filters.keyPresence === "has_keys"
                ? "Showing purchases with keys"
                : "Click to show purchases with keys"
            }
            onClick={() =>
              setFilters({
                keyPresence:
                  filters.keyPresence === "has_keys" ? null : "has_keys",
              })
            }
          />
          <StatTile
            label="Download size"
            value={formatBytes(stats.totalBytes)}
            subtitle="Combined visible file size"
          />
          <StatTile
            label="Estimated spend"
            value={formatCurrency(stats.totalCost)}
            subtitle="Across visible purchases"
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.5fr,1fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Recent purchases
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Latest additions in the current scope
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Review your newest captured purchases before drilling into charts and tables.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/orders">Open purchases</Link>
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {recentPurchases.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
                No purchases match the current filters.
              </div>
            ) : (
              recentPurchases.map((purchase) => {
                const compactName = getCompactBundleName(purchase.name);
                return (
                <div
                  key={purchase.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white" title={compactName.full}>{compactName.display}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                        <span>{purchase.categoryLabel}</span>
                        <span>•</span>
                        <span>{formatDate(purchase.createdAt)}</span>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-slate-300">
                      {formatCurrency(purchase.amountSpent)}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1">
                      {purchase.includedItemCount} included item{purchase.includedItemCount === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1">
                      {purchase.downloadCount} download{purchase.downloadCount === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1">
                      {purchase.keyCount} key{purchase.keyCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              )})
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
          <div className="flex items-center gap-2 text-indigo-300">
            <KeyRound className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              Purchase themes
            </p>
          </div>
          <h3 className="mt-3 text-xl font-semibold text-white">
            Weighted tag cloud for recent subproduct themes
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            This style is often called a <span className="font-medium text-slate-300">tag cloud</span>: words from recent subproduct titles and descriptions grow larger and bolder as they appear more often, while filler words are filtered out.
          </p>

          {recentPurchaseThemes.length === 0 ? (
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
              Add more captured purchase detail to see the recent-theme cloud.
            </div>
          ) : (
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1">
                  Click a theme to set the overview search
                </span>
                {filters.search && (
                  <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-indigo-200">
                    Current search: {filters.search}
                  </span>
                )}
              </div>

              <WordCloudChart
                data={recentPurchaseThemes}
                selected={filters.search}
                onSelect={(value) =>
                  setFilters({
                    search: filters.search.trim().toLowerCase() === value.trim().toLowerCase() ? "" : value,
                  })
                }
              />
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-300">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Inventory mix
              </p>
            </div>
            <h3 className="mt-3 text-xl font-semibold text-white">
              See how the current scope breaks down
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Keep the main categorical splits together so category and platform answers can be compared at the same glance.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-4">
              <BarChart
                title="Purchase categories"
                data={categoryCounts}
                selected={filters.category}
                onSelect={(value) =>
                  setFilters({ category: filters.category === value ? null : value })
                }
              />
          </div>
          <div className="col-span-3">
               <BarChart
                title="Download platform"
                data={platformCounts}
                selected={filters.platform}
                onSelect={(value) =>
                  setFilters({ platform: filters.platform === value ? null : value })
                }
              />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-300">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Activity trends
              </p>
            </div>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Track order volume and spend over time
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Keep the time grouping control with the charts it changes so trend reading stays self-explanatory.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Group by
            </span>
            <div className="flex rounded-lg border border-slate-700 bg-slate-950/70 p-1">
              <Button 
                  variant={timeScale === "day" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-7 px-2"
                  onClick={() => setTimeScale("day")}
                  title="Daily"
              >
                  <CalendarDays className="h-4 w-4" />
              </Button>
              <Button 
                  variant={timeScale === "month" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-7 px-2"
                  onClick={() => setTimeScale("month")}
                  title="Monthly"
              >
                  <Calendar className="h-4 w-4" />
              </Button>
              <Button 
                  variant={timeScale === "quarter" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-7 px-2"
                  onClick={() => setTimeScale("quarter")}
                  title="Quarterly"
              >
                  <CalendarRange className="h-4 w-4" />
              </Button>
              <Button 
                  variant={timeScale === "year" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-7 px-2"
                  onClick={() => setTimeScale("year")}
                  title="Annually"
              >
                  <Clock className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
             <BarChart title={`Orders over time (${timeScale})`} data={history.orders} />
             <BarChart title={`Spending over time (${timeScale})`} data={history.spending} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
        <div className="flex items-center gap-2 text-indigo-300">
          <Sparkles className="h-4 w-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
            Supporting breakdowns
          </p>
        </div>
        <h3 className="mt-3 text-xl font-semibold text-white">
          Publisher and key mix
        </h3>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Keep secondary inventory breakdowns together so the page gets progressively more detailed as you scroll.
        </p>

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
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow-sm shadow-black/20">
        <h3 className="text-lg font-semibold tracking-tight text-white">
          Browse by category
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          Jump into category-specific detail views after using the overview to narrow your scope.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {options.categories.map((category) => (
            <Link
              key={category}
              to={`/category/${category}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-indigo-500/40 hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {normalizeCategoryLabel(category)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

