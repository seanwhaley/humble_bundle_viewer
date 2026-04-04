/**
 * Shared application layout and navigation style roles.
 */

import { cn } from "../lib/utils";

export const APP_SHELL_CLASS = "flex min-h-screen bg-background text-foreground";

export const APP_MOBILE_BACKDROP_CLASS =
  "fixed inset-0 z-40 bg-background/80 md:hidden";

export const APP_SIDEBAR_CLASS =
  "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300";

export const APP_SIDEBAR_WIDTH_EXPANDED_CLASS = "w-64";

export const APP_SIDEBAR_WIDTH_COLLAPSED_CLASS = "w-[60px]";

export const APP_SIDEBAR_OFFSCREEN_CLASS = "-translate-x-full md:translate-x-0";

export const APP_SIDEBAR_ONSCREEN_CLASS = "translate-x-0";

export const APP_SIDEBAR_HEADER_CLASS =
  "flex h-16 items-center border-b border-sidebar-border px-4";

export const APP_SIDEBAR_HEADER_EXPANDED_CLASS = "justify-between";

export const APP_SIDEBAR_HEADER_COLLAPSED_CLASS = "justify-center";

export const APP_SIDEBAR_BRAND_CLASS = "min-w-0";

export const APP_SIDEBAR_BRAND_TITLE_CLASS =
  "block truncate text-lg font-bold tracking-tight text-sidebar-foreground";

export const APP_SIDEBAR_BRAND_SUBTITLE_CLASS =
  "block truncate text-xs text-sidebar-foreground/70";

export const APP_SIDEBAR_NAV_CLASS = "flex-1 overflow-y-auto p-2";

export const APP_SIDEBAR_GROUPS_CLASS = "space-y-4";

export const APP_SIDEBAR_GROUP_CLASS = "space-y-1";

export const APP_SIDEBAR_GROUP_HEADING_CLASS =
  "px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45";

export const APP_MAIN_CLASS = "flex-1 transition-all duration-300";

export const APP_MAIN_EXPANDED_CLASS = "md:ml-64 md:w-[calc(100%-16rem)]";

export const APP_MAIN_COLLAPSED_CLASS = "md:ml-[60px] md:w-[calc(100%-60px)]";

export const APP_HEADER_CLASS =
  "sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur md:px-5";

export const APP_HEADER_IDENTITY_CLASS = "flex min-w-0 items-center gap-3";

export const APP_HEADER_TITLE_BLOCK_CLASS = "min-w-0";

export const APP_HEADER_EYEBROW_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";

export const APP_HEADER_TITLE_ROW_CLASS =
  "flex min-w-0 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3";

export const APP_HEADER_TITLE_CLASS =
  "truncate text-base font-semibold text-foreground md:text-lg";

export const APP_HEADER_SUBTITLE_CLASS =
  "hidden truncate text-xs text-muted-foreground xl:block";

export const APP_HEADER_ACTIONS_CLASS = "flex shrink-0 items-center gap-2";

export const APP_ICON_CLASS = "h-5 w-5 shrink-0";

export const APP_DESKTOP_ONLY_ACTION_CLASS = "hidden md:flex";

export const APP_MOBILE_ONLY_ACTION_CLASS = "md:hidden";

export const APP_CONTENT_PAD_CLASS = "p-4 md:p-5";

export const APP_CONTENT_STACK_CLASS = "space-y-4";

export const SIDEBAR_ITEM_CLASS =
  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export const SIDEBAR_ITEM_ACTIVE_CLASS =
  "bg-sidebar-accent font-medium text-sidebar-accent-foreground";

export const SIDEBAR_ITEM_COLLAPSED_CLASS = "justify-center px-2";

export const SIDEBAR_ITEM_LABEL_CLASS = "truncate";

export const SIDEBAR_ITEM_BADGE_CLASS =
  "ml-auto rounded-full border border-status-warning/40 bg-status-warning/10 px-2 py-0.5 text-[10px] font-semibold text-status-warning-foreground";

export const SIDEBAR_ITEM_DOT_CLASS =
  "absolute right-2 top-2 h-2 w-2 rounded-full bg-status-warning-foreground";

export const getSidebarItemClass = (isActive: boolean, collapsed: boolean) =>
  cn(
    SIDEBAR_ITEM_CLASS,
    isActive && SIDEBAR_ITEM_ACTIVE_CLASS,
    collapsed && SIDEBAR_ITEM_COLLAPSED_CLASS,
  );
