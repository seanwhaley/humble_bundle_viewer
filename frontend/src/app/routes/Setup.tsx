/**
 * Setup route for choosing a fresh capture or an existing library snapshot.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import PaneHeader from "../../components/ui/PaneHeader";
import ThemeSelect from "../../components/ui/ThemeSelect";
import { useLibraryStatus } from "../../data/api";
import {
  readStoredLibraryPath,
  selectLibraryPath,
  writeStoredLibraryPath,
} from "../../data/librarySelection";
import { usePersistentState } from "../../hooks/usePersistentState";
import { cn } from "../../lib/utils";
import { COMPACT_FORM_SELECT_CLASS } from "../../styles/roles";

// Persists the last successful capture path for auto-load on refresh.
const SETUP_MODE_STORAGE_KEY = "humble.setup.mode";
const SETUP_DOWNLOAD_PLATFORMS_STORAGE_KEY = "humble.setup.download.platforms";
const SETUP_DOWNLOAD_FILE_TYPES_STORAGE_KEY = "humble.setup.download.fileTypes";
const SETUP_DOWNLOAD_SIZE_POLICY_STORAGE_KEY =
  "humble.setup.download.sizePolicy";
const LEGACY_SETUP_DOWNLOAD_PLATFORMS_STORAGE_KEYS = ["humble.setup.platforms"];
const LEGACY_SETUP_DOWNLOAD_FILE_TYPES_STORAGE_KEYS = [
  "humble.setup.fileTypes",
];
const LEGACY_SETUP_DOWNLOAD_SIZE_POLICY_STORAGE_KEYS = [
  "humble.setup.sizePolicy",
];

const parseList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Form for running a one-time library capture without storing credentials.
 */
export default function Setup() {
  const queryClient = useQueryClient();
  const { data: libraryStatus } = useLibraryStatus();
  const [storedLibraryPath, setStoredLibraryPathState] = useState(
    () => readStoredLibraryPath() ?? "",
  );
  const [mode, setMode] = usePersistentState<"capture" | "existing">(
    SETUP_MODE_STORAGE_KEY,
    "capture",
  );
  const [authCookie, setAuthCookie] = useState("");
  const [outputPath, setOutputPath] = useState(() => storedLibraryPath);
  const [existingPath, setExistingPath] = useState(() => storedLibraryPath);
  const [downloadFiles, setDownloadFiles] = useState(false);
  const [platformsInput, setPlatformsInput] = usePersistentState(
    SETUP_DOWNLOAD_PLATFORMS_STORAGE_KEY,
    "ebook, audio",
    { legacyKeys: LEGACY_SETUP_DOWNLOAD_PLATFORMS_STORAGE_KEYS },
  );
  const [fileTypesInput, setFileTypesInput] = usePersistentState(
    SETUP_DOWNLOAD_FILE_TYPES_STORAGE_KEY,
    "",
    { legacyKeys: LEGACY_SETUP_DOWNLOAD_FILE_TYPES_STORAGE_KEYS },
  );
  const [sizePolicy, setSizePolicy] = usePersistentState(
    SETUP_DOWNLOAD_SIZE_POLICY_STORAGE_KEY,
    "all",
    { legacyKeys: LEGACY_SETUP_DOWNLOAD_SIZE_POLICY_STORAGE_KEYS },
  );
  const [status, setStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [isPickingSaveFolder, setIsPickingSaveFolder] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<{
    path: string;
    total: number;
  } | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
    null,
  );
  const hasStoredLibraryPath = storedLibraryPath.trim().length > 0;

  const setStoredLibraryPath = (value: string | null) => {
    writeStoredLibraryPath(value);
    setStoredLibraryPathState(value?.trim() ?? "");
  };

  useEffect(() => {
    if (!libraryStatus) return;
    if (
      !storedLibraryPath &&
      libraryStatus.exists &&
      libraryStatus.current_path
    ) {
      setStoredLibraryPath(libraryStatus.current_path);
      return;
    }
    if (!outputPath) {
      setOutputPath(libraryStatus.default_save_dir || "");
    }
    if (!existingPath) {
      setExistingPath(libraryStatus.default_library_path || "");
    }
  }, [libraryStatus, outputPath, existingPath, storedLibraryPath]);

  useEffect(() => {
    if (status !== "success" || redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      window.location.assign("/");
      return;
    }

    const timeout = window.setTimeout(() => {
      setRedirectCountdown((current) =>
        current === null ? null : Math.max(0, current - 1),
      );
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [redirectCountdown, status]);

  const finishSuccess = (path: string, total: number) => {
    setStatus("success");
    setMessage(`Loaded ${total} products. Viewer now points to ${path}.`);
    setSuccessSummary({ path, total });
    setRedirectCountdown(5);
    setStoredLibraryPath(path);
    queryClient.invalidateQueries({ queryKey: ["library"] });
    queryClient.invalidateQueries({ queryKey: ["library-status"] });
    setOutputPath(path);
    setExistingPath(path);
  };

  /**
   * Trigger the backend capture and persist the chosen output path.
   */
  const handleCapture = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedCookie = authCookie.trim();
    const trimmedPath = outputPath.trim();

    if (!trimmedCookie) {
      setStatus("error");
      setMessage("Enter your session cookie before running the capture.");
      return;
    }

    if (!trimmedPath) {
      setStatus("error");
      setMessage("Provide a save folder for library_products.json.");
      return;
    }

    setStatus("running");
    setMessage(null);
    setSuccessSummary(null);
    setRedirectCountdown(null);

    try {
      const platforms = parseList(platformsInput);
      const fileTypes = parseList(fileTypesInput);
      const response = await fetch("/api/library/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_cookie: trimmedCookie,
          output_path: trimmedPath,
          download_files: downloadFiles,
          platforms: platforms.length ? platforms : null,
          file_types: fileTypes.length ? fileTypes : null,
          size_policy: sizePolicy,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Library capture failed.");
      }

      finishSuccess(payload.output_path, payload.total_products || 0);
      setAuthCookie("");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Library capture failed.",
      );
    }
  };

  const handleSelect = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedPath = existingPath.trim();
    if (!trimmedPath) {
      setStatus("error");
      setMessage("Provide the path to an existing library file.");
      return;
    }

    setStatus("running");
    setMessage(null);
    setSuccessSummary(null);
    setRedirectCountdown(null);

    try {
      const payload = await selectLibraryPath(trimmedPath);
      finishSuccess(payload.output_path, payload.total_products || 0);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to load library file.",
      );
    }
  };

  const handleBrowseSaveFolder = async () => {
    setMessage(null);

    try {
      setIsPickingSaveFolder(true);
      const response = await fetch("/api/library/pick-save-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initial_path:
            outputPath.trim() || libraryStatus?.default_save_dir || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Could not open the folder picker.");
      }

      if (
        typeof payload?.selected_path === "string" &&
        payload.selected_path.trim()
      ) {
        setOutputPath(payload.selected_path);
        if (status === "error") {
          setStatus("idle");
        }
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ?
          error.message
        : "Could not open the folder picker.",
      );
    } finally {
      setIsPickingSaveFolder(false);
    }
  };

  const handleSelectSaveFolder = async () => {
    setMode("capture");
    await handleBrowseSaveFolder();
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Choose a library workflow
        </h2>
        <p className="text-muted-foreground">
          Start a fresh capture or switch the viewer to an existing
          `library_products.json`. Session cookies are used only for the capture
          run and are never stored.
        </p>
      </div>

      <Card surface="panel" radius="compact">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div>
              <Badge variant="surface" size="compact" casing="ui">
                Viewer preference
              </Badge>
            </div>
            <h3 className="text-sm font-semibold text-card-foreground">
              Theme selection
            </h3>
            <p className="text-sm text-muted-foreground">
              Change the viewer theme here instead of from every route header.
            </p>
          </div>
          <div className="shrink-0 self-start sm:self-center">
            <ThemeSelect />
          </div>
        </CardContent>
      </Card>

      {libraryStatus && !libraryStatus.exists && (
        <div className="rounded-lg border border-status-info/40 bg-status-info/10 p-4 text-sm text-status-info-foreground">
          No library file was found at
          <span className="mx-1 font-semibold text-foreground">
            {libraryStatus.current_path}
          </span>
          . Start a capture or select an existing file to continue.
        </div>
      )}

      {hasStoredLibraryPath ?
        <Card surface="panel">
          <CardContent className="space-y-3 p-4">
            <div>
              <Badge variant={libraryStatus?.exists ? "success" : "info"}>
                Last used
              </Badge>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-card-foreground">
                Last used library
              </h3>
              <p className="break-all text-sm text-muted-foreground">
                {storedLibraryPath}
              </p>
              <p className="text-xs text-muted-foreground">
                Choose a workflow below to refresh this snapshot or switch to a
                different saved file.
              </p>
            </div>
          </CardContent>
        </Card>
      : <div className="grid gap-4 xl:grid-cols-2">
          <Card surface="panel">
            <CardHeader className="pb-2">
              <PaneHeader
                title="Create a fresh library snapshot"
                description="Use your current `_simpleauth_sess` cookie to capture a new `library_products.json` and optionally download matching files."
                eyebrow={<Badge variant="neutral">Capture once</Badge>}
              />
            </CardHeader>
          </Card>

          <Card surface="panel">
            <CardHeader className="pb-2">
              <PaneHeader
                title="Point the viewer at a saved file"
                description="Switch quickly between previously captured libraries without rerunning the browser capture workflow."
                eyebrow={<Badge variant="success">Reuse existing data</Badge>}
              />
            </CardHeader>
          </Card>
        </div>
      }

      <div className="grid gap-4 lg:grid-cols-2">
        <label
          htmlFor="mode-capture"
          className={cn(
            "cursor-pointer rounded-lg border p-4 text-left transition",
            mode === "capture" ?
              "border-primary/60 bg-accent/40"
            : "border-border bg-surface-panel",
          )}>
          <div className="flex items-center gap-2">
            <input
              id="mode-capture"
              type="radio"
              name="setup-mode"
              checked={mode === "capture"}
              onChange={() => setMode("capture")}
            />
            <span className="font-semibold">Capture new library</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Provide your session cookie and a save folder (defaults to your
            Downloads directory).
          </p>
        </label>

        <label
          htmlFor="mode-existing"
          className={cn(
            "cursor-pointer rounded-lg border p-4 text-left transition",
            mode === "existing" ?
              "border-primary/60 bg-accent/40"
            : "border-border bg-surface-panel",
          )}>
          <div className="flex items-center gap-2">
            <input
              id="mode-existing"
              type="radio"
              name="setup-mode"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
            />
            <span className="font-semibold">Use existing library file</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Point the viewer at an existing library_products.json file on disk.
          </p>
        </label>
      </div>

      <Card surface="panel">
        <CardHeader className="pb-4">
          <PaneHeader
            title={
              mode === "capture" ?
                "Capture a fresh library file"
              : "Load a previously captured library"
            }
            description={
              mode === "capture" ?
                "Best for first-time setup, refreshing stale library data, or producing a new snapshot in another folder."
              : "Best for switching between saved snapshots or reopening a known-good library file without using your browser session again."
            }
            eyebrow={<Badge variant="neutral">Current workflow</Badge>}
            footer={
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={status === "running" || isPickingSaveFolder}
                  onClick={() => {
                    void handleSelectSaveFolder();
                  }}>
                  {isPickingSaveFolder && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Select folder…
                </Button>
                {mode !== "capture" && (
                  <p className="text-xs text-muted-foreground">
                    Switches back to capture mode so you can choose where the
                    next library snapshot will be saved.
                  </p>
                )}
              </div>
            }
          />
        </CardHeader>
      </Card>

      {mode === "capture" ?
        <form onSubmit={handleCapture} className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <label htmlFor="sessionCookie" className="text-sm font-medium">
              Session Cookie
            </label>
            <Input
              id="sessionCookie"
              type="password"
              placeholder="_simpleauth_sess value"
              value={authCookie}
              onChange={(event) => setAuthCookie(event.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Grab the <code className="text-xs">_simpleauth_sess</code> cookie
              from the Humble Bundle session you want to capture.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="saveLocation" className="text-sm font-medium">
              Save Folder
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="saveLocation"
                type="text"
                data-doc-id="setup-save-location"
                placeholder={
                  libraryStatus?.default_save_dir || "C:\\path\\to\\Downloads"
                }
                value={outputPath}
                onChange={(event) => setOutputPath(event.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                className="sm:self-start"
                disabled={status === "running" || isPickingSaveFolder}
                onClick={handleBrowseSaveFolder}>
                {isPickingSaveFolder && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Select folder…
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A folder path writes
              <span className="font-medium text-foreground">
                {" "}
                library_products.json
              </span>
              into that folder. Use Select folder to open the local folder
              picker, or enter a full file path manually.
            </p>
          </div>

          <div className="flex items-start gap-2">
            <input
              id="downloadFiles"
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={downloadFiles}
              onChange={(event) => setDownloadFiles(event.target.checked)}
            />
            <label
              htmlFor="downloadFiles"
              className="text-sm text-muted-foreground">
              Download files after capture (uses the download folder in
              <code className="ml-1 text-xs text-foreground">config.yaml</code>
              ).
            </label>
          </div>

          {downloadFiles && (
            <Card surface="panel" radius="compact">
              <CardContent className="grid gap-4 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-card-foreground">
                    Optional download scope
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Narrow the follow-up downloads only when you need a targeted
                    capture. Leaving the defaults broad keeps the workflow
                    simple.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Platforms</label>
                  <Input
                    value={platformsInput}
                    onChange={(event) => setPlatformsInput(event.target.value)}
                    placeholder="ebook, audio"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated platforms (example: ebook, audio).
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">File types</label>
                  <Input
                    value={fileTypesInput}
                    onChange={(event) => setFileTypesInput(event.target.value)}
                    placeholder="pdf, epub, mp3"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional comma-separated file extensions to download.
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="sizePolicy" className="text-sm font-medium">
                    Size policy
                  </label>
                  <select
                    id="sizePolicy"
                    className={
                      COMPACT_FORM_SELECT_CLASS + " h-10 w-full px-3 text-sm"
                    }
                    value={sizePolicy}
                    onChange={(event) => setSizePolicy(event.target.value)}>
                    <option value="all">Download all files</option>
                    <option value="smallest">Smallest per product</option>
                    <option value="largest">Largest per product</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

          <Button type="submit" disabled={status === "running"}>
            {status === "running" && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Run capture now
          </Button>

          {message && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                status === "success" ?
                  "border-status-success/40 bg-status-success/10 text-status-success-foreground"
                : "border-status-error/40 bg-status-error/10 text-status-error-foreground"
              }`}>
              {message}
            </div>
          )}
        </form>
      : <form onSubmit={handleSelect} className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <label htmlFor="existingPath" className="text-sm font-medium">
              Library file path
            </label>
            <Input
              id="existingPath"
              type="text"
              data-doc-id="setup-existing-path"
              placeholder="C:\\path\\to\\library_products.json"
              value={existingPath}
              onChange={(event) => setExistingPath(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Point to an existing file downloaded previously.
            </p>
          </div>

          <Button type="submit" disabled={status === "running"}>
            {status === "running" && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Load selected library
          </Button>

          {message && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                status === "success" ?
                  "border-status-success/40 bg-status-success/10 text-status-success-foreground"
                : "border-status-error/40 bg-status-error/10 text-status-error-foreground"
              }`}>
              {message}
            </div>
          )}
        </form>
      }

      {successSummary && (
        <Card className="max-w-3xl border-status-success/40 bg-status-success/10">
          <CardHeader className="pb-4">
            <PaneHeader
              title="Continue with maintenance or inspection"
              titleClassName="text-lg text-status-success-foreground"
              note={
                <>
                  {successSummary.total} products were loaded from
                  <span className="mx-1 font-medium text-foreground">
                    {successSummary.path}
                  </span>
                  and the viewer is ready for the next step.
                </>
              }
              noteClassName="text-sm font-normal text-status-success-foreground/90"
              description={
                redirectCountdown === null ?
                  "Automatic redirect paused."
                : `Redirecting to Home in ${redirectCountdown}s unless you choose a destination first.`
              }
              descriptionClassName="text-xs text-status-success-foreground/80"
              eyebrow={<Badge variant="success">Next tools</Badge>}
            />
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/command-center">Open Command Center</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/schema">Open Schema</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/">Open Home</Link>
            </Button>
            {redirectCountdown !== null && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRedirectCountdown(null)}>
                Stay here
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
