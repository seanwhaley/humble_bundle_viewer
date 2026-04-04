/**
 * Expanded purchase detail view with structured summary and included-item breakdown.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Download, Key } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "./DataTable";
import RedemptionLinksButton from "./RedemptionLinksButton";
import SubproductInfoLink from "./SubproductInfoLink";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import {
    buildDescriptionSnippet,
    collectProductDownloads,
    countContainedItems,
    getSubproductAuthorSummary,
    getSubproductPublisher,
    getSubproductTitle,
    isSteamKeyType,
    normalizeCategoryLabel,
    normalizePlatformLabel,
    summarizeAuthors,
} from "../data/selectors";
import { collectProductRedemptionLinks } from "../data/redemption";
import { formatBytes, formatCurrency, formatDateTime } from "../utils/format";
import { Download as DownloadType, Product } from "../data/types";

interface OrderDetailPanelProps {
    product: Product;
}

type SuborderRow = {
  id: string;
    subproduct_name: string;
    info_url?: string;
    author_summary?: string;
    publisher?: string;
    description_snippet?: string;
  platform_summary: string;
  download_count: number;
  key_count: number;
  total_size: string;
    originalSearch: string;
        key_route: string;
        key_label: string;
};

const getResolvedKeyCount = (product: Product) => {
    const subproductKeys = (product.subproducts || []).reduce(
        (sum, subproduct) => sum + (subproduct.keys?.length || 0),
        0
    );
    return subproductKeys > 0 ? subproductKeys : product.keys?.length || 0;
};

const getResolvedKeys = (product: Product) => {
    const subproductKeys = (product.subproducts || []).flatMap(
        (subproduct) => subproduct.keys || []
    );
    return subproductKeys.length > 0 ? subproductKeys : product.keys || [];
};

const getKeyActionMeta = (keyTypes: Array<string | undefined>) => {
    const hasSteamKeys = keyTypes.some((keyType) => isSteamKeyType(keyType));
    return {
        key_route: hasSteamKeys ? "/library/steam-keys" : "/library/other-keys",
        key_label: hasSteamKeys ? "Open Steam keys" : "Open Other Keys",
    };
};

const getAccessSummary = (downloadCount: number, keyCount: number) => {
    if (downloadCount > 0 && keyCount > 0) return "Mixed access";
    if (downloadCount > 0) return "Downloads only";
    if (keyCount > 0) return "Keys only";
    return "No attached content";
};

const buildPlatformSummary = (downloads: DownloadType[]) => {
    const labels = Array.from(
        new Set(
            downloads
                .map((download) => normalizePlatformLabel(download.platform))
                .filter(Boolean)
        )
    );

    if (labels.length === 0) return "No download media";
    return labels.join(" • ");
};

/**
 * Drawer content for a selected order.
 */
export default function OrderDetailPanel({ product }: OrderDetailPanelProps) {
    const allDownloads = useMemo(() => collectProductDownloads(product), [product]);
    const totalBytes = useMemo(
        () =>
            allDownloads.reduce(
                (sum, download) => sum + (download.size_bytes || 0),
                0
            ),
        [allDownloads]
    );
    const totalKeys = getResolvedKeyCount(product);
    const redemptionLinks = useMemo(
        () => collectProductRedemptionLinks(product),
        [product]
    );
    const includedItemCount = countContainedItems(product);

    const suborderRows: SuborderRow[] = useMemo(() => {
        const subproducts = product.subproducts;
        if (Array.isArray(subproducts) && subproducts.length > 0) {
            return subproducts.map((subproduct, index) => {
                const downloads = subproduct.downloads || [];
                const totalSize = downloads.reduce(
                    (sum, download) => sum + (download.size_bytes || 0),
                    0
                );
                const keyCount = subproduct.keys?.length || 0;

                return {
                    ...getKeyActionMeta(
                        (subproduct.keys || []).map(
                            (key) => key.key_type_human_name || key.key_type
                        )
                    ),
                    id: `${product.gamekey || product.machine_name || "purchase"}-${index}`,
                    subproduct_name: getSubproductTitle(subproduct),
                    info_url: subproduct.url,
                    author_summary: getSubproductAuthorSummary(subproduct),
                    publisher: getSubproductPublisher(subproduct),
                    description_snippet: buildDescriptionSnippet(
                        subproduct.page_details?.description,
                        220
                    ),
                    platform_summary: buildPlatformSummary(downloads),
                    download_count: downloads.length,
                    key_count: keyCount,
                    total_size: formatBytes(totalSize),
                    originalSearch:
                        subproduct.human_name ||
                        subproduct.machine_name ||
                        product.product_name ||
                        "",
                };
            });
        }

        return [
            {
                ...getKeyActionMeta(
                    getResolvedKeys(product).map(
                        (key) => key.key_type_human_name || key.key_type
                    )
                ),
                id: String(product.gamekey || product.machine_name || "purchase"),
                subproduct_name:
                    product.product_name || product.machine_name || "Untitled purchase",
                info_url: undefined,
                author_summary: summarizeAuthors(
                    (product.subproducts || []).flatMap(
                        (subproduct) => subproduct.page_details?.authors || []
                    )
                ),
                publisher: (product.subproducts || [])
                    .map((subproduct) => getSubproductPublisher(subproduct))
                    .find(Boolean),
                description_snippet: buildDescriptionSnippet(
                    (product.subproducts || [])
                        .map((subproduct) => subproduct.page_details?.description)
                        .find(Boolean),
                    220
                ),
                platform_summary: buildPlatformSummary(allDownloads),
                download_count: allDownloads.length,
                key_count: totalKeys,
                total_size: formatBytes(totalBytes),
                originalSearch:
                    product.product_name || product.machine_name || "Untitled purchase",
            },
        ];
    }, [allDownloads, product, totalBytes, totalKeys]);

  const suborderColumns: ColumnDef<SuborderRow>[] = [
    { 
        accessorKey: "subproduct_name", 
        header: "Included item",
        cell: ({ getValue }) => (
            <Tooltip content={getValue() as string}>
                <span className="truncate max-w-[200px] block">{getValue() as string}</span>
            </Tooltip>
        )
    },
    {
        id: "details",
        header: "Details",
        cell: ({ row }) => (
            <div className="min-w-[260px] space-y-1 whitespace-normal">
                {row.original.author_summary ? (
                    <div className="text-sm font-medium text-card-foreground">
                        {row.original.author_summary}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">No author metadata yet</div>
                )}
                {row.original.publisher && (
                    <div className="text-xs text-muted-foreground">{row.original.publisher}</div>
                )}
                {row.original.description_snippet && (
                    <Tooltip content={row.original.description_snippet}>
                        <p className="line-clamp-3 text-xs text-muted-foreground">
                            {row.original.description_snippet}
                        </p>
                    </Tooltip>
                )}
            </div>
        )
    },
    {
        accessorKey: "info_url",
        header: "Info",
        cell: ({ getValue, row }) => (
            <SubproductInfoLink
                url={getValue() as string | undefined}
                label={`Open info page for ${row.original.subproduct_name}`}
            />
        )
    },
    { 
        accessorKey: "platform_summary", 
        header: "Platforms",
        cell: ({ getValue }) => (
            <Tooltip content={getValue() as string || "No platforms"}>
                <span className="truncate max-w-[100px] block">{getValue() as string}</span>
            </Tooltip>
        )
    },
    { accessorKey: "download_count", header: "DLs" },
    { accessorKey: "key_count", header: "Keys" },
    { accessorKey: "total_size", header: "Size" },
    {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
            <div className="flex gap-2">
                 <Button variant="outline" size="sm" className="h-7 px-2" asChild>
                    <Link to={`/library/other-downloads?search=${encodeURIComponent(row.original.originalSearch)}`}>
                        <Download className="h-3 w-3 mr-1" />
                    </Link>
                 </Button>
                 <Button variant="outline" size="sm" className="h-7 px-2" asChild>
                    <Link
                        to={`${row.original.key_route}?search=${encodeURIComponent(
                            row.original.originalSearch
                        )}`}
                    >
                        <Key className="h-3 w-3 mr-1" />
                    </Link>
                 </Button>
            </div>
        )
    }
  ];

    const totalSpent = product.amount_spent ?? 0;
    const accessSummary = getAccessSummary(allDownloads.length, totalKeys);
    const categoryLabel = normalizeCategoryLabel(product.category);
    const keyActionMeta = getKeyActionMeta(
        getResolvedKeys(product).map((key) => key.key_type_human_name || key.key_type)
    );
  
  return (
      <div className="flex flex-col space-y-6">
                     <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className="rounded-full border border-status-neutral/80 bg-status-neutral/80 px-2.5 py-1 text-status-neutral-foreground">
                                            {categoryLabel}
                                        </span>
                                        <span className="rounded-full border border-status-neutral/80 bg-status-neutral/80 px-2.5 py-1 text-status-neutral-foreground">
                                            {accessSummary}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Purchased {formatDateTime(product.created_at)}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {allDownloads.length > 0 ? (
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to={`/library/other-downloads?search=${encodeURIComponent(product.product_name || product.machine_name || "")}`}>
                                                Open downloads
                                            </Link>
                                        </Button>
                                    ) : (
                                        <Button variant="outline" size="sm" disabled>
                                            Open downloads
                                        </Button>
                                    )}
                                    {totalKeys > 0 ? (
                                        <Button variant="outline" size="sm" asChild>
                                            <Link
                                                to={`${keyActionMeta.key_route}?search=${encodeURIComponent(
                                                    product.product_name || product.machine_name || ""
                                                )}`}
                                            >
                                                {keyActionMeta.key_label}
                                            </Link>
                                        </Button>
                                    ) : (
                                        <Button variant="outline" size="sm" disabled>
                                            Open keys
                                        </Button>
                                    )}
                                    <RedemptionLinksButton
                                        links={redemptionLinks}
                                        label="Redeem content"
                                    />
                                </div>
                            </div>

                            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                                    <div>
                                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Spent</div>
                                            <div className="text-2xl font-bold">{formatCurrency(totalSpent)}</div>
                                    </div>
                                    <div>
                                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Included items</div>
                                            <div className="text-2xl font-bold">{includedItemCount}</div>
                                    </div>
                                    <div>
                                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Downloads</div>
                                            <div className="text-2xl font-bold">{allDownloads.length}</div>
                                    </div>
                                    <div>
                                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Keys</div>
                                            <div className="text-2xl font-bold">{totalKeys}</div>
                                    </div>
                                    <div>
                                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Download size</div>
                                            <div className="text-2xl font-bold">{formatBytes(totalBytes)}</div>
                                    </div>
                                    <div>
                                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Media mix</div>
                                            <div className="text-sm font-medium">{buildPlatformSummary(allDownloads)}</div>
                                    </div>
                            </div>
                    </div>

                    <div>
                            <div className="mb-3">
                                <h3 className="text-lg font-semibold">Included items</h3>
                                <p className="text-sm text-muted-foreground">
                                    Review the contained titles, formats, and quick follow-up actions for this purchase.
                                </p>
                            </div>
                            <DataTable columns={suborderColumns} data={suborderRows} searchKey="subproduct_name" />
                    </div>
      </div>
  )
}
