/**
 * Helpers for extracting safe, typed redemption links from Humble key metadata.
 */

import { Key, Product, RedemptionLink } from "./types";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const normalizeText = (value?: string | null) =>
  value?.replace(/\s+/g, " ").trim() || "";

const inferLinkKind = (label: string): RedemptionLink["kind"] =>
  /instruction|support/i.test(label) ? "instructions" : "redeem";

const inferLinkRegion = (label: string): string | undefined => {
  const lowered = label.toLowerCase();
  if (lowered.includes("eu")) return "EU";
  if (lowered.includes("uk")) return "UK";
  if (
    lowered.includes("us") ||
    lowered.includes("ca") ||
    lowered.includes("au") ||
    lowered.includes("nz") ||
    lowered.includes("non-eu")
  ) {
    return "US/CA/AU/NZ + non-EU/UK";
  }
  return undefined;
};

const normalizeUrl = (value?: string | null): string | null => {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

/**
 * Extract typed redemption links from Humble custom-instructions HTML.
 */
export const extractRedemptionLinksFromHtml = (
  html?: string | null
): RedemptionLink[] => {
  if (!html || typeof DOMParser === "undefined") {
    return [];
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const seen = new Set<string>();
  const links: RedemptionLink[] = [];

  document.querySelectorAll("a[href]").forEach((anchor, index) => {
    const url = normalizeUrl(anchor.getAttribute("href"));
    if (!url || seen.has(url)) {
      return;
    }

    seen.add(url);
    const label = normalizeText(anchor.textContent) || `Redemption link ${index + 1}`;

    links.push({
      id: `${index}-${url}`,
      label,
      url,
      kind: inferLinkKind(label),
      region: inferLinkRegion(label),
    });
  });

  return links;
};

/**
 * Return typed redemption links for a key entry.
 */
export const getKeyRedemptionLinks = (key?: Key | null): RedemptionLink[] =>
  extractRedemptionLinksFromHtml(key?.custom_instructions_html);

/**
 * Collect de-duplicated redemption links for a product across all key entries.
 */
export const collectProductRedemptionLinks = (
  product: Product
): RedemptionLink[] => {
  const linksByUrl = new Map<string, RedemptionLink>();

  (product.keys || []).forEach((key) => {
    getKeyRedemptionLinks(key).forEach((link) => {
      if (!linksByUrl.has(link.url)) {
        linksByUrl.set(link.url, link);
      }
    });
  });

  return Array.from(linksByUrl.values());
};