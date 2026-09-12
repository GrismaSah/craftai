/**
 * Client-side transport for /api/chat.
 *
 * Owns three things the builder page used to hand-roll (badly):
 *   1. UTF-8-safe stream decoding.
 *   2. Stripping the out-of-band sentinels the route appends after HTTP 200 is committed.
 *   3. The CONTINUE_PROMPT loop when a generation is cut off mid-artifact.
 */

import { CONTINUE_PROMPT } from "@/lib/prompts";
import {
  MAX_OUTPUT_TOKENS,
  REQUEST_TOKEN_LIMIT,
  SYSTEM_PROMPT_TOKENS,
} from "@/lib/constants";
import type { ArtifactEvent, ArtifactParser } from "@/lib/artifactParser";
import { createArtifactParser } from "@/lib/artifactParser";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The route cannot send an HTTP 429 once `toTextStreamResponse()` has committed a 200,
 * so upstream failures arrive as these trailing markers in the body instead.
 * Keep in sync with src/app/api/chat/route.ts.
 */
const ERROR_OPEN = "<craftaiError>";
const ERROR_CLOSE = "</craftaiError>";
const TRUNCATED = "<craftaiTruncated/>";

export interface StreamError {
  code:
    | "quota_exceeded"
    | "too_many_requests"
    | "request_too_large"
    | "upstream_rejected"
    | "internal_error"
    | string;
  message?: string;
  /**
   * Seconds to wait, from the `Retry-After` header. Only set for
   * `too_many_requests`; the UI can turn it into a countdown instead of an
   * open-ended "try again later".
   */
  retryAfter?: number;
}

/** Longest suffix of `buf` that is a proper prefix of `sentinel`. */
function pendingPrefixLen(buf: string, sentinel: string): number {
  const max = Math.min(buf.length, sentinel.length - 1);
  for (let k = max; k > 0; k--) {
    if (sentinel.startsWith(buf.slice(buf.length - k))) return k;
  }
  return 0;
}

/**
 * Splits streamed text into model output and trailing control sentinels.
 *
 * Sentinels only ever appear at the tail, but they can still straddle a chunk
 * boundary, so text whose suffix could begin one is held back rather than
 * forwarded to the parser and then retracted.
 */
class SentinelFilter {
  private buf = "";
  private tail = "";
  private tripped = false;

  /** Returns the model text safe to forward to the artifact parser. */
  push(chunk: string): string {
    if (this.tripped) {
      this.tail += chunk;
      return "";
    }

    this.buf += chunk;

    for (const opener of [ERROR_OPEN, TRUNCATED]) {
      const at = this.buf.indexOf(opener);
      if (at >= 0) {
        const safe = this.buf.slice(0, at);
        this.tail = this.buf.slice(at);
        this.buf = "";
        this.tripped = true;
        return safe;
      }
    }

    const hold = Math.max(
      pendingPrefixLen(this.buf, ERROR_OPEN),
      pendingPrefixLen(this.buf, TRUNCATED)
    );
    const safe = this.buf.slice(0, this.buf.length - hold);
    this.buf = this.buf.slice(this.buf.length - hold);
    return safe;
  }

  /** Flushes any held-back text that turned out not to be a sentinel. */
  end(): string {
    const rest = this.buf;
    this.buf = "";
    return rest;
  }

  get truncated(): boolean {
    return this.tail.includes(TRUNCATED);
  }

  get error(): StreamError | null {
    const open = this.tail.indexOf(ERROR_OPEN);
    if (open < 0) return null;
    const start = open + ERROR_OPEN.length;
    const close = this.tail.indexOf(ERROR_CLOSE, start);
    const raw = this.tail.slice(start, close < 0 ? undefined : close);
    try {
      const parsed = JSON.parse(raw) as StreamError;
      return parsed?.code ? parsed : { code: "internal_error" };
    } catch {
      // A sentinel we cannot parse is still a failure signal; do not swallow it.
      return { code: "internal_error" };
    }
  }
}

/**
 * Drains a text stream, decoding incrementally.
 *
 * `{ stream: true }` is the whole point: without it TextDecoder treats every chunk as a
 * complete document, so any multi-byte character straddling a chunk boundary decodes to
 * U+FFFD and silently corrupts the generated code.
 */
export async function readTextStream(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) {
        full += text;
        onText(text);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const tail = decoder.decode();
  if (tail) {
    full += tail;
    onText(tail);
  }

  return full;
}

export interface StreamTurnResult {
  /** Raw assistant text, sentinels stripped — this is what goes into llmMessages. */
  text: string;
  /** Conversational text the model wrote outside any artifact. Empty for a pure build. */
  prose: string;
  /** True when the model emitted at least one artifact, i.e. this was a build turn. */
  builtSomething: boolean;
  /** Distinct file paths written by this turn. */
  filesWritten: number;
  /** True only when a real artifact was left unterminated. A prose-only reply is NOT truncated. */
  truncated: boolean;
  error: StreamError | null;
  aborted: boolean;
}

export interface StreamTurnOptions {
  messages: ChatMessage[];
  onEvents: (events: ArtifactEvent[]) => void;
  /** Continuation attempts after a cut-off response. One is plenty; more invites loops. */
  maxContinues?: number;
  signal?: AbortSignal;
}


/**
 * Token budgeting for a tokens-per-minute capped plan.
 *
 * Groq rejects a single request that exceeds the plan's TPM allowance with HTTP 413,
 * counting prompt AND completion. The dominant growth term is conversation history: a
 * build turn's assistant reply contains every file it wrote, so replaying it verbatim
 * each turn blows the budget by the second message.
 *
 * Characters-per-token measured against Groq's own tokenizer on this project's real
 * prompts: 4.4 for prose, 3.4 for source-heavy text. Use the pessimistic figure.
 */
const CHARS_PER_TOKEN = 3.3;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface FitOptions {
  /** Total per-request token allowance. Defaults to `REQUEST_TOKEN_LIMIT`. */
  limit?: number;
  /** Tokens the server-side system prompt will add. */
  systemTokens?: number;
  /**
   * Tokens to leave for the model's reply. Defaults to `MAX_OUTPUT_TOKENS` —
   * the same constant /api/chat passes as `maxOutputTokens`. Overriding it with
   * anything smaller than what the route actually requests reintroduces the 413.
   */
  outputReserve?: number;
}

/**
 * Assembles the message list for one turn, newest-first, until the budget runs out.
 *
 * Always kept: the final user message (the actual request) and `context[0]` (the build
 * format rules). `context[1]` — the initial scaffold listing — is dropped as soon as
 * real history exists, because the history supersedes it and it costs ~1600 tokens.
 */
export function fitMessages(
  context: ChatMessage[],
  history: ChatMessage[],
  next: ChatMessage,
  {
    limit = REQUEST_TOKEN_LIMIT,
    systemTokens = SYSTEM_PROMPT_TOKENS,
    // Derived, never a literal: the route's `maxOutputTokens` and this reserve
    // are the same number by construction, so they cannot drift apart again.
    outputReserve = MAX_OUTPUT_TOKENS,
  }: FitOptions = {}
): ChatMessage[] {
  const budget = Math.max(500, limit - systemTokens - outputReserve);

  const rules = context.slice(0, 1);
  const scaffold = context.slice(1);

  let used =
    estimateTokens(next.content) +
    rules.reduce((n, m) => n + estimateTokens(m.content), 0);

  const kept: ChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = estimateTokens(history[i].content);
    if (used + cost > budget) break;
    used += cost;
    kept.unshift(history[i]);
  }

  // Only pay for the scaffold listing while it is the model's sole view of the project.
  const head = [...rules];
  if (kept.length === 0) {
    for (const m of scaffold) {
      const cost = estimateTokens(m.content);
      if (used + cost > budget) break;
      used += cost;
      head.push(m);
    }
  }

  return [...head, ...kept, next];
}

async function postChat(
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<Response> {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
}

/**
 * Runs one builder turn, transparently continuing a response that was cut off.
 *
 * A single parser instance spans every continuation — `end()` is called only once, at the
 * very end. That is why the parser is a stateful object: CONTINUE_PROMPT makes the model
 * resume mid-file with no reopening tag, so the parser must still be sitting inside the
 * open <boltAction> when the next response starts arriving.
 */
export async function streamArtifactTurn({
  messages,
  onEvents,
  maxContinues = 1,
  signal,
}: StreamTurnOptions): Promise<StreamTurnResult> {
  // Prose is captured, not discarded: the model answers questions in plain text and
  // the builder needs somewhere to show that.
  const parser: ArtifactParser = createArtifactParser({
    emitDeltas: true,
    emitProse: true,
  });

  let prose = "";
  const written = new Set<string>();
  const collect = (events: ArtifactEvent[]) => {
    for (const e of events) {
      if (e.kind === "prose") prose += e.text;
      // A diff action never produces a `file-close`, so counting only those made a
      // pure-edit turn report zero files written and dropped the file-count chip
      // from a reply that had in fact changed the project. `builtSomething` is
      // driven by `sawArtifact()`, not by this set, so tab routing is unaffected.
      else if (e.kind === "file-close" || e.kind === "file-patch") written.add(e.path);
    }
    onEvents(events);
  };

  let conversation = [...messages];
  let assistantText = "";
  let truncated = false;
  let error: StreamError | null = null;
  let attempts = 0;

  try {
    for (;;) {
      const response = await postChat(conversation, signal);

      if (!response.ok) {
        let payload: { error?: string; message?: string } = {};
        try {
          payload = await response.json();
        } catch {
          /* non-JSON error body */
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        error = {
          code: payload.error ?? `http_${response.status}`,
          message: payload.message,
          ...(Number.isFinite(retryAfter) && retryAfter > 0
            ? { retryAfter }
            : {}),
        };
        break;
      }

      if (!response.body) {
        error = { code: "empty_response" };
        break;
      }

      const filter = new SentinelFilter();
      let turnText = "";

      await readTextStream(response.body, (chunk) => {
        const safe = filter.push(chunk);
        if (!safe) return;
        turnText += safe;
        const events = parser.write(safe);
        if (events.length) collect(events);
      });

      const rest = filter.end();
      if (rest) {
        turnText += rest;
        const events = parser.write(rest);
        if (events.length) collect(events);
      }

      assistantText += turnText;
      error = filter.error;
      truncated = filter.truncated;

      if (error) break;

      // Continue only when the parser is genuinely mid-artifact. A clean finish with a
      // `length` finish_reason still means we have every file the model managed to emit.
      const cutOff = truncated || parser.isOpen();
      if (!cutOff || attempts >= maxContinues) {
        truncated = cutOff;
        break;
      }

      attempts += 1;
      conversation = [
        ...conversation,
        { role: "assistant", content: assistantText },
        { role: "user", content: CONTINUE_PROMPT },
      ];
    }
  } catch (err) {
    if (signal?.aborted || (err as Error)?.name === "AbortError") {
      return {
        text: assistantText,
        prose,
        builtSomething: parser.sawArtifact(),
        filesWritten: written.size,
        truncated,
        error: null,
        aborted: true,
      };
    }
    error = {
      code: "network_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const tail = parser.end();
  if (tail.length) collect(tail);

  // `no-artifact` means the model chose to answer in prose rather than build — that is a
  // valid reply, not a cut-off one. Only an artifact left hanging counts as truncation.
  if (!truncated) {
    truncated = tail.some(
      (e) =>
        e.kind === "incomplete" &&
        (e.reason === "open-action" || e.reason === "open-artifact")
    );
  }

  return {
    text: assistantText,
    prose: prose.trim(),
    builtSomething: parser.sawArtifact(),
    filesWritten: written.size,
    truncated,
    error,
    aborted: false,
  };
}
