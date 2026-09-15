import type { FileItem } from "@/types/types";
import type { ChatMessage } from "@/lib/chatStream";
import type { ChatTurn } from "@/components/Builder/ChatPanel";

/**
 * Survives a refresh of /builder — nothing more. There is no server-side
 * persistence (HANDOVER.md §6 P1 item 5 tracks that as real future work), and
 * this is not trying to be a substitute: it's `localStorage`, one slot, one
 * project at a time.
 *
 * Deliberately a single fixed key rather than one per prompt/project — this
 * app shows one project per tab by design (HANDOVER.md's roadmap, not this
 * file, is where multi-project support belongs). Two /builder tabs open with
 * different prompts will clobber each other's saved snapshot; the loser just
 * won't restore after a refresh, which is a fine failure mode for a portfolio
 * project and not worth a per-project key for.
 */
const STORAGE_KEY = "craftai:builder:v1";

export interface BuilderSnapshot {
  /** The prompt the URL was opened with. Restoring only ever matches this. */
  prompt: string;
  files: FileItem[];
  chatTurns: ChatTurn[];
  llmMessages: ChatMessage[];
  contextMessages: ChatMessage[];
  templateType: "react" | "node" | null;
}

function isSnapshotShaped(value: unknown): value is BuilderSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.prompt === "string" &&
    Array.isArray(v.files) &&
    Array.isArray(v.chatTurns) &&
    Array.isArray(v.llmMessages) &&
    Array.isArray(v.contextMessages) &&
    (v.templateType === "react" ||
      v.templateType === "node" ||
      v.templateType === null)
  );
}

/** Silently does nothing where storage cannot be reached — SSR, a full quota, or a browser that blocks it. */
export function saveBuilderSnapshot(snapshot: BuilderSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded (a large generated project) or storage disabled (private
    // browsing). A refresh just won't restore; not worth a fallback here.
  }
}

/** Returns null on anything short of an exact prompt match — a different prompt means a different project, not a resume. */
export function loadBuilderSnapshot(prompt: string): BuilderSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshotShaped(parsed) || parsed.prompt !== prompt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearBuilderSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to recover from — the slot was never usable either way.
  }
}
