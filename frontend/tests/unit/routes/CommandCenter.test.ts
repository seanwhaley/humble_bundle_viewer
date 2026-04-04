import { describe, expect, it } from "vitest";

import { sanitizePersistedCommandState } from "../../../src/app/routes/CommandCenter";

describe("sanitizePersistedCommandState", () => {
  it("converts stale running command state back to idle on restore", () => {
    expect(
      sanitizePersistedCommandState({
        status: "running",
        message: "Running command…",
        detailLines: ["still going"],
        actions: [{ label: "Go", to: "/" }],
      }),
    ).toEqual({
      status: "idle",
      message: null,
      detailLines: [],
      actions: [],
    });
  });

  it("preserves completed command state", () => {
    const completed = {
      status: "success" as const,
      message: "Done",
      detailLines: ["Output: file.json"],
      actions: [{ label: "Open", to: "/library/purchases" }],
    };

    expect(sanitizePersistedCommandState(completed)).toEqual(completed);
  });
});
