/**
 * Command center for running CLI workflows from the viewer.
 */
import { type ReactNode, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  type CurrentBundlesStatus,
  type CurrentChoiceStatus,
  useCurrentBundlesStatus,
  useCurrentChoiceStatus,
  useLibraryStatus,
} from "../../data/api";
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
import { formatDateTime } from "../../utils/format";

type CommandStatus = "idle" | "running" | "success" | "error";

type CommandState = {
  status: CommandStatus;
  message: string | null;
  detailLines: string[];
  actions: StatusAction[];
};

type StatusAction = {
  label: string;
  to: string;
};

type StatusTone = "fresh" | "stale" | "missing" | "loading";

type CommandOptions<TDetails> = {
  refreshLibrary?: boolean;
  invalidateQueryKeys?: string[][];
  buildDetailLines?: (details: TDetails) => string[];
  buildActions?: (details: TDetails) => StatusAction[];
  runningMessage?: string;
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
  : status === "running" ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
  : "border-rose-500/40 bg-rose-500/10 text-rose-200";

const REPORT_STALE_MS = 24 * 60 * 60 * 1000;

const formatElapsedSince = (dateInput?: string | null) => {
  if (!dateInput) return null;
  const timestamp = new Date(dateInput).getTime();
  if (Number.isNaN(timestamp)) return null;
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 1) return "less than an hour ago";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
};

const buildToneClasses = (tone: StatusTone) =>
  tone === "fresh" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
  : tone === "stale" ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
  : tone === "loading" ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
  : "border-slate-700 bg-slate-900/80 text-slate-200";

const ReportStatusPill = ({
  tone,
  label,
}: {
  tone: StatusTone;
  label: string;
}) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${buildToneClasses(
      tone,
    )}`}>
    {label}
  </span>
);

const getReportStatusMeta = (
  generatedAt: string | null | undefined,
  exists: boolean,
): { tone: StatusTone; label: string; detail: string } => {
  if (!exists || !generatedAt) {
    return {
      tone: "missing",
      label: "Missing",
      detail: "No saved report yet. Run the refresh to create one.",
    };
  }

  const timestamp = new Date(generatedAt).getTime();
  if (Number.isNaN(timestamp)) {
    return {
      tone: "missing",
      label: "Unknown",
      detail: "A report exists, but its saved timestamp could not be parsed.",
    };
  }

  const stale = Date.now() - timestamp > REPORT_STALE_MS;
  const elapsedLabel = formatElapsedSince(generatedAt);
  return {
    tone: stale ? "stale" : "fresh",
    label: stale ? "Stale" : "Fresh",
    detail: `Last generated ${formatDateTime(generatedAt)}${elapsedLabel ? ` (${elapsedLabel})` : ""}.`,
  };
};

const CurrentSalesStatusSummary = ({
  title,
  tone,
  label,
  detail,
  lines,
}: {
  title: string;
  tone: StatusTone;
  label: string;
  detail: string;
  lines: string[];
}) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          {title}
        </p>
        <p className="text-sm text-slate-100">{detail}</p>
      </div>
      <ReportStatusPill tone={tone} label={label} />
    </div>
    {lines.length > 0 && (
      <ul className="mt-3 space-y-1 text-xs text-slate-300">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    )}
  </div>
);

const StatusMessage = ({ state }: { state: CommandState }) => {
  if (!state.message) return null;
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${buildMessageClasses(
        state.status,
      )}`}>
      <div>{state.message}</div>
      {state.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {state.actions.map((action) => (
            <Button
              key={`${action.to}-${action.label}`}
              asChild
              size="sm"
              variant="outline"
              className="border-slate-700 bg-slate-950/70 text-slate-100 hover:bg-slate-900">
              <Link to={action.to}>{action.label}</Link>
            </Button>
          ))}
        </div>
      )}
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
  actions: [],
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
    <div className="space-y-6">{children}</div>
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
  ...withOutputPath("Output folder", details.output_dir),
  ...withOutputPath("Bundle index HTML", details.index_html_path),
  ...withOutputPath("Bundle links", details.bundle_links_path),
  ...withOutputPath("Catalog", details.catalog_json_path),
  ...withOutputPath("Report JSON", details.report_json_path),
  ...withOutputPath("Report Markdown", details.report_markdown_path),
  `Generated: ${details.generated_at}`,
  `Library: ${details.library_path}`,
  `Bundle types: ${details.bundle_types.join(", ")}`,
  `Bundles captured: ${details.bundle_count}`,
];

const buildCurrentBundlesActions = (): StatusAction[] => [
  { label: "Open Sales Overview", to: "/venue/overview" },
  { label: "Open Game Bundles", to: "/venue/bundles/games" },
  { label: "Open Book Bundles", to: "/venue/bundles/books" },
  { label: "Open Software Bundles", to: "/venue/bundles/software" },
];

const buildCurrentChoiceDetailLines = (
  details: CurrentChoiceCommandDetails,
): string[] => [
  ...withOutputPath("Output folder", details.output_dir),
  ...withOutputPath("Saved page HTML", details.page_html_path),
  ...withOutputPath("Snapshot", details.snapshot_json_path),
  ...withOutputPath("Report JSON", details.report_json_path),
  ...withOutputPath("Report Markdown", details.report_markdown_path),
  `Generated: ${details.generated_at}`,
  `Library: ${details.library_path}`,
  `Month: ${details.month_label}`,
  `Games captured: ${details.game_count}`,
];

const buildCurrentChoiceActions = (): StatusAction[] => [
  { label: "Open Sales Overview", to: "/venue/overview" },
  { label: "Open Current Choice", to: "/venue/choice" },
];

export default function CommandCenter() {
  const queryClient = useQueryClient();
  const { data: libraryStatus } = useLibraryStatus();
  const { data: currentBundlesStatus, isLoading: currentBundlesStatusLoading } =
    useCurrentBundlesStatus();
  const { data: currentChoiceStatus, isLoading: currentChoiceStatusLoading } =
    useCurrentChoiceStatus();

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
    setState({
      status: "running",
      message: options?.runningMessage ?? "Running command…",
      detailLines: [],
      actions: [],
    });
    try {
      const data = await postMaintenanceCommand<TDetails>(endpoint, payload);
      setState({
        status: "success",
        message: data.message || "Command completed successfully.",
        detailLines: options?.buildDetailLines?.(data.details) ?? [],
        actions: options?.buildActions?.(data.details) ?? [],
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
        actions: [],
      });
    }
  };

  const renderCurrentBundlesSummary = (
    status?: CurrentBundlesStatus,
    isLoading?: boolean,
  ) => {
    if (isLoading) {
      return (
        <CurrentSalesStatusSummary
          title="Saved bundle report status"
          tone="loading"
          label="Loading"
          detail="Checking the latest saved current-sales bundle analysis…"
          lines={[]}
        />
      );
    }

    if (!status) {
      return null;
    }

    const meta = getReportStatusMeta(status.generated_at, status.report_exists);
    return (
      <CurrentSalesStatusSummary
        title="Saved bundle report status"
        tone={meta.tone}
        label={meta.label}
        detail={meta.detail}
        lines={[
          `Bundle types: ${status.bundle_types.join(", ")}`,
          `Saved bundles: ${status.bundle_count ?? 0}`,
          `Output folder: ${status.output_dir}`,
        ]}
      />
    );
  };

  const renderCurrentChoiceSummary = (
    status?: CurrentChoiceStatus,
    isLoading?: boolean,
  ) => {
    if (isLoading) {
      return (
        <CurrentSalesStatusSummary
          title="Saved Choice report status"
          tone="loading"
          label="Loading"
          detail="Checking the latest saved current Humble Choice analysis…"
          lines={[]}
        />
      );
    }

    if (!status) {
      return null;
    }

    const meta = getReportStatusMeta(status.generated_at, status.report_exists);
    return (
      <CurrentSalesStatusSummary
        title="Saved Choice report status"
        tone={meta.tone}
        label={meta.label}
        detail={meta.detail}
        lines={[
          `Month: ${status.month_label ?? "Not captured yet"}`,
          `Saved games: ${status.game_count ?? 0}`,
          `Output folder: ${status.output_dir}`,
        ]}
      />
    );
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
          {renderCurrentBundlesSummary(
            currentBundlesStatus,
            currentBundlesStatusLoading,
          )}
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
                  runningMessage:
                    "Refreshing current bundle analysis for games, books, and software. This can take a moment while the backend captures the live sales pages.",
                  buildDetailLines: buildCurrentBundlesDetailLines,
                  buildActions: buildCurrentBundlesActions,
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
          {renderCurrentChoiceSummary(
            currentChoiceStatus,
            currentChoiceStatusLoading,
          )}
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
                  runningMessage:
                    "Refreshing the current Humble Choice analysis. This can take a moment while the backend fetches the latest saved month snapshot.",
                  buildDetailLines: buildCurrentChoiceDetailLines,
                  buildActions: buildCurrentChoiceActions,
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
