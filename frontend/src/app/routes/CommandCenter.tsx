/**
 * Command center for running CLI workflows from the viewer.
 */
import { type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Badge, type BadgeProps } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { usePersistentState } from "../../hooks/usePersistentState";
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

type StatusTone = "fresh" | "stale" | "missing" | "loading" | "unavailable";

type StatusQueryState = {
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
};

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

type StatusVariant = NonNullable<BadgeProps["variant"]>;

const buildMessageClasses = (status: CommandStatus) =>
  status === "success" ?
    "border-status-success/40 bg-status-success/10 text-status-success-foreground"
  : status === "running" ?
    "border-status-info/40 bg-status-info/10 text-status-info-foreground"
  : "border-status-error/40 bg-status-error/10 text-status-error-foreground";

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

const getStatusVariant = (tone: StatusTone): StatusVariant =>
  tone === "fresh" ? "success"
  : tone === "stale" ? "warning"
  : tone === "loading" ? "info"
  : tone === "unavailable" ? "error"
  : "neutral";

const ReportStatusPill = ({
  tone,
  label,
}: {
  tone: StatusTone;
  label: string;
}) => (
  <Badge variant={getStatusVariant(tone)}>
    {label}
  </Badge>
);

const getReportStatusMeta = (
  generatedAt: string | null | undefined,
  exists: boolean,
): { tone: StatusTone; label: string; detail: string } => {
  if (!exists) {
    return {
      tone: "missing",
      label: "Missing",
      detail: "No saved report yet. Run the refresh to create one.",
    };
  }

  if (!generatedAt) {
    return {
      tone: "unavailable",
      label: "Unavailable",
      detail:
        "A saved report exists, but its generated timestamp is unavailable.",
    };
  }

  const timestamp = new Date(generatedAt).getTime();
  if (Number.isNaN(timestamp)) {
    return {
      tone: "unavailable",
      label: "Unavailable",
      detail: "A saved report exists, but its timestamp could not be parsed.",
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

const buildErrorLines = (error?: unknown): string[] =>
  error instanceof Error && error.message ? [error.message] : [];

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
  <Card className="rounded-lg bg-card/80 p-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </p>
        <p className="text-sm text-foreground">{detail}</p>
      </div>
      <ReportStatusPill tone={tone} label={label} />
    </div>
    {lines.length > 0 && (
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {lines.map((line, index) => (
          <li key={`${title}-${index}`}>{line}</li>
        ))}
      </ul>
    )}
  </Card>
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
              className="bg-background/70">
              <Link to={action.to}>{action.label}</Link>
            </Button>
          ))}
        </div>
      )}
      {state.detailLines.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs opacity-90">
          {state.detailLines.map((line, index) => (
            <li key={`${state.status}-${index}`}>{line}</li>
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

export const sanitizePersistedCommandState = (
  state: CommandState,
): CommandState =>
  state.status === "running" ? createIdleState() : state;

const serializeCommandState = (value: CommandState) =>
  JSON.stringify(sanitizePersistedCommandState(value));

const deserializeCommandState = (value: string): CommandState =>
  sanitizePersistedCommandState(JSON.parse(value) as CommandState);

const useCommandStatePersistence = (key: string) =>
  usePersistentState<CommandState>(key, createIdleState, {
    storage: "session",
    serialize: serializeCommandState,
    deserialize: deserializeCommandState,
  });

const CommandSection = ({
  title,
  description,
  note,
  children,
}: {
  title: string;
  description: string;
  note?: ReactNode;
  children: ReactNode;
}) => (
  <section className="space-y-4">
    <div>
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {note && <div className="mt-2 text-sm text-muted-foreground">{note}</div>}
    </div>
    <div className="space-y-6">{children}</div>
  </section>
);

const CommandCard = ({
  eyebrow,
  eyebrowVariant = "neutral",
  title,
  description,
  note,
  children,
}: {
  eyebrow: string;
  eyebrowVariant?: StatusVariant;
  title: string;
  description: string;
  note?: string;
  children: ReactNode;
}) => (
  <Card className="bg-card/60">
    <CardHeader className="pb-4">
      <div>
        <Badge variant={eyebrowVariant}>{eyebrow}</Badge>
      </div>
      <h4 className="text-lg font-semibold text-card-foreground">{title}</h4>
      {note && <p className="text-sm font-medium text-muted-foreground">{note}</p>}
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardHeader>
    <CardContent className="space-y-3">{children}</CardContent>
  </Card>
);

const AdvancedOptions = ({
  storageKey,
  summary,
  hint,
  onReset,
  children,
}: {
  storageKey: string;
  summary: string;
  hint: string;
  onReset?: () => void;
  children: ReactNode;
}) => {
  const [open, setOpen] = usePersistentState(storageKey, false, {
    storage: "session",
  });

  return (
    <details
      className="rounded-lg border border-border bg-card/80"
      open={open}>
      <summary
        className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground marker:content-none"
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>{summary}</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
      </summary>
      <div className="border-t border-border p-3">
        {onReset && (
          <div className="mb-3 flex justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={onReset}>
              Reset to defaults
            </Button>
          </div>
        )}
        {children}
      </div>
    </details>
  );
};

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

const renderCurrentBundlesSummary = (
  status: CurrentBundlesStatus | undefined,
  queryState: StatusQueryState,
) => {
  if (queryState.isLoading) {
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

  if (queryState.isError) {
    return (
      <CurrentSalesStatusSummary
        title="Saved bundle report status"
        tone="unavailable"
        label="Unavailable"
        detail="Unable to load saved bundle report status right now."
        lines={buildErrorLines(queryState.error)}
      />
    );
  }

  if (!status) {
    return (
      <CurrentSalesStatusSummary
        title="Saved bundle report status"
        tone="unavailable"
        label="Unavailable"
        detail="Saved bundle report status is unavailable right now."
        lines={[]}
      />
    );
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
  status: CurrentChoiceStatus | undefined,
  queryState: StatusQueryState,
) => {
  if (queryState.isLoading) {
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

  if (queryState.isError) {
    return (
      <CurrentSalesStatusSummary
        title="Saved Choice report status"
        tone="unavailable"
        label="Unavailable"
        detail="Unable to load the latest saved current Humble Choice analysis."
        lines={buildErrorLines(queryState.error)}
      />
    );
  }

  if (!status) {
    return (
      <CurrentSalesStatusSummary
        title="Saved Choice report status"
        tone="unavailable"
        label="Unavailable"
        detail="Saved current Humble Choice status is unavailable right now."
        lines={[]}
      />
    );
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

export default function CommandCenter() {
  const queryClient = useQueryClient();
  const { data: libraryStatus } = useLibraryStatus();
  const {
    data: currentBundlesStatus,
    isLoading: currentBundlesStatusLoading,
    isError: currentBundlesStatusError,
    error: currentBundlesStatusErrorDetail,
  } = useCurrentBundlesStatus();
  const {
    data: currentChoiceStatus,
    isLoading: currentChoiceStatusLoading,
    isError: currentChoiceStatusError,
    error: currentChoiceStatusErrorDetail,
  } = useCurrentChoiceStatus();

  const [rebuildOrder, setRebuildOrder] = useCommandStatePersistence(
    "humble.session.commands.rebuildOrderModels",
  );
  const [generateOrder, setGenerateOrder] = useCommandStatePersistence(
    "humble.session.commands.generateOrderModels",
  );
  const [rebuildLibrary, setRebuildLibrary] = useCommandStatePersistence(
    "humble.session.commands.rebuildLibraryArtifacts",
  );
  const [buildSchema, setBuildSchema] = useCommandStatePersistence(
    "humble.session.commands.buildViewerSchema",
  );
  const [cachePages, setCachePages] = useCommandStatePersistence(
    "humble.session.commands.cacheSubproductPages",
  );
  const [extractMetadata, setExtractMetadata] = useCommandStatePersistence(
    "humble.session.commands.extractSubproductMetadata",
  );
  const [analyzeCurrentBundles, setAnalyzeCurrentBundles] = useCommandStatePersistence(
    "humble.session.commands.analyzeCurrentBundles",
  );
  const [analyzeCurrentChoice, setAnalyzeCurrentChoice] = useCommandStatePersistence(
    "humble.session.commands.analyzeCurrentChoice",
  );

  const [rebuildArtifactsDir, setRebuildArtifactsDir, resetRebuildArtifactsDir] =
    usePersistentState("humble.commands.rebuildArtifactsDir", "data/artifacts");
  const [rebuildPattern, setRebuildPattern, resetRebuildPattern] =
    usePersistentState("humble.commands.rebuildPattern", "orders_batch_*.json");
  const [rebuildOrderModelPath, setRebuildOrderModelPath, resetRebuildOrderModelPath] =
    usePersistentState(
      "humble.commands.rebuildOrderModelPath",
      "data/artifacts/order_payload_models.py",
    );
  const [rebuildOrderClass, setRebuildOrderClass, resetRebuildOrderClass] =
    usePersistentState("humble.commands.rebuildOrderClass", "OrderPayloadList");

  const [generateApiDir, setGenerateApiDir, resetGenerateApiDir] =
    usePersistentState("humble.commands.generateApiDir", "data/artifacts/api_responses");
  const [generatePattern, setGeneratePattern, resetGeneratePattern] =
    usePersistentState("humble.commands.generatePattern", "orders_batch_*.json");
  const [generateOutputModels, setGenerateOutputModels, resetGenerateOutputModels] =
    usePersistentState(
      "humble.commands.generateOutputModels",
      "data/artifacts/order_payload_models.py",
    );
  const [generateClassName, setGenerateClassName, resetGenerateClassName] =
    usePersistentState("humble.commands.generateClassName", "OrderPayloadList");

  const [libraryApiDir, setLibraryApiDir, resetLibraryApiDir] =
    usePersistentState("humble.commands.libraryApiDir", "data/artifacts/api_responses");
  const [libraryPattern, setLibraryPattern, resetLibraryPattern] =
    usePersistentState("humble.commands.libraryPattern", "orders_batch_*.json");
  const [libraryOutputProducts, setLibraryOutputProducts, resetLibraryOutputProducts] =
    usePersistentState(
      "humble.commands.libraryOutputProducts",
      "data/artifacts/library_products.json",
    );
  const [libraryOrderModelPath, setLibraryOrderModelPath, resetLibraryOrderModelPath] =
    usePersistentState(
      "humble.commands.libraryOrderModelPath",
      "data/artifacts/order_payload_models.py",
    );
  const [libraryOrderModelClass, setLibraryOrderModelClass, resetLibraryOrderModelClass] =
    usePersistentState("humble.commands.libraryOrderModelClass", "OrderPayloadList");

  const [cacheLibraryFile, setCacheLibraryFile, resetCacheLibraryFile] =
    usePersistentState(
      "humble.commands.cacheLibraryFile",
      "data/artifacts/library_products.json",
    );
  const [cacheDir, setCacheDir, resetCacheDir] = usePersistentState(
    "humble.commands.cacheDir",
    "data/artifacts/subproduct_pages",
  );
  const [cacheQuery, setCacheQuery, resetCacheQuery] = usePersistentState(
    "humble.commands.cacheQuery",
    "",
  );
  const [cacheUrl, setCacheUrl, resetCacheUrl] = usePersistentState(
    "humble.commands.cacheUrl",
    "",
  );
  const [cacheLimit, setCacheLimit, resetCacheLimit] = usePersistentState(
    "humble.commands.cacheLimit",
    "",
  );
  const [cacheMaxFailures, setCacheMaxFailures, resetCacheMaxFailures] =
    usePersistentState("humble.commands.cacheMaxFailures", "1");
  const [cacheDomainWorkers, setCacheDomainWorkers, resetCacheDomainWorkers] =
    usePersistentState("humble.commands.cacheDomainWorkers", "");

  const [metadataCacheDir, setMetadataCacheDir, resetMetadataCacheDir] =
    usePersistentState(
      "humble.commands.metadataCacheDir",
      "data/artifacts/subproduct_pages",
    );
  const [metadataOutputFile, setMetadataOutputFile, resetMetadataOutputFile] =
    usePersistentState("humble.commands.metadataOutputFile", "");
  const [metadataReportFile, setMetadataReportFile, resetMetadataReportFile] =
    usePersistentState(
      "humble.commands.metadataReportFile",
      "data/artifacts/temp/subproduct_metadata_coverage_summary.md",
    );

  const [schemaOutput, setSchemaOutput, resetSchemaOutput] = usePersistentState(
    "humble.commands.schemaOutput",
    "docs/assets/tools/library-products-schema.json",
  );

  const resetLibraryArtifactOptions = () => {
    resetLibraryApiDir();
    resetLibraryPattern();
    resetLibraryOutputProducts();
    resetLibraryOrderModelPath();
    resetLibraryOrderModelClass();
  };

  const resetSchemaOptions = () => {
    resetSchemaOutput();
  };

  const resetRebuildOrderOptions = () => {
    resetRebuildArtifactsDir();
    resetRebuildPattern();
    resetRebuildOrderModelPath();
    resetRebuildOrderClass();
  };

  const resetGenerateOrderOptions = () => {
    resetGenerateApiDir();
    resetGeneratePattern();
    resetGenerateOutputModels();
    resetGenerateClassName();
  };

  const resetCacheOptions = () => {
    resetCacheLibraryFile();
    resetCacheDir();
    resetCacheQuery();
    resetCacheUrl();
    resetCacheLimit();
    resetCacheMaxFailures();
    resetCacheDomainWorkers();
  };

  const resetMetadataOptions = () => {
    resetMetadataCacheDir();
    resetMetadataOutputFile();
    resetMetadataReportFile();
  };

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
          <code className="mx-1 text-xs text-foreground">.env</code> and
          <code className="ml-1 text-xs text-foreground">config.yaml</code> still
          requires the CLI or manual updates.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="bg-card/60">
          <CardHeader className="pb-2">
            <div>
              <Badge variant="success">Guided first</Badge>
            </div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Start with the safe defaults
            </h3>
            <p className="text-sm text-muted-foreground">
              Capture flows and report refreshes stay one click away. Expand the
              advanced sections only when you need path overrides or scoped runs.
            </p>
          </CardHeader>
        </Card>
        <Card className="bg-card/60">
          <CardHeader className="pb-2">
            <div>
              <Badge variant="neutral">Rebuilds and exports</Badge>
            </div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Refresh saved artifacts deliberately
            </h3>
            <p className="text-sm text-muted-foreground">
              Library rebuilds and schema exports stay grouped together so it is
              clearer when you are regenerating files versus just inspecting data.
            </p>
          </CardHeader>
        </Card>
        <Card className="bg-card/60">
          <CardHeader className="pb-2">
            <div>
              <Badge variant="info">Enrichment pipeline</Badge>
            </div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Cache, then extract metadata
            </h3>
            <p className="text-sm text-muted-foreground">
              External subproduct enrichment is still available here, but it now
              reads as a two-step workflow instead of another pile of textboxes.
            </p>
          </CardHeader>
        </Card>
      </div>

      <CommandSection
        title="Guided workflows"
        description="Fast entry points for report refreshes with safe defaults and minimal input."
        note={
          <>
            Need a full capture or file switch first?{" "}
            <Link className="font-medium text-primary hover:underline" to="/setup">
              Open Setup
            </Link>
            .
          </>
        }>
        <CommandCard
          eyebrow="Reports"
          eyebrowVariant="info"
          title="Current sales bundle analysis"
          description="Capture the current games, books, and software sales pages and rebuild the shared bundle-overlap report used by the Current sales routes.">
          {renderCurrentBundlesSummary(
            currentBundlesStatus,
            {
              isLoading: currentBundlesStatusLoading,
              isError: currentBundlesStatusError,
              error: currentBundlesStatusErrorDetail,
            },
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
          eyebrowVariant="info"
          title="Current sales Choice analysis"
          description="Refresh the saved current-month Humble Choice report that powers the Current sales Choice page.">
          {renderCurrentChoiceSummary(
            currentChoiceStatus,
            {
              isLoading: currentChoiceStatusLoading,
              isError: currentChoiceStatusError,
              error: currentChoiceStatusErrorDetail,
            },
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
          eyebrowVariant="warning"
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
              storageKey="humble.session.advancedOptions.rebuildLibraryArtifacts"
              summary="Advanced paths and model settings"
              hint="Change paths or class names only when you are rebuilding from non-default artifacts."
              onReset={resetLibraryArtifactOptions}>
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
          eyebrowVariant="neutral"
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
              storageKey="humble.session.advancedOptions.buildViewerSchema"
              summary="Advanced output path"
              hint="Change the destination only when you need to export the schema somewhere else."
              onReset={resetSchemaOptions}>
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
          eyebrowVariant="warning"
          title="Rebuild order models"
          note="Requires saved API batches in the artifacts directory and is best when you are regenerating the default shared model file."
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
              storageKey="humble.session.advancedOptions.rebuildOrderModels"
              summary="Advanced paths and class names"
              hint="Adjust these only when the saved API batches or model destination differ from the defaults."
              onReset={resetRebuildOrderOptions}>
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
          eyebrowVariant="warning"
          title="Generate order models"
          note="Requires an explicit API response directory input and is best when you are generating a model for a different source or output path."
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
              storageKey="humble.session.advancedOptions.generateOrderModels"
              summary="Advanced input and output paths"
              hint="Use these when you want to build a model from a different API batch location or output file."
              onReset={resetGenerateOrderOptions}>
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
          eyebrowVariant="info"
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
              storageKey="humble.session.advancedOptions.cacheSubproductPages"
              summary="Advanced cache scope"
              hint="Use filters only when you need a smaller or custom scrape target."
              onReset={resetCacheOptions}>
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
          eyebrowVariant="info"
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
              storageKey="humble.session.advancedOptions.extractSubproductMetadata"
              summary="Advanced metadata outputs"
              hint="Override these only when you want custom cache or report destinations."
              onReset={resetMetadataOptions}>
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
