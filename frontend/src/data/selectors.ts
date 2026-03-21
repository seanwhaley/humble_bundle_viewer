/**
 * Selector helpers to derive UI-friendly data from library products.
 */
import {
  Download,
  FlattenedDownload,
  FlattenedKey,
  Key,
  Product,
  Subproduct,
  SuborderItem,
} from "./types";
import { DownloadPresence, FilterState, KeyPresence } from "../state/filters";
import { getKeyRedemptionLinks } from "./redemption";

export interface CountDatum {
  id?: string;
  label: string;
  value: number;
  selectValue?: string | null;
}

export interface BundleFamilyDatum extends CountDatum {
  fullLabel: string;
  searchTerm: string;
  abbreviation?: string;
}

export interface RecentPurchaseSummary {
  id: string;
  name: string;
  categoryKey: string;
  categoryLabel: string;
  createdAt?: string;
  amountSpent: number;
  downloadCount: number;
  keyCount: number;
  includedItemCount: number;
}

export interface PurchaseThemeDatum {
  label: string;
  value: number;
}

export interface ExpiringUnredeemedKeySummary {
  thresholdDays: number;
  urgentUnredeemedCount: number;
  expiredUnredeemedCount: number;
  expiringSoonUnredeemedCount: number;
  affectedPurchaseCount: number;
  nextExpiringDaysRemaining: number | null;
}

export interface ExpiringKeyActionSummary {
  thresholdDays: number;
  openActionCount: number;
  expiredReferenceCount: number;
  affectedPurchaseCount: number;
  nextExpiringDaysRemaining: number | null;
}

export interface ExpiringKeyRevealPolicy {
  assume_revealed_keys_redeemed: boolean;
  ignore_revealed_status_for_expired_keys: boolean;
  ignore_revealed_status_for_unexpired_keys: boolean;
}

export const DEFAULT_EXPIRING_KEY_REVEAL_POLICY: ExpiringKeyRevealPolicy = {
  assume_revealed_keys_redeemed: true,
  ignore_revealed_status_for_expired_keys: true,
  ignore_revealed_status_for_unexpired_keys: false,
};

export type KeyInventoryScope =
  | "all"
  | "needs_reveal"
  | "revealed"
  | "redeemable"
  | "expiring"
  | "direct_redeem"
  | "instructions";

export interface KeyInventorySummary {
  total: number;
  revealed: number;
  needsReveal: number;
  redeemable: number;
  expiring: number;
  directRedeem: number;
  instructions: number;
}

export type ExpiringKeyScope =
  | "all"
  | "needs_action"
  | "expired"
  | "next_7_days"
  | "next_30_days"
  | "needs_reveal";

export interface ExpiringKeyScopeCounts {
  all: number;
  needs_action: number;
  expired: number;
  next_7_days: number;
  next_30_days: number;
  needs_reveal: number;
}

export interface OverviewAttentionSummary {
  expiringSoonKeys: number;
  keysOnlyPurchases: number;
  mixedAccessPurchases: number;
  largeDownloadPurchases: number;
}

export interface LibraryTotalsSummary {
  totalProducts: number;
  totalSubproducts: number;
  totalFiles: number;
  totalKeys: number;
}

export interface DownloadRouteVisibility {
  downloads: boolean;
  software: boolean;
  videos: boolean;
  ebooks: boolean;
  audiobooks: boolean;
}

export const SOFTWARE_PLATFORM_VALUES = [
  "windows",
  "mac",
  "linux",
  "android",
] as const;

export const VIDEO_PLATFORM_VALUE = "video" as const;

const toTitleCase = (value: string) =>
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const normalizeWhitespace = (value?: string | null) =>
  value ? value.replace(/\s+/g, " ").trim() : "";

const PURCHASE_THEME_STOP_WORDS = new Set([
  "about",
  "again",
  "against",
  "all",
  "after",
  "also",
  "among",
  "and",
  "annual",
  "another",
  "are",
  "around",
  "audio",
  "audiobook",
  "audiobooks",
  "because",
  "before",
  "being",
  "book",
  "books",
  "bundle",
  "bundles",
  "choice",
  "chapter",
  "com",
  "collection",
  "complete",
  "content",
  "current",
  "day",
  "days",
  "digital",
  "edition",
  "editions",
  "every",
  "february",
  "for",
  "from",
  "get",
  "game",
  "games",
  "guide",
  "has",
  "have",
  "here",
  "humble",
  "into",
  "its",
  "issue",
  "items",
  "january",
  "just",
  "march",
  "may",
  "more",
  "most",
  "month",
  "monthly",
  "new",
  "one",
  "our",
  "over",
  "part",
  "pack",
  "pdf",
  "plan",
  "reader",
  "release",
  "season",
  "set",
  "some",
  "series",
  "software",
  "soundtrack",
  "stories",
  "story",
  "them",
  "then",
  "than",
  "that",
  "the",
  "their",
  "these",
  "this",
  "through",
  "title",
  "titles",
  "using",
  "volume",
  "volumes",
  "what",
  "when",
  "which",
  "while",
  "with",
  "your",
]);

const normalizePurchaseThemeToken = (token: string) => {
  const cleaned = token
    .toLowerCase()
    .replace(/^'+|'+$/g, "")
    .replace(/'s$/g, "")
    .replace(/^-+|-+$/g, "");

  if (!cleaned || cleaned.length < 3) return "";
  if (/^\d+$/.test(cleaned)) return "";
  if (PURCHASE_THEME_STOP_WORDS.has(cleaned)) return "";
  return cleaned;
};

export const getCompactBundleName = (value?: string | null) => {
  const full = normalizeWhitespace(value) || "Untitled";
  const splitIndex = full.indexOf(":");

  if (splitIndex !== -1) {
    const prefix = full.substring(0, splitIndex).trim();
    const suffix = full.substring(splitIndex + 1).trim();

    if (prefix.endsWith("Bundle")) {
      const abbreviation = prefix
        .split(/\s+/)
        .map((word) => word[0])
        .join("")
        .toUpperCase();

      return {
        full,
        display: `${abbreviation}: ${suffix}`,
        familyLabel: prefix,
        familyKey: prefix.toLowerCase(),
        abbreviation,
        prefix,
        suffix,
        isAbbreviated: true,
      };
    }
  }

  return {
    full,
    display: full,
    familyLabel: full,
    familyKey: full.toLowerCase(),
    abbreviation: undefined,
    prefix: undefined,
    suffix: full,
    isAbbreviated: false,
  };
};

export const summarizeAuthors = (
  authors?: string[] | null,
  limit: number = 2,
) => {
  const cleaned = Array.from(
    new Set(
      (authors || [])
        .map((author) => normalizeWhitespace(author))
        .filter(Boolean),
    ),
  );
  if (cleaned.length === 0) return "";
  if (cleaned.length <= limit) return cleaned.join(", ");
  return `${cleaned.slice(0, limit).join(", ")} +${cleaned.length - limit}`;
};

export const buildDescriptionSnippet = (
  description?: string | null,
  limit: number = 180,
) => {
  const cleaned = normalizeWhitespace(description);
  if (!cleaned) return "";
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit - 1).trimEnd()}…`;
};

export const getSubproductTitle = (subproduct: Subproduct) =>
  subproduct.page_details?.title ||
  subproduct.human_name ||
  subproduct.machine_name ||
  "Untitled item";

export const getSubproductPublisher = (subproduct: Subproduct) =>
  subproduct.page_details?.publisher || subproduct.payee?.human_name || "";

export const getSubproductAuthorSummary = (subproduct: Subproduct) =>
  summarizeAuthors(subproduct.page_details?.authors);

export const getSubproductDescriptionSnippet = (subproduct: Subproduct) =>
  buildDescriptionSnippet(subproduct.page_details?.description);

export const normalizeCategoryValue = (value?: string) => {
  if (!value) return "unknown";
  const lower = value.toLowerCase();
  if (lower === "subscriptioncontent" || lower === "subscriptionplan") {
    return "subscription";
  }
  return lower;
};

export const normalizeCategoryLabel = (value?: string) => {
  const normalized = normalizeCategoryValue(value);
  switch (normalized) {
    case "subscription":
      return "Subscription";
    case "storefront":
      return "Storefront";
    case "bundle":
      return "Bundle";
    case "widget":
      return "Widget";
    case "unknown":
      return "Unknown";
    default:
      return toTitleCase(normalized);
  }
};

export const normalizePlatformValue = (value?: string) =>
  value ? value.toLowerCase() : "unknown";

export const isSoftwarePlatform = (value?: string) =>
  SOFTWARE_PLATFORM_VALUES.includes(
    normalizePlatformValue(value) as (typeof SOFTWARE_PLATFORM_VALUES)[number],
  );

export const isVideoPlatform = (value?: string) =>
  normalizePlatformValue(value) === VIDEO_PLATFORM_VALUE;

export const isDedicatedContentPlatform = (value?: string) => {
  const normalized = normalizePlatformValue(value);
  return (
    normalized === "ebook" ||
    normalized === "audio" ||
    isVideoPlatform(normalized) ||
    isSoftwarePlatform(normalized)
  );
};

export const isEbookPlatform = (value?: string) =>
  normalizePlatformValue(value) === "ebook";

export const isAudiobookPlatform = (value?: string) =>
  normalizePlatformValue(value) === "audio";

export const hasGenericDownloads = (products: Product[]) =>
  products.some((product) =>
    collectProductDownloads(product).some(
      (download) => !isDedicatedContentPlatform(download.platform),
    ),
  );

export const hasPlatformDownloads = (
  products: Product[],
  predicate: (platform?: string) => boolean,
) =>
  products.some((product) =>
    collectProductDownloads(product).some((download) =>
      predicate(download.platform),
    ),
  );

export const getDownloadRouteVisibility = (
  products: Product[],
): DownloadRouteVisibility => ({
  downloads: hasGenericDownloads(products),
  software: hasPlatformDownloads(products, isSoftwarePlatform),
  videos: hasPlatformDownloads(products, isVideoPlatform),
  ebooks: hasPlatformDownloads(products, isEbookPlatform),
  audiobooks: hasPlatformDownloads(products, isAudiobookPlatform),
});

export const normalizePlatformLabel = (value?: string) => {
  const normalized = normalizePlatformValue(value);
  switch (normalized) {
    case "ebook":
      return "eBook";
    case "audio":
      return "Audio";
    case "mac":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    case "android":
      return "Android";
    case "other":
      return "Other";
    case "unknown":
      return "Unknown";
    default:
      return toTitleCase(normalized);
  }
};

export const normalizeKeyTypeValue = (value?: string) =>
  normalizeKeyType(value);

export const normalizeKeyTypeLabel = (value?: string) => {
  const normalized = normalizeKeyTypeValue(value);
  switch (normalized) {
    case "steam":
      return "Steam";
    case "epic":
      return "Epic";
    case "gog":
      return "GOG";
    case "other":
      return "Other";
    default:
      return toTitleCase(normalized);
  }
};

export const isSteamKeyType = (value?: string) =>
  normalizeKeyTypeValue(value) === "steam";

export const isNonSteamKeyType = (value?: string) => !isSteamKeyType(value);

export const countContainedItems = (product: Product) => {
  const subproducts = product.subproducts;
  if (Array.isArray(subproducts) && subproducts.length > 0) {
    return subproducts.length;
  }
  return 1;
};

export const getResolvedProductKeyCount = (product: Product) => {
  const subproductKeys = (product.subproducts || []).reduce(
    (sum, subproduct) => sum + (subproduct.keys?.length || 0),
    0,
  );
  return subproductKeys > 0 ? subproductKeys : product.keys?.length || 0;
};

export const collectResolvedProductKeys = (product: Product) => {
  const subproductKeys = (product.subproducts || []).flatMap(
    (subproduct) => subproduct.keys || [],
  );
  return subproductKeys.length > 0 ? subproductKeys : product.keys || [];
};

/**
 * Collect all downloads for a product, preferring subproduct downloads.
 */
export const collectProductDownloads = (product: Product): Download[] => {
  const normalize = (download: Download) => ({
    ...download,
    file_type: download.file_type || "file",
  });

  const subproducts = product.subproducts;
  if (Array.isArray(subproducts) && subproducts.length) {
    const files: Download[] = [];
    subproducts.forEach((subproduct) => {
      (subproduct.downloads || []).forEach((download) => {
        files.push(normalize(download));
      });
    });
    if (files.length > 0) {
      return files;
    }
  }

  return (product.downloads || []).map((download) => normalize(download));
};

/**
 * Expand products into suborder items for tabular views.
 */
export const buildSuborders = (products: Product[]): SuborderItem[] => {
  return buildSubproductItems(products).filter((item) => {
    const subproducts = item.product.subproducts;
    return Array.isArray(subproducts) && subproducts.length >= 2;
  });
};

/**
 * Expand all subproducts into row-friendly items, including single-subproduct orders.
 */
export const buildSubproductItems = (products: Product[]): SuborderItem[] => {
  const items: SuborderItem[] = [];

  products.forEach((product, index) => {
    const subproducts = product.subproducts;
    if (!Array.isArray(subproducts) || subproducts.length === 0) return;

    subproducts.forEach((subproduct, subIndex) => {
      const downloads: Download[] = (subproduct.downloads || []).map(
        (download) => ({
          ...download,
          file_type: download.file_type || "file",
        }),
      );

      const totalBytes = downloads.reduce(
        (sum, download) => sum + (download.size_bytes || 0),
        0,
      );
      const platformSummary = Array.from(
        new Set(downloads.map((download) => download.platform || "unknown")),
      ).join(", ");

      const keys =
        subproduct.keys?.length ?
          subproduct.keys
        : (product.keys || []).filter(
            (k) =>
              k.machine_name &&
              subproduct.machine_name &&
              k.machine_name === subproduct.machine_name,
          );

      items.push({
        id: `${product.gamekey || "product"}-${index}-${subIndex}`,
        parentGamekey: product.gamekey,
        parentName: product.product_name || product.machine_name || "Untitled",
        parentCategory: product.category || "unknown",
        subproductName: getSubproductTitle(subproduct),
        subproductMachine: subproduct.machine_name || "",
        infoUrl:
          subproduct.page_details?.replacement_url ||
          subproduct.page_details?.final_url ||
          subproduct.url,
        viewerPagePath: subproduct.page_details?.html_path || undefined,
        authorSummary: getSubproductAuthorSummary(subproduct),
        descriptionSnippet: getSubproductDescriptionSnippet(subproduct),
        publisher: getSubproductPublisher(subproduct),
        downloads,
        keys,
        totalBytes,
        platformSummary,
        product,
      });
    });
  });

  return items;
};

export const productHasKeys = (product: Product) =>
  Array.isArray(product.keys) && product.keys.length > 0;

export const productHasDownloads = (product: Product) =>
  collectProductDownloads(product).length > 0;

const normalizeKeyType = (value?: string) => {
  if (!value) return "other";
  const lower = value.toLowerCase();
  if (lower.includes("steam")) return "steam";
  if (lower.includes("epic")) return "epic";
  if (lower.includes("gog")) return "gog";
  return value;
};

/**
 * Apply all active filters and return products sorted by date.
 */
export const applyProductFilters = (
  products: Product[],
  filters: FilterState,
  overrides?: Partial<FilterState>,
) => {
  const effective = { ...filters, ...overrides };
  return products
    .filter((product) => {
      const searchValue = effective.search.trim().toLowerCase();
      if (searchValue) {
        const fields = [
          product.product_name,
          product.machine_name,
          product.gamekey,
          product.category,
        ];
        const matches = fields
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchValue));
        if (matches) return true;

        // Deep search: Subproducts/Downloads
        const subproductMatch = (product.subproducts || []).some(
          (subproduct) => {
            const details = subproduct.page_details;
            const detailFields = [
              subproduct.human_name,
              subproduct.machine_name,
              subproduct.url,
              subproduct.payee?.human_name,
              details?.title,
              details?.subtitle,
              details?.description,
              details?.publisher,
              details?.series,
              details?.language,
              details?.page_title,
              ...(details?.authors || []),
              ...(details?.tags || []),
              ...(details?.isbns || []),
            ];
            return detailFields
              .filter(Boolean)
              .some((value) =>
                String(value).toLowerCase().includes(searchValue),
              );
          },
        );
        if (subproductMatch) return true;

        const downloads = collectProductDownloads(product);
        const downloadMatch = downloads.some(
          (d) =>
            (d.name && d.name.toLowerCase().includes(searchValue)) ||
            (d.platform && d.platform.toLowerCase().includes(searchValue)),
        );
        if (downloadMatch) return true;

        // Deep search: Keys
        const keyMatch = (product.keys || []).some(
          (k) =>
            (k.human_name &&
              k.human_name.toLowerCase().includes(searchValue)) ||
            (k.key_type_human_name &&
              k.key_type_human_name.toLowerCase().includes(searchValue)),
        );
        if (keyMatch) return true;

        return false;
      }

      if (effective.category) {
        if (effective.category === "subscription") {
          if (
            product.category !== "subscriptioncontent" &&
            product.category !== "subscriptionplan"
          ) {
            return false;
          }
        } else if (product.category !== effective.category) {
          return false;
        }
      }

      if (effective.startDate || effective.endDate) {
        const createdStr = product.created_at;
        if (!createdStr) return false;

        const created = new Date(createdStr).getTime();

        if (effective.startDate) {
          const start = new Date(effective.startDate).getTime();
          if (created < start) return false;
        }

        if (effective.endDate) {
          // Set end date to end of day
          const end = new Date(effective.endDate);
          end.setHours(23, 59, 59, 999);
          if (created > end.getTime()) return false;
        }
      }

      if (effective.keyPresence) {
        const hasKeys = productHasKeys(product);
        if (effective.keyPresence === "has_keys" && !hasKeys) return false;
        if (effective.keyPresence === "no_keys" && hasKeys) return false;
      }

      if (effective.downloadPresence) {
        const hasDownloads = productHasDownloads(product);
        if (effective.downloadPresence === "has_downloads" && !hasDownloads) {
          return false;
        }
        if (effective.downloadPresence === "no_downloads" && hasDownloads) {
          return false;
        }
      }

      const downloads = collectProductDownloads(product);
      if (effective.platform) {
        const match = downloads.some(
          (download) => download.platform === effective.platform,
        );
        if (!match) return false;
      }

      if (effective.keyType) {
        const keyMatch = (product.keys || []).some((key) => {
          const keyType = normalizeKeyType(
            key.key_type_human_name || key.key_type,
          );
          return keyType === normalizeKeyType(effective.keyType || undefined);
        });
        if (!keyMatch) return false;
      }

      return true;
    })
    .sort((a, b) => {
      // Sort by created date descending (Newest first)
      const dateA = a.created_at;
      const dateB = b.created_at;
      if (!dateA) return 1; // No date -> older
      if (!dateB) return -1;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
};

/**
 * Build unique filter option values from the library data.
 */
export const getFilterOptions = (products: Product[]) => {
  const categories = new Set<string>();
  const platforms = new Set<string>();
  const keyTypes = new Set<string>();
  const publishers = new Set<string>();

  products.forEach((product) => {
    if (product.category) {
      // Merge subscription categories
      if (
        product.category === "subscriptioncontent" ||
        product.category === "subscriptionplan"
      ) {
        categories.add("subscription");
      } else {
        categories.add(product.category);
      }
    }

    // Extract Platforms
    collectProductDownloads(product).forEach((download) => {
      if (download.platform) platforms.add(download.platform);
    });

    // Extract Key Types
    (product.keys || []).forEach((key) => {
      const value = normalizeKeyType(key.key_type_human_name || key.key_type);
      if (value) keyTypes.add(value);
    });

    // Extract Publishers (Payee)
    const subproducts = product.subproducts;
    if (Array.isArray(subproducts)) {
      subproducts.forEach((sub) => {
        const payee = sub.page_details?.publisher || sub.payee?.human_name;
        if (payee) publishers.add(payee);
      });
    }
  });

  return {
    categories: Array.from(categories).sort(),
    platforms: Array.from(platforms).sort(),
    keyTypes: Array.from(keyTypes).sort(),
    publishers: Array.from(publishers).sort(),
  };
};

/**
 * Aggregate totals used by dashboard tiles.
 */
export const computeStats = (products: Product[]) => {
  const totalProducts = products.length;
  const totalContainedItems = products.reduce(
    (sum, product) => sum + countContainedItems(product),
    0,
  );
  const totalDownloads = products.reduce(
    (sum, product) => sum + collectProductDownloads(product).length,
    0,
  );
  const totalKeys = products.reduce(
    (sum, product) => sum + (product.keys?.length || 0),
    0,
  );
  const totalBytes = products.reduce((sum, product) => {
    const downloads = collectProductDownloads(product);
    return (
      sum +
      downloads.reduce(
        (inner, download) => inner + (download.size_bytes || 0),
        0,
      )
    );
  }, 0);
  const totalCost = products.reduce(
    (sum, product) => sum + (product.amount_spent || 0),
    0,
  );

  return {
    totalProducts,
    totalContainedItems,
    totalDownloads,
    totalKeys,
    totalBytes,
    totalCost,
  };
};

export const computeLibraryTotals = (
  products: Product[],
): LibraryTotalsSummary => ({
  totalProducts: products.length,
  totalSubproducts: products.reduce(
    (sum, product) => sum + (product.subproducts?.length || 0),
    0,
  ),
  totalFiles: products.reduce(
    (sum, product) => sum + collectProductDownloads(product).length,
    0,
  ),
  totalKeys: products.reduce(
    (sum, product) => sum + getResolvedProductKeyCount(product),
    0,
  ),
});

/**
 * Group long tails into an "other" bucket to keep charts readable.
 */
export const groupSmallValues = (
  data: CountDatum[],
  limit: number = 6,
): CountDatum[] => {
  if (data.length <= limit) return data;

  // Sort descending
  const sorted = [...data].sort((a, b) => b.value - a.value);

  const top = sorted.slice(0, limit);
  const others = sorted.slice(limit);

  if (others.length === 0) return top;

  const otherValue = others.reduce((sum, item) => sum + item.value, 0);
  const isOtherBucket = (item: CountDatum) => {
    const id = item.id?.trim().toLowerCase();
    const label = item.label.trim().toLowerCase();
    return id === "other" || label === "other";
  };

  const existingOtherIndex = top.findIndex(isOtherBucket);
  if (existingOtherIndex !== -1) {
    const existingOther = top[existingOtherIndex];
    const mergedOther: CountDatum = {
      ...existingOther,
      id: "other",
      label: "Other",
      value: existingOther.value + otherValue,
      selectValue: null,
    };

    return [
      ...top.filter((_, index) => index !== existingOtherIndex),
      mergedOther,
    ];
  }

  return [
    ...top,
    { id: "other", label: "Other", value: otherValue, selectValue: null },
  ];
};

export const buildCategoryCounts = (products: Product[]): CountDatum[] => {
  const counts = new Map<string, number>();
  products.forEach((product) => {
    const key = normalizeCategoryValue(product.category);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const result = Array.from(counts.entries()).map(([id, value]) => ({
    id,
    label: normalizeCategoryLabel(id),
    value,
  }));
  return groupSmallValues(result);
};

export const buildPlatformCounts = (products: Product[]): CountDatum[] => {
  const counts = new Map<string, number>();
  products.forEach((product) => {
    collectProductDownloads(product).forEach((download) => {
      const key = normalizePlatformValue(download.platform);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  const result = Array.from(counts.entries()).map(([id, value]) => ({
    id,
    label: normalizePlatformLabel(id),
    value,
  }));
  return groupSmallValues(result);
};

export const buildKeyTypeCounts = (products: Product[]): CountDatum[] => {
  const counts = new Map<string, number>();
  products.forEach((product) => {
    (product.keys || []).forEach((key) => {
      const id = normalizeKeyTypeValue(key.key_type_human_name || key.key_type);
      counts.set(id, (counts.get(id) || 0) + 1);
    });
  });
  const result = Array.from(counts.entries()).map(([id, value]) => ({
    id,
    label: normalizeKeyTypeLabel(id),
    value,
  }));
  return groupSmallValues(result);
};

export const buildPublisherCounts = (products: Product[]): CountDatum[] => {
  const counts = new Map<string, number>();
  products.forEach((product) => {
    const subproducts = product.subproducts as any[];
    if (Array.isArray(subproducts)) {
      subproducts.forEach((sub) => {
        // Count per subproduct to weight by actual items?
        // Or just count distinct publishers per order?
        // Counting per subproduct item seems more accurate for "inventory" size.
        const label = sub.payee?.human_name || "Unknown";
        counts.set(label, (counts.get(label) || 0) + 1);
      });
    }
  });
  const result = Array.from(counts.entries()).map(([label, value]) => ({
    label,
    value,
  }));
  return groupSmallValues(result);
};

export const buildFileTypeCounts = (products: Product[]): CountDatum[] => {
  const counts = new Map<string, number>();
  products.forEach((product) => {
    collectProductDownloads(product).forEach((download) => {
      const id = download.file_type || "file";
      counts.set(id, (counts.get(id) || 0) + 1);
    });
  });
  const result = Array.from(counts.entries()).map(([id, value]) => ({
    id,
    label: id.toUpperCase(),
    value,
  }));
  return groupSmallValues(result);
};

export const buildRecentPurchases = (
  products: Product[],
  limit: number = 5,
): RecentPurchaseSummary[] =>
  [...products]
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, limit)
    .map((product, index) => ({
      id: product.gamekey || product.machine_name || `recent-${index}`,
      name: product.product_name || product.machine_name || "Untitled purchase",
      categoryKey: normalizeCategoryValue(product.category),
      categoryLabel: normalizeCategoryLabel(product.category),
      createdAt: product.created_at,
      amountSpent: product.amount_spent || 0,
      downloadCount: collectProductDownloads(product).length,
      keyCount: getResolvedProductKeyCount(product),
      includedItemCount: countContainedItems(product),
    }));

const tokenizePurchaseThemeText = (value?: string | null) => {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return [] as string[];

  return (normalized.match(/[a-z0-9][a-z0-9'-]*/g) || [])
    .map(normalizePurchaseThemeToken)
    .filter(Boolean);
};

export const buildRecentPurchaseThemes = (
  products: Product[],
  recentLimit: number = 10,
  tagLimit: number = 18,
): PurchaseThemeDatum[] => {
  const recentProducts = [...products]
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, recentLimit);

  const counts = new Map<string, number>();

  recentProducts.forEach((product) => {
    const titleTokens = new Set<string>();
    const detailTokens = new Set<string>();

    const subproducts = product.subproducts || [];

    if (subproducts.length === 0) {
      tokenizePurchaseThemeText(product.product_name).forEach((token) => {
        titleTokens.add(token);
      });
    }

    subproducts.forEach((subproduct) => {
      tokenizePurchaseThemeText(getSubproductTitle(subproduct)).forEach((token) => {
        titleTokens.add(token);
      });

      tokenizePurchaseThemeText(subproduct.page_details?.description).forEach((token) => {
        detailTokens.add(token);
      });

      (subproduct.page_details?.tags || []).forEach((tag) => {
        tokenizePurchaseThemeText(tag).forEach((token) => {
          detailTokens.add(token);
        });
      });
    });

    titleTokens.forEach((token) => {
      counts.set(token, (counts.get(token) || 0) + 2);
    });

    detailTokens.forEach((token) => {
      counts.set(token, (counts.get(token) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.label.localeCompare(b.label);
    })
    .slice(0, tagLimit);
};

export const buildExpiringUnredeemedKeySummary = (
  products: Product[],
  thresholdDays: number = 30,
): ExpiringUnredeemedKeySummary => {
  let expiredUnredeemedCount = 0;
  let expiringSoonUnredeemedCount = 0;
  let nextExpiringDaysRemaining: number | null = null;
  const affectedPurchaseIds = new Set<string>();

  products.forEach((product, productIndex) => {
    collectResolvedProductKeys(product).forEach((key) => {
      if (key.redeemed_key_val) {
        return;
      }

      const rawDays = key.num_days_until_expired;
      const hasCountdown = rawDays !== undefined && rawDays > -1;
      const isExpired = key.is_expired || (hasCountdown && rawDays < 1);
      const isExpiringSoon = hasCountdown && rawDays >= 1 && rawDays <= thresholdDays;

      if (!isExpired && !isExpiringSoon) {
        return;
      }

      affectedPurchaseIds.add(
        product.gamekey || product.machine_name || `product-${productIndex}`,
      );

      if (isExpired) {
        expiredUnredeemedCount += 1;
        return;
      }

      expiringSoonUnredeemedCount += 1;
      nextExpiringDaysRemaining =
        nextExpiringDaysRemaining === null ?
          rawDays
        : Math.min(nextExpiringDaysRemaining, rawDays as number);
    });
  });

  return {
    thresholdDays,
    urgentUnredeemedCount:
      expiredUnredeemedCount + expiringSoonUnredeemedCount,
    expiredUnredeemedCount,
    expiringSoonUnredeemedCount,
    affectedPurchaseCount: affectedPurchaseIds.size,
    nextExpiringDaysRemaining,
  };
};

const resolveExpiringKeyRevealPolicy = (
  policy?: Partial<ExpiringKeyRevealPolicy>,
): ExpiringKeyRevealPolicy => ({
  ...DEFAULT_EXPIRING_KEY_REVEAL_POLICY,
  ...policy,
});

const flattenedKeyIsExpired = (key: FlattenedKey) => {
  const countdown = key.numDaysUntilExpired;
  return key.status.includes("Expired") || countdown === 0;
};

const flattenedKeyExpiresWithinDays = (
  key: FlattenedKey,
  maxDays: number,
) => {
  const countdown = key.numDaysUntilExpired;
  return countdown !== undefined && countdown >= 1 && countdown <= maxDays;
};

const flattenedKeyNeedsReveal = (key: FlattenedKey) => !key.keyValue;

const flattenedKeyHasRedeemLink = (key: FlattenedKey) =>
  key.redemptionLinks.some((link) => link.kind === "redeem");

const flattenedKeyHasInstructionsLink = (key: FlattenedKey) =>
  key.redemptionLinks.some((link) => link.kind === "instructions");

const flattenedKeyIsUrgent = (key: FlattenedKey) =>
  flattenedKeyIsExpired(key) || flattenedKeyExpiresWithinDays(key, 30);

const flattenedKeyIsDirectRedeem = (key: FlattenedKey) =>
  key.status.includes("Direct redeem");

const rawKeyRevealCountsAsHandled = (
  key: Key,
  policy: ExpiringKeyRevealPolicy,
) => {
  if (!key.redeemed_key_val || !policy.assume_revealed_keys_redeemed) {
    return false;
  }

  const rawDays = key.num_days_until_expired;
  const hasCountdown = rawDays !== undefined && rawDays > -1;
  const isExpired = key.is_expired || (hasCountdown && rawDays < 1);

  return isExpired ?
      !policy.ignore_revealed_status_for_expired_keys
    : !policy.ignore_revealed_status_for_unexpired_keys;
};

const flattenedKeyRevealCountsAsHandled = (
  key: FlattenedKey,
  policy: ExpiringKeyRevealPolicy,
) => {
  if (!key.keyValue || !policy.assume_revealed_keys_redeemed) {
    return false;
  }

  return flattenedKeyIsExpired(key) ?
      !policy.ignore_revealed_status_for_expired_keys
    : !policy.ignore_revealed_status_for_unexpired_keys;
};

export const buildExpiringKeyActionSummary = (
  products: Product[],
  thresholdDays: number = 30,
  policy?: Partial<ExpiringKeyRevealPolicy>,
): ExpiringKeyActionSummary => {
  const resolvedPolicy = resolveExpiringKeyRevealPolicy(policy);
  let openActionCount = 0;
  let expiredReferenceCount = 0;
  let nextExpiringDaysRemaining: number | null = null;
  const affectedPurchaseIds = new Set<string>();

  products.forEach((product, productIndex) => {
    collectResolvedProductKeys(product).forEach((key) => {
      const rawDays = key.num_days_until_expired;
      const hasCountdown = rawDays !== undefined && rawDays > -1;
      const isExpired = key.is_expired || (hasCountdown && rawDays < 1);

      if (isExpired) {
        if (rawKeyRevealCountsAsHandled(key, resolvedPolicy)) {
          return;
        }

        expiredReferenceCount += 1;
        affectedPurchaseIds.add(
          product.gamekey || product.machine_name || `product-${productIndex}`,
        );
        return;
      }

      const isExpiringSoon = hasCountdown && rawDays >= 1 && rawDays <= thresholdDays;
      if (!isExpiringSoon || rawKeyRevealCountsAsHandled(key, resolvedPolicy)) {
        return;
      }

      openActionCount += 1;
      affectedPurchaseIds.add(
        product.gamekey || product.machine_name || `product-${productIndex}`,
      );
      nextExpiringDaysRemaining =
        nextExpiringDaysRemaining === null ?
          rawDays
        : Math.min(nextExpiringDaysRemaining, rawDays as number);
    });
  });

  return {
    thresholdDays,
    openActionCount,
    expiredReferenceCount,
    affectedPurchaseCount: affectedPurchaseIds.size,
    nextExpiringDaysRemaining,
  };
};

export const filterExpiringKeysByScope = (
  keys: FlattenedKey[],
  scope: ExpiringKeyScope,
  policy?: Partial<ExpiringKeyRevealPolicy>,
) => {
  const resolvedPolicy = resolveExpiringKeyRevealPolicy(policy);

  switch (scope) {
    case "needs_action":
      return keys.filter(
        (key) =>
          !flattenedKeyIsExpired(key) &&
          flattenedKeyExpiresWithinDays(key, 30) &&
          !flattenedKeyRevealCountsAsHandled(key, resolvedPolicy),
      );
    case "expired":
      return keys.filter(
        (key) =>
          flattenedKeyIsExpired(key) &&
          !flattenedKeyRevealCountsAsHandled(key, resolvedPolicy),
      );
    case "next_7_days":
      return keys.filter(
        (key) =>
          flattenedKeyExpiresWithinDays(key, 7) &&
          !flattenedKeyRevealCountsAsHandled(key, resolvedPolicy),
      );
    case "next_30_days":
      return keys.filter(
        (key) =>
          flattenedKeyExpiresWithinDays(key, 30) &&
          !flattenedKeyRevealCountsAsHandled(key, resolvedPolicy),
      );
    case "needs_reveal":
      return keys.filter(
        (key) => !flattenedKeyIsExpired(key) && flattenedKeyNeedsReveal(key),
      );
    case "all":
    default:
      return keys;
  }
};

export const buildExpiringKeyScopeCounts = (
  keys: FlattenedKey[],
  policy?: Partial<ExpiringKeyRevealPolicy>,
): ExpiringKeyScopeCounts => ({
  all: keys.length,
  needs_action: filterExpiringKeysByScope(keys, "needs_action", policy).length,
  expired: filterExpiringKeysByScope(keys, "expired", policy).length,
  next_7_days: filterExpiringKeysByScope(keys, "next_7_days", policy).length,
  next_30_days: filterExpiringKeysByScope(keys, "next_30_days", policy).length,
  needs_reveal: filterExpiringKeysByScope(keys, "needs_reveal", policy).length,
});

export const shouldShowExpiringKeyAction = (
  key: FlattenedKey,
  policy?: Partial<ExpiringKeyRevealPolicy>,
) => {
  const resolvedPolicy = resolveExpiringKeyRevealPolicy(policy);
  return (
    !flattenedKeyIsExpired(key) &&
    !flattenedKeyRevealCountsAsHandled(key, resolvedPolicy) &&
    key.redemptionLinks.length > 0
  );
};

export const filterKeyInventoryByScope = (
  keys: FlattenedKey[],
  scope: KeyInventoryScope,
) => {
  switch (scope) {
    case "needs_reveal":
      return keys.filter(flattenedKeyNeedsReveal);
    case "revealed":
      return keys.filter((key) => !flattenedKeyNeedsReveal(key));
    case "redeemable":
      return keys.filter(flattenedKeyHasRedeemLink);
    case "expiring":
      return keys.filter(flattenedKeyIsUrgent);
    case "direct_redeem":
      return keys.filter(flattenedKeyIsDirectRedeem);
    case "instructions":
      return keys.filter(flattenedKeyHasInstructionsLink);
    case "all":
    default:
      return keys;
  }
};

export const getKeyRedemptionActionLabel = (key: FlattenedKey) => {
  if (flattenedKeyHasRedeemLink(key)) {
    return "Redeem";
  }

  if (flattenedKeyHasInstructionsLink(key)) {
    return "Instructions";
  }

  return "Action";
};

export const buildKeyInventorySummary = (
  keys: FlattenedKey[],
): KeyInventorySummary => ({
  total: keys.length,
  revealed: filterKeyInventoryByScope(keys, "revealed").length,
  needsReveal: filterKeyInventoryByScope(keys, "needs_reveal").length,
  redeemable: filterKeyInventoryByScope(keys, "redeemable").length,
  expiring: filterKeyInventoryByScope(keys, "expiring").length,
  directRedeem: filterKeyInventoryByScope(keys, "direct_redeem").length,
  instructions: filterKeyInventoryByScope(keys, "instructions").length,
});

export const sortKeyInventoryForTriage = (keys: FlattenedKey[]) =>
  [...keys].sort((a, b) => {
    const score = (key: FlattenedKey) => {
      const urgent = flattenedKeyIsUrgent(key);
      const needsReveal = flattenedKeyNeedsReveal(key);
      const directRedeem = flattenedKeyIsDirectRedeem(key);
      const redeemable = flattenedKeyHasRedeemLink(key);

      if (urgent && needsReveal) return 0;
      if (urgent) return 1;
      if (needsReveal && directRedeem) return 2;
      if (needsReveal && redeemable) return 3;
      if (needsReveal) return 4;
      if (redeemable) return 5;
      return 6;
    };

    const scoreDiff = score(a) - score(b);
    if (scoreDiff !== 0) return scoreDiff;

    const aDays = flattenedKeyIsExpired(a) ? -1 : (a.numDaysUntilExpired ?? 9999);
    const bDays = flattenedKeyIsExpired(b) ? -1 : (b.numDaysUntilExpired ?? 9999);
    if (aDays !== bDays) return aDays - bDays;

    return (a.keyName || "").localeCompare(b.keyName || "");
  });

export const buildBundleFamilyCounts = (
  products: Product[],
  limit: number = 5,
): BundleFamilyDatum[] => {
  const counts = new Map<
    string,
    {
      value: number;
      fullLabel: string;
      searchTerm: string;
      abbreviation?: string;
    }
  >();

  products.forEach((product) => {
    const name =
      product.product_name || product.machine_name || "Untitled purchase";
    const compact = getCompactBundleName(name);
    const current = counts.get(compact.familyKey) || {
      value: 0,
      fullLabel: compact.familyLabel,
      searchTerm: compact.familyLabel,
      abbreviation: compact.abbreviation,
    };
    current.value += 1;
    counts.set(compact.familyKey, current);
  });

  return Array.from(counts.entries())
    .map(([id, value]) => ({
      id,
      label: value.abbreviation || value.fullLabel,
      value: value.value,
      fullLabel: value.fullLabel,
      searchTerm: value.searchTerm,
      abbreviation: value.abbreviation,
    }))
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.fullLabel.localeCompare(b.fullLabel);
    })
    .slice(0, limit);
};

export const buildOverviewAttention = (
  products: Product[],
): OverviewAttentionSummary => {
  const expiringSoonKeys = products.reduce((sum, product) => {
    const keyCount = (product.keys || []).filter((key) => {
      const days = key.num_days_until_expired;
      return (
        days !== undefined &&
        days >= 0 &&
        days <= 7 &&
        !key.is_expired &&
        !key.sold_out
      );
    }).length;
    return sum + keyCount;
  }, 0);

  const keysOnlyPurchases = products.filter(
    (product) => productHasKeys(product) && !productHasDownloads(product),
  ).length;

  const mixedAccessPurchases = products.filter(
    (product) => productHasKeys(product) && productHasDownloads(product),
  ).length;

  const largeDownloadPurchases = products.filter((product) => {
    const downloads = collectProductDownloads(product);
    const totalBytes = downloads.reduce(
      (sum, download) => sum + (download.size_bytes || 0),
      0,
    );
    return downloads.length >= 10 || totalBytes >= 5 * 1024 * 1024 * 1024;
  }).length;

  return {
    expiringSoonKeys,
    keysOnlyPurchases,
    mixedAccessPurchases,
    largeDownloadPurchases,
  };
};

export const buildPresenceCounts = (products: Product[]) => {
  const keyPresence = new Map<KeyPresence, number>([
    ["has_keys", 0],
    ["no_keys", 0],
  ]);
  const downloadPresence = new Map<DownloadPresence, number>([
    ["has_downloads", 0],
    ["no_downloads", 0],
  ]);

  products.forEach((product) => {
    if (productHasKeys(product)) {
      keyPresence.set("has_keys", (keyPresence.get("has_keys") || 0) + 1);
    } else {
      keyPresence.set("no_keys", (keyPresence.get("no_keys") || 0) + 1);
    }

    if (productHasDownloads(product)) {
      downloadPresence.set(
        "has_downloads",
        (downloadPresence.get("has_downloads") || 0) + 1,
      );
    } else {
      downloadPresence.set(
        "no_downloads",
        (downloadPresence.get("no_downloads") || 0) + 1,
      );
    }
  });

  return {
    keyPresence: Array.from(keyPresence.entries()).map(([label, value]) => ({
      label,
      value,
    })),
    downloadPresence: Array.from(downloadPresence.entries()).map(
      ([label, value]) => ({ label, value }),
    ),
  };
};

/**
 * Build time-series aggregates for spend and order counts.
 */
export const buildHistoryData = (
  products: Product[],
  grouping: "day" | "month" | "quarter" | "year" = "month",
) => {
  const history = new Map<string, { spent: number; count: number }>();

  products.forEach((p) => {
    if (!p.created_at) return;
    const date = new Date(p.created_at);
    if (isNaN(date.getTime())) return;

    let key = "";
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();

    if (grouping === "day") {
      key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    } else if (grouping === "month") {
      key = `${y}-${String(m).padStart(2, "0")}`;
    } else if (grouping === "quarter") {
      const q = Math.floor((m - 1) / 3) + 1;
      key = `${y}-Q${q}`;
    } else {
      key = `${y}`;
    }

    const current = history.get(key) || { spent: 0, count: 0 };
    current.spent += p.amount_spent || 0;
    current.count += 1;
    history.set(key, current);
  });

  // Sort by key (date) ascending
  const sortedKeys = Array.from(history.keys()).sort();

  return {
    spending: sortedKeys.map((k) => ({
      label: k,
      value: Number(history.get(k)!.spent.toFixed(2)),
    })),
    orders: sortedKeys.map((k) => ({
      label: k,
      value: history.get(k)!.count,
    })),
  };
};

/**
 * Flatten nested downloads into row-friendly records.
 */
export const flattenDownloads = (products: Product[]): FlattenedDownload[] => {
  const rows: FlattenedDownload[] = [];
  products.forEach((product, index) => {
    // We need to iterate subproducts to get the subproduct name
    const subproducts = product.subproducts;

    let foundInSubproducts = false;

    if (Array.isArray(subproducts) && subproducts.length) {
      subproducts.forEach((subproduct) => {
        const subName =
          subproduct.human_name || subproduct.machine_name || "Untitled item";
        (subproduct.downloads || []).forEach((download, downloadIndex) => {
          foundInSubproducts = true;
          const url = download.url || "";
          rows.push({
            id: `${product.gamekey || index}-${subName}-${downloadIndex}`,
            productName: subName,
            productCategory: product.category || "unknown",
            platform: download.platform || "unknown",
            fileType: download.file_type || "file",
            sizeBytes: download.size_bytes,
            url,
            orderName: product.product_name || "Unknown Order",
            dateAcquired: product.created_at || "",
          });
        });
      });
    }

    if (!foundInSubproducts) {
      // Fallback for orders without subproducts (or subproducts with no downloads)
      (product.downloads || []).forEach((download, downloadIndex) => {
        rows.push({
          id: `${product.gamekey || index}-${downloadIndex}`,
          productName:
            product.product_name || product.machine_name || "Untitled",
          productCategory: product.category || "unknown",
          platform: download.platform || "unknown",
          fileType: download.file_type || "file",
          sizeBytes: download.size_bytes,
          url: download.url,
          orderName: product.product_name || "Unknown Order",
          dateAcquired: product.created_at || "",
        });
      });
    }
  });
  return rows;
};

/**
 * Flatten key inventory into row-friendly records.
 */
export const flattenKeys = (products: Product[]): FlattenedKey[] => {
  const rows: FlattenedKey[] = [];
  products.forEach((product, index) => {
    (product.keys || []).forEach((key, keyIndex) => {
      const status: string[] = [];
      if (key.is_expired) status.push("Expired");
      if (key.sold_out) status.push("Sold out");
      if (key.is_gift) status.push("Gift");
      if (key.direct_redeem) status.push("Direct redeem");

      // Check redemption/reveal status
      if (key.redeemed_key_val) {
        status.push("Revealed");
      } else if (!key.is_expired && !key.sold_out) {
        status.push("Unrevealed");
      }

      if (!status.length) status.push("Available");

      rows.push({
        id: `${product.gamekey || index}-${keyIndex}`,
        productName: product.product_name || product.machine_name || "Untitled",
        productCategory: product.category || "unknown",
        keyType: key.key_type_human_name || key.key_type || "unknown",
        keyName: key.human_name || key.machine_name || "unknown",
        keyValue: key.redeemed_key_val,
        redemptionLinks: getKeyRedemptionLinks(key),
        steamAppId: key.steam_app_id,
        status,
        dateAcquired: product.created_at || "",
        numDaysUntilExpired: key.num_days_until_expired,
      });
    });
  });
  return rows;
};
