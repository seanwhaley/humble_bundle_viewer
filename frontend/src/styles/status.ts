/**
 * Shared semantic status style roles.
 */

import type { LinkExpirationState } from "../utils/downloads";

export const STATUS_SUCCESS_PANEL_CLASS =
  "border-status-success/40 bg-status-success/10 text-status-success-foreground";

export const STATUS_INFO_PANEL_CLASS =
  "border-status-info/40 bg-status-info/10 text-status-info-foreground";

export const STATUS_WARNING_PANEL_CLASS =
  "border-status-warning/40 bg-status-warning/10 text-status-warning-foreground";

export const STATUS_ERROR_PANEL_CLASS =
  "border-status-error/40 bg-status-error/10 text-status-error-foreground";

export const STATUS_NEUTRAL_PANEL_CLASS =
  "border-status-neutral/80 bg-status-neutral/80 text-status-neutral-foreground";

export const STATUS_SUCCESS_PANEL_SOFT_CLASS =
  "rounded-md border border-status-success/40 bg-status-success/10 p-3.5";

export const STATUS_SUCCESS_HEADER_CLASS =
  "flex items-center gap-2 text-sm font-semibold text-status-success-foreground";

export const STATUS_SUCCESS_BODY_TEXT_CLASS =
  "mt-1 max-w-3xl text-xs text-foreground/90";

export const STATUS_SCOPE_PANEL_CLASS =
  "rounded-md border border-border bg-surface-overlay px-2.5 py-1.5 text-right text-[11px] text-muted-foreground";

export const STATUS_WARNING_TEXT_XS_CLASS = "text-xs text-status-warning-foreground";

export const STATUS_ERROR_TEXT_XS_CLASS = "text-xs text-status-error-foreground";

export const STATUS_SUCCESS_TEXT_RIGHT_CLASS =
  "text-right text-sm font-medium text-status-success-foreground";

export const STATUS_PROGRESS_BAR_CLASS =
  "mt-3 h-2 w-full overflow-hidden rounded-full [appearance:none] [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-status-success [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-status-success";

export const WARNING_BANNER_CLASS =
  "rounded-lg border border-status-warning/40 bg-status-warning/10 px-3.5 py-3 shadow-sm";

export const WARNING_BANNER_LAYOUT_CLASS =
  "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between";

export const WARNING_BANNER_HEADER_CLASS =
  "flex items-center gap-2 text-status-warning-foreground";

export const WARNING_BANNER_TITLE_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em]";

export const WARNING_BANNER_BODY_CLASS = "mt-1 text-sm font-medium text-foreground";

export const WARNING_BANNER_DETAIL_CLASS =
  "mt-1 text-xs text-status-warning-foreground";

export const WARNING_TEXT_EMPHASIS_CLASS =
  "font-medium text-status-warning-foreground";

export const SUCCESS_TEXT_CLASS = "font-medium text-status-success-foreground";

export const WARNING_TEXT_CLASS = "font-semibold text-status-warning-foreground";

export const EXPIRED_TEXT_CLASS = "font-bold text-destructive";

export const DOWNLOAD_ACTION_STATUS_CLASS: Record<
  LinkExpirationState,
  string
> = {
  unknown: "",
  valid: "",
  upcoming: "",
  expiring:
    "border-status-warning/40 bg-status-warning/10 text-status-warning-foreground hover:bg-status-warning/15",
  expired:
    "border-status-error/40 bg-status-error/10 text-status-error-foreground hover:bg-status-error/15",
};

export const DOWNLOAD_EXPIRY_BADGE_TONE_CLASS: Record<
  LinkExpirationState,
  string
> = {
  unknown: STATUS_NEUTRAL_PANEL_CLASS,
  valid: STATUS_NEUTRAL_PANEL_CLASS,
  upcoming: STATUS_NEUTRAL_PANEL_CLASS,
  expiring: STATUS_WARNING_PANEL_CLASS,
  expired: STATUS_ERROR_PANEL_CLASS,
};

export const DOWNLOAD_EXPIRY_BADGE_CLASS = "rounded-full border px-2.5 py-1";

export const STATUS_MESSAGE_CLASS = "rounded-md border px-3 py-2 text-sm";

export const COMMAND_STATUS_PANEL_CLASS = {
  success: STATUS_SUCCESS_PANEL_CLASS,
  running: STATUS_INFO_PANEL_CLASS,
  error: STATUS_ERROR_PANEL_CLASS,
  idle: STATUS_NEUTRAL_PANEL_CLASS,
} as const;
