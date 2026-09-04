export const WORK_DIR_NAME = 'project';
export const WORK_DIR = `/home/${WORK_DIR_NAME}`;

/**
 * Token budget for one /api/chat turn.
 *
 * These three numbers are one budget and must be read together, which is why
 * they live here rather than half in the route and half in `chatStream.ts`.
 * Splitting them is what produced a live 413: the route asked for 4,096 output
 * tokens while `fitMessages` reserved only 3,000, so a full history could
 * assemble 1,800 + 3,200 + 4,096 = 9,096 against an 8,000 ceiling.
 * `MAX_OUTPUT_TOKENS` is now the single source for both sides.
 *
 * WHY NOT `groq/compound-mini`, despite its advertised 70,000 TPM. It was tried
 * and reverted, measured against this account:
 *
 *   - Its 70,000 TPM belongs to the WRAPPER. compound is an agentic router, and
 *     each real generation runs on an inner model that keeps the free tier's own
 *     8,000 TPM. Observed inner models: `openai/gpt-oss-120b` AND
 *     `llama-3.3-70b-versatile` (the latter is not even listed for this account).
 *     Four rapid calls -> two failed with `Rate limit reached for model ... Limit
 *     8000`, tagged `type: 'compound'`. The headroom does not exist.
 *   - It bills ~2.15x the prompt: the same 7,822-char system prompt costs 4,199
 *     prompt_tokens on compound-mini and 1,955 on gpt-oss-120b.
 *
 * So compound-mini was strictly worse on both cost and reliability. Check the
 * inner model's limit, not the wrapper's headline, before trying this again.
 */

/** Hard cap on the model's reply, and the reserve `fitMessages` holds back for it. */
export const MAX_OUTPUT_TOKENS = 4_096;

/**
 * What `getSystemPrompt()` actually costs on the generation model, rounded up.
 *
 * MEASURED, not estimated, against Groq's own accounting rather than
 * `estimateTokens()` — send the rendered prompt with `max_tokens: 1` and read
 * `usage.prompt_tokens` back. On `openai/gpt-oss-120b`:
 *
 *   5,811 chars (before the diff rules) -> 1,482 prompt_tokens
 *   7,822 chars (with the diff rules)   -> 1,955 prompt_tokens
 *
 * The diff rules therefore cost +473 tokens per turn. A 3.3 chars/token estimate
 * would have predicted +609 - close here, but the same estimate was 70% low on
 * compound-mini, because per-model overhead is invisible to a character ratio.
 * Re-measure when the prompt or the model changes; an estimate here silently
 * under-reserves the budget, which is the drift that caused the 413 above.
 */
export const SYSTEM_PROMPT_TOKENS = 2_000;

/**
 * Ceiling for prompt + completion of a single request: the account's real
 * per-minute allowance on `openai/gpt-oss-120b`, confirmed from
 * `x-ratelimit-limit-tokens`. Prompt AND completion count against it.
 *
 * That leaves 8,000 - 2,000 - 4,096 = ~1,900 tokens for history, which is thin.
 * It is the reason diff edits matter: a follow-up that rewrites a 200-line file
 * in full does not fit, while the same edit as a diff costs a few hundred tokens.
 */
export const REQUEST_TOKEN_LIMIT = 8_000;
