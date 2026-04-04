/**
 * Collapsible filter bar for library-wide filtering.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X, Filter } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { useFilters } from "../state/filters";
import { cn } from "../lib/utils";
import {
  FIELD_LABEL_CLASS,
  FILTER_BAR_CHIP_CLASS,
  FILTER_BAR_COLLAPSED_SUMMARY_CLASS,
  FILTER_BAR_CONTENT_ANIMATION_CLASS,
  FILTER_BAR_FOOTER_CLASS,
  FILTER_BAR_GRID_CLASS,
  FILTER_BAR_HEADER_CLASS,
  FILTER_BAR_MORE_CHIP_CLASS,
  FILTER_BAR_SHELL_CLASS,
  FILTER_BAR_TITLE_CLASS,
  FORM_FIELD_STACK_CLASS,
  FORM_SELECT_CLASS,
} from "../styles/roles";

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
    showDownloadPresence,
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

  return (
    <div className={cn(FILTER_BAR_SHELL_CLASS, className)}>
      {!hideHeader && (
        <button
          type="button"
          className={cn(FILTER_BAR_HEADER_CLASS, "w-full text-left")}
          aria-expanded={isExpanded ? "true" : "false"}
          onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center gap-2">
            <h3 className={FILTER_BAR_TITLE_CLASS}>
              <Filter className="h-5 w-5 text-muted-foreground" />
              Filters
            </h3>
            {activeFilterCount > 0 && !isExpanded && (
              <div className={FILTER_BAR_COLLAPSED_SUMMARY_CLASS}>
                {filters.search && (
                  <Badge
                    variant="surface"
                    size="compact"
                    casing="ui"
                    className={FILTER_BAR_CHIP_CLASS}>
                    Search: {filters.search}
                  </Badge>
                )}
                {filters.category && (
                  <Badge
                    variant="surface"
                    size="compact"
                    casing="ui"
                    className={FILTER_BAR_CHIP_CLASS}>
                    Category: {filters.category}
                  </Badge>
                )}
                {activeFilterCount -
                  (filters.search ? 1 : 0) -
                  (filters.category ? 1 : 0) >
                  0 && (
                  <span className={FILTER_BAR_MORE_CHIP_CLASS}>
                    +
                    {activeFilterCount -
                      (filters.search ? 1 : 0) -
                      (filters.category ? 1 : 0)}{" "}
                    more
                  </span>
                )}
              </div>
            )}
          </div>
          <span className="inline-flex items-center justify-center rounded-md p-2 text-foreground">
            {isExpanded ?
              <ChevronUp className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
      )}

      {isExpanded && (
        <div
          className={cn(
            FILTER_BAR_CONTENT_ANIMATION_CLASS,
            !hideHeader && "mt-4",
          )}>
          <div className={FILTER_BAR_GRID_CLASS}>
            {showSearchField && (
              <div className={FORM_FIELD_STACK_CLASS}>
                <label className={FIELD_LABEL_CLASS}>Search</label>
                <Input
                  placeholder="Search..."
                  value={filters.search}
                  onChange={(event) =>
                    setFilters({ search: event.target.value })
                  }
                />
              </div>
            )}

            {showCategoryField && (
              <div className={FORM_FIELD_STACK_CLASS}>
                <label className={FIELD_LABEL_CLASS}>Category</label>
                <select
                  className={FORM_SELECT_CLASS}
                  title="Category"
                  value={filters.category ?? ""}
                  onChange={(event) =>
                    setFilters({ category: event.target.value || null })
                  }>
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
              <div className={FORM_FIELD_STACK_CLASS}>
                <label className={FIELD_LABEL_CLASS}>Platform</label>
                <select
                  className={FORM_SELECT_CLASS}
                  title="Platform"
                  value={filters.platform ?? ""}
                  onChange={(event) =>
                    setFilters({ platform: event.target.value || null })
                  }>
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
              <div className={FORM_FIELD_STACK_CLASS}>
                <label className={FIELD_LABEL_CLASS}>Key type</label>
                <select
                  className={FORM_SELECT_CLASS}
                  title="Key type"
                  value={filters.keyType ?? ""}
                  onChange={(event) =>
                    setFilters({ keyType: event.target.value || null })
                  }>
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

          <div className={cn(FILTER_BAR_GRID_CLASS, "mt-4")}>
            {showKeyPresenceField && (
              <div className={FORM_FIELD_STACK_CLASS}>
                <label className={FIELD_LABEL_CLASS}>Keys</label>
                <select
                  className={FORM_SELECT_CLASS}
                  title="Key presence"
                  value={filters.keyPresence ?? ""}
                  onChange={(event) =>
                    setFilters({
                      keyPresence:
                        event.target.value ?
                          (event.target.value as "has_keys" | "no_keys")
                        : null,
                    })
                  }>
                  <option value="">All</option>
                  <option value="has_keys">Has keys</option>
                  <option value="no_keys">No keys</option>
                </select>
              </div>
            )}

            {showDownloadPresenceField && (
              <div className={FORM_FIELD_STACK_CLASS}>
                <label className={FIELD_LABEL_CLASS}>Downloads</label>
                <select
                  className={FORM_SELECT_CLASS}
                  title="Download presence"
                  value={filters.downloadPresence ?? ""}
                  onChange={(event) =>
                    setFilters({
                      downloadPresence:
                        event.target.value ?
                          (event.target.value as
                            | "has_downloads"
                            | "no_downloads")
                        : null,
                    })
                  }>
                  <option value="">All</option>
                  <option value="has_downloads">Has downloads</option>
                  <option value="no_downloads">No downloads</option>
                </select>
              </div>
            )}

            {showDateRangeField && (
              <>
                <div className={FORM_FIELD_STACK_CLASS}>
                  <label className={FIELD_LABEL_CLASS}>Start Date</label>
                  <Input
                    type="date"
                    value={filters.startDate ?? ""}
                    onChange={(e) =>
                      setFilters({ startDate: e.target.value || null })
                    }
                  />
                </div>
                <div className={FORM_FIELD_STACK_CLASS}>
                  <label className={FIELD_LABEL_CLASS}>End Date</label>
                  <Input
                    type="date"
                    value={filters.endDate ?? ""}
                    onChange={(e) =>
                      setFilters({ endDate: e.target.value || null })
                    }
                  />
                </div>
              </>
            )}

            <div className={FILTER_BAR_FOOTER_CLASS}>
              <Button
                variant="outline"
                onClick={() => {
                  clearFilters();
                  onClear?.();
                }}
                className="gap-2">
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
