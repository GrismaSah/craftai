"use client";

import { FileItem } from "@/types/types";
import { ChevronRight, File, Folder } from "lucide-react";
import { memo, useState } from "react";

interface FileExplorerProps {
  files: FileItem[];
  onFileSelect: (file: FileItem) => void;
}

/**
 * Memoized so a streaming generation stays cheap: the tree reducer shares untouched
 * subtrees by reference, so only nodes on the changed path actually re-render.
 */
const FileNode = memo(function FileNode({
  file,
  onFileSelect,
  level = 0,
}: {
  file: FileItem;
  onFileSelect: (file: FileItem) => void;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const isFolder = file.type === "folder";

  return (
    <div>
      <button
        onClick={() => {
          if (isFolder) {
            setExpanded(!expanded);
          } else {
            onFileSelect(file);
          }
        }}
        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] text-sm text-[#999] hover:text-[#e0e0e0] transition-colors"
        style={{ paddingLeft: `${level * 14 + 8}px` }}
      >
        {isFolder && (
          <ChevronRight
            className={`w-3 h-3 text-[#555] transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        )}
        {isFolder ? (
          <Folder className="w-3.5 h-3.5 text-[#ff8a5c]" />
        ) : (
          <File className="w-3.5 h-3.5 text-[#555]" />
        )}
        <span className="truncate">{file.name}</span>
      </button>
      {isFolder && expanded && file.children && (
        <div>
          {file.children.map((child) => (
            <FileNode
              key={child.path}
              file={child}
              onFileSelect={onFileSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export function FileExplorer({ files, onFileSelect }: FileExplorerProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-3">
        Files
      </h3>
      {files.length === 0 ? (
        <p className="text-[#666] text-sm">No files yet</p>
      ) : (
        <div className="space-y-0.5">
          {files.map((file) => (
            <FileNode
              key={file.path}
              file={file}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
