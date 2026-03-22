/**
 * Command center for running CLI workflows from the viewer.
 */
import { type ReactNode, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useLibraryStatus } from "../../data/api";
import {
  CurrentBundlesCommandDetails,
  CurrentChoiceCommandDetails,
  LibraryArtifactCommandDetails,
  OrderModelCommandDetails,
  SubproductMetadataCommandDetails,
  SubproductPageCacheCommandDetails,
  ViewerSchemaCommandDetails,
  postMaintenanceCommand,
} from "../../data/maintenance";

type CommandStatus = "idle" | "running" | "success" | "error";

type CommandState = {
  status: CommandStatus;
  message: string | null;
  detailLines: string[];
};

type CommandOptions<TDetails> = {
  refreshLibrary?: boolean;
  invalidateQueryKeys?: string[][];
  buildDetailLines?: (details: TDetails) => string[];
};

const optionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const optionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildMessageClasses = (status: CommandStatus) =>
  status === "success" ?
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
  : "border-rose-500/40 bg-rose-500/10 text-rose-200";

const StatusMessage = ({ state }: { state: CommandState }) => {
  if (!state.message) return null;
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${buildMessageClasses(
        state.status,
      )}`}>
      <div>{state.message}</div>
      {state.detailLines.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-200">
          {state.detailLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

const createIdleState = (): CommandState => ({
  status: "idle",
  message: null,
  detailLines: [],
});

const CommandSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <section className="space-y-4">
    <div>
      <h3 className="text-xl font-semibold text-slate-50">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">{children}</div>
  </section>
);

const CommandCard = ({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
      {eyebrow}
    </p>
    <h4 className="mt-2 text-lg font-semibold text-slate-50">{title}</h4>
    <p className="mt-2 text-sm text-slate-300">{description}</p>
    <div className="mt-4 space-y-3">{children}</div>
  </div>
);

const AdvancedOptions = ({
  summary,
  hint,
  children,
}: {
  summary: string;
  hint: string;
  children: ReactNode;
}) => (
  <details className="rounded-lg border border-slate-800 bg-slate-950/80">
    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-slate-200 marker:content-none">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <span>{summary}</span>
        <span className="text-xs text-slate-400">{hint}</span>
      </div>
    </summary>
    <div className="border-t border-slate-800 p-3">{children}</div>
  </details>
);

const withOutputPath = (label: string, outputPath?: string | null) =>
  outputPath ? [`${label}: ${outputPath}`] : [];

const buildOrderModelDetailLines = (
  details: OrderModelCommandDetails,
): string[] => {
  const lines = [
    ...withOutputPath("Output", details.output_path),
    `Payloads: ${details.payload_count}`,
  ];
  if (details.missing_paths.length > 0) {
    lines.push(`Missing paths: ${details.missing_paths.join(", ")}`);
  }
  return lines;
};

const buildLibraryArtifactDetailLines = (
  details: LibraryArtifactCommandDetails,
): string[] => [
  ...withOutputPath("Output", details.output_path),
  `Products: ${details.total_products}`,
];

const buildSchemaDetailLines = (
  details: ViewerSchemaCommandDetails,
): string[] => withOutputPath("Schema", details.output_path);

const buildSubproductCacheDetailLines = (
  details: SubproductPageCacheCommandDetails,
): string[] => [
  ...withOutputPath("Manifest", details.manifest_path),
  `Requested: ${details.requested_urls}`,
  `Processed: ${details.processed_urls}`,
  `Fetched: ${details.fetched_pages}`,
  `Reused: ${details.reused_pages}`,
  `Failed: ${details.failed_pages}`,
  `Skipped: ${details.skipped_pages}`,
];

const buildSubproductMetadataDetailLines = (
  details: SubproductMetadataCommandDetails,
): string[] => [
  ...withOutputPath("Metadata", details.output_path),
  ...withOutputPath("Report", details.report_path),
  `Processed: ${details.processed_entries}`,
  `Extracted: ${details.extracted_entries}`,
  `Fallback only: ${details.fallback_only_entries}`,
  `Read failures: ${details.html_read_failures}`,
];

const buildCurrentBundlesDetailLines = (
  details: CurrentBundlesCommandDetails,
): string[] => [
  ...withOutputPath("Catalog", details.catalog_json_path),
  ...withOutputPath("Report JSON", details.report_json_path),
  ...withOutputPath("Report Markdown", details.report_markdown_path),
  `Bundle types: ${details.bundle_types.join(", ")}`,
  `Bundles captured: ${details.bundle_count}`,
];

const buildCurrentChoiceDetailLines = (
  details: CurrentChoiceCommandDetails,
): string[] => [
  ...withOutputPath("Snapshot", details.snapshot_json_path),
  ...withOutputPath("Report JSON", details.report_json_path),
  ...withOutputPath("Report Markdown", details.report_markdown_path),
  `Month: ${details.month_label}`,
  `Games captured: ${details.game_count}`,
];

export default function CommandCenter() {
  const queryClient = useQueryClient();
  const { data: libraryStatus } = useLibraryStatus();

  const [rebuildOrder, setRebuildOrder] =
    useState<CommandState>(createIdleState);
  const [generateOrder, setGenerateOrder] =
    useState<CommandState>(createIdleState);
  const [rebuildLibrary, setRebuildLibrary] =
    useState<CommandState>(createIdleState);
  const [buildSchema, setBuildSchema] = useState<CommandState>(createIdleState);
  const [cachePages, setCachePages] = useState<CommandState>(createIdleState);
  const [extractMetadata, setExtractMetadata] =
    useState<CommandState>(createIdleState);
  const [analyzeCurrentBundles, setAnalyzeCurrentBundles] =
    useState<CommandState>(createIdleState);
  const [analyzeCurrentChoice, setAnalyzeCurrentChoice] =
    useState<CommandState>(createIdleState);

  const [rebuildArtifactsDir, setRebuildArtifactsDir] =
    useState("data/artifacts");
  const [rebuildPattern, setRebuildPattern] = useState("orders_batch_*.json");
  const [rebuildOrderModelPath, setRebuildOrderModelPath] = useState(
    "data/artifacts/order_payload_models.py",
  );
  const [rebuildOrderClass, setRebuildOrderClass] =
    useState("OrderPayloadList");

  const [generateApiDir, setGenerateApiDir] = useState(
    "data/artifacts/api_responses",
  );
  const [generatePattern, setGeneratePattern] = useState("orders_batch_*.json");
  const [generateOutputModels, setGenerateOutputModels] = useState(
    "data/artifacts/order_payload_models.py",
  );
  const [generateClassName, setGenerateClassName] =
    useState("OrderPayloadList");

  const [libraryApiDir, setLibraryApiDir] = useState(
    "data/artifacts/api_responses",
  );
  const [libraryPattern, setLibraryPattern] = useState("orders_batch_*.json");
  const [libraryOutputProducts, setLibraryOutputProducts] = useState(
    "data/artifacts/library_products.json",
  );
  const [libraryOrderModelPath, setLibraryOrderModelPath] = useState(
    "data/artifacts/order_payload_models.py",
  );
  const [libraryOrderModelClass, setLibraryOrderModelClass] =
    useState("OrderPayloadList");

  const [cacheLibraryFile, setCacheLibraryFile] = useState(
    "data/artifacts/library_products.json",
  );
  const [cacheDir, setCacheDir] = useState("data/artifacts/subproduct_pages");
  const [cacheQuery, setCacheQuery] = useState("");
  const [cacheUrl, setCacheUrl] = useState("");
  const [cacheLimit, setCacheLimit] = useState("");
  const [cacheMaxFailures, setCacheMaxFailures] = useState("1");
  const [cacheDomainWorkers, setCacheDomainWorkers] = useState("");

  const [metadataCacheDir, setMetadataCacheDir] = useState(
    "data/artifacts/subproduct_pages",
  );
  const [metadataOutputFile, setMetadataOutputFile] = useState("");
  const [metadataReportFile, setMetadataReportFile] = useState(
    "data/artifacts/temp/subproduct_metadata_coverage_summary.md",
  );

  const [schemaOutput, setSchemaOutput] = useState(
    "docs/assets/tools/library-products-schema.json",
  );

  const runCommand = async <TDetails,>(
    endpoint: string,
    payload: Record<string, unknown>,
    state: CommandState,
    setState: (value: CommandState) => void,
    options?: CommandOptions<TDetails>,
  ) => {
    if (state.status === "running") return;
    setState({ status: "running", message: null, detailLines: [] });
    try {
      const data = await postMaintenanceCommand<TDetails>(endpoint, payload);
      setState({
        status: "success",
        message: data.message || "Command completed successfully.",
        detailLines: options?.buildDetailLines?.(data.details) ?? [],
      });
      if (options?.refreshLibrary) {
        queryClient.invalidateQueries({ queryKey: ["library"] });
        queryClient.invalidateQueries({ queryKey: ["library-status"] });
      }
      options?.invalidateQueryKeys?.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Command failed.",
        detailLines: [],
      });
    }
  };

  return (
    <div className="w-full space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Maintenance workflows
        </h2>
        <p className="text-muted-foreground">
          Run the same workflows available in the CLI. The cards below keep the
          default action visible first and tuck path overrides into expandable
          advanced sections. Editing
          <code className="mx-1 text-xs text-slate-200">.env</code> and
          <code className="ml-1 text-xs text-slate-200">config.yaml</code> still
          requires the CLI or manual updates.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Guided first
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-50">
            Start with the safe defaults
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            Capture flows and report refreshes stay one click away. Expand the
            advanced sections only when you need path overrides or scoped runs.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
            Rebuilds and exports
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-50">
            Refresh saved artifacts deliberately
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            Library rebuilds and schema exports stay grouped together so it is
            clearer when you are regenerating files versus just inspecting data.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Enrichment pipeline
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-50">
            Cache, then extract metadata
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            External subproduct enrichment is still available here, but it now
            reads as a two-step workflow instead of another pile of textboxes.
          </p>
        </div>
      </div>

      <CommandSection
        title="Guided workflows"
        description="Fast entry points for setup and report refreshes with safe defaults and minimal input.">
        <CommandCard
          eyebrow="Setup"
          title="Capture + Download"
          description="Use the Setup page to run the full capture workflow with your session cookie and optional downloads.">
          <div className="flex flex-wrap gap-3">
            <Button asChild size="sm">
              <Link to="/setup">Open setup</Link>
            </Button>
            {libraryStatus && (
              <span className="text-xs text-slate-400">
                Current file: {libraryStatus.current_path}
              </span>
            )}
          </div>
        </CommandCard>

        <CommandCard
          eyebrow="Reports"
          title="Current sales bundle analysis"
          description="Capture the current games, books, and software sales pages and rebuild the shared bundle-overlap report used by the Current sales routes.">
          <Button
            type="button"
            size="sm"
            disabled={analyzeCurrentBundles.status === "running"}
            onClick={() =>
              runCommand<CurrentBundlesCommandDetails>(
                "/api/maintenance/analyze-current-bundles",
                { bundle_types: ["games", "books", "software"] },
                analyzeCurrentBundles,
                setAnalyzeCurrentBundles,
                {
                  buildDetailLines: buildCurrentBundlesDetailLines,
                  invalidateQueryKeys: [
                    ["current-bundles-status"],
                    ["current-bundles"],
                  ],
                },
              )
            }>
            {analyzeCurrentBundles.status === "running" && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Analyze current bundles
          </Button>
          <StatusMessage state={analyzeCurrentBundles} />
        </CommandCard>

        <CommandCard
          eyebrow="Reports"
          title="Current sales Choice analysis"
          description="Refresh the saved current-month Humble Choice report that powers the Current sales Choice page.">
          <Button
            type="button"
            size="sm"
            disabled={analyzeCurrentChoice.status === "running"}
            onClick={() =>
              runCommand<CurrentChoiceCommandDetails>(
                "/api/maintenance/analyze-current-choice",
                {},
                analyzeCurrentChoice,
                setAnalyzeCurrentChoice,
                {
                  buildDetailLines: buildCurrentChoiceDetailLines,
                  invalidateQueryKeys: [
                    ["current-choice-status"],
                    ["current-choice"],
                  ],
                },
              )
            }>
            {analyzeCurrentChoice.status === "running" && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Analyze current Choice
          </Button>
          <StatusMessage state={analyzeCurrentChoice} />
        </CommandCard>
      </CommandSection>

      <CommandSection
        title="Rebuilds and exports"
        description="File-generating commands stay grouped here so schema, artifact, and model rebuilds are easier to scan before you run them.">
        <CommandCard
          eyebrow="Rebuild"
          title="Rebuild library artifacts"
          description="Regenerate `library_products.json` from stored API batches and refresh the viewer.">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              runCommand<LibraryArtifactCommandDetails>(
                "/api/maintenance/rebuild-library-artifacts",
                {
                  api_dir: libraryApiDir,
                  pattern: libraryPattern,
                  output_products: libraryOutputProducts,
                  order_model_path: libraryOrderModelPath,
                  order_model_class: libraryOrderModelClass,
                },
                rebuildLibrary,
                setRebuildLibrary,
                {
                  refreshLibrary: true,
                  buildDetailLines: buildLibraryArtifactDetailLines,
                },
              );
            }}>
            <Button
              type="submit"
              size="sm"
              disabled={rebuildLibrary.status === "running"}>
              {rebuildLibrary.status === "running" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Rebuild library artifacts
            </Button>
            <AdvancedOptions
              summary="Advanced paths and model settings"
              hint="Change paths or class names only when you are rebuilding from non-default artifacts.">
              <div className="space-y-3">
                <Input
                  value={libraryApiDir}
                  onChange={(event) => setLibraryApiDir(event.target.value)}
                  placeholder="API response directory"
                />
                <Input
                  value={libraryPattern}
                  onChange={(event) => setLibraryPattern(event.target.value)}
                  placeholder="orders_batch_*.json"
                />
                <Input
                  value={libraryOutputProducts}
                  onChange={(event) =>
                    setLibraryOutputProducts(event.target.value)
                  }
                  placeholder="Output library_products.json"
                />
                <Input
                  value={libraryOrderModelPath}
                  onChange={(event) =>
                    setLibraryOrderModelPath(event.target.value)
                  }
                  placeholder="Order model path"
                />
                <Input
                  value={libraryOrderModelClass}
                  onChange={(event) =>
                    setLibraryOrderModelClass(event.target.value)
                  }
                  placeholder="OrderPayloadList"
                />
              </div>
            </AdvancedOptions>
            <StatusMessage state={rebuildLibrary} />
          </form>
        </CommandCard>

        <CommandCard
          eyebrow="Export"
          title="Build viewer schema"
          description="Export the schema used by the standalone viewer validation tools.">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              runCommand<ViewerSchemaCommandDetails>(
                "/api/maintenance/build-viewer-assets",
                { schema_output: schemaOutput },
                buildSchema,
                setBuildSchema,
                { buildDetailLines: buildSchemaDetailLines },
              );
            }}>
            <Button
              type="submit"
              size="sm"
              disabled={buildSchema.status === "running"}>
              {buildSchema.status === "running" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Build viewer schema
            </Button>
            <AdvancedOptions
              summary="Advanced output path"
              hint="Change the destination only when you need to export the schema somewhere else.">
              <Input
                value={schemaOutput}
                onChange={(event) => setSchemaOutput(event.target.value)}
                placeholder="Schema output path"
              />
            </AdvancedOptions>
            <StatusMessage state={buildSchema} />
          </form>
        </CommandCard>

        <CommandCard
          eyebrow="Rebuild"
          title="Rebuild order models"
          description="Regenerate the order payload models from saved API batches.">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              runCommand<OrderModelCommandDetails>(
                "/api/maintenance/rebuild-order-models",
                {
                  artifacts_dir: rebuildArtifactsDir,
                  pattern: rebuildPattern,
                  order_model_path: rebuildOrderModelPath,
                  order_model_class: rebuildOrderClass,
                },
                rebuildOrder,
                setRebuildOrder,
                { buildDetailLines: buildOrderModelDetailLines },
              );
            }}>
            <Button
              type="submit"
              size="sm"
              disabled={rebuildOrder.status === "running"}>
              {rebuildOrder.status === "running" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Rebuild order models
            </Button>
            <AdvancedOptions
              summary="Advanced paths and class names"
              hint="Adjust these only when the saved API batches or model destination differ from the defaults.">
              <div className="space-y-3">
                <Input
                  value={rebuildArtifactsDir}
                  onChange={(event) =>
                    setRebuildArtifactsDir(event.target.value)
                  }
                  placeholder="Artifacts directory"
                />
                <Input
                  value={rebuildPattern}
                  onChange={(event) => setRebuildPattern(event.target.value)}
                  placeholder="orders_batch_*.json"
                />
                <Input
                  value={rebuildOrderModelPath}
                  onChange={(event) =>
                    setRebuildOrderModelPath(event.target.value)
                  }
                  placeholder="Output model path"
                />
                <Input
                  value={rebuildOrderClass}
                  onChange={(event) => setRebuildOrderClass(event.target.value)}
                  placeholder="OrderPayloadList"
                />
              </div>
            </AdvancedOptions>
            <StatusMessage state={rebuildOrder} />
          </form>
        </CommandCard>

        <CommandCard
          eyebrow="Rebuild"
          title="Generate order models"
          description="Build a fresh order payload model from API batch files.">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              runCommand<OrderModelCommandDetails>(
                "/api/maintenance/generate-order-models",
                {
                  api_dir: generateApiDir,
                  pattern: generatePattern,
                  output_models: generateOutputModels,
                  class_name: generateClassName,
                },
                generateOrder,
                setGenerateOrder,
                { buildDetailLines: buildOrderModelDetailLines },
              );
            }}>
            <Button
              type="submit"
              size="sm"
              disabled={generateOrder.status === "running"}>
              {generateOrder.status === "running" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Generate order models
            </Button>
            <AdvancedOptions
              summary="Advanced input and output paths"
              hint="Use these when you want to build a model from a different API batch location or output file.">
              <div className="space-y-3">
                <Input
                  value={generateApiDir}
                  onChange={(event) => setGenerateApiDir(event.target.value)}
                  placeholder="API response directory"
                />
                <Input
                  value={generatePattern}
                  onChange={(event) => setGeneratePattern(event.target.value)}
                  placeholder="orders_batch_*.json"
                />
                <Input
                  value={generateOutputModels}
                  onChange={(event) =>
                    setGenerateOutputModels(event.target.value)
                  }
                  placeholder="Output model path"
                />
                <Input
                  value={generateClassName}
                  onChange={(event) => setGenerateClassName(event.target.value)}
                  placeholder="OrderPayloadList"
                />
              </div>
            </AdvancedOptions>
            <StatusMessage state={generateOrder} />
          </form>
        </CommandCard>
      </CommandSection>

      <CommandSection
        title="Metadata enrichment"
        description="Use these two commands together when you want richer authors, publishers, summaries, and descriptions throughout the viewer.">
        <CommandCard
          eyebrow="Enrichment"
          title="Cache subproduct pages"
          description="Fetch and cache external publisher or product pages so the viewer can surface richer title metadata.">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              runCommand<SubproductPageCacheCommandDetails>(
                "/api/maintenance/cache-subproduct-pages",
                {
                  library_file: cacheLibraryFile,
                  cache_dir: optionalText(cacheDir),
                  subproduct_query: optionalText(cacheQuery),
                  url: optionalText(cacheUrl),
                  limit: optionalNumber(cacheLimit),
                  max_failures: optionalNumber(cacheMaxFailures),
                  domain_workers: optionalNumber(cacheDomainWorkers),
                },
                cachePages,
                setCachePages,
                { buildDetailLines: buildSubproductCacheDetailLines },
              );
            }}>
            <Button
              type="submit"
              size="sm"
              disabled={cachePages.status === "running"}>
              {cachePages.status === "running" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Cache subproduct pages
            </Button>
            <AdvancedOptions
              summary="Advanced cache scope"
              hint="Use filters only when you need a smaller or custom scrape target.">
              <div className="space-y-3">
                <Input
                  value={cacheLibraryFile}
                  onChange={(event) => setCacheLibraryFile(event.target.value)}
                  placeholder="Library file path"
                />
                <Input
                  value={cacheDir}
                  onChange={(event) => setCacheDir(event.target.value)}
                  placeholder="Cache directory"
                />
                <Input
                  value={cacheQuery}
                  onChange={(event) => setCacheQuery(event.target.value)}
                  placeholder="Optional title or publisher filter"
                />
                <Input
                  value={cacheUrl}
                  onChange={(event) => setCacheUrl(event.target.value)}
                  placeholder="Optional exact URL override"
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    value={cacheLimit}
                    onChange={(event) => setCacheLimit(event.target.value)}
                    placeholder="Limit"
                  />
                  <Input
                    value={cacheMaxFailures}
                    onChange={(event) =>
                      setCacheMaxFailures(event.target.value)
                    }
                    placeholder="Max failures"
                  />
                  <Input
                    value={cacheDomainWorkers}
                    onChange={(event) =>
                      setCacheDomainWorkers(event.target.value)
                    }
                    placeholder="Domain workers"
                  />
                </div>
              </div>
            </AdvancedOptions>
            <StatusMessage state={cachePages} />
          </form>
        </CommandCard>

        <CommandCard
          eyebrow="Enrichment"
          title="Extract subproduct metadata"
          description="Parse cached external pages into structured metadata that the Purchases and media routes can display.">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              runCommand<SubproductMetadataCommandDetails>(
                "/api/maintenance/extract-subproduct-metadata",
                {
                  cache_dir: optionalText(metadataCacheDir),
                  output_file: optionalText(metadataOutputFile),
                  report_file: optionalText(metadataReportFile),
                },
                extractMetadata,
                setExtractMetadata,
                {
                  refreshLibrary: true,
                  buildDetailLines: buildSubproductMetadataDetailLines,
                },
              );
            }}>
            <Button
              type="submit"
              size="sm"
              disabled={extractMetadata.status === "running"}>
              {extractMetadata.status === "running" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Extract metadata
            </Button>
            <AdvancedOptions
              summary="Advanced metadata outputs"
              hint="Override these only when you want custom cache or report destinations.">
              <div className="space-y-3">
                <Input
                  value={metadataCacheDir}
                  onChange={(event) => setMetadataCacheDir(event.target.value)}
                  placeholder="Cache directory"
                />
                <Input
                  value={metadataOutputFile}
                  onChange={(event) =>
                    setMetadataOutputFile(event.target.value)
                  }
                  placeholder="Optional metadata.json output path"
                />
                <Input
                  value={metadataReportFile}
                  onChange={(event) =>
                    setMetadataReportFile(event.target.value)
                  }
                  placeholder="Optional markdown report path"
                />
              </div>
            </AdvancedOptions>
            <StatusMessage state={extractMetadata} />
          </form>
        </CommandCard>
      </CommandSection>
    </div>
  );
}
