/**
 * Shared page- and route-level style roles.
 */

export const PAGE_STACK_CLASS = "flex w-full flex-col";

export const PAGE_STACK_TIGHT_CLASS = `${PAGE_STACK_CLASS} space-y-4`;

export const PAGE_STACK_ROOMY_CLASS = `${PAGE_STACK_CLASS} space-y-6`;

export const PAGE_INTRO_CLASS = "space-y-1";

export const PAGE_INTRO_TITLE_CLASS =
  "text-3xl font-bold tracking-tight text-foreground";

export const PAGE_INTRO_DESCRIPTION_CLASS = "text-muted-foreground";

export const ROUTE_LOADING_CONTAINER_CLASS =
  "flex h-[50vh] items-center justify-center";

export const ROUTE_LOADING_CONTENT_CLASS =
  "flex items-center gap-3 text-muted-foreground";

export const ROUTE_LOADING_ICON_CLASS = "h-8 w-8 animate-spin";

export const ROUTE_LOADING_PULSE_DOT_CLASS =
  "h-2 w-2 animate-ping rounded-full bg-muted-foreground";

export const ROUTE_ERROR_MESSAGE_CLASS =
  "rounded-md bg-destructive/15 p-4 text-destructive";

export const ROUTE_MESSAGE_TITLE_CLASS =
  "text-xl font-semibold text-foreground";

export const ROUTE_MESSAGE_BODY_CLASS = "mt-2 text-sm text-foreground/90";

export const ROUTE_MESSAGE_EMPHASIS_CLASS =
  "mx-1 font-semibold text-foreground";

export const SECTION_TEXT_CLASS = "text-sm text-card-foreground";

export const SECTION_MUTED_TEXT_CLASS = "text-sm text-muted-foreground";

export const SECTION_HELP_TEXT_CLASS = "text-xs text-muted-foreground";

export const SECTION_TITLE_TEXT_CLASS = "text-xl font-semibold text-foreground";

export const SECTION_DESCRIPTION_TEXT_CLASS =
  "mt-1 text-sm text-muted-foreground";

export const SECTION_NOTE_TEXT_CLASS = "mt-2 text-sm text-muted-foreground";

export const SECTION_STACK_CLASS = "space-y-4";

export const SECTION_STACK_COMPACT_CLASS = "space-y-3";

export const SECTION_STACK_RELAXED_CLASS = "space-y-6";

export const SECTION_SPLIT_ROW_CLASS =
  "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between";

export const SECTION_BODY_STACK_CLASS = "space-y-1";

export const DETAIL_LIST_CLASS = "mt-3 space-y-1 text-xs text-muted-foreground";

export const DETAIL_ACTION_ROW_CLASS = "mt-3 flex flex-wrap gap-2";

export const STATUS_DETAIL_LIST_CLASS =
  "mt-2 list-disc space-y-1 pl-5 text-xs opacity-90";

export const FORM_STACK_CLASS = "space-y-3";

export const GRID_THREE_COLUMN_CLASS = "grid gap-3 md:grid-cols-3";

export const GRID_THREE_COLUMN_COMPACT_CLASS = "grid gap-3 sm:grid-cols-3";

export const GRID_TWO_FOUR_COLUMN_CLASS =
  "grid gap-3 md:grid-cols-2 xl:grid-cols-4";

export const GRID_TWO_THREE_SIX_COLUMN_CLASS =
  "grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6";

export const GRID_TWO_FOUR_RELAXED_CLASS =
  "grid gap-4 md:grid-cols-2 xl:grid-cols-4";

export const GRID_TWO_XL_SPLIT_CLASS = "grid gap-4 xl:grid-cols-2";

export const GRID_FOUR_METRIC_CLASS =
  "mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4";

export const PANEL_HEADER_SPLIT_ROW_CLASS =
  "flex flex-wrap items-center justify-between gap-3";

export const PANEL_HEADER_TOP_ALIGN_ROW_CLASS =
  "flex flex-wrap items-start justify-between gap-3";

export const PANEL_HEADER_STACK_ROW_CLASS =
  "flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between";

export const PANEL_TEXT_BLOCK_CLASS = "space-y-2";

export const PANEL_LEAD_TEXT_CLASS = "mt-3 text-sm text-muted-foreground";

export const PANEL_INTRO_TEXT_CLASS =
  "mt-2 max-w-3xl text-sm text-muted-foreground";

export const PANEL_ACTION_SUMMARY_CLASS = "text-sm text-muted-foreground";

export const PANEL_HELP_TEXT_CLASS = "text-xs text-muted-foreground";

export const PANEL_META_ROW_CLASS =
  "mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground";

export const PANEL_ERROR_TEXT_CLASS = "text-xs text-status-error-foreground";

export const FLOATING_DISCLOSURE_PANEL_CLASS =
  "absolute right-0 z-20 mt-2 w-72";

export const FLOATING_DISCLOSURE_HEADER_CLASS =
  "flex items-center justify-between gap-3";

export const FLOATING_DISCLOSURE_LIST_CLASS = "mt-3 space-y-2";

export const DISCLOSURE_SUMMARY_PADDED_CLASS =
  "cursor-pointer list-none p-6 pb-0";

export const DISCLOSURE_BODY_PADDED_STACK_CLASS =
  "space-y-4 px-6 pb-6 text-sm text-card-foreground";

export const EMPHASIS_TEXT_CLASS = "font-semibold text-card-foreground";

export const DISCLOSURE_SUMMARY_CLASS =
  "cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground marker:content-none";

export const DISCLOSURE_SUMMARY_ROW_CLASS =
  "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between";

export const DISCLOSURE_HINT_CLASS = "text-xs text-muted-foreground";

export const DISCLOSURE_BODY_CLASS = "border-t border-border p-3";

export const DISCLOSURE_RESET_ROW_CLASS = "mb-3 flex justify-end";

export const FLEX_ACTION_ROW_CLASS = "flex flex-wrap gap-2";

export const PAGE_ACTION_ROW_CLASS = "flex flex-wrap items-center gap-2";
