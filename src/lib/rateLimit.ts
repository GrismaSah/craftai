/**
 * Fixed-window rate limiting for the two API routes.
 *
 * WHAT THIS IS NOT
 * ----------------
 * The counters live in a module-scope `Map`, so they are **per process** and
 * **reset on every deploy**. On a single long-lived `next start` container this
 * is a real control. On Vercel serverless — where each concurrent invocation may
 * get its own isolate and instances are recycled constantly — it is close to
 * decorative: N instances multiply every budget by N, and a cold start clears
 * the window. It exists because "unmetered public endpoint spending the owner's
 * Groq credits" is worse than an imperfect limiter, not because it is correct.
 *
 * The moment this app is deployed anywhere horizontally scaled, this must move
 * to shared state (Upstash/Redis `INCR` + `EXPIRE`, or Vercel KV). The call
 * sites do not need to change — only the body of `check()`.
 *
 * Deliberately lives inside the route handlers rather than `src/proxy.ts`: the
 * Proxy docs (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md)
 * warn that a proxy "is meant to be invoked separately of your render code and
 * in optimized cases deployed to your CDN ... you should not attempt relying on
 * shared modules or globals". Route handlers are plain Node modules, so
 * module-scope state is sound there.
 */

interface Window {
  count: number;
  /** Epoch ms at which this window expires and the count resets. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * Full-map sweeps are O(n); doing one per request would make the limiter itself
 * a load amplifier. Sweeping at most once per window-ish interval keeps the map
 * bounded by (distinct clients seen in the last minute) rather than by (distinct
 * clients seen ever), which is the actual leak we care about.
 */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, win] of windows) {
    if (win.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets. 0 when `ok`. Suitable for `Retry-After`. */
  retryAfter: number;
}

/**
 * Consumes one unit against `key`'s window.
 *
 * Fixed window, not sliding: a client can burst `limit` at the end of one window
 * and `limit` again at the start of the next. Accepted — the numbers below are
 * chosen so that even 2x the nominal rate is affordable.
 */
export function check(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);

  // The key's own expired entry is always evicted, independent of the throttled
  // full sweep, so a returning client never inherits a stale count.
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, retryAfter: 0 };
}

export interface Budget {
  limit: number;
  windowMs: number;
  /** Disambiguates this window's keys from another budget's for the same client. */
  scope: string;
}

/**
 * /api/chat is the expensive route: `maxDuration = 300`, up to ~24k prompt plus
 * 8k completion tokens per call, against an account allowance of 70,000 TPM and
 * **250 requests/day**. The daily figure is what drives these numbers.
 *
 * Per minute: a legitimate turn can fire at most three requests in quick
 * succession — the turn itself, one continuation (`chatStream.ts maxContinues =
 * 1`), and a later patch-recovery turn. 6 leaves 2x headroom for a fast typist
 * while capping a scripted client at 6/min instead of hundreds.
 *
 * Per hour: 40 is roughly one build turn every 90 seconds, which is faster than
 * anyone actually iterates, and bounds a single abusive IP to ~16% of the 250
 * daily requests per hour. Without this second window a client at exactly 6/min
 * would exhaust the entire day's account budget in 42 minutes.
 */
export const CHAT_BUDGETS: readonly Budget[] = [
  { limit: 6, windowMs: 60_000, scope: "chat:m" },
  { limit: 40, windowMs: 60 * 60_000, scope: "chat:h" },
];

/**
 * /api/template is one short classification call on a cheaper model with its own
 * per-model allowance, and the client fires exactly one per new build. 20/min is
 * generous for a human and still stops a loop dead.
 */
export const TEMPLATE_BUDGETS: readonly Budget[] = [
  { limit: 20, windowMs: 60_000, scope: "tpl:m" },
];

/**
 * Applies every budget in order and returns the first refusal.
 *
 * Short-circuits on refusal so a client that is already blocked by the minute
 * window does not also burn its hourly allowance.
 */
export function checkBudgets(
  client: string,
  budgets: readonly Budget[]
): RateLimitResult {
  for (const { limit, windowMs, scope } of budgets) {
    const result = check(`${scope}:${client}`, limit, windowMs);
    if (!result.ok) return result;
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Best-effort client identity.
 *
 * `NextRequest.ip` was removed in Next 15, so there is no built-in. `x-forwarded-for`
 * is a client-controlled header: behind a trusted proxy that overwrites it (Vercel,
 * Cloudflare, an nginx with `proxy_set_header`) the first hop is the real client, but
 * on a bare `next start` with no proxy in front, anyone can send
 * `X-Forwarded-For: <random>` per request and get a fresh bucket every time. That is
 * the honest ceiling of this tier: a speed bump against casual abuse and runaway
 * client loops, not an access control. Real enforcement needs auth or a trusted edge.
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  // Set by some proxies (nginx, Cloudflare) and not by browsers; same caveat.
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;

  // No identity at all — everyone shares one bucket. Fails closed-ish rather
  // than handing unidentified traffic an unmetered path.
  return "unknown";
}
