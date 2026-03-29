/**
 * Setup route for running a capture with a session cookie.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { useLibraryStatus } from "../../data/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import { cn } from "../../lib/utils";

// Persists the last successful capture path for auto-load on refresh.
const STORAGE_KEY = "humble.libraryPath";

const parseList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Form for running a one-time library capture without storing credentials.
 */
export default function LibrarySetup() {
  const queryClient = useQueryClient();
  const { data: libraryStatus } = useLibraryStatus();
  const [mode, setMode] = usePersistentState<"capture" | "existing">(
    "humble.setup.mode",
    "capture",
  );
  const [authCookie, setAuthCookie] = useState("");
  const [outputPath, setOutputPath] = useState(
    () =>
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) ?? "" : "",
  );
  const [existingPath, setExistingPath] = useState(
    () =>
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) ?? "" : "",
  );
  const [downloadFiles, setDownloadFiles] = useState(false);
  const [platformsInput, setPlatformsInput] = usePersistentState(
    "humble.setup.platforms",
    "ebook, audio",
  );
  const [fileTypesInput, setFileTypesInput] = usePersistentState(
    "humble.setup.fileTypes",
    "",
  );
  const [sizePolicy, setSizePolicy] = usePersistentState(
    "humble.setup.sizePolicy",
    "all",
  );
  const [status, setStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<{
    path: string;
    total: number;
  } | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!libraryStatus) return;
    if (!outputPath) {
      setOutputPath(libraryStatus.default_save_dir || "");
    }
    if (!existingPath) {
      setExistingPath(libraryStatus.default_library_path || "");
    }
  }, [libraryStatus, outputPath, existingPath]);

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
    setMessage(
      `Loaded ${total} products. Viewer now points to ${path}.`,
    );
    setSuccessSummary({ path, total });
    setRedirectCountdown(5);
    localStorage.setItem(STORAGE_KEY, path);
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
      const response = await fetch("/api/library/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library_path: trimmedPath }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Failed to load library file.");
      }

      finishSuccess(payload.output_path, payload.total_products || 0);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to load library file.",
      );
    }
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

      {libraryStatus && !libraryStatus.exists && (
        <div className="rounded-lg border border-status-info/40 bg-status-info/10 p-4 text-sm text-status-info-foreground">
          No library file was found at
          <span className="mx-1 font-semibold text-foreground">
            {libraryStatus.current_path}
          </span>
          . Start a capture or select an existing file to continue.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-card/60">
          <CardHeader className="pb-2">
            <div>
              <Badge variant="neutral">Capture once</Badge>
            </div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Create a fresh library snapshot
            </h3>
            <p className="text-sm text-muted-foreground">
              Use your current `_simpleauth_sess` cookie to capture a new
              `library_products.json` and optionally download matching files.
            </p>
          </CardHeader>
        </Card>

        <Card className="bg-card/60">
          <CardHeader className="pb-2">
            <div>
              <Badge variant="success">Reuse existing data</Badge>
            </div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Point the viewer at a saved file
            </h3>
            <p className="text-sm text-muted-foreground">
              Switch quickly between previously captured libraries without
              rerunning the browser capture workflow.
            </p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label
          htmlFor="mode-capture"
          className={cn(
            "cursor-pointer rounded-lg border p-4 text-left transition",
            mode === "capture"
              ? "border-primary/60 bg-accent/40"
              : "border-border bg-card/60",
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
            mode === "existing"
              ? "border-primary/60 bg-accent/40"
              : "border-border bg-card/60",
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

      <Card className="bg-card/60">
        <CardHeader className="pb-4">
          <div>
            <Badge variant="neutral">Current workflow</Badge>
          </div>
          <h3 className="text-lg font-semibold text-card-foreground">
            {mode === "capture" ?
              "Capture a fresh library file"
            : "Load a previously captured library"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {mode === "capture" ?
              "Best for first-time setup, refreshing stale library data, or producing a new snapshot in another folder."
            : "Best for switching between saved snapshots or reopening a known-good library file without using your browser session again."
            }
          </p>
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
            <Input
              id="saveLocation"
              type="text"
              data-doc-id="setup-save-location"
              placeholder={
                libraryStatus?.default_save_dir || "C:\\path\\to\\Downloads"
              }
              value={outputPath}
              onChange={(event) => setOutputPath(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A folder path writes
              <span className="font-medium text-foreground">
                {" "}
                library_products.json
              </span>
              into that folder. You can also provide a full file path.
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
            <label htmlFor="downloadFiles" className="text-sm text-muted-foreground">
              Download files after capture (uses the download folder in
              <code className="ml-1 text-xs text-foreground">config.yaml</code>).
            </label>
          </div>

          {downloadFiles && (
            <Card className="rounded-lg bg-card/60">
              <CardContent className="grid gap-4 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-card-foreground">
                  Optional download scope
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                  Narrow the follow-up downloads only when you need a targeted
                  capture. Leaving the defaults broad keeps the workflow simple.
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
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            <div>
              <Badge variant="success">Next tools</Badge>
            </div>
            <h3 className="text-lg font-semibold text-status-success-foreground">
              Continue with maintenance or inspection
            </h3>
            <p className="text-sm text-status-success-foreground/90">
              {successSummary.total} products were loaded from
              <span className="mx-1 font-medium text-foreground">
                {successSummary.path}
              </span>
              and the viewer is ready for the next step.
            </p>
            <p className="text-xs text-status-success-foreground/80">
              {redirectCountdown === null
                ? "Automatic redirect paused."
                : `Redirecting to overview in ${redirectCountdown}s unless you choose a destination first.`}
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/commands">Open Command Center</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/structure">Open Schema</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/">Open Overview</Link>
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
