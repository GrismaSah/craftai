import { createGroq } from "@ai-sdk/groq";
import { APICallError } from "ai";

export interface ModelConfig {
  /** Groq model id, verified live against `/openai/v1/models` for this account. */
  readonly id: string;
  /**
   * Whether the model accepts `reasoning_format`.
   *
   * This is not cosmetic: Groq rejects the parameter outright with HTTP 400
   * (`"\`reasoning_format\` is not supported with this model"`) rather than
   * ignoring it, so getting this wrong takes the route down completely. It is a
   * property of the model, so it lives next to the id — a future model swap that
   * edits only the id cannot reintroduce the mismatch.
   */
  readonly supportsReasoningFormat: boolean;
}

/**
 * Model ids verified live against the Groq `/openai/v1/models` endpoint for this
 * account. Do not swap these for ids copied from Groq's public docs — this
 * account does not have access to the whole catalogue.
 *
 * - `groq/compound-mini`   agentic model with server-side tool use, 70,000 TPM /
 *   250 requests per day on this account. Used for artifact generation. It is
 *   NOT a `reasoning_format` model; passing the option is a hard 400.
 * - `qwen/qwen3.8-27b`     context 131,042 / max completion 16,384. Cheap and
 *   fast; used only for the chat|react|node classification. A reasoning model,
 *   so its chain-of-thought must be suppressed or it corrupts the parsed output.
 *
 * Build the per-call options with `reasoningOptions()` rather than hand-writing
 * `providerOptions` at the call site.
 */
export const MODELS = {
  generation: {
    id: "openai/gpt-oss-120b",
    supportsReasoningFormat: true,
  },
  classification: {
    id: "qwen/qwen3.8-27b",
    supportsReasoningFormat: true,
  },
} as const satisfies Record<string, ModelConfig>;

/**
 * Written out structurally rather than imported: the AI SDK's `ProviderOptions`
 * lives in `@ai-sdk/provider-utils`, which `ai` imports but does not re-export,
 * so naming it here would mean depending on a transitive package. The literal is
 * assignable to the `providerOptions` parameter either way.
 */
type ReasoningProviderOptions = { groq: { reasoningFormat: "hidden" } };

/**
 * `providerOptions` for a model, hiding chain-of-thought where that is supported
 * and sending nothing where it is not.
 *
 * Returns `undefined` (not `{}`) for models without the capability so the key is
 * absent from the request body entirely.
 */
export function reasoningOptions(
  model: ModelConfig
): ReasoningProviderOptions | undefined {
  return model.supportsReasoningFormat
    ? { groq: { reasoningFormat: "hidden" } }
    : undefined;
}

/**
 * Thrown at *call* time (never at import time) when `GROQ_API_KEY` is absent.
 *
 * The previous NVIDIA provider threw at module scope. `next build` imports every
 * route module to collect page data, so that throw killed the build on any
 * machine without the key, and turned a config mistake into an opaque 500 at
 * runtime. Keep the throw lazy.
 */
export class MissingApiKeyError extends Error {
  constructor(
    message = "GROQ_API_KEY is not set. Add it to .env.local — see .env.example."
  ) {
    super(message);
    this.name = "MissingApiKeyError";
  }
}

let provider: ReturnType<typeof createGroq> | undefined;

/**
 * Lazily creates and memoizes the Groq provider.
 *
 * @throws {MissingApiKeyError} if `GROQ_API_KEY` is unset or empty.
 */
export function getGroq(): ReturnType<typeof createGroq> {
  if (provider) return provider;

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new MissingApiKeyError();

  provider = createGroq({ apiKey });
  return provider;
}

export type ApiErrorCode =
  | "missing_api_key"
  | "quota_exceeded"
  | "too_many_requests"
  | "request_too_large"
  | "upstream_rejected"
  | "internal_error";

export type ApiErrorBody =
  | { error: "missing_api_key"; message: string }
  | { error: "quota_exceeded"; message: string }
  | { error: "too_many_requests"; message: string }
  | { error: "request_too_large"; message: string }
  | { error: "upstream_rejected"; message: string }
  | { error: "internal_error" };

export interface ClassifiedError {
  status: number;
  code: ApiErrorCode;
  /** Safe to show a user. Never contains upstream error detail. */
  message: string;
  /** Exact JSON body both routes return. */
  body: ApiErrorBody;
}

const QUOTA_MESSAGE =
  "Rate limit reached. Please wait a moment and try again.";
const TOO_LARGE_MESSAGE =
  "This conversation is too large for your Groq plan's per-minute token limit. " +
  "Start a new build, or upgrade at console.groq.com/settings/billing.";
const INTERNAL_MESSAGE = "Something went wrong. Please try again.";
const THROTTLED_MESSAGE =
  "You are sending requests too quickly. Please wait a moment and try again.";
/**
 * Deliberately says "misconfigured", not "try again": a 400 from Groq is a bad
 * request *we* built, so retrying cannot help. It is called out separately
 * because the last one — `reasoning_format` sent to a model that rejects it —
 * broke every /api/chat call while presenting to the client as a generic
 * `internal_error`, exactly the misdiagnosis HANDOVER.md records for the 413.
 */
const UPSTREAM_REJECTED_MESSAGE =
  "The server sent an invalid request to Groq. This is a server-side " +
  "misconfiguration, not something retrying will fix — check the server logs.";

/**
 * Maps an unknown thrown/streamed error onto the response shape both routes use.
 *
 * `APICallError` is re-exported from `@ai-sdk/provider` through `ai` and carries
 * a typed `statusCode`, so there is no need to cast through `Record<string, unknown>`.
 */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof MissingApiKeyError) {
    return {
      status: 503,
      code: "missing_api_key",
      message: error.message,
      body: { error: "missing_api_key", message: error.message },
    };
  }

  // Groq signals "this single request exceeds your tokens-per-minute allowance" with
  // HTTP 413 and `code: rate_limit_exceeded`, NOT 429. Without this branch it fell
  // through to a generic 500 and the user saw an empty builder with no explanation.
  if (APICallError.isInstance(error) && error.statusCode === 413) {
    return {
      status: 413,
      code: "request_too_large",
      message: TOO_LARGE_MESSAGE,
      body: { error: "request_too_large", message: TOO_LARGE_MESSAGE },
    };
  }

  if (APICallError.isInstance(error) && error.statusCode === 429) {
    return {
      status: 429,
      code: "quota_exceeded",
      message: QUOTA_MESSAGE,
      body: { error: "quota_exceeded", message: QUOTA_MESSAGE },
    };
  }

  // A 400 is our bug, not the user's, and it must not hide inside the 500 bucket.
  // 502 rather than 400 to the client: the client's request was fine.
  if (APICallError.isInstance(error) && error.statusCode === 400) {
    return {
      status: 502,
      code: "upstream_rejected",
      message: UPSTREAM_REJECTED_MESSAGE,
      body: { error: "upstream_rejected", message: UPSTREAM_REJECTED_MESSAGE },
    };
  }

  return {
    status: 500,
    code: "internal_error",
    message: INTERNAL_MESSAGE,
    body: { error: "internal_error" },
  };
}

/**
 * Local rate-limit refusal — the request never reached Groq.
 *
 * Distinct from `quota_exceeded` (Groq's own 429) on purpose: one means "you are
 * going too fast for this deployment", the other means "the account's allowance
 * is spent". Conflating them would tell the user to wait for the wrong thing.
 */
export function tooManyRequestsResponse(retryAfter: number): Response {
  const body: ApiErrorBody = {
    error: "too_many_requests",
    message: THROTTLED_MESSAGE,
  };

  return Response.json(body, {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(Math.max(1, Math.ceil(retryAfter))),
    },
  });
}

/**
 * Convenience wrapper for the pre-stream error paths. Logs the real error
 * server-side and returns only the sanitized body to the client.
 */
export function errorResponse(error: unknown, context: string): Response {
  const classified = classifyError(error);
  console.error(`[${context}] ${classified.code}:`, error);

  return Response.json(classified.body, {
    status: classified.status,
    headers: { "Cache-Control": "no-store" },
  });
}
