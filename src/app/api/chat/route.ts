import { streamText } from "ai";
import { getSystemPrompt } from "@/lib/prompts";
import { MAX_OUTPUT_TOKENS } from "@/lib/constants";
import {
  MODELS,
  classifyError,
  errorResponse,
  getGroq,
  reasoningOptions,
  tooManyRequestsResponse,
} from "@/lib/ai/groq";
import { CHAT_BUDGETS, checkBudgets, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * A full multi-file artifact can take a couple of minutes to emit. 300s is the
 * ceiling most hosts allow for a streaming node function; the stream is
 * incremental, so the client sees progress long before this fires.
 */
export const maxDuration = 300;

/**
 * `MAX_OUTPUT_TOKENS` is imported, not declared here, on purpose.
 *
 * Groq's TPM budget counts prompt AND completion against one per-minute figure —
 * 70,000 for `groq/compound-mini` on this account, verified from
 * `x-ratelimit-limit-tokens`. The client's `fitMessages()` has to reserve exactly
 * as many tokens as this route then requests; when the two were separate literals
 * (4,096 here against a 3,000 reserve there) a full history assembled ~9,096
 * tokens against the then-8,000 ceiling and Groq answered 413. Both sides now
 * read `src/lib/constants.ts`, which is where the whole budget is explained.
 *
 * Larger projects still finish via the CONTINUE_PROMPT path in
 * src/lib/chatStream.ts rather than by raising this.
 */

/**
 * ~60k tokens of input — far above `REQUEST_TOKEN_LIMIT`, which is the real
 * budget. This is only a DoS backstop, so that a multi-megabyte body is rejected
 * before it is parsed into messages rather than after.
 */
const MAX_INPUT_CHARS = 200_000;

/** Roles the client is allowed to send. `system` is owned by the server. */
type ClientRole = "user" | "assistant";

interface ClientMessage {
  role: ClientRole;
  content: string;
}

type ValidationResult =
  | { ok: true; messages: ClientMessage[]; strippedSystemTurns: number }
  | { ok: false; status: number; error: string; message: string };

/**
 * Hand-written because `zod` does not resolve in this project — it is bundled
 * inside the AI SDK's own dependency tree (`zod/v4` under `@ai-sdk/*`) and is
 * not a direct dependency, so importing it here would be relying on a hoisting
 * accident. Verified with `node -e "require.resolve('zod')"` -> MODULE_NOT_FOUND.
 */
function validateBody(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_body",
      message: "Request body must be a JSON object.",
    };
  }

  const { messages } = body as { messages?: unknown };

  if (!Array.isArray(messages)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_body",
      message: "`messages` must be an array.",
    };
  }

  const accepted: ClientMessage[] = [];
  let strippedSystemTurns = 0;
  let totalChars = 0;

  for (const raw of messages) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {
        ok: false,
        status: 400,
        error: "invalid_body",
        message: "Each message must be an object.",
      };
    }

    const { role, content } = raw as { role?: unknown; content?: unknown };

    if (typeof content !== "string") {
      return {
        ok: false,
        status: 400,
        error: "invalid_body",
        message: "Each message must have string `content`.",
      };
    }

    // The server owns the system prompt. A client-supplied system turn on a
    // public, unauthenticated endpoint is a prompt-injection vector and would
    // also fight the real system prompt for the model's attention.
    if (role === "system") {
      strippedSystemTurns += 1;
      continue;
    }

    if (role !== "user" && role !== "assistant") {
      return {
        ok: false,
        status: 400,
        error: "invalid_body",
        message: "Message `role` must be 'user' or 'assistant'.",
      };
    }

    totalChars += content.length;
    if (totalChars > MAX_INPUT_CHARS) {
      return {
        ok: false,
        status: 413,
        error: "payload_too_large",
        message: `Conversation exceeds the ${MAX_INPUT_CHARS} character limit. Start a new build.`,
      };
    }

    accepted.push({ role, content });
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid_body",
      message: "At least one user or assistant message is required.",
    };
  }

  return { ok: true, messages: accepted, strippedSystemTurns };
}

function badRequest(result: Extract<ValidationResult, { ok: false }>): Response {
  return Response.json(
    { error: result.error, message: result.message },
    { status: result.status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request): Promise<Response> {
  // ---- Everything detectable before the stream starts returns a real status.

  // First, before parsing the body: this is the expensive route, and the whole
  // point of the limiter is that a refusal costs nothing. It must also run
  // before the stream is returned — once a 200 is committed the status line is
  // fixed and a 429 can no longer be expressed (see src/lib/chatStream.ts:20).
  const throttled = checkBudgets(clientKey(req), CHAT_BUDGETS);
  if (!throttled.ok) return tooManyRequestsResponse(throttled.retryAfter);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "invalid_body", message: "Request body must be valid JSON." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const validated = validateBody(body);
  if (!validated.ok) return badRequest(validated);

  if (validated.strippedSystemTurns > 0) {
    console.warn(
      `[api/chat] stripped ${validated.strippedSystemTurns} client-supplied system message(s)`
    );
  }

  let model;
  try {
    model = getGroq()(MODELS.generation.id);
  } catch (error) {
    // Missing API key -> real 503 before any bytes are committed.
    return errorResponse(error, "api/chat");
  }

  // ---- Past this point the status line is committed to 200, so errors have to
  // travel in-band. See the sentinel below.
  let streamError: unknown;

  const result = streamText({
    model,
    system: getSystemPrompt(),
    messages: validated.messages,
    // Defence in depth: even if a system turn slipped past validation the SDK
    // would reject it rather than silently merging it into the prompt.
    allowSystemInMessages: false,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // Derived from the model's own capability flag. `groq/compound-mini` does not
    // accept `reasoning_format` and Groq rejects the whole call with HTTP 400
    // rather than ignoring it, so this must never be hard-coded here again.
    providerOptions: reasoningOptions(MODELS.generation),
    // Stop billing the moment the client goes away.
    abortSignal: req.signal,
    onError: ({ error }) => {
      streamError = error;
    },
  });

  const encoder = new TextEncoder();

  // Raw text stream — a downstream parser in the builder consumes this verbatim,
  // so no SSE/NDJSON framing. Errors and truncation are signalled with sentinel
  // lines appended after the model output.
  const passthrough = new TransformStream<Uint8Array, Uint8Array>();
  const writer = passthrough.writable.getWriter();

  void (async () => {
    try {
      for await (const chunk of result.textStream) {
        // `await` preserves backpressure from the client socket.
        await writer.write(encoder.encode(chunk));
      }

      if (streamError) {
        await writeErrorSentinel(writer, encoder, streamError);
      } else {
        const finishReason = await Promise.resolve(result.finishReason).catch(
          () => undefined
        );
        if (finishReason === "length") {
          // The model hit MAX_OUTPUT_TOKENS mid-artifact. The client can use
          // this to fire a continuation request instead of rendering a
          // half-written file tree as if it were complete.
          await writer.write(encoder.encode("\n<craftaiTruncated/>"));
        }
      }
    } catch (error) {
      if (req.signal.aborted) {
        // Client hung up; nothing left to tell it.
      } else {
        await writeErrorSentinel(writer, encoder, streamError ?? error);
      }
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(passthrough.readable, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // Proxies that buffer the body defeat incremental delivery and look
      // exactly like a broken client-side parser.
      "X-Accel-Buffering": "no",
    },
  });
}

async function writeErrorSentinel(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  error: unknown
): Promise<void> {
  const { code, message } = classifyError(error);
  console.error(`[api/chat] stream error (${code}):`, error);

  const sentinel = `\n<craftaiError>${JSON.stringify({ code, message })}</craftaiError>`;
  await writer.write(encoder.encode(sentinel)).catch(() => {});
}
