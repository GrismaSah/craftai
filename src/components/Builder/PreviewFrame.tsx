"use client";

import { useEffect, useRef, useState } from "react";
import { FileItem } from "@/types/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebContainerInstance = any;

type MountEntry =
  | { file: { contents: string } }
  | { directory: Record<string, MountEntry> };

interface PreviewFrameProps {
  webContainer: WebContainerInstance;
  files: FileItem[];
  loading?: boolean;
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function findFileByPath(files: FileItem[], path: string): FileItem | undefined {
  for (const f of files) {
    if (f.path === path) return f;
    if (f.children) {
      const found = findFileByPath(f.children, path);
      if (found) return found;
    }
  }
}

function buildFileMap(files: FileItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  function walk(items: FileItem[]) {
    for (const item of items) {
      if (item.type === "file" && item.path) {
        map[item.path] = item.content || "";
      }
      if (item.children) walk(item.children);
    }
  }
  walk(files);
  return map;
}

export function PreviewFrame({
  webContainer,
  files,
  loading = false,
}: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string>("");

  const serverStartedRef = useRef(false);
  const prevPkgHashRef = useRef<string | null>(null);
  const prevFilesJsonRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverReadyHandlerRef = useRef<((port: number, url: string) => void) | null>(null);

  async function processFiles(cancel: { value: boolean }) {
    if (cancel.value) return;

    const pkgFile = findFileByPath(files, "/package.json");
    const currentPkgHash = pkgFile ? simpleHash(pkgFile.content || "") : null;
    const wasStarted = serverStartedRef.current;
    const pkgChanged =
      currentPkgHash != null && currentPkgHash !== prevPkgHashRef.current;

    if (!wasStarted || pkgChanged) {
      if (!pkgFile) {
        setError("Project is missing a package.json — cannot start preview");
        setStatus("error");
        return;
      }
      await mountFiles(files);
      if (cancel.value) return;
      await new Promise((r) => setTimeout(r, 500));
      if (cancel.value) return;
      await bootServer(cancel);
      serverStartedRef.current = true;
      prevPkgHashRef.current = currentPkgHash;
    } else {
      const prevFiles = prevFilesJsonRef.current
        ? JSON.parse(prevFilesJsonRef.current)
        : [];
      await writeIncremental(prevFiles, files, cancel);
    }

    prevFilesJsonRef.current = JSON.stringify(files);
  }

  async function mountFiles(files: FileItem[]) {
    const mountStructure = createMountStructure(files);
    await webContainer.mount(mountStructure);
  }

  async function writeIncremental(
    oldFiles: FileItem[],
    newFiles: FileItem[],
    cancel: { value: boolean }
  ) {
    const oldMap = buildFileMap(oldFiles);
    const newMap = buildFileMap(newFiles);
    let writeFailed = false;

    for (const [path, content] of Object.entries(newMap)) {
      if (cancel.value) return;
      if (oldMap[path] === content) continue;

      const dir = path.substring(0, path.lastIndexOf("/"));
      if (dir) {
        try {
          await webContainer.fs.mkdir(dir, { recursive: true });
        } catch {
          /* dir may already exist */
        }
      }
      try {
        await webContainer.fs.writeFile(path, content);
      } catch {
        writeFailed = true;
      }
    }

    if (!writeFailed) {
      for (const path of Object.keys(oldMap)) {
        if (cancel.value) return;
        if (!(path in newMap)) {
          try {
            await webContainer.fs.rm(path);
          } catch {
            /* file may already be gone */
          }
        }
      }
    } else {
      serverStartedRef.current = false;
      prevPkgHashRef.current = null;
      await mountFiles(newFiles);
    }
  }

  function createMountStructure(files: FileItem[]): Record<string, MountEntry> {
    const processFile = (file: FileItem): MountEntry => {
      if (file.type === "folder") {
        return {
          directory: file.children
            ? Object.fromEntries(
                file.children.map((child) => [
                  child.name,
                  processFile(child),
                ])
              )
            : {},
        };
      }

      return { file: { contents: file.content || "" } };
    };

    return Object.fromEntries(
      files.map((file) => [file.name, processFile(file)])
    );
  }

  async function waitForFile(
    paths: string[],
    cancel: { value: boolean },
    timeoutMs = 10000
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (cancel.value) return false;
      for (const p of paths) {
        try {
          await webContainer.fs.readFile(p, "utf-8");
          return true;
        } catch {
          /* try next path */
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  async function bootServer(cancel: { value: boolean }) {
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        setStatus("loading");
        setError(null);

        serverStartedRef.current = false;

        // if (serverReadyHandlerRef.current) {
        //   webContainer.off("server-ready", serverReadyHandlerRef.current);
        // }

        const handler = (port: number, url: string) => {
          if (cancel.value) return;
          serverStartedRef.current = true;
          setUrl(url);
          setStatus("ready");
        };
        serverReadyHandlerRef.current = handler;
        webContainer.on("server-ready", handler);

        const hasPkg = await waitForFile(
          ["/package.json", "package.json"],
          cancel
        );
        if (cancel.value) return;
        if (!hasPkg) throw new Error("No package.json found");

        console.log("[preview] Running pnpm install...");

const installProcess = await webContainer.spawn("npm", ["install"]);

let installLogs = "";

installProcess.output.pipeTo(
  new WritableStream({
    write(data) {
      installLogs += data;
      console.log("[pnpm]", data);
    },
  })
);

const installExit = await installProcess.exit;

console.log("========== PNPM OUTPUT ==========");
console.log(installLogs);
console.log("================================");

if (cancel.value) return;

if (installExit !== 0) {
  console.error("Install exited:", installExit);
  console.error("Install logs:");
  console.error(installLogs);

  throw new Error(`pnpm install failed with exit code ${installExit}`);
}

        console.log("[preview] Starting dev server with pnpm run dev...");
        const devProcess = await webContainer.spawn("npm", ["run", "dev"]);
        devProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              console.log("[dev server]", data);
            },
          })
        );

        devProcess.exit.then((code: number) => {
          if (cancel.value) return;
          if (code !== 0 && !serverStartedRef.current) {
            console.error("[preview] Dev server exited with code:", code);
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
          console.log(`[preview] Retrying (${retries}/${maxRetries})...`);
          await new Promise((r) => setTimeout(r, 1000));
          if (cancel.value) return;
        } else {
          setError(
            err instanceof Error ? err.message : "Failed to setup preview"
          );
          setStatus("error");
          return;
        }
      }
    }
  }

  useEffect(() => {
    if (!webContainer || files.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const cancel = { value: false };

    debounceRef.current = setTimeout(async () => {
      if (cancel.value) return;
      await processFiles(cancel);
    }, 800);

    return () => {
      cancel.value = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webContainer, files]);

  if (loading || status === "loading") {
    return (
      <div className="h-full flex items-center justify-center rounded-2xl border border-white/[0.06] bg-[#111]">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#ff8a5c] border-t-transparent" />
          <p className="text-sm text-[#888]">
            {loading ? "Building preview..." : "Starting preview server..."}
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="h-full flex items-center justify-center rounded-2xl border border-white/[0.06] bg-[#111] p-8">
        <div className="text-center max-w-md">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-5 h-5 text-red-400"
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
          <p className="font-medium text-[#ccc] text-sm">Preview unavailable</p>
          <p className="text-xs text-[#888] mt-1.5">
            {error || "Something went wrong."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full rounded-2xl overflow-hidden border border-white/[0.06] bg-[#111]">
      {url ? (
        <iframe
          ref={iframeRef}
          src={url}
          className="w-full h-full"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      ) : (
        <div className="h-full flex items-center justify-center text-[#666] text-sm">
          Waiting for server...
        </div>
      )}
    </div>
  );
}
