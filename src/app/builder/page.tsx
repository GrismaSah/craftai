"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FileExplorer } from "@/components/Builder/FileExplorer";
import { CodeEditor } from "@/components/Builder/CodeEditor";
import { PreviewFrame } from "@/components/Builder/PreviewFrame";
import { TabView, type BuilderTab } from "@/components/Builder/TabView";
import { ChatPanel, type ChatTurn } from "@/components/Builder/ChatPanel";
import { FileItem } from "@/types/types";
import { parseArtifact } from "@/lib/artifactParser";
import {
  findFileByPath,
  findFirstFile,
  type PatchFailureReport,
} from "@/lib/fileTree";
import { useArtifactStream } from "@/hooks/useArtifactStream";
import {
  estimateTokens,
  fitMessages,
  streamArtifactTurn,
  type ChatMessage,
  type StreamTurnResult,
} from "@/lib/chatStream";
import {
  MAX_OUTPUT_TOKENS,
  REQUEST_TOKEN_LIMIT,
  SYSTEM_PROMPT_TOKENS,
} from "@/lib/constants";
import type { ArtifactEvent } from "@/lib/artifactParser";
import { useWebContainer } from "@/hooks/useWebContainer";
import { Loader } from "@/components/Builder/Loader";
import { QuotaErrorModal } from "@/components/Builder/QuotaErrorModal";
import { downloadProjectAsZip } from "@/lib/downloadZip";
import { ArrowLeft, Download, Send, Mic, TriangleAlert } from "lucide-react";
import Link from "next/link";

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

/**
 * Follow-up turns allowed after a diff failed to apply. ONE.
 *
 * Same discipline as `maxContinues = 1` in chatStream.ts. A model that missed once will
 * often miss again the same way, and each retry costs a full request against a
 * per-minute token allowance shared with the turn that just ran. Two invites a loop that
 * spends the whole minute achieving nothing; one buys the common case (a slightly stale
 * SEARCH block) and then tells the user the truth.
 */
const MAX_PATCH_RECOVERIES = 1;
/** Beyond this the recovery prompt is bigger than the problem; warn instead. */
const MAX_RECOVERY_FILES = 3;
const MAX_RECOVERY_FILE_CHARS = 12_000;

function describePatchFailure(report: PatchFailureReport): string {
  switch (report.reason) {
    case "file-missing":
      return "that file does not exist in the project";
    case "file-streaming":
      return "that file was still being written and could not be diffed";
    case "no-hunks":
      return "the diff contained no SEARCH/REPLACE block";
    case "malformed":
      return "the SEARCH/REPLACE markers were malformed";
    case "no-match":
      return "the SEARCH block does not appear in the file";
    case "ambiguous":
      return "the SEARCH block appears more than once, so the target was ambiguous";
    default:
      return "the diff could not be applied";
  }
}

/**
 * Builds the one follow-up prompt sent after a diff fails, or null when recovery is not
 * worth attempting.
 *
 * It attaches the CURRENT FULL CONTENT of each affected file rather than just its path.
 * The model cannot rewrite a file it cannot see, and `fitMessages` has very likely
 * already trimmed the turn that wrote it — asking blind produces a plausible file that
 * silently drops whatever else was in there.
 */
function buildPatchRecoveryPrompt(
  failures: PatchFailureReport[],
  tree: FileItem[]
): string | null {
  const paths: string[] = [];
  for (const f of failures) if (!paths.includes(f.path)) paths.push(f.path);
  if (paths.length === 0 || paths.length > MAX_RECOVERY_FILES) return null;

  const blocks: string[] = [];
  for (const path of paths) {
    const why = failures
      .filter((f) => f.path === path)
      .map((f) =>
        f.search
          ? `- ${describePatchFailure(f)}. The SEARCH block that failed was:\n${f.search}`
          : `- ${describePatchFailure(f)}.`
      )
      .join("\n");

    const file = findFileByPath(tree, path);
    if (!file) {
      blocks.push(`FILE ${path}\n${why}`);
      continue;
    }
    const content = file.content ?? "";
    // A file this large would dominate the request budget and is exactly the case
    // where a diff was the right call — retrying with the whole thing inline trades
    // one failure for a guaranteed 413.
    if (content.length > MAX_RECOVERY_FILE_CHARS) return null;
    blocks.push(`FILE ${path}\n${why}\n\nIts current full content is:\n${content}`);
  }

  const prompt = [
    "Your previous reply used diff actions that could not be applied. Those files are unchanged.",
    "",
    blocks.join("\n\n"),
    "",
    "Redo those edits now, following these rules exactly:",
    // The parser only recognises an action inside an artifact — a bare <boltAction>
    // is read as prose and produces no events at all, so this reply would fail
    // exactly as silently as the diff it is replacing.
    "- Wrap the reply in a single <boltArtifact> as usual.",
    '- Emit one complete <boltAction type="file" filePath="..."> per file listed above, containing the ENTIRE final file.',
    '- Do NOT use <boltAction type="diff"> anywhere in this reply.',
    "- Change nothing that was not part of the original request.",
  ].join("\n");

  // `fitMessages` always keeps the final user message whatever it costs, so an
  // oversized recovery prompt would not be trimmed — it would just 413. Check it
  // against the same budget fitMessages works to, and give up cleanly instead.
  const budget = REQUEST_TOKEN_LIMIT - SYSTEM_PROMPT_TOKENS - MAX_OUTPUT_TOKENS;
  if (estimateTokens(prompt) > budget) return null;

  return prompt;
}

function BuilderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const promptParam = searchParams?.get("prompt") || "";

  const [userPrompt, setUserPrompt] = useState("");
  const [bootPrompt] = useState(promptParam);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  /**
   * Project context from /api/template, sent as user turns rather than a system turn.
   * The server owns the system prompt now — a client-supplied one is an injection vector
   * on a public endpoint, and it was being layered on top of the route's own prompt.
   */
  const [contextMessages, setContextMessages] = useState<ChatMessage[]>([]);
  const [llmMessages, setLlmMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);

  const {
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
  } = useArtifactStream();

  /**
   * A diff that did not apply, after recovery was exhausted or declined.
   *
   * Deliberately UI state and not a `FileItem['status']` value: widening the tree's
   * status union would leak a failure into `hasStreamingFile` in PreviewFrame and into
   * CodeEditor's read-only gate. The tree stays a truthful mirror of file contents.
   */
  const [patchWarning, setPatchWarning] = useState<string | null>(null);

  const { webContainer, bootError } = useWebContainer();

  // The selection is a path, not a node. Holding a `FileItem` here kept a snapshot of the
  // tree taken at click time, so the editor went on rendering the content the file had
  // when it was selected — every later tree update was invisible to it.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [templateType, setTemplateType] = useState<"react" | "node" | null>(null);
  const [activeTab, setActiveTab] = useState<BuilderTab>("chat");
  const [quotaError, setQuotaError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const speechWindow = window as SpeechRecognitionWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final) {
        setUserPrompt((prev) => (prev ? `${prev} ${final}` : final));
        setInterimTranscript("");
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;
  }, []);

  const handleVoiceToggle = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      setInterimTranscript("");
    } else {
      setInterimTranscript("");
      recognition.start();
      setIsListening(true);
    }
  };

  const visibleSelectedFile =
    (selectedPath ? findFileByPath(files, selectedPath) : null) ?? findFirstFile(files);

  const handleFileSelect = useCallback((file: FileItem) => {
    setSelectedPath(file.path);
  }, []);

  /** Maps a failed turn onto the quota modal, or an alert for anything unexpected. */
  const reportStreamError = useCallback(
    (code: string, message?: string) => {
      if (code === "quota_exceeded") {
        setQuotaError(
          message || "API credits exhausted. Please wait a moment and try again."
        );
        return;
      }
      if (code === "request_too_large") {
        setQuotaError(
          message ||
            "This conversation is too large for your Groq plan's per-minute token limit."
        );
        return;
      }
      // HTTP 429 from the rate limiter — same story for the user as a quota error.
      if (code === "too_many_requests") {
        setQuotaError(
          message ||
            "Too many requests. Wait a few seconds before sending another prompt."
        );
        return;
      }
      if (code === "missing_api_key") {
        setQuotaError(
          message ||
            "GROQ_API_KEY is not configured on the server. Add it to .env.local and restart."
        );
        return;
      }
      console.error("Generation failed:", code, message);
      setQuotaError(message || `Generation failed (${code}).`);
    },
    []
  );

  /** Appends the model's prose to the in-flight assistant turn as it arrives. */
  const appendProse = useCallback((chunk: string) => {
    setChatTurns((turns) => {
      const last = turns[turns.length - 1];
      if (!last || last.role !== "assistant" || !last.pending) return turns;
      const next = [...turns];
      next[next.length - 1] = { ...last, content: last.content + chunk };
      return next;
    });
  }, []);

  const runTurn = useCallback(
    // A named function expression so the patch-recovery follow-up can call it again
    // without a self-referential useCallback dependency.
    async function runTurn(
      messages: ChatMessage[],
      signal?: AbortSignal,
      recoveryDepth = 0
    ): Promise<StreamTurnResult> {
      setStreaming(true);
      setTruncated(false);
      setPatchWarning(null);
      setChatTurns((t) => [
        ...t,
        { role: "assistant", content: "", pending: true },
      ]);

      const handleEvents = (events: ArtifactEvent[]) => {
        ingest(events);
        let chunk = "";
        for (const e of events) if (e.kind === "prose") chunk += e.text;
        if (chunk) appendProse(chunk);
      };

      try {
        const result = await streamArtifactTurn({
          messages,
          onEvents: handleEvents,
          signal,
        });

        // Drain the coalescing queue here rather than waiting for the effect that
        // fires on `streaming -> false`: the patch failures have to be in hand
        // before this function returns, and that effect runs a render later.
        const patchFailures = flushNow();

        if (result.error) {
          reportStreamError(result.error.code, result.error.message);
        }
        if (result.truncated) setTruncated(true);

        setChatTurns((turns) => {
          const next = [...turns];
          const i = next.length - 1;
          if (next[i]?.role === "assistant") {
            next[i] = {
              role: "assistant",
              content:
                result.prose ||
                (result.builtSomething
                  ? "Done — the files are in the Code tab."
                  : result.error
                    ? "Something went wrong."
                    : "No response."),
              fileCount: result.filesWritten,
              pending: false,
            };
          }
          return next;
        });

        // Intent routing: a question pulls the user back to the chat where the answer is.
        // A build only opens the editor if they were still in the chat — yanking someone
        // off a live preview to watch their own iteration land is worse than a stale tab.
        setActiveTab((current) => {
          if (!result.builtSomething) return "chat";
          return current === "chat" ? "code" : current;
        });

        // A failed diff is the one outcome that lies by default: the tree is unchanged,
        // the preview shows the old app, and the reply above already said "Done".
        // Either fix it or say so — never neither.
        if (patchFailures.length > 0 && !result.aborted) {
          const prompt =
            recoveryDepth < MAX_PATCH_RECOVERIES
              ? buildPatchRecoveryPrompt(patchFailures, getFiles())
              : null;

          if (prompt) {
            // Only the user's original request goes along for context. The system
            // prompt on the route already carries the artifact format, and the full
            // file contents are inline in `prompt`, so replaying history would buy
            // nothing and cost the budget that the file contents need.
            const original = messages[messages.length - 1];
            return runTurn(
              [...(original ? [original] : []), { role: "user", content: prompt }],
              signal,
              recoveryDepth + 1
            );
          }

          const paths = [...new Set(patchFailures.map((f) => f.path))];
          setPatchWarning(
            `Some edits could not be applied to ${paths.join(", ")}. Ask again and describe the change in words.`
          );
        }

        return result;
      } finally {
        setStreaming(false);
      }
    },
    [
      appendProse,
      flushNow,
      getFiles,
      ingest,
      reportStreamError,
      setStreaming,
      setTruncated,
    ]
  );

  /**
   * Classifies a prompt and, when it is a build, seeds the starter project.
   * `context` is null for a conversational prompt — that is a success, not a failure.
   */
  const ensureScaffold = useCallback(
    async (
      prompt: string,
      signal?: AbortSignal
    ): Promise<{ ok: boolean; context: ChatMessage[] | null }> => {
      const res = await fetch("/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        reportStreamError(data.error || `http_${res.status}`, data.message);
        return { ok: false, context: null };
      }

      const { prompts, uiPrompts, classification } = (await res.json()) ?? {};
      const isBuild = classification === "react" || classification === "node";
      if (!isBuild) return { ok: true, context: null };

      if (!Array.isArray(uiPrompts) || !uiPrompts[0]) {
        reportStreamError(
          "bad_template_response",
          "The template service returned no starter project."
        );
        return { ok: false, context: null };
      }

      setTemplateType(classification as "react" | "node");
      // The scaffold is a complete artifact string, not a stream — the same parser
      // handles it, so files land in the tree before the LLM is even called.
      ingestSync(parseArtifact(uiPrompts[0]).events);

      const context: ChatMessage[] = (Array.isArray(prompts) ? prompts : []).map(
        (content: string) => ({ role: "user" as const, content })
      );
      setContextMessages(context);
      return { ok: true, context };
    },
    [ingestSync, reportStreamError]
  );

  const init = useCallback(
    async (prompt: string, signal?: AbortSignal) => {
      if (!prompt) {
        router.push("/");
        return;
      }

      try {
        setLoading(true);

        const seeded = await ensureScaffold(prompt, signal);
        if (signal?.aborted) return;
        if (!seeded.ok) {
          setLoading(false);
          return;
        }

        setReady(true);
        // A build opens the editor; a question stays in the conversation.
        if (seeded.context) setActiveTab("code");
        setLoading(false);
        setChatTurns([{ role: "user", content: prompt }]);

        const result = await runTurn(
          fitMessages(seeded.context ?? [], [], {
            role: "user",
            content: prompt,
          }),
          signal
        );
        if (signal?.aborted) return;

        setLlmMessages([
          { role: "user", content: prompt },
          { role: "assistant", content: result.text },
        ]);
      } catch (error) {
        if (signal?.aborted || (error as Error)?.name === "AbortError") return;
        console.error("Error initializing builder:", error);
        reportStreamError(
          "init_failed",
          error instanceof Error ? error.message : "Unknown error"
        );
        setLoading(false);
      }
    },
    [ensureScaffold, reportStreamError, router, runTurn]
  );

  // Kicks off the generation pipeline — an external system, not derived state. The
  // deferral keeps the first setState out of this effect's own render pass, and the
  // controller means navigating away actually stops the stream instead of billing on.
  useEffect(() => {
    if (!bootPrompt) return;
    const controller = new AbortController();
    const id = setTimeout(() => void init(bootPrompt, controller.signal), 0);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = userPrompt.trim();
    if (!trimmed || streaming) return;

    const newMessage: ChatMessage = { role: "user", content: trimmed };
    setUserPrompt("");
    setChatTurns((t) => [...t, { role: "user", content: trimmed }]);

    // A session that opened with a question has no project yet. If this message turns
    // out to be a build request, scaffold before generating so the model has a real
    // package.json and config to build on rather than inventing one.
    let context = contextMessages;
    if (templateType === null) {
      const seeded = await ensureScaffold(trimmed);
      if (seeded.context) context = seeded.context;
    }

    const result = await runTurn(fitMessages(context, llmMessages, newMessage));

    if (result.text) {
      setLlmMessages((prev) => [
        ...prev,
        newMessage,
        { role: "assistant", content: result.text },
      ]);
    }
  }, [
    contextMessages,
    ensureScaffold,
    llmMessages,
    runTurn,
    streaming,
    templateType,
    userPrompt,
  ]);

  const fileCount = countFiles(files);
  const hasFiles = fileCount > 0;
  // Tabs appear only once they mean something: no Code tab for a pure conversation,
  // no Preview for a node project.
  const showPreview = hasFiles && templateType === "react";
  const availableTabs: BuilderTab[] = [
    "chat",
    ...(hasFiles ? (["code"] as BuilderTab[]) : []),
    ...(showPreview ? (["preview"] as BuilderTab[]) : []),
  ];

  const busy = loading || streaming;
  // Only blank the panes when there is genuinely nothing to show. Gating on `busy` alone
  // is what made streaming invisible: files arrive throughout the generation.
  const paneLoading = busy && files.length === 0;

  return (
    <div className="h-screen flex overflow-hidden bg-[#0a0a0a]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-white/[0.06] bg-[#0f0f0f]/90 px-4 py-3 backdrop-blur-xl md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-sm font-medium text-[#888] transition-colors hover:text-[#e0e0e0]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Home</span>
              </Link>
              <div className="h-4 w-px bg-white/[0.08]" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#ff8a5c]/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#ff8a5c]">
                    Builder
                  </span>
                  {streaming && (
                    <span className="text-[11px] text-[#888]">
                      {files.length} file{files.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => downloadProjectAsZip(files, "website-project")}
                disabled={files.length === 0 || streaming}
                className="flex items-center gap-2 rounded-xl bg-[#ff8a5c] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#e87345] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-xs">Download ZIP</span>
              </button>
            </div>
          </div>
        </header>

        {(truncated || bootError || patchWarning) && (
          <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.07] px-4 py-2 md:px-6">
            <div className="flex items-start gap-2 text-xs text-amber-200/90">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                {bootError
                  ? `Live preview unavailable: ${bootError}. Your browser may not support WebContainer, or the page is not cross-origin isolated. Code and ZIP download still work.`
                  : /* The patch warning outranks truncation: it names specific files the
                       user can act on, where truncation is only "ask again". */
                    (patchWarning ??
                      "The build was cut off before every file was written. Ask for the missing pieces in the chat below.")}
              </span>
            </div>
          </div>
        )}

        {loading && !ready ? (
          <main className="flex flex-1 items-center justify-center p-6">
            <div className="rounded-2xl border border-white/[0.06] bg-[#111] px-6 py-5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
              <Loader label="Thinking..." />
            </div>
          </main>
        ) : (
          ready && (
            <div className="flex min-h-0 flex-1 overflow-hidden p-3 md:p-4">
              {hasFiles && (
                <div className="hidden w-60 shrink-0 overflow-y-auto rounded-2xl border border-white/[0.06] bg-[#111] shadow-[0_4px_24px_rgba(0,0,0,0.3)] md:flex lg:w-72">
                  <div className="w-full p-3">
                    <FileExplorer files={files} onFileSelect={handleFileSelect} />
                  </div>
                </div>
              )}

              <div className={`flex min-w-0 flex-1 flex-col ${hasFiles ? "md:pl-3" : ""}`}>
                {availableTabs.length > 1 && (
                  <div className="shrink-0 pb-3">
                    <TabView
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                      tabs={availableTabs}
                      fileCount={fileCount}
                    />
                  </div>
                )}
                {/*
                  Every pane stays mounted and is hidden with CSS instead. Unmounting
                  PreviewFrame wiped its refs, so returning to the tab re-ran `npm install`
                  and started a *second* dev server inside the same singleton container.
                  Staying mounted is also what lets an editor edit reach the WebContainer
                  while the user is looking at the Code tab.
                */}
                <div className="relative min-h-0 flex-1">
                  <div
                    className="h-full"
                    style={{ display: activeTab === "chat" ? undefined : "none" }}
                  >
                    <ChatPanel turns={chatTurns} streaming={streaming} />
                  </div>
                  {showPreview && (
                    /*
                      Hidden with `visibility`, not `display`, and absolutely positioned so
                      it always has real dimensions: an iframe whose ancestor is
                      `display:none` measures 0x0, and WebContainer's Vite server would be
                      handed a zero-height viewport the first time the tab is shown.
                    */
                    <div
                      className="absolute inset-0"
                      style={{
                        visibility: activeTab === "preview" ? "visible" : "hidden",
                        pointerEvents: activeTab === "preview" ? undefined : "none",
                      }}
                    >
                      <PreviewFrame
                        webContainer={webContainer}
                        files={files}
                        streaming={streaming}
                        loading={paneLoading}
                      />
                    </div>
                  )}
                  <div
                    className="h-full"
                    style={{ display: activeTab === "code" ? undefined : "none" }}
                  >
                    <CodeEditor
                      file={visibleSelectedFile}
                      loading={paneLoading}
                      onChange={writeFile}
                      // The stream owns the tree while it is writing; a concurrent hand
                      // edit would be overwritten by the next file-close anyway.
                      readOnly={streaming}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {ready && (
          <div className="shrink-0 border-t border-white/[0.06] bg-[#0f0f0f]/90 px-3 py-3 backdrop-blur-xl md:px-4">
            <div className="flex items-center gap-2 max-w-4xl mx-auto">
              {isListening ? (
                <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-[#1a1a1a] border border-white/[0.08] rounded-xl">
                  <div className="flex items-end gap-[3px] h-5 shrink-0">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{
                          width: "4px",
                          borderRadius: "2px",
                          backgroundColor: "#ff8a5c",
                          animation: "voice-wave 1.2s ease-in-out infinite",
                          animationDelay: `${i * 0.15}s`,
                          height: "20px",
                        }}
                      />
                    ))}
                  </div>
                  {interimTranscript ? (
                    <span className="text-sm text-[#999] truncate flex-1">
                      {interimTranscript}
                    </span>
                  ) : (
                    <span className="text-sm text-[#666] font-medium">
                      Listening...
                    </span>
                  )}
                  <button
                    onClick={handleVoiceToggle}
                    className="shrink-0 text-xs text-[#666] hover:text-[#ccc] transition-colors"
                  >
                    Tap to stop
                  </button>
                </div>
              ) : (
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder={
                    streaming ? "Generating..." : "Ask for changes..."
                  }
                  rows={1}
                  disabled={streaming}
                  className="flex-1 resize-none rounded-xl border border-white/[0.08] bg-[#1a1a1a] px-3 py-2 text-sm text-[#ccc] placeholder:text-[#555] transition-colors focus:border-[#ff8a5c]/40 focus:outline-none disabled:opacity-50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
              )}
              <button
                onClick={handleVoiceToggle}
                disabled={streaming}
                title="Start voice input"
                className="shrink-0 p-2 rounded-xl transition-all duration-200 bg-[#1a1a1a] border border-white/[0.08] text-[#666] hover:text-[#ccc] hover:border-[#ff8a5c]/30 disabled:opacity-30"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                onClick={() => void handleSend()}
                disabled={streaming || !userPrompt.trim()}
                className="shrink-0 p-2 bg-[#ff8a5c] text-white rounded-xl hover:bg-[#e87345] transition-colors disabled:opacity-30"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <QuotaErrorModal
          open={quotaError !== null}
          message={quotaError ?? undefined}
          onClose={() => setQuotaError(null)}
        />
      </div>
    </div>
  );
}

function countFiles(items: FileItem[]): number {
  let n = 0;
  for (const item of items) {
    if (item.type === "file") n++;
    if (item.children) n += countFiles(item.children);
  }
  return n;
}

export default function BuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
          <div className="text-sm text-[#666]">Loading...</div>
        </div>
      }
    >
      <BuilderContent />
    </Suspense>
  );
}
