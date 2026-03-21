/**
 * Formatting helpers for UI display.
 */
export const formatBytes = (bytes?: number) => {
  if (!bytes || Number.isNaN(bytes)) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

/**
 * Format a number using the browser locale.
 */
export const formatNumber = (value?: number) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat().format(value);
};

/**
 * Format USD currency values for tiles and tables.
 */
export const formatCurrency = (value?: number) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

/**
 * Format dates as MM/DD/YY in a consistent locale.
 */
export const formatDate = (dateInput?: string | Date | number | null) => {
  if (!dateInput) return "–";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

/**
 * Format dates with short date and time for status surfaces.
 */
export const formatDateTime = (dateInput?: string | Date | number | null) => {
  if (!dateInput) return "–";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

