import { describe, expect, it } from "vitest";

import type {
  Download,
  FlattenedKey,
  Key,
  Product,
} from "../../../src/data/types";
import {
  buildExpiringKeyActionSummary,
  buildKeyInventorySummary,
  buildExpiringKeyScopeCounts,
  buildExpiringUnredeemedKeySummary,
  buildRecentPurchaseThemes,
  DEFAULT_EXPIRING_KEY_REVEAL_POLICY,
  filterExpiringKeysByScope,
  filterKeyInventoryByScope,
  getKeyRedemptionActionLabel,
  getDownloadRouteVisibility,
} from "../../../src/data/selectors";

const makeDownload = (overrides: Partial<Download> = {}): Download => ({
  file_type: "zip",
  url: "https://example.com/file.zip",
  ...overrides,
});

const makeProduct = (downloads: Download[]): Product => ({
  product_name: "Sample Bundle",
  gamekey: "sample-bundle",
  category: "bundle",
  created_at: "2026-03-01T00:00:00Z",
  subproducts: [
    {
      human_name: "Sample Title",
      downloads,
    },
  ],
});

const makeKey = (overrides: Partial<Key> = {}): Key => ({
  key_type: "steam",
  key_type_human_name: "Steam",
  human_name: "Sample Key",
  ...overrides,
});

describe("getDownloadRouteVisibility", () => {
  it("reports visibility for every download route from library content", () => {
    const products: Product[] = [
      makeProduct([makeDownload({ platform: "ebook", file_type: "epub" })]),
      makeProduct([makeDownload({ platform: "audio", name: "MP3" })]),
      makeProduct([makeDownload({ platform: "video", file_type: "mp4" })]),
      makeProduct([makeDownload({ platform: "windows", file_type: "exe" })]),
      makeProduct([makeDownload({ platform: "pdf", file_type: "pdf" })]),
    ];

    expect(getDownloadRouteVisibility(products)).toEqual({
      downloads: true,
      software: true,
      videos: true,
      ebooks: true,
      audiobooks: true,
    });
  });

  it("hides the generic downloads route when only dedicated media pages match", () => {
    const products: Product[] = [
      makeProduct([makeDownload({ platform: "ebook", file_type: "epub" })]),
      makeProduct([makeDownload({ platform: "audio", name: "FLAC" })]),
      makeProduct([makeDownload({ platform: "video", file_type: "mp4" })]),
      makeProduct([makeDownload({ platform: "linux", file_type: "tar.gz" })]),
    ];

    expect(getDownloadRouteVisibility(products)).toEqual({
      downloads: false,
      software: true,
      videos: true,
      ebooks: true,
      audiobooks: true,
    });
  });
});

describe("buildExpiringUnredeemedKeySummary", () => {
  it("counts only expired or soon-expiring unrevealed keys", () => {
    const products: Product[] = [
      {
        product_name: "Urgent Bundle",
        gamekey: "urgent-bundle",
        subproducts: [
          {
            human_name: "Urgent Item",
            keys: [
              makeKey({ human_name: "Expired", is_expired: true }),
              makeKey({ human_name: "Soon", num_days_until_expired: 5 }),
              makeKey({ human_name: "Far", num_days_until_expired: 60 }),
              makeKey({
                human_name: "Claimed Soon",
                num_days_until_expired: 3,
                redeemed_key_val: "AAAAA-BBBBB-CCCCC",
              }),
            ],
          },
        ],
      },
    ];

    expect(buildExpiringUnredeemedKeySummary(products, 30)).toEqual({
      thresholdDays: 30,
      urgentUnredeemedCount: 2,
      expiredUnredeemedCount: 1,
      expiringSoonUnredeemedCount: 1,
      affectedPurchaseCount: 1,
      nextExpiringDaysRemaining: 5,
    });
  });
});

describe("expiring key scope helpers", () => {
  const keys: FlattenedKey[] = [
    {
      id: "expired-unrevealed",
      keyName: "Expired unrevealed",
      status: ["Expired"],
      keyType: "Steam",
      redemptionLinks: [],
      numDaysUntilExpired: 0,
    },
    {
      id: "expired-revealed",
      keyName: "Expired revealed",
      status: ["Expired", "Revealed"],
      keyType: "Steam",
      keyValue: "AAAAA-BBBBB-CCCCC",
      redemptionLinks: [],
      numDaysUntilExpired: 0,
    },
    {
      id: "soon-unrevealed",
      keyName: "Soon unrevealed",
      status: ["Unrevealed"],
      keyType: "Steam",
      redemptionLinks: [],
      numDaysUntilExpired: 5,
    },
    {
      id: "month-revealed",
      keyName: "Month revealed",
      status: ["Revealed"],
      keyType: "Steam",
      keyValue: "AAAAA-BBBBB-CCCCC",
      redemptionLinks: [],
      numDaysUntilExpired: 20,
    },
    {
      id: "far-unrevealed",
      keyName: "Far unrevealed",
      status: ["Unrevealed"],
      keyType: "Steam",
      redemptionLinks: [],
      numDaysUntilExpired: 45,
    },
  ];

  it("filters the expiring key table into urgency-focused scopes", () => {
    expect(
      filterExpiringKeysByScope(keys, "needs_action").map((key) => key.id),
    ).toEqual(["soon-unrevealed"]);
    expect(
      filterExpiringKeysByScope(keys, "expired").map((key) => key.id),
    ).toEqual(["expired-unrevealed", "expired-revealed"]);
    expect(
      filterExpiringKeysByScope(keys, "next_7_days").map((key) => key.id),
    ).toEqual(["soon-unrevealed"]);
    expect(
      filterExpiringKeysByScope(keys, "next_30_days").map((key) => key.id),
    ).toEqual(["soon-unrevealed"]);
    expect(
      filterExpiringKeysByScope(keys, "needs_reveal").map((key) => key.id),
    ).toEqual(["soon-unrevealed", "far-unrevealed"]);
  });

  it("builds quick-scope counts for the expiring keys route", () => {
    expect(buildExpiringKeyScopeCounts(keys)).toEqual({
      all: 5,
      needs_action: 1,
      expired: 2,
      next_7_days: 1,
      next_30_days: 1,
      needs_reveal: 2,
    });
  });

  it("lets users opt back into revealed unexpired keys for still-open windows", () => {
    expect(
      filterExpiringKeysByScope(keys, "next_30_days", {
        ...DEFAULT_EXPIRING_KEY_REVEAL_POLICY,
        ignore_revealed_status_for_unexpired_keys: true,
      }).map((key) => key.id),
    ).toEqual(["soon-unrevealed", "month-revealed"]);
  });
});

describe("buildExpiringKeyActionSummary", () => {
  it("treats revealed keys as handled for open windows by default while still surfacing expired history", () => {
    const products: Product[] = [
      {
        product_name: "Urgent Bundle",
        gamekey: "urgent-bundle",
        subproducts: [
          {
            human_name: "Urgent Item",
            keys: [
              makeKey({ human_name: "Expired unrevealed", is_expired: true }),
              makeKey({
                human_name: "Expired revealed",
                is_expired: true,
                redeemed_key_val: "AAAAA-BBBBB-CCCCC",
              }),
              makeKey({
                human_name: "Soon unrevealed",
                num_days_until_expired: 5,
              }),
              makeKey({
                human_name: "Soon revealed",
                num_days_until_expired: 3,
                redeemed_key_val: "DDDDD-EEEEE-FFFFF",
              }),
            ],
          },
        ],
      },
    ];

    expect(buildExpiringKeyActionSummary(products, 30)).toEqual({
      thresholdDays: 30,
      openActionCount: 1,
      expiredReferenceCount: 2,
      affectedPurchaseCount: 1,
      nextExpiringDaysRemaining: 5,
    });
  });

  it("can ignore revealed status for unexpired keys when configured", () => {
    const products: Product[] = [
      {
        product_name: "Urgent Bundle",
        gamekey: "urgent-bundle",
        subproducts: [
          {
            human_name: "Urgent Item",
            keys: [
              makeKey({
                human_name: "Soon unrevealed",
                num_days_until_expired: 5,
              }),
              makeKey({
                human_name: "Soon revealed",
                num_days_until_expired: 3,
                redeemed_key_val: "DDDDD-EEEEE-FFFFF",
              }),
            ],
          },
        ],
      },
    ];

    expect(
      buildExpiringKeyActionSummary(products, 30, {
        ...DEFAULT_EXPIRING_KEY_REVEAL_POLICY,
        ignore_revealed_status_for_unexpired_keys: true,
      }),
    ).toEqual({
      thresholdDays: 30,
      openActionCount: 2,
      expiredReferenceCount: 0,
      affectedPurchaseCount: 1,
      nextExpiringDaysRemaining: 3,
    });
  });
});

describe("key inventory helpers", () => {
  const keys: FlattenedKey[] = [
    {
      id: "expired-unrevealed",
      keyName: "Expired unrevealed",
      status: ["Expired"],
      keyType: "Steam",
      redemptionLinks: [],
      numDaysUntilExpired: 0,
    },
    {
      id: "direct-redeem",
      keyName: "Direct redeem",
      status: ["Direct redeem", "Unrevealed"],
      keyType: "Steam",
      redemptionLinks: [
        {
          id: "redeem-1",
          label: "Redeem",
          url: "https://example.com/redeem",
          kind: "redeem",
        },
      ],
    },
    {
      id: "instructions-only",
      keyName: "Instructions only",
      status: ["Unrevealed"],
      keyType: "Boot.dev",
      redemptionLinks: [
        {
          id: "instructions-1",
          label: "Instructions",
          url: "https://example.com/instructions",
          kind: "instructions",
        },
      ],
    },
    {
      id: "revealed-soon",
      keyName: "Revealed soon",
      status: ["Revealed"],
      keyType: "Steam",
      keyValue: "AAAAA-BBBBB-CCCCC",
      redemptionLinks: [
        {
          id: "redeem-2",
          label: "Redeem",
          url: "https://example.com/redeem-2",
          kind: "redeem",
        },
      ],
      numDaysUntilExpired: 14,
    },
  ];

  it("filters shared key inventory scopes for Steam and Non-Steam routes", () => {
    expect(
      filterKeyInventoryByScope(keys, "needs_reveal").map((key) => key.id),
    ).toEqual(["expired-unrevealed", "direct-redeem", "instructions-only"]);
    expect(
      filterKeyInventoryByScope(keys, "revealed").map((key) => key.id),
    ).toEqual(["revealed-soon"]);
    expect(
      filterKeyInventoryByScope(keys, "redeemable").map((key) => key.id),
    ).toEqual(["direct-redeem", "revealed-soon"]);
    expect(
      filterKeyInventoryByScope(keys, "expiring").map((key) => key.id),
    ).toEqual(["expired-unrevealed", "revealed-soon"]);
    expect(
      filterKeyInventoryByScope(keys, "direct_redeem").map((key) => key.id),
    ).toEqual(["direct-redeem"]);
    expect(
      filterKeyInventoryByScope(keys, "instructions").map((key) => key.id),
    ).toEqual(["instructions-only"]);
  });

  it("builds a compact shared summary for key inventory pages", () => {
    expect(buildKeyInventorySummary(keys)).toEqual({
      total: 4,
      revealed: 1,
      needsReveal: 3,
      redeemable: 2,
      expiring: 2,
      directRedeem: 1,
      instructions: 1,
    });
  });

  it("picks a compact action label that matches available redemption metadata", () => {
    expect(getKeyRedemptionActionLabel(keys[1])).toBe("Redeem");
    expect(getKeyRedemptionActionLabel(keys[2])).toBe("Instructions");
    expect(
      getKeyRedemptionActionLabel({
        id: "no-links",
        keyName: "No links",
        status: ["Expired"],
        keyType: "Steam",
        redemptionLinks: [],
      }),
    ).toBe("Action");
  });
});

describe("buildRecentPurchaseThemes", () => {
  it("surfaces meaningful subproduct keywords and drops generic filler terms", () => {
    const products: Product[] = [
      {
        product_name: "March 2026 Humble Choice",
        gamekey: "warhammer-stories",
        created_at: "2026-03-04T00:00:00Z",
        subproducts: [
          {
            human_name: "Imperium Rising",
            page_details: {
              description:
                "Warhammer tactics, imperium heroes, and galaxy-spanning conflict.",
              tags: ["grimdark", "strategy"],
            },
          },
        ],
      },
      {
        product_name: "Mystery Comics Bundle",
        gamekey: "mystery-comics",
        created_at: "2026-03-03T00:00:00Z",
        subproducts: [
          {
            human_name: "Detective Signal",
            page_details: {
              description:
                "A noir mystery packed with detectives and conspiracies.",
              tags: ["mystery", "noir"],
            },
          },
        ],
      },
    ];

    const themes = buildRecentPurchaseThemes(products, 10, 20).map(
      (theme) => theme.label,
    );

    expect(themes).toContain("warhammer");
    expect(themes).toContain("imperium");
    expect(themes).toContain("mystery");
    expect(themes).not.toContain("bundle");
    expect(themes).not.toContain("choice");
    expect(themes).not.toContain("march");
  });
});
