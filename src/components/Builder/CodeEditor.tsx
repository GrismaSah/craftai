"use client";

import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useRef } from "react";
import { FileItem } from "@/types/types";

/**
 * Keystroke -> state coalescing window.
 *
 * Every commit re-renders the tree, the explorer, and retriggers PreviewFrame's
 * incremental write into the WebContainer. 300ms is long enough to collapse a burst
 * of typing into one write and short enough that HMR still feels immediate.
 */
const COMMIT_MS = 300;

interface CodeEditorProps {
  file: FileItem | null;
  loading?: boolean;
  /** Debounced; fires with the path captured at edit time, not the current selection. */
  onChange?: (path: string, content: string) => void;
  /** Editing is blocked while a generation is in flight — the stream owns the tree then. */
  readOnly?: boolean;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  html: "html",
  css: "css",
  py: "python",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  md: "markdown",
};

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return LANGUAGE_BY_EXT[ext || ""] || "plaintext";
}

export function CodeEditor({
  file,
  loading = false,
  onChange,
  readOnly = false,
}: CodeEditorProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ path: string; content: string } | null>(null);
  // Held in a ref so `flush` keeps a stable identity: if it changed with `onChange`, the
  // cleanup effect below would re-run every render and commit on every keystroke.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) onChangeRef.current?.(pending.path, pending.content);
  }, []);

  // Switching files (or leaving) must not strand the last keystrokes in the timer.
  const path = file?.path;
  useEffect(() => flush, [path, flush]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined || !path) return;
      pendingRef.current = { path, content: value };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, COMMIT_MS);
    },
    [path, flush]
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#ff8a5c] border-t-transparent" />
          <p className="text-sm text-[#888]">Generating code...</p>
        </div>
      </div>
    );
  }

  if (!file || file.type === "folder") {
    return (
      <div className="h-full flex items-center justify-center text-[#666] text-sm">
        Select a file to view its contents
      </div>
    );
  }

  return (
    <div className="h-full rounded-2xl overflow-hidden border border-white/[0.06] bg-[#111] flex flex-col">
      <div className="bg-[#161616] px-4 py-2 border-b border-white/[0.06] flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        </div>
        <span className="text-xs text-[#666] ml-3 truncate">{file.path}</span>
        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-[#555]">
          {readOnly ? "Read-only" : "Editable"}
        </span>
      </div>
      {/*
        `path` gives every file its own Monaco model, so the language actually follows the
        selection and each file keeps its own undo stack. `defaultLanguage` could not do
        this: `default*` props are read once per editor instance.
      */}
      <Editor
        height="100%"
        path={file.path}
        language={getLanguage(file.name)}
        theme="vs-dark"
        value={file.content || ""}
        onChange={handleChange}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          wordWrap: "on",
          scrollBeyondLastLine: false,
          lineNumbers: "on",
          folding: true,
          renderWhitespace: "selection",
        }}
      />
    </div>
  );
}
