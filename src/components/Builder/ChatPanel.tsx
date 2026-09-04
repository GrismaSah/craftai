"use client";

import { useEffect, useRef } from "react";
import { Sparkles, User } from "lucide-react";

export interface ChatTurn {
  role: "user" | "assistant";
  /** Prose shown in the transcript. Artifact markup never reaches here. */
  content: string;
  /** Files this assistant turn wrote, if it was a build. */
  fileCount?: number;
  /** True while the reply is still streaming in. */
  pending?: boolean;
}

interface ChatPanelProps {
  turns: ChatTurn[];
  streaming: boolean;
}

export function ChatPanel({ turns, streaming }: ChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, streaming]);

  if (turns.length === 0) {
    return (
      <div className="h-full rounded-2xl border border-white/[0.06] bg-[#111] flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <Sparkles className="mx-auto mb-3 h-5 w-5 text-[#ff8a5c]" />
          <p className="text-sm text-[#ccc]">Ask a question or describe what to build</p>
          <p className="mt-1.5 text-xs text-[#666]">
            Questions get answered here. Build requests open the code editor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto rounded-2xl border border-white/[0.06] bg-[#111] p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {turns.map((turn, i) => (
          <div key={i} className="flex gap-3">
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                turn.role === "user"
                  ? "bg-white/[0.06] text-[#888]"
                  : "bg-[#ff8a5c]/15 text-[#ff8a5c]"
              }`}
            >
              {turn.role === "user" ? (
                <User className="h-3 w-3" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#555]">
                {turn.role === "user" ? "You" : "CraftAI"}
              </p>

              {turn.content && (
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#ccc]">
                  {turn.content}
                </div>
              )}

              {turn.pending && !turn.content && (
                <div className="flex items-center gap-2 text-sm text-[#666]">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#ff8a5c] border-t-transparent" />
                  Thinking...
                </div>
              )}

              {typeof turn.fileCount === "number" && turn.fileCount > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-xs text-[#888]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff8a5c]" />
                  Wrote {turn.fileCount} file{turn.fileCount === 1 ? "" : "s"} — see the Code tab
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
