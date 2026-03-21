import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "../../../src/utils/format";

describe("format helpers", () => {
  it("formats byte values across units and handles missing input", () => {
    expect(formatBytes()).toBe("–");
    expect(formatBytes(0)).toBe("–");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats numbers and currency while preserving empty-state placeholders", () => {
    expect(formatNumber()).toBe("–");
    expect(formatNumber(Number.NaN)).toBe("–");
    expect(formatNumber(12345)).toBe("12,345");

    expect(formatCurrency()).toBe("–");
    expect(formatCurrency(Number.NaN)).toBe("–");
    expect(formatCurrency(14.99)).toBe("$14.99");
  });

  it("formats dates and datetimes while rejecting invalid input", () => {
    expect(formatDate()).toBe("–");
    expect(formatDate("not-a-date")).toBe("–");
    expect(formatDate("2026-03-21T12:34:00Z")).toBe("03/21/26");

    expect(formatDateTime(null)).toBe("–");
    expect(formatDateTime("not-a-date")).toBe("–");
    expect(formatDateTime("2026-03-21T12:34:00Z")).toContain("2026");
    expect(formatDateTime("2026-03-21T12:34:00Z")).toContain("Mar");
  });
});
