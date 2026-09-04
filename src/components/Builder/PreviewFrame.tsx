"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Unsubscribe,
  WebContainer,
  WebContainerProcess,
} from "@webcontainer/api";
import { buildFileMap, findFileByPath } from "@/lib/fileTree";
import { FileItem } from "@/types/types";

type MountEntry =
  | { file: { contents: string } }
  | { directory: Record<string, MountEntry> };

interface PreviewFrameProps {
  webContainer: WebContainer | null;
  files: FileItem[];
  /** True while a generation is in flight. Nothing is mounted or installed until it clears. */
  streaming?: boolean;
  loading?: boolean;
}

/** Built without a literal ESC so `no-control-regex` has nothing to complain about. */
const ANSI_ESCAPE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "g"
);

/** npm and Vite both paint with ANSI and \r; we only want the last human-readable line. */
function lastLine(chunk: string): string | null {
  const lines = chunk
    .replace(ANSI_ESCAPE, "")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const line = lines[lines.length - 1];
  return line ? line.slice(0, 200) : null;
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

export function PreviewFrame({
  webContainer,
  files,
  streaming = false,
  loading = false,
}: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string>("");
  /** Latest line of install/dev-server output, so a stalled install is visible in the UI. */
  const [progress, setProgress] = useState<string>("");
  /** Tail of the install log, shown only when something failed. */
  const [errorLog, setErrorLog] = useState<string[]>([]);
  /**
   * package.json in the tree no longer matches the one node_modules was installed from.
   * Reinstalling is a deliberate click rather than an automatic reaction: the editor is
   * writable now, and auto-reacting would fire a full remount + `npm install` on every
   * keystroke typed into package.json.
   */
  const [depsStale, setDepsStale] = useState(false);
  const [reinstallNonce, setReinstallNonce] = useState(0);

  const serverStartedRef = useRef(false);
  const prevPkgHashRef = useRef<string | null>(null);
  const prevFilesJsonRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // WebContainer has no `off()`; `on()` hands back an unsubscribe function instead.
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  // The container is a singleton, so a second `npm run dev` would race the first for the port.
  const devProcessRef = useRef<WebContainerProcess | null>(null);
  const progressThrottleRef = useRef(0);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  /** Rate-limited: npm paints a progress bar many times a second. */
  function pushProgress(chunk: string) {
    // Once the server is up the overlay is gone; re-rendering for every HMR line is waste.
    if (serverStartedRef.current) return;
    const line = lastLine(chunk);
    if (!line) return;
    const now = Date.now();
    if (now - progressThrottleRef.current < 120) return;
    progressThrottleRef.current = now;
    setProgress(line);
  }

  async function processFiles(container: WebContainer, cancel: { value: boolean }) {
    if (cancel.value) return;

    const pkgFile = findFileByPath(files, "/package.json");
    const currentPkgHash = pkgFile ? simpleHash(pkgFile.content || "") : null;
    const wasStarted = serverStartedRef.current;

    if (!wasStarted) {
      if (!pkgFile) {
        setError("Project is missing a package.json — cannot start preview");
        setStatus("error");
        return;
      }
      await mountFiles(container, files);
      if (cancel.value) return;
      await new Promise((r) => setTimeout(r, 500));
      if (cancel.value) return;
      await bootServer(container, cancel);
      if (cancel.value) return;
      serverStartedRef.current = true;
      prevPkgHashRef.current = currentPkgHash;
      setDepsStale(false);
    } else {
      const prevFiles: FileItem[] = prevFilesJsonRef.current
        ? JSON.parse(prevFilesJsonRef.current)
        : [];
      const wrote = await writeIncremental(container, prevFiles, files, cancel);
      if (cancel.value) return;

      if (!wrote) {
        // The container fs is now out of sync with the tree. Remounting alone is not
        // enough — without restarting the dev server the preview stays dead for good.
        await mountFiles(container, files);
        if (cancel.value) return;
        await bootServer(container, cancel);
        if (cancel.value) return;
        serverStartedRef.current = true;
        prevPkgHashRef.current = currentPkgHash;
        setDepsStale(false);
      } else {
        setDepsStale(
          currentPkgHash != null && currentPkgHash !== prevPkgHashRef.current
        );
      }
    }

    prevFilesJsonRef.current = JSON.stringify(files);
  }

  async function mountFiles(container: WebContainer, items: FileItem[]) {
    await container.mount(createMountStructure(items));
  }

  /** Returns false when a write failed and the container needs a full remount + reboot. */
  async function writeIncremental(
    container: WebContainer,
    oldFiles: FileItem[],
    newFiles: FileItem[],
    cancel: { value: boolean }
  ): Promise<boolean> {
    const oldMap = buildFileMap(oldFiles);
    const newMap = buildFileMap(newFiles);

    for (const [path, content] of Object.entries(newMap)) {
      if (cancel.value) return true;
      if (oldMap[path] === content) continue;

      const dir = path.substring(0, path.lastIndexOf("/"));
      if (dir) {
        try {
          await container.fs.mkdir(dir, { recursive: true });
        } catch {
          /* dir may already exist */
        }
      }
      try {
        await container.fs.writeFile(path, content);
      } catch {
        serverStartedRef.current = false;
        prevPkgHashRef.current = null;
        return false;
      }
    }

    for (const path of Object.keys(oldMap)) {
      if (cancel.value) return true;
      if (!(path in newMap)) {
        try {
          await container.fs.rm(path);
        } catch {
          /* file may already be gone */
        }
      }
    }
    return true;
  }

  function createMountStructure(items: FileItem[]): Record<string, MountEntry> {
    const processFile = (file: FileItem): MountEntry => {
      if (file.type === "folder") {
        return {
          directory: file.children
            ? Object.fromEntries(
                file.children.map((child) => [child.name, processFile(child)])
              )
            : {},
        };
      }
      return { file: { contents: file.content || "" } };
    };

    return Object.fromEntries(items.map((file) => [file.name, processFile(file)]));
  }

  async function waitForFile(
    container: WebContainer,
    paths: string[],
    cancel: { value: boolean },
    timeoutMs = 10000
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (cancel.value) return false;
      for (const p of paths) {
        try {
          await container.fs.readFile(p, "utf-8");
          return true;
        } catch {
          /* try next path */
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  async function bootServer(container: WebContainer, cancel: { value: boolean }) {
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        setStatus("loading");
        setError(null);
        setErrorLog([]);

        serverStartedRef.current = false;

        // Drop the previous subscription first: bootServer can run again on retry or on a
        // reinstall, and each `on()` adds an independent listener.
        unsubscribeRef.current?.();
        unsubscribeRef.current = container.on("server-ready", (_port, readyUrl) => {
          if (cancel.value) return;
          serverStartedRef.current = true;
          setUrl(readyUrl);
          setProgress("");
          setStatus("ready");
        });

        const hasPkg = await waitForFile(
          container,
          ["/package.json", "package.json"],
          cancel
        );
        if (cancel.value) return;
        if (!hasPkg) throw new Error("No package.json found");

        setProgress("Installing dependencies...");

        const installProcess = await container.spawn("npm", ["install"]);
        const installLogs: string[] = [];
        installProcess.output
          .pipeTo(
            new WritableStream({
              write(data) {
                installLogs.push(data);
                if (installLogs.length > 200) installLogs.shift();
                pushProgress(data);
              },
            })
          )
          .catch(() => {
            /* the stream closes with the process; nothing to recover */
          });

        const installExit = await installProcess.exit;
        if (cancel.value) return;

        if (installExit !== 0) {
          setErrorLog(tail(installLogs));
          throw new Error(`npm install failed with exit code ${installExit}`);
        }

        setProgress("Starting dev server...");

        // A previous dev server is still alive inside the singleton container; leaving it
        // running means two Vite processes fighting over the same port.
        try {
          devProcessRef.current?.kill();
        } catch {
          /* already exited */
        }

        const devProcess = await container.spawn("npm", ["run", "dev"]);
        devProcessRef.current = devProcess;
        const devLogs: string[] = [];
        devProcess.output
          .pipeTo(
            new WritableStream({
              write(data) {
                devLogs.push(data);
                if (devLogs.length > 200) devLogs.shift();
                pushProgress(data);
              },
            })
          )
          .catch(() => {
            /* the stream closes with the process; nothing to recover */
          });

        void devProcess.exit.then((code: number) => {
          if (cancel.value) return;
          if (code !== 0 && !serverStartedRef.current) {
            setErrorLog(tail(devLogs));
            setError(`Dev server exited with code ${code}`);
            setStatus("error");
          }
        });

        return;
      } catch (err) {
        console.error("Preview setup error:", err);
        if (cancel.value) return;

        if (retries < maxRetries) {
          retries++;
          setProgress(`Retrying (${retries}/${maxRetries})...`);
          await new Promise((r) => setTimeout(r, 1000));
          if (cancel.value) return;
        } else {
          setError(err instanceof Error ? err.message : "Failed to setup preview");
          setStatus("error");
          setProgress("");
          return;
        }
      }
    }
  }

  const handleReinstall = useCallback(() => {
    serverStartedRef.current = false;
    prevPkgHashRef.current = null;
    setDepsStale(false);
    setReinstallNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!webContainer || files.length === 0) return;
    // Never mount a half-written tree. Without this the debounce would fire on any pause
    // in the stream and run `npm install` against an incomplete package.json.
    if (streaming) return;
    if (files.some((f) => hasStreamingFile(f))) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const cancel = { value: false };

    debounceRef.current = setTimeout(() => {
      if (cancel.value) return;
      void processFiles(webContainer, cancel);
    }, 300);

    return () => {
      cancel.value = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webContainer, files, streaming, reinstallNonce]);

  const busy = loading || streaming || status === "loading" || status === "idle";
  const overlay = busy || status === "error";

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111]">
      {/*
        The iframe is never torn down for a status change — only covered. Unmounting it
        reloads the running app and throws away whatever state the user had in it.
      */}
      {url ? (
        <iframe
          ref={iframeRef}
          src={url}
          className="h-full w-full"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      ) : (
        !overlay && (
          <div className="flex h-full items-center justify-center text-sm text-[#666]">
            Waiting for server...
          </div>
        )
      )}

      {depsStale && !overlay && (
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-[#ff8a5c]/20 bg-[#111]/95 px-4 py-2 backdrop-blur-sm">
          <span className="min-w-0 flex-1 truncate text-xs text-[#999]">
            package.json changed since the last install.
          </span>
          <button
            type="button"
            onClick={handleReinstall}
            className="shrink-0 rounded-lg bg-[#ff8a5c] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#e87345]"
          >
            Reinstall dependencies
          </button>
        </div>
      )}

      {overlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#111] p-8">
          {status === "error" && !busy ? (
            <div className="max-w-md text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <svg
                  className="h-5 w-5 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#ccc]">Preview unavailable</p>
              <p className="mt-1.5 text-xs text-[#888]">
                {error || "Something went wrong."}
              </p>
              {errorLog.length > 0 && (
                <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-3 text-left text-[11px] leading-relaxed text-[#777]">
                  {errorLog.join("")}
                </pre>
              )}
              <button
                type="button"
                onClick={handleReinstall}
                className="mt-4 rounded-lg bg-[#ff8a5c] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#e87345]"
              >
                Retry install
              </button>
            </div>
          ) : (
            <div className="w-full max-w-md text-center">
              <div className="flex items-center justify-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#ff8a5c] border-t-transparent" />
                <p className="text-sm text-[#888]">
                  {streaming || loading
                    ? "Generating project..."
                    : "Starting preview server..."}
                </p>
              </div>
              {!streaming && !loading && progress && (
                <p className="mx-auto mt-3 max-w-full truncate font-mono text-[11px] text-[#666]">
                  {progress}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Last few chunks of a process log — enough to see the real error, not a wall of text. */
function tail(chunks: string[]): string[] {
  return chunks.slice(-25);
}

/** Belt-and-braces guard in case `streaming` is ever threaded through wrong. */
function hasStreamingFile(item: FileItem): boolean {
  if (item.type === "file") return item.status === "streaming";
  return item.children?.some(hasStreamingFile) ?? false;
}
