import { afterEach, describe, expect, it } from "vitest";

import type { Key, Product } from "../../../src/data/types";
import {
  collectProductRedemptionLinks,
  extractRedemptionLinksFromHtml,
  getKeyRedemptionLinks,
} from "../../../src/data/redemption";

const originalDomParser = globalThis.DOMParser;

afterEach(() => {
  globalThis.DOMParser = originalDomParser;
});

describe("redemption helpers", () => {
  it("returns no links when html is missing or DOM parsing is unavailable", () => {
    expect(extractRedemptionLinksFromHtml()).toEqual([]);

    globalThis.DOMParser = undefined as typeof DOMParser;

    expect(
      extractRedemptionLinksFromHtml(
        "<a href='https://example.com'>Redeem</a>",
      ),
    ).toEqual([]);
  });

  it("extracts de-duplicated typed links with normalized labels and regions", () => {
    const links = extractRedemptionLinksFromHtml(`
      <div>
        <a href="https://example.com/redeem">  Redeem in EU  </a>
        <a href="https://example.com/redeem">Redeem in EU</a>
        <a href="https://example.com/help">Support for UK customers</a>
        <a href="javascript:alert('xss')">Ignore me</a>
        <a href="https://example.com/fallback"></a>
      </div>
    `);

    expect(links).toEqual([
      {
        id: "0-https://example.com/redeem",
        label: "Redeem in EU",
        url: "https://example.com/redeem",
        kind: "redeem",
        region: "EU",
      },
      {
        id: "2-https://example.com/help",
        label: "Support for UK customers",
        url: "https://example.com/help",
        kind: "instructions",
        region: "UK",
      },
      {
        id: "4-https://example.com/fallback",
        label: "Redemption link 5",
        url: "https://example.com/fallback",
        kind: "redeem",
      },
    ]);
  });

  it("collects unique product links across all keys", () => {
    const key = (custom_instructions_html: string): Key => ({
      custom_instructions_html,
    });
    const product: Product = {
      keys: [
        key(`<a href="https://example.com/redeem">Redeem US</a>`),
        key(`<a href="https://example.com/redeem">Redeem US</a>`),
        key(`<a href="https://example.com/instructions">Instructions</a>`),
      ],
    };

    expect(
      getKeyRedemptionLinks({
        custom_instructions_html: `<a href="https://example.com/redeem">Redeem US</a>`,
      }),
    ).toHaveLength(1);
    expect(
      collectProductRedemptionLinks(product).map((link) => link.url),
    ).toEqual([
      "https://example.com/redeem",
      "https://example.com/instructions",
    ]);
  });
});
