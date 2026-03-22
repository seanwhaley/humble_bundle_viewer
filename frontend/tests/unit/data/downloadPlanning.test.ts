import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDownloadPlan,
  type DownloadPlanItem,
} from "../../../src/data/downloadPlanning";

function mockResponse(
  ok: boolean,
  payload: unknown,
  jsonReject = false,
): Response {
  return {
    ok,
    json:
      jsonReject ?
        async () => Promise.reject(new Error("bad json"))
      : async () => payload,
  } as Response;
}

describe("buildDownloadPlan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns an empty plan without calling the API when there are no items", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(buildDownloadPlan([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a filtered payload and maps the backend response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(true, [
        {
          title_id: "alpha-ebook",
          title: "Alpha",
          source_bundle: "Bundle A",
          platform: "windows",
          file_type: "epub",
          filename: "alpha.epub",
          relative_path: "Alpha/alpha.epub",
          size_bytes: 1234,
          url: "https://example.test/alpha.epub",
          checksums: { sha256: "abc" },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const items: DownloadPlanItem[] = [
      {
        titleId: "alpha-ebook",
        title: "Alpha",
        sourceBundle: "Bundle A",
        downloads: [
          {
            platform: "windows",
            name: "Alpha EPUB",
            file_type: "epub",
            size_bytes: 1234,
            url: "https://example.test/alpha.epub",
            checksums: { sha256: "abc" },
          },
          {
            platform: "windows",
            name: "Broken entry",
            file_type: "epub",
            size_bytes: 9,
          },
        ],
      },
    ];

    const result = await buildDownloadPlan(items, {
      platforms: ["windows"],
      fileTypes: ["epub"],
      sizePolicy: "smallest",
    });

    expect(result).toEqual([
      {
        titleId: "alpha-ebook",
        title: "Alpha",
        sourceBundle: "Bundle A",
        platform: "windows",
        fileType: "epub",
        filename: "alpha.epub",
        relativePath: "Alpha/alpha.epub",
        sizeBytes: 1234,
        url: "https://example.test/alpha.epub",
        checksums: { sha256: "abc" },
      },
    ]);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/downloads/plan",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(body).toEqual({
      items: [
        {
          title_id: "alpha-ebook",
          title: "Alpha",
          source_bundle: "Bundle A",
          downloads: [
            {
              platform: "windows",
              name: "Alpha EPUB",
              url: "https://example.test/alpha.epub",
              size_bytes: 1234,
              checksums: { sha256: "abc" },
              file_type: "epub",
            },
          ],
        },
      ],
      platforms: ["windows"],
      file_types: ["epub"],
      size_policy: "smallest",
    });
  });

  it("surfaces backend error detail messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          mockResponse(false, {
            detail: "No downloads matched the selection.",
          }),
        ),
    );

    await expect(
      buildDownloadPlan([
        {
          titleId: "alpha-ebook",
          title: "Alpha",
          sourceBundle: "Bundle A",
          downloads: [{ url: "https://example.test/alpha.epub" }],
        },
      ]),
    ).rejects.toThrow("No downloads matched the selection.");
  });

  it("falls back to a generic message when the error response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse(false, null, true)),
    );

    await expect(
      buildDownloadPlan([
        {
          titleId: "alpha-ebook",
          title: "Alpha",
          sourceBundle: "Bundle A",
          downloads: [{ url: "https://example.test/alpha.epub" }],
        },
      ]),
    ).rejects.toThrow("Unable to build the download plan.");
  });
});
