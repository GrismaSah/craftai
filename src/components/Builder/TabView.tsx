"use client";

export type BuilderTab = "chat" | "code" | "preview";

interface TabViewProps {
  activeTab: BuilderTab;
  onTabChange: (tab: BuilderTab) => void;
  /** Tabs to show. The preview tab is meaningless for a node project. */
  tabs?: BuilderTab[];
  /** Shown as a badge on the code tab. */
  fileCount?: number;
}

const LABELS: Record<BuilderTab, string> = {
  chat: "Chat",
  code: "Code",
  preview: "Preview",
};

export function TabView({
  activeTab,
  onTabChange,
  tabs = ["chat", "code", "preview"],
  fileCount,
}: TabViewProps) {
  return (
    <div className="flex w-fit gap-1 rounded-xl border border-white/[0.06] bg-[#111] p-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
            activeTab === tab
              ? "bg-[#ff8a5c] text-white"
              : "text-[#666] hover:bg-white/[0.04] hover:text-[#ccc]"
          }`}
        >
          {LABELS[tab]}
          {tab === "code" && typeof fileCount === "number" && fileCount > 0 && (
            <span
              className={`rounded px-1.5 text-[10px] font-semibold ${
                activeTab === tab ? "bg-white/25 text-white" : "bg-white/[0.06] text-[#777]"
              }`}
            >
              {fileCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
