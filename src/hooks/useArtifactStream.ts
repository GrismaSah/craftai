"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArtifactEvent } from "@/lib/artifactParser";
import { applyEvents, upsertFile, type PatchFailureReport } from "@/lib/fileTree";
import type { FileItem } from "@/types/types";

/**
 * Coalescing window for incoming artifact events.
 *
 * Applying every event immediately would call setFiles once per token, re-rendering Monaco
 * and the whole explorer hundreds of times during a single generation. Batching on a short
 * timer keeps the tree visibly live while collapsing a burst into one render.
 */
const FLUSH_MS = 50;

export interface ArtifactStreamState {
  files: FileItem[];
  /** True from the first byte of a generation until the stream settles. */
  streaming: boolean;
  /** Set when a response was cut off mid-artifact and continuation did not recover it. */
  truncated: boolean;
  /** Queues events for the next flush. */
  ingest: (events: ArtifactEvent[]) => void;
  /** Applies events immediately — for complete, non-streamed input like the starter blob. */
  ingestSync: (events: ArtifactEvent[]) => void;
  /**
   * Drains the queue synchronously and hands back every patch failure seen since the
   * last drain.
   *
   * Failures are returned rather than exposed as state on purpose. The final batch of a
   * generation is flushed by the effect below, which fires when `streaming` flips false —
   * i.e. after `setStreaming(false)` in the caller's `finally`. A caller reading failures
   * from React state at that point reads one render too early and always sees nothing.
   * Returning them from the call sidesteps React's timing entirely.
   */
  flushNow: () => PatchFailureReport[];
  /**
   * The tree as of the last applied batch, read straight from the mirror.
   *
   * Same timing problem as `flushNow`, same answer: a caller acting on the result of
   * `flushNow` is between a `setFiles` and its render, so the `files` value it closed
   * over is one batch stale. The patch-recovery prompt attaches file *contents*, and
   * attaching stale ones would send the model a version of the file that no longer
   * exists — exactly the mistake the recovery is there to correct.
   */
  getFiles: () => FileItem[];
  /**
   * Replaces a file's content from outside the artifact stream — the code editor.
   * Deliberately not routed through `ingest`: a hand edit is not a model event, and
   * faking one would put a lie in the provenance of an *artifact* stream.
   */
  writeFile: (path: string, content: string) => void;
  setStreaming: (value: boolean) => void;
  setTruncated: (value: boolean) => void;
  reset: () => void;
  /**
   * Replaces the tree wholesale with an already-complete set of files — a
   * restored snapshot, not a live event stream. Bypasses the coalescing queue
   * entirely, same as `reset`, since there is nothing to batch.
   */
  hydrate: (files: FileItem[]) => void;
}

export function useArtifactStream(): ArtifactStreamState {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const pending = useRef<ArtifactEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  /**
   * Mirror of the tree, held outside React.
   *
   * The fold used to run inside the `setFiles` updater, which is no longer tenable: it
   * now yields patch failures that must be collected exactly once, and React may invoke
   * an updater twice under StrictMode. Every mutation therefore folds against this ref
   * and calls `setFiles` with a plain value. Anything that changes the tree MUST go
   * through here — a single write that skips it leaves the mirror stale and the next
   * patch is applied against content the user is no longer looking at.
   */
  const treeRef = useRef<FileItem[]>([]);
  const failuresRef = useRef<PatchFailureReport[]>([]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const applyBatch = useCallback((batch: ArtifactEvent[]) => {
    const { files: next, failures } = applyEvents(treeRef.current, batch);
    treeRef.current = next;
    setFiles(next);
    if (failures.length) failuresRef.current.push(...failures);
  }, []);

  const flush = useCallback(() => {
    timer.current = null;
    if (!pending.current.length || !mounted.current) return;
    const batch = pending.current;
    pending.current = [];
    applyBatch(batch);
  }, [applyBatch]);

  const ingest = useCallback(
    (events: ArtifactEvent[]) => {
      if (!events.length) return;
      pending.current.push(...events);
      if (timer.current === null) {
        timer.current = setTimeout(flush, FLUSH_MS);
      }
    },
    [flush]
  );

  const ingestSync = useCallback(
    (events: ArtifactEvent[]) => {
      if (!events.length) return;
      applyBatch(events);
    },
    [applyBatch]
  );

  const flushNow = useCallback((): PatchFailureReport[] => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current.length) {
      const batch = pending.current;
      pending.current = [];
      applyBatch(batch);
    }
    const failures = failuresRef.current;
    failuresRef.current = [];
    return failures;
  }, [applyBatch]);

  const getFiles = useCallback(() => treeRef.current, []);

  const writeFile = useCallback((path: string, content: string) => {
    const next = upsertFile(treeRef.current, path, content, "complete");
    treeRef.current = next;
    setFiles(next);
  }, []);

  const reset = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = [];
    treeRef.current = [];
    failuresRef.current = [];
    setFiles([]);
    setStreaming(false);
    setTruncated(false);
  }, []);

  const hydrate = useCallback((next: FileItem[]) => {
    treeRef.current = next;
    setFiles(next);
  }, []);

  // A generation that ends with events still queued must not leave them stranded.
  useEffect(() => {
    if (streaming || timer.current === null) return;
    clearTimeout(timer.current);
    flush();
  }, [streaming, flush]);

  return {
    files,
    streaming,
    truncated,
    ingest,
    ingestSync,
    flushNow,
    getFiles,
    writeFile,
    setStreaming,
    setTruncated,
    reset,
    hydrate,
  };
}
