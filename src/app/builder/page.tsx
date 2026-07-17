"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FileExplorer } from "@/components/Builder/FileExplorer";
import { CodeEditor } from "@/components/Builder/CodeEditor";
import { PreviewFrame } from "@/components/Builder/PreviewFrame";
import { TabView } from "@/components/Builder/TabView";
import { Step, FileItem, StepType } from "@/types/types";
import { parseXml } from "@/lib/steps";
import { useWebContainer } from "@/hooks/useWebContainer";
import { Loader } from "@/components/Builder/Loader";
import { QuotaErrorModal } from "@/components/Builder/QuotaErrorModal";
import { downloadProjectAsZip } from "@/lib/downloadZip";
import { ArrowLeft, Download, Send, Mic } from "lucide-react";
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

function BuilderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const promptParam = searchParams?.get("prompt") || "";

  const [userPrompt, setUserPrompt] = useState("");
  const [bootPrompt] = useState(promptParam);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [llmMessages, setLlmMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [templateSet, setTemplateSet] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const speechWindow = window as SpeechRecognitionWindow;
      const SpeechRecognition =
        speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-US";

        recognitionRef.current.onresult = (event) => {
          let interim = "";
          let final = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              final += result[0].transcript;
            } else {
              interim += result[0].transcript;
            }
          }
          if (final) {
            setUserPrompt((prev) => {
              const separator = prev ? " " : "";
              return prev + separator + final;
            });
            setInterimTranscript("");
          } else {
            setInterimTranscript(interim);
          }
        };

        recognitionRef.current.onerror = () => {
          setIsListening(false);
          setInterimTranscript("");
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
          setInterimTranscript("");
        };
      }
    }
  }, []);

  const handleVoiceToggle = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimTranscript("");
    } else {
      setInterimTranscript("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const { webContainer: webcontainer } = useWebContainer();

  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [templateType, setTemplateType] = useState<"react" | "node" | null>(null);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");

  const [steps, setSteps] = useState<Step[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const findFirstFile = (items: FileItem[]): FileItem | null => {
    for (const item of items) {
      if (item.type === "file") return item;
      if (item.children?.length) {
        const nested = findFirstFile(item.children);
        if (nested) return nested;
      }
    }
    return null;
  };

  const findFileByPath = (items: FileItem[], path: string): FileItem | null => {
    for (const item of items) {
      if (item.path === path) return item.type === "file" ? item : null;
      if (item.children?.length) {
        const nested = findFileByPath(item.children, path);
        if (nested) return nested;
      }
    }
    return null;
  };

  const visibleSelectedFile =
    selectedFile && findFileByPath(files, selectedFile.path)
      ? selectedFile
      : findFirstFile(files);

  useEffect(() => {
    let originalFiles = [...files];
    let updateHappened = false;

    steps
      .filter(({ status }) => status === "pending")
      .forEach((step) => {
        updateHappened = true;
        if (step?.type === StepType.CreateFile) {
          let parsedPath = step.path?.split("/").filter(Boolean) ?? [];
          let currentFileStructure = [...originalFiles];
          const finalAnswerRef = currentFileStructure;
          let currentFolder = "";

          while (parsedPath.length) {
            currentFolder = `${currentFolder}/${parsedPath[0]}`;
            const currentFolderName = parsedPath[0];
            parsedPath = parsedPath.slice(1);

            if (!parsedPath.length) {
              const file = currentFileStructure.find(
                (x) => x.path === currentFolder
              );
              if (!file) {
                currentFileStructure.push({
                  name: currentFolderName,
                  type: "file",
                  path: currentFolder,
                  content: step.code,
                });
              } else {
                file.content = step.code;
              }
            } else {
              const folder = currentFileStructure.find(
                (x) => x.path === currentFolder
              );
              if (!folder) {
                currentFileStructure.push({
                  name: currentFolderName,
                  type: "folder",
                  path: currentFolder,
                  children: [],
                });
              }
              currentFileStructure = currentFileStructure.find(
                (x) => x.path === currentFolder
              )!.children!;
            }
          }
          originalFiles = finalAnswerRef;
        }
      });

    if (updateHappened) {
      queueMicrotask(() => {
        setFiles(originalFiles);
        setSteps((steps) =>
          steps.map((s: Step) => ({ ...s, status: "completed" as const }))
        );
      });
    }
  }, [steps]);

  async function init(prompt: string) {
    if (!prompt) {
      router.push("/");
      return;
    }

    try {
      setLoading(true);
      const templateResponse = await fetch("/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!templateResponse.ok) {
        if (templateResponse.status === 429) {
          const data = await templateResponse.json();
          setQuotaError(data.message || "API credits exhausted. Please wait and try again.");
          setLoading(false);
          return;
        }
        throw new Error(`Template API failed: ${templateResponse.status}`);
      }

      const templateData = await templateResponse.json();

      if (
        !templateData ||
        !templateData.uiPrompts ||
        !Array.isArray(templateData.uiPrompts) ||
        !templateData.uiPrompts[0]
      ) {
        setLoading(false);
        return;
      }

      setTemplateSet(true);

      const { prompts, uiPrompts, classification } = templateData;
      setTemplateType(classification || "react");
      const combinedSystemPrompt = [...(prompts || [])].join("\n\n");
      setSystemPrompt(combinedSystemPrompt);

      const parsedSteps = parseXml(uiPrompts[0]);
      setSteps(
        parsedSteps.map((x: Step) => ({
          ...x,
          status: "pending" as const,
        }))
      );

      setLoading(true);

      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: combinedSystemPrompt },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!chatResponse.ok) {
        if (chatResponse.status === 429) {
          const data = await chatResponse.json();
          setQuotaError(data.message || "API credits exhausted. Please wait and try again.");
          setLoading(false);
          return;
        }
        throw new Error(`Chat API failed: ${chatResponse.status}`);
      }

      const reader = chatResponse.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullResponse += decoder.decode(value);
        }
      }

      setLoading(false);

      const newSteps = parseXml(fullResponse);
      setSteps((s) => {
        const combined = [
          ...s,
          ...newSteps.map((x) => ({
            ...x,
            status: "pending" as const,
          })),
        ];
        return combined.map((step, index) => ({
          ...step,
          id: index + 1,
        }));
      });

      setLlmMessages([
        { role: "user" as const, content: prompt },
        { role: "assistant" as const, content: fullResponse },
      ]);
    } catch (error) {
      console.error("Error initializing builder:", error);
      alert(
        `Error initializing builder: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!bootPrompt) return;
    init(bootPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => downloadProjectAsZip(files, "website-project")}
                disabled={files.length === 0}
                className="flex items-center gap-2 rounded-xl bg-[#ff8a5c] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#e87345] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-xs">Download ZIP</span>
              </button>
            </div>
          </div>
        </header>

        {loading && !templateSet ? (
          <main className="flex flex-1 items-center justify-center p-6">
            <div className="rounded-2xl border border-white/[0.06] bg-[#111] px-6 py-5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
              <Loader label="Preparing template..." />
            </div>
          </main>
        ) : (
          templateSet && (
            <div className="flex min-h-0 flex-1 overflow-hidden p-3 md:p-4">
              <div className="hidden w-60 shrink-0 overflow-y-auto rounded-2xl border border-white/[0.06] bg-[#111] shadow-[0_4px_24px_rgba(0,0,0,0.3)] md:flex lg:w-72">
                <div className="w-full p-3">
                  <FileExplorer files={files} onFileSelect={setSelectedFile} />
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col md:pl-3">
                {templateType === "react" && (
                  <div className="shrink-0 pb-3">
                    <TabView activeTab={activeTab} onTabChange={setActiveTab} />
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  {templateType === "react" && activeTab === "preview" ? (
                    <PreviewFrame webContainer={webcontainer} files={files} loading={loading} />
                  ) : (
                    <CodeEditor file={visibleSelectedFile} loading={loading} />
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {templateSet && (
        <div className="shrink-0 border-t border-white/[0.06] bg-[#0f0f0f]/90 px-3 py-3 backdrop-blur-xl md:px-4">
          {loading ? (
            <Loader label="Generating changes..." />
          ) : (
            <div className="flex items-center gap-2 max-w-4xl mx-auto">
              {isListening ? (
                <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-[#1a1a1a] border border-white/[0.08] rounded-xl">
                  <div className="flex items-end gap-[3px] h-5 shrink-0">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{
                          width: '4px',
                          borderRadius: '2px',
                          backgroundColor: '#ff8a5c',
                          animation: 'voice-wave 1.2s ease-in-out infinite',
                          animationDelay: `${i * 0.15}s`,
                          height: '20px',
                        }}
                      />
                    ))}
                  </div>
                  {interimTranscript ? (
                    <span className="text-sm text-[#999] truncate flex-1">{interimTranscript}</span>
                  ) : (
                    <span className="text-sm text-[#666] font-medium">Listening...</span>
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
                  placeholder="Ask for changes..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-white/[0.08] bg-[#1a1a1a] px-3 py-2 text-sm text-[#ccc] placeholder:text-[#555] transition-colors focus:border-[#ff8a5c]/40 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      document.getElementById("chat-send-btn")?.click();
                    }
                  }}
                />
              )}
              <button
                onClick={handleVoiceToggle}
                disabled={loading}
                title="Start voice input"
                className="shrink-0 p-2 rounded-xl transition-all duration-200 bg-[#1a1a1a] border border-white/[0.08] text-[#666] hover:text-[#ccc] hover:border-[#ff8a5c]/30 disabled:opacity-30"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                id="chat-send-btn"
                onClick={async () => {
                  if (!userPrompt.trim()) return;

                  const newMessage = {
                    role: "user" as const,
                    content: userPrompt,
                  };

                  setLoading(true);

                  try {
                    const chatResponse = await fetch("/api/chat", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        messages: systemPrompt
                          ? [
                              { role: "system" as const, content: systemPrompt },
                              ...llmMessages,
                              newMessage,
                            ]
                          : [...llmMessages, newMessage],
                      }),
                    });

                    if (!chatResponse.ok) {
                      if (chatResponse.status === 429) {
                        const data = await chatResponse.json();
                        setQuotaError(data.message || "API credits exhausted. Please wait and try again.");
                        setLoading(false);
                        return;
                      }
                      throw new Error(`Chat API failed: ${chatResponse.status}`);
                    }

                    const reader = chatResponse.body?.getReader();
                    const decoder = new TextDecoder();
                    let fullResponse = "";

                    if (reader) {
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        fullResponse += decoder.decode(value);
                      }
                    }

                    if (!fullResponse.trim()) {
                      throw new Error("Empty response from API");
                    }

                    setLoading(false);

                    setLlmMessages((x) => [
                      ...x,
                      newMessage,
                      { role: "assistant" as const, content: fullResponse },
                    ]);

                    const newSteps = parseXml(fullResponse);
                    if (newSteps.length > 0) {
                      setSteps((s) => {
                        const combined = [
                          ...s,
                          ...newSteps.map((x) => ({
                            ...x,
                            status: "pending" as const,
                          })),
                        ];
                        return combined.map((step, index) => ({
                          ...step,
                          id: index + 1,
                        }));
                      });
                    }

                    setUserPrompt("");
                  } catch (error) {
                    console.error("Error sending message:", error);
                    alert(
                      `Error: ${error instanceof Error ? error.message : "Unknown error"}`
                    );
                    setLoading(false);
                  }
                }}
                disabled={loading || !userPrompt.trim()}
                className="shrink-0 p-2 bg-[#ff8a5c] text-white rounded-xl hover:bg-[#e87345] transition-colors disabled:opacity-30"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
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

export default function BuilderPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-sm text-[#666]">Loading...</div>
      </div>
    }>
      <BuilderContent />
    </Suspense>
  )
}
