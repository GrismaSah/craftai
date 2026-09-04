# CraftAI — Engineering Handover

**Last updated:** 2026-09-04
**Branch:** `main` (nothing committed — all work is uncommitted in the working tree)
**Stack:** Next.js 16.2.6 (App Router) · React 19.2.4 · TypeScript strict · Tailwind v3 · AI SDK v6 · Groq · WebContainer

---

## 1. What this is

A Bolt.new / Lovable-style builder: you describe a website, an LLM writes a complete
multi-file project, and it runs live in the browser via WebContainer.

**Goal: parity with bolt.new / Lovable.** Section 6 is an honest map of the distance
left. The core generation loop works; the product scaffolding around it largely does not
exist yet.

---

## 2. Current architecture

```
Landing (/)                    src/components/Home.tsx + src/sections/*
  └─ prompt ──> /builder?prompt=…

Builder (/builder)             src/app/builder/page.tsx      ← orchestrator
  ├─ POST /api/template        classify chat | react | node, return scaffold
  ├─ POST /api/chat            stream the generation
  ├─ src/lib/chatStream.ts     transport: UTF-8 decode, sentinels, continuation, token budget
  ├─ src/lib/artifactParser.ts incremental <boltArtifact> scanner  → ArtifactEvent[]
  ├─ src/lib/fileTree.ts       pure immutable tree reducer
  ├─ src/hooks/useArtifactStream.ts  batches events → one setFiles per ~50ms
  └─ panes: ChatPanel | CodeEditor (Monaco) | PreviewFrame (WebContainer)
```

**Data flow for one turn.** `fitMessages()` assembles a token-budgeted message list →
`POST /api/chat` → server owns the system prompt and streams raw text → the client parser
emits `file-open` / `file-delta` / `file-close` / `prose` events as bytes arrive →
`applyEvents` folds them immutably into `FileItem[]` → the tree renders progressively.

**Provider layer** is `src/lib/ai/groq.ts`: lazy memoized `getGroq()` (throws at *call*
time, never import time), `MODELS`, and `classifyError()` which both routes share.

---

## 3. What was done in this session

Every number below was measured against the running system, not estimated.

### Provider migration
The app was documented as Gemini, actually ran on **NVIDIA NIM**, and had Groq installed
but never imported. Now Groq-only.

- Deleted `src/lib/nvidia-provider.ts`, dropped `@ai-sdk/openai-compatible`
- **Neither originally planned model exists on this account.** Verified against
  `GET /openai/v1/models` before writing any code. Now: `openai/gpt-oss-120b` for
  generation, `qwen/qwen3.8-27b` for classification (3× faster, emits no reasoning tokens)
- Runtime deps 24 → 13

### The bug that made the app return nothing
Groq free tier caps at **8,000 tokens/minute**. Requests were 8,900–9,600 tokens and were
rejected with **HTTP 413** (`code: rate_limit_exceeded`). The error handler only knew
about 429, so it degraded to a generic 500 that the UI silently swallowed.

| | Before | After |
|---|---|---|
| System prompt | 3,685 tok | **1,479 tok** |
| Build rules | 314 | 314 |
| Scaffold listing (was resent every turn) | 1,608 | **0 after turn 1** |
| **Fixed overhead** | **5,607** | **1,793** |
| Headroom under 8,000 | 2,393 | **6,207** |

Also: 413 now maps to an actionable message; history is token-budgeted (flat ~7,900 vs
growing to 28,674 by turn 8); `maxOutputTokens` cut from 32,768 — which alone exceeded the
entire per-minute allowance — to 4,096.

### Chat vs. build routing
The model always answered questions correctly; the builder rendered only files and threw
the prose away, so questions appeared to return nothing.

- `/api/template` classifies **chat | react | node** — 9/9 on a live test set
- New `ChatPanel` renders the conversation; tabs route by intent (question → Chat,
  build → Code) and only appear once they mean something
- Brainstorm-then-build seeds the scaffold at the moment you actually ask to build
- Fixed the false "response was cut off" banner: a prose reply emits
  `incomplete: no-artifact`, which was wrongly read as truncation

### Correctness fixes (each verified)
- **UTF-8 corruption** — `decoder.decode(value)` without `{stream:true}`. The old reader
  mangled 39 characters in a 115-byte multibyte sample; the new one is byte-exact at every
  chunk boundary.
- **`next build` was broken** — `nvidia-provider.ts` threw at module scope, killing route
  collection. Build now succeeds even with no API key.
- **Streaming was cosmetic** — the client buffered the whole response then parsed once.
  Now 260–1,164 progressive render batches per generation.
- **React state mutation** — the old tree builder shallow-copied then mutated nested
  `children` arrays before `setFiles`. Replaced with a pure path-copying reducer.
- **WebContainer listener leak** — `bootServer` retries twice, each adding a
  `server-ready` listener. Note: **`.off()` does not exist**; `on()` returns an
  `Unsubscribe` function. That is why the original cleanup was commented out.
- **Prompt injection** — the client supplied its own `system` turn on a public endpoint.
  Server now owns the system prompt and strips client system turns (tested with a real
  injection: `PWNED` absent, artifact still produced, strip logged).
- **`/home` was a live broken route** — `src/pages/` is the Pages Router root, so
  `src/pages/home.tsx` served at `/home` with no `_app.tsx` (no CSS, no fonts). Moved to
  `src/components/Home.tsx`.
- **Classifier** — `answer.includes("react")` misfired on "a node API that serves a react
  app". Now enum-constrained output.
- Deleted: `/test` page (never worked — posted `{message}`, route wants `{messages}`),
  `GROQ_SETUP.md` (every claim false), 5 unused files, 10 unused deps, and the dead
  `MODIFICATIONS_TAG_NAME` / `allowedHTMLElements` constants.

### Verification status
`pnpm typecheck` ✅ · `pnpm build` ✅ (also with no API key) · parser byte-parity with the
old implementation on both starter blobs ✅ · parser identical when fed 1 byte at a time ✅ ·
all four user flows live-tested ✅

**Not verified:** the browser click-through. WebContainer needs cross-origin isolation that
cannot be driven headlessly. COOP/COEP headers are confirmed correct and the CDN JSZip load
survives the COEP policy, but nobody has watched the preview iframe boot.

---

## 4. Hard constraints — read before changing anything

1. **Groq free tier = 8,000 TPM, all standard models.** Prompt *and* completion count.
   This is the single biggest force on the design: it is why the system prompt is lean, why
   history is trimmed, and why `maxOutputTokens` is 4,096.

   **`groq/compound-mini` does NOT get you out of this — it was tried and reverted.**
   Its advertised **70,000 TPM belongs to the wrapper**. compound is an agentic router,
   and each real generation runs on an inner model that still carries the free tier's
   own 8,000 TPM. Observed inner models: `openai/gpt-oss-120b` *and*
   `llama-3.3-70b-versatile` (the latter is not even listed for this account). Four
   rapid calls produced two failures — `Rate limit reached for model ... Limit 8000`,
   tagged `type: 'compound'`. It also bills **~2.15x** the prompt: the same 7,822-char
   system prompt costs 4,199 prompt_tokens on compound-mini versus 1,955 on
   `openai/gpt-oss-120b`. Strictly worse on both cost and reliability.

   The lesson generalises: **check the inner model's limit, not the wrapper's headline.**
   `x-ratelimit-limit-tokens` on a compound model describes the router, not the work.
2. **Never regress the parser's terminator rule.** File content legitimately contains `<`
   (`<!doctype html>`, `<StrictMode>`, `<App />`). An action ends **only** on the literal
   `</boltAction>`.
3. **Paths carry a leading slash.** The scaffold emits `filePath="src/App.tsx"` but the
   tree stores `/src/App.tsx`, and `PreviewFrame` looks up `/package.json`. Do not
   "tidy" this to relative paths.
4. **Model IDs are account-specific.** The `@ai-sdk/groq` TypeScript union is a stale
   literal type, not proof of access. Always check `GET /openai/v1/models` first.
5. **`AGENTS.md` is real.** This Next.js version differs from most training data. Read
   `node_modules/next/dist/docs/` before writing routing or framework code.

---

## 5. Known-good verification commands

```bash
pnpm typecheck && pnpm lint && pnpm build

# Models actually available on this account
curl -s -H "Authorization: Bearer $GROQ_API_KEY" \
  https://api.groq.com/openai/v1/models | jq -r '.data[].id'

# Per-model rate limits (headers, not docs)
curl -sD - -o /dev/null -X POST https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"openai/gpt-oss-120b","messages":[{"role":"user","content":"hi"}],"max_tokens":1}' \
  | grep -i ratelimit

# Route smoke tests
curl -s -X POST localhost:3000/api/template -H 'Content-Type: application/json' \
  -d '{"prompt":"a landing page for a coffee shop"}'
curl -sN -X POST localhost:3000/api/chat -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"build a react counter app"}]}'
```

Server errors are logged to `.next/dev/logs/next-development.log` — check it before
theorising about a client bug.

---

## 6. Remaining work — the road to bolt.new / Lovable parity

### P0 — blocking, do first

| # | Item | Why |
|---|---|---|
| 1 | **Browser click-through** | Nobody has seen the WebContainer preview boot. Run `pnpm dev`, submit a prompt, confirm the iframe renders a live app. Everything else is built on this assumption. |
| 2 | **Decide model / tier** | 8,000 TPM is ~one build per minute. **`groq/compound-mini` is not an escape hatch — tried, measured, reverted (see §4.1).** Upgrading the Groq plan is the only real fix. This gates real usability. |
| 3 | **Rate limiting + abuse control** | Both API routes are **open and unmetered**. Anyone who finds the deployed URL spends your Groq credits. Do not deploy publicly until this exists. |

### P1 — required for a usable product

| # | Item | Notes |
|---|---|---|
| 4 | **Make the editor writable** | `CodeEditor.tsx:66` is `readOnly: true`. Users cannot touch their own code — a glaring gap vs both competitors. Needs debounced write-back into `FileItem[]` and a WebContainer `fs.writeFile`. |
| 5 | **Persistence** | All state is in-memory React. A refresh loses the project. Needs a DB (Postgres/Supabase), a `projects` table, and autosave. |
| 6 | **Auth + accounts** | None exists. Prerequisite for persistence, quotas and billing. Nav has dead "Sign in" / "Get started" buttons. |
| 7 | **Diff-based edits** | The system prompt mandates full-file rewrites. On an 8k budget that is brutally expensive, and it is the main reason follow-up turns strain the limit. Bolt uses targeted diffs. Highest-leverage token win available. |
| 8 | **Terminal + shell execution** | The parser emits `shell` events; **nothing consumes them**. `PreviewFrame` hardcodes `npm install` / `npm run dev`, and all output goes to `console.log`. Users need a visible terminal. Treat model-authored commands as untrusted — this is a deliberate security decision, not an oversight. |
| 9 | **Error auto-fix loop** | Bolt/Lovable read dev-server and build errors and feed them back for repair. We surface nothing. Large perceived-quality win. |

### P2 — competitive parity

| # | Item |
|---|---|
| 10 | **Deploy button** (Netlify/Vercel one-click) — currently ZIP download only |
| 11 | **GitHub export / sync** |
| 12 | **Project dashboard** — list, rename, duplicate, delete |
| 13 | **Version history / undo** — every generation is destructive today |
| 14 | **Node project run story** — the Preview tab is React-only (`page.tsx:412`); node projects generate code with no way to run it |
| 15 | **Image / screenshot input** — "build me this" from a design |
| 16 | **Share links** — public read-only project URLs |

### P3 — polish and debt

| # | Item |
|---|---|
| 17 | **`npm install` warm-start** — install dominates the 20–40s wait. Kick it off when `/package.json` closes rather than after the whole stream. Needs partial mount + cancellation if a later artifact rewrites `package.json`. |
| 18 | **12 lint errors** remain, all pre-existing and untouched by this session: `NewHeroSection.tsx` (4 `any` + a setState-in-effect), `downloadZip.ts` (3 `any`), `stripIndents.ts` (2 `any`), `NewFeaturesSection.tsx` (2 unescaped quotes). Plus 6 `<img>` warnings. |
| 19 | **Landing page is placeholder** — fake testimonials (John Doe, Sarah Kim), hotlinked CDN logos, pricing tiers with no checkout, 5 dead `href="#"` links in the footer. |
| 20 | **Three unreconciled design systems** — `DESIGN.md` describes *Cursor's* brand (`#f54e00`), `globals.css` declares purple (`#7c3aed`), the shipped UI uses `#ff8a5c`. Pick one. |
| 21 | **No tests, no test runner.** Verification is currently manual scripts. Add Vitest; `artifactParser.ts` and `fileTree.ts` are pure and trivially testable. |
| 22 | **Speech recognition duplicated** in `NewHeroSection.tsx` (untyped `any`) and `builder/page.tsx` (hand-typed). Extract one hook. |
| 23 | **`downloadZip.ts` loads JSZip from a CDN at runtime.** It works (verified: `cross-origin-resource-policy: cross-origin`), but it is a runtime network dependency for a core feature. Bundle it. |

---

## 7. Gotchas that will cost you an afternoon

- **`git` is off-limits.** `CLAUDE.md` forbids committing, pushing and staging. Recovery if
  something gets staged: `git restore --staged .` (keeps the working tree).
- **A dev server may already be running.** Next enforces one instance per project and will
  refuse a second with a confusing message. Check `.next/dev/logs/` for the live port.
- **Rate limits poison test runs.** Space live LLM calls ~60s apart or you will get
  spurious 413s and conclude something is broken when it is not.
- **`streamText` errors cannot become HTTP errors.** `toTextStreamResponse()` commits a 200
  before the upstream reply is known. That is why failures travel in-band as
  `<craftaiError>` / `<craftaiTruncated/>` sentinels, parsed in `chatStream.ts`.
- **`.env.local` is required** and gitignored. Copy `.env.example`; only `GROQ_API_KEY` is
  needed.
