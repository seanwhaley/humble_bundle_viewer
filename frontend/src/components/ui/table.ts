/**
 * Shared table style tokens for native table surfaces.
 */

export const tableHeaderSurfaceClass = "bg-surface-inset text-muted-foreground";

export const stickyTableHeaderSurfaceClass =
  "sticky top-0 z-10 bg-surface-inset text-muted-foreground backdrop-blur";

export const tableHeaderRowClass = "border-b border-border";

export const tableHeaderCellClass = "font-medium text-muted-foreground";

export const tableCheckboxClass =
  "h-4 w-4 rounded border border-input bg-background text-primary";

export const tableToolbarClass = "space-y-3 p-3.5";

export const tableToolbarRowClass =
  "flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between";

export const tableToolbarSearchSectionClass =
  "flex min-w-0 flex-1 flex-col gap-2";

export const tableToolbarSummaryClass =
  "flex flex-wrap items-center gap-2 text-xs text-muted-foreground";

export const tableToolbarActionsClass = "flex flex-wrap items-center gap-2";

export const tableSelectionSummaryClass = "text-xs text-muted-foreground";

export const tableOverflowVisibleClass = "overflow-visible";

export const tableScrollWrapperClass = "overflow-x-auto overflow-y-visible";

export const tableFixedWrapperClass =
  "max-w-full overflow-x-hidden overflow-y-visible";

export const tableBaseClass = "caption-bottom text-left text-xs md:text-sm";

export const tableAutoLayoutClass = "min-w-full table-auto";

export const tableFixedLayoutClass = "w-full table-fixed";

export const tableHeaderBorderClass = "[&_tr]:border-b [&_tr]:border-border";

export const tableHeaderContentClass =
  "align-top whitespace-normal break-words";

export const tableSelectionHeaderCellClass = "w-10 px-2.5 py-3 text-center";

export const tableHeaderCellPaddingClass = "px-3 py-3 text-left";

export const tableSelectionHeaderStackClass =
  "flex items-start justify-center pt-0.5";

export const tableHeaderStackClass = "flex flex-col items-start gap-1.5";

export const tableHeaderToggleClass = "flex w-full items-start gap-2";

export const tableHeaderSortableClass = "cursor-pointer select-none";

export const tableHeaderLabelRowClass = "flex min-w-0 items-center gap-2";

export const tableFilterAnchorClass = "relative flex w-full justify-start";

export const tableFilterTriggerClass =
  "cursor-pointer rounded-md border border-border bg-surface-overlay px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground";

export const tableFilterTriggerContentClass = "flex items-center gap-1";

export const tableFilterCountBadgeClass =
  "rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground";

export const tableFilterMenuClass =
  "absolute left-0 top-full z-20 mt-2 w-52 rounded-md p-2 text-popover-foreground shadow-lg";

export const tableFilterMenuHeaderClass =
  "flex items-center justify-between pb-2 text-[10px] uppercase tracking-wide text-muted-foreground";

export const tableFilterMenuClearClass =
  "text-muted-foreground hover:text-foreground";

export const tableFilterMenuSelectClass = "h-40 w-full py-1";

export const tableFilterMenuHintClass =
  "pt-2 text-[10px] text-muted-foreground";

export const tableBodyRowClass =
  "border-b border-border transition-colors hover:bg-accent/60 data-[state=selected]:bg-accent";

export const tableCellBaseClass = "whitespace-normal break-words";

export const tableSelectionCellClass = "w-10 px-2.5 py-3 text-center align-top";

export const tableBodyCellClass = "p-3 align-top";

export const tableEmptyStateClass = "h-24 text-center text-muted-foreground";

export const tablePaginationClass =
  "flex flex-wrap items-center justify-end gap-2 py-4";

export const tablePaginationInfoClass = "flex-1 text-xs text-muted-foreground";

export const tablePaginationControlsClass =
  "flex flex-wrap items-center gap-4 text-xs text-muted-foreground";

export const tablePaginationSelectGroupClass = "flex items-center gap-2";

export const tablePaginationButtonsClass = "space-x-2";
