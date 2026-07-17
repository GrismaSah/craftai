"use client";

import Editor from "@monaco-editor/react";
import { FileItem } from "@/types/types";

interface CodeEditorProps {
  file: FileItem | null;
  loading?: boolean;
}

export function CodeEditor({ file, loading = false }: CodeEditorProps) {
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

  const getLanguage = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
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
    return languageMap[ext || ""] || "plaintext";
  };

  return (
    <div className="h-full rounded-2xl overflow-hidden border border-white/[0.06] bg-[#111] flex flex-col">
      <div className="bg-[#161616] px-4 py-2 border-b border-white/[0.06] flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        </div>
        <span className="text-xs text-[#666] ml-3 truncate">{file.path}</span>
      </div>
      <Editor
        height="100%"
        defaultLanguage={getLanguage(file.name)}
        theme="vs-dark"
        value={file.content || ""}
        options={{
          readOnly: true,
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
