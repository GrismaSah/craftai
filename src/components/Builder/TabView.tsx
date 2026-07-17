"use client";

interface TabViewProps {
  activeTab: "code" | "preview";
  onTabChange: (tab: "code" | "preview") => void;
}

export function TabView({ activeTab, onTabChange }: TabViewProps) {
  return (
    <div className="flex gap-1 bg-[#111] border border-white/[0.06] rounded-xl p-1 w-fit">
      <button
        onClick={() => onTabChange("code")}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
          activeTab === "code"
            ? "bg-[#ff8a5c] text-white"
            : "text-[#666] hover:text-[#ccc] hover:bg-white/[0.04]"
        }`}
      >
        Code
      </button>
      <button
        onClick={() => onTabChange("preview")}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
          activeTab === "preview"
            ? "bg-[#ff8a5c] text-white"
            : "text-[#666] hover:text-[#ccc] hover:bg-white/[0.04]"
        }`}
      >
        Preview
      </button>
    </div>
  );
}
