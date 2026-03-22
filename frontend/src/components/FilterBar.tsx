/**
 * Collapsible filter bar for library-wide filtering.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X, Filter } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useFilters } from "../state/filters";
import { cn } from "../lib/utils";

export type FilterBarField =
  | "search"
  | "category"
  | "platform"
  | "keyType"
  | "keyPresence"
  | "downloadPresence"
  | "dateRange";

interface FilterBarProps {
  categories: string[];
  platforms: string[];
  keyTypes: string[];
  fields?: FilterBarField[];
  showSearch?: boolean;
  showCategory?: boolean;
  showPlatform?: boolean;
  showKeyType?: boolean;
  showKeyPresence?: boolean;
  showDownloadPresence?: boolean;
  showDateRange?: boolean;
  hideHeader?: boolean;
  isExpanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
  className?: string;
  extraContent?: ReactNode;
  onClear?: () => void;
}

/**
 * Filter controls used by most routes.
 */
export default function FilterBar({
  categories,
  platforms,
  keyTypes,
  fields,
  showSearch = true,
  showCategory = true,
  showPlatform = true,
  showKeyType = true,
  showKeyPresence = true,
  showDownloadPresence = true,
  showDateRange = true,
  hideHeader = false,
  isExpanded: controlledExpanded,
  onExpandedChange,
  className,
  extraContent,
  onClear,
}: FilterBarProps) {
  const { filters, setFilters, clearFilters } = useFilters();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;
  const setIsExpanded = onExpandedChange ?? setInternalExpanded;
  const showField = (field: FilterBarField, fallback: boolean) =>
    fields ? fields.includes(field) : fallback;

  const showSearchField = showField("search", showSearch);
  const showCategoryField = showField("category", showCategory);
  const showPlatformField = showField("platform", showPlatform);
  const showKeyTypeField = showField("keyType", showKeyType);
  const showKeyPresenceField = showField("keyPresence", showKeyPresence);
  const showDownloadPresenceField = showField(
    "downloadPresence",
    showDownloadPresence
  );
  const showDateRangeField = showField("dateRange", showDateRange);

  // Used to show a compact summary when collapsed.
  const activeFilterCount = [
    showSearchField && filters.search,
    showCategoryField && filters.category,
    showPlatformField && filters.platform,
    showKeyTypeField && filters.keyType,
    showKeyPresenceField && filters.keyPresence,
    showDownloadPresenceField && filters.downloadPresence,
    showDateRangeField && (filters.startDate || filters.endDate),
  ].filter(Boolean).length;

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className={cn("rounded-xl border bg-card px-6 py-4 text-card-foreground shadow-sm", className)}>
      {!hideHeader && (
      <div 
        className="flex cursor-pointer items-center justify-between" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
            <Filter className="h-5 w-5 text-muted-foreground" />
            Filters
          </h3>
          {activeFilterCount > 0 && !isExpanded && (
            <div className="ml-4 flex gap-2">
              {filters.search && (
                <span className="inline-flex items-center rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                  Search: {filters.search}
                </span>
              )}
              {filters.category && (
                <span className="inline-flex items-center rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                  Category: {filters.category}
                </span>
              )}
              {(activeFilterCount - (filters.search ? 1 : 0) - (filters.category ? 1 : 0)) > 0 && (
                <span className="inline-flex items-center rounded-md border border-transparent bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                  +{activeFilterCount - (filters.search ? 1 : 0) - (filters.category ? 1 : 0)} more
                </span>
              )}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
      )}
      
      {isExpanded && (
      <div className={cn("animate-in fade-in slide-in-from-top-2 duration-200", !hideHeader && "mt-4")}>
          <div className="grid gap-4 md:grid-cols-4">
        {showSearchField && (
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Search</label>
            <Input
              placeholder="Search..."
              value={filters.search}
              onChange={(event) => setFilters({ search: event.target.value })}
            />
          </div>
        )}

        {showCategoryField && (
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Category</label>
            <select
              className={selectClass}
              title="Category"
              value={filters.category ?? ""}
              onChange={(event) =>
                setFilters({ category: event.target.value || null })
              }
            >
              <option value="">All</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        )}

        {showPlatformField && (
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Platform</label>
            <select
              className={selectClass}
              title="Platform"
              value={filters.platform ?? ""}
              onChange={(event) =>
                setFilters({ platform: event.target.value || null })
              }
            >
              <option value="">All</option>
              {platforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </div>
        )}

        {showKeyTypeField && (
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Key type</label>
            <select
              className={selectClass}
              title="Key type"
              value={filters.keyType ?? ""}
              onChange={(event) =>
                setFilters({ keyType: event.target.value || null })
              }
            >
              <option value="">All</option>
              {keyTypes.map((keyType) => (
                <option key={keyType} value={keyType}>
                  {keyType}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4 mt-4">
        {showKeyPresenceField && (
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Keys</label>
            <select
              className={selectClass}
              title="Key presence"
              value={filters.keyPresence ?? ""}
              onChange={(event) =>
                setFilters({
                  keyPresence: event.target.value
                    ? (event.target.value as "has_keys" | "no_keys")
                    : null,
                })
              }
            >
              <option value="">All</option>
              <option value="has_keys">Has keys</option>
              <option value="no_keys">No keys</option>
            </select>
          </div>
        )}

        {showDownloadPresenceField && (
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Downloads</label>
            <select
              className={selectClass}
              title="Download presence"
              value={filters.downloadPresence ?? ""}
              onChange={(event) =>
                setFilters({
                  downloadPresence: event.target.value
                    ? (event.target.value as "has_downloads" | "no_downloads")
                    : null,
                })
              }
            >
              <option value="">All</option>
              <option value="has_downloads">Has downloads</option>
              <option value="no_downloads">No downloads</option>
            </select>
          </div>
        )}

        {showDateRangeField && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Start Date</label>
              <Input
                type="date"
                value={filters.startDate ?? ""}
                onChange={(e) => setFilters({ startDate: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">End Date</label>
              <Input
                type="date"
                value={filters.endDate ?? ""}
                onChange={(e) => setFilters({ endDate: e.target.value || null })}
              />
            </div>
          </>
        )}

        <div className="md:col-span-2 flex items-end justify-end">
          <Button
            variant="outline"
            onClick={() => {
              clearFilters();
              onClear?.();
            }}
            className="gap-2"
          >
            <X className="w-4 h-4" /> Clear filters
          </Button>
        </div>
      </div>
      {extraContent && <div className="mt-4">{extraContent}</div>}
        </div>
      )}
    </div>
  );
}

