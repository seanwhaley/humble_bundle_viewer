/**
 * Setup route for running a capture with a session cookie.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useLibraryStatus } from "../../data/api";

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
  const [mode, setMode] = useState<"capture" | "existing">("capture");
  const [authCookie, setAuthCookie] = useState("");
  const [outputPath, setOutputPath] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? "",
  );
  const [existingPath, setExistingPath] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? "",
  );
  const [downloadFiles, setDownloadFiles] = useState(false);
  const [platformsInput, setPlatformsInput] = useState("ebook, audio");
  const [fileTypesInput, setFileTypesInput] = useState("");
  const [sizePolicy, setSizePolicy] = useState("all");
  const [status, setStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!libraryStatus) return;
    if (!outputPath) {
      setOutputPath(libraryStatus.default_save_dir || "");
    }
    if (!existingPath) {
      setExistingPath(libraryStatus.default_library_path || "");
    }
  }, [libraryStatus, outputPath, existingPath]);

  const finishSuccess = (path: string, total: number) => {
    setStatus("success");
    setMessage(
      `Loaded ${total} products. Viewer now points to ${path}. Refreshing...`,
    );
    localStorage.setItem(STORAGE_KEY, path);
    queryClient.invalidateQueries({ queryKey: ["library"] });
    queryClient.invalidateQueries({ queryKey: ["library-status"] });
    setTimeout(() => {
      window.location.assign("/");
    }, 800);
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
      setOutputPath(payload.output_path);
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
      setExistingPath(payload.output_path);
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
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm text-slate-200">
          No library file was found at
          <span className="mx-1 font-semibold text-white">
            {libraryStatus.current_path}
          </span>
          . Start a capture or select an existing file to continue.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
            Capture once
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-50">
            Create a fresh library snapshot
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            Use your current `_simpleauth_sess` cookie to capture a new
            `library_products.json` and optionally download matching files.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Reuse existing data
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-50">
            Point the viewer at a saved file
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            Switch quickly between previously captured libraries without
            rerunning the browser capture workflow.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Next tools
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-50">
            Continue with maintenance or inspection
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            After loading a library, jump to Command Center for refresh tasks or
            Schema to inspect the normalized data model.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/commands">Open Command Center</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/structure">Open Schema</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label
          htmlFor="mode-capture"
          className={`cursor-pointer rounded-lg border p-4 text-left transition ${
            mode === "capture" ?
              "border-indigo-500/60 bg-indigo-500/10"
            : "border-slate-800 bg-slate-950/60"
          }`}>
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
          <p className="mt-2 text-sm text-slate-300">
            Provide your session cookie and a save folder (defaults to your
            Downloads directory).
          </p>
        </label>

        <label
          htmlFor="mode-existing"
          className={`cursor-pointer rounded-lg border p-4 text-left transition ${
            mode === "existing" ?
              "border-indigo-500/60 bg-indigo-500/10"
            : "border-slate-800 bg-slate-950/60"
          }`}>
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
          <p className="mt-2 text-sm text-slate-300">
            Point the viewer at an existing library_products.json file on disk.
          </p>
        </label>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Current workflow
        </p>
        <h3 className="mt-2 text-lg font-semibold text-slate-50">
          {mode === "capture" ?
            "Capture a fresh library file"
          : "Load a previously captured library"}
        </h3>
        <p className="mt-2 text-sm text-slate-300">
          {mode === "capture" ?
            "Best for first-time setup, refreshing stale library data, or producing a new snapshot in another folder."
          : "Best for switching between saved snapshots or reopening a known-good library file without using your browser session again."
          }
        </p>
      </div>

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
            <p className="text-xs text-slate-400">
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
            <p className="text-xs text-slate-400">
              A folder path writes
              <span className="font-medium text-slate-200">
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
            <label htmlFor="downloadFiles" className="text-sm text-slate-300">
              Download files after capture (uses the download folder in
              <code className="ml-1 text-xs text-slate-200">config.yaml</code>).
            </label>
          </div>

          {downloadFiles && (
            <div className="grid gap-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Optional download scope
                </h3>
                <p className="mt-1 text-xs text-slate-400">
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
                <p className="text-xs text-slate-400">
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
                <p className="text-xs text-slate-400">
                  Optional comma-separated file extensions to download.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="sizePolicy" className="text-sm font-medium">
                  Size policy
                </label>
                <select
                  id="sizePolicy"
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={sizePolicy}
                  onChange={(event) => setSizePolicy(event.target.value)}>
                  <option value="all">Download all files</option>
                  <option value="smallest">Smallest per product</option>
                  <option value="largest">Largest per product</option>
                </select>
              </div>
            </div>
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
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/40 bg-rose-500/10 text-rose-200"
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
            <p className="text-xs text-slate-400">
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
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/40 bg-rose-500/10 text-rose-200"
              }`}>
              {message}
            </div>
          )}
        </form>
      }
    </div>
  );
}
