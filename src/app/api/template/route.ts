import { Output, generateText } from "ai";
import { BASE_PROMPT } from "@/lib/prompts";
import { basePrompt as reactBasePrompt } from "@/defaults/react";
import { basePrompt as nodeBasePrompt } from "@/defaults/node";
import {
  MODELS,
  errorResponse,
  getGroq,
  reasoningOptions,
  tooManyRequestsResponse,
} from "@/lib/ai/groq";
import { TEMPLATE_BUDGETS, checkBudgets, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * The classifier only needs the opening request, and a label is all it returns —
 * length beyond a paragraph or two adds cost without changing the answer. 8,000
 * characters (~2,400 tokens) is far more than any real build prompt while
 * stopping an unbounded string from being forwarded to the model. Distinct from
 * /api/chat's 200,000, which budgets a whole conversation.
 */
const MAX_PROMPT_CHARS = 8_000;

/**
 * A single short classification call. Measured at 0.3-2.7s against
 * `qwen/qwen3.8-27b`; 30s is a generous ceiling that still fails fast.
 */
export const maxDuration = 30;

const CLASSIFICATIONS = ["chat", "react", "node"] as const;
type Classification = (typeof CLASSIFICATIONS)[number];

/** The two classifications that cause a project scaffold to be seeded. */
type BuildClassification = Exclude<Classification, "chat">;

const CLASSIFIER_SYSTEM = `You are a router for a prompt-to-website builder. Read the user's message and choose exactly one of: chat, react, node.

chat - the user is talking, not commissioning work. Greetings, small talk, thanks, questions about technology, questions about a project that already exists, requests to explain or compare things, brainstorming, or planning out loud. Nothing should be scaffolded.
  Examples: "hi" / "hey there" / "what is tailwind?" / "what fonts did you use?" / "which is better, css grid or flexbox?" / "explain what you just built" / "can you help me think through the layout?" / "why did you pick vite?" / "is redux still worth learning?"

react - the user wants a NEW frontend built: a web app, site, page, dashboard, landing page, UI, or component library.
  Examples: "a landing page for a coffee shop" / "build me a portfolio site with a dark mode toggle" / "todo app in react" / "make a pricing page with three tiers"

node - the user wants a NEW backend built: an API, server, CLI, worker, or service.
  Examples: "an express REST API with JWT auth" / "a node script that scrapes RSS feeds" / "build a websocket chat server"

Decision rules, in order:
1. BIAS TO chat. If the user is asking ABOUT something rather than asking FOR something to be built, choose chat. A message that is a question and contains no instruction to create, build, make, generate, or add something is chat.
2. Only choose react or node when the user is actually commissioning software - there is something they want to exist that does not exist yet.
3. If it is a build request that names both a frontend and a backend, choose whichever is the primary deliverable. "a node backend API that serves a react frontend" is node, because the API is the deliverable.
4. Do not be fooled by technology names. Mentioning React, Node, Express or Tailwind does not make a message a build request - "what is tailwind?" is chat.

Answer with the single label only.`;

const ARTIFACT_INSTRUCTIONS = (
  exampleFilePath: string
) => `\n\nIMPORTANT: When writing code files, you MUST wrap your response in XML tags like this:

<boltArtifact id="project-update" title="Updated Project">
<boltAction type="file" filePath="${exampleFilePath}">
file content here
</boltAction>
</boltArtifact>

Each file goes in its own <boltAction> tag with the correct filePath. On the first build, write every file the project needs in full. After that, follow the file-vs-diff rule in your instructions.`;

const REACT_APP_GUIDANCE = `\n\nReact projects must be real applications, not the stock Vite starter. Do not leave the default placeholder UI in place. Build a complete interactive experience with state, reusable components, responsive layout, and functionality that matches the user's request.`;

/**
 * Response shape is part of the contract with the builder client.
 *
 * For a build classification: `{ classification, prompts: [systemPrompt,
 * contextPrompt], uiPrompts: [basePrompt] }` - byte-identical to what it has
 * always been. Do not reshape it without updating the client.
 *
 * For `chat` the client must NOT scaffold anything, so the scaffold-bearing keys
 * are absent entirely rather than empty. `"prompts" in body` is the client's
 * test, and an empty array would pass it.
 */
type TemplateResponse =
  | { classification: "chat" }
  | {
      classification: BuildClassification;
      prompts: [string, string];
      uiPrompts: [string];
    };

function buildResponse(classification: Classification): TemplateResponse {
  if (classification === "chat") {
    // No project is seeded and no system/context prompt is handed back. The
    // client streams a conversational reply from /api/chat instead.
    return { classification: "chat" };
  }

  if (classification === "react") {
    return {
      classification: "react",
      prompts: [
        BASE_PROMPT + ARTIFACT_INSTRUCTIONS("path/to/file.tsx") + REACT_APP_GUIDANCE,
        `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nImportant: treat the starter as a scaffold only. Replace the default Vite placeholder with a functional React application that fits the prompt.\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
      ],
      uiPrompts: [reactBasePrompt],
    };
  }

  // `classification` is narrowed to "node" here, so every path returns. The old
  // handler had a fall-through that returned an empty 200 and rendered a blank
  // builder screen. Adding a fourth label to CLASSIFICATIONS without handling it
  // here is a compile error, because the return type is the exhaustive union.
  return {
    classification: "node",
    prompts: [
      BASE_PROMPT + ARTIFACT_INSTRUCTIONS("path/to/file.js"),
      `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${nodeBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
    ],
    uiPrompts: [nodeBasePrompt],
  };
}

export async function POST(req: Request): Promise<Response> {
  const throttled = checkBudgets(clientKey(req), TEMPLATE_BUDGETS);
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

  const prompt =
    typeof body === "object" && body !== null
      ? (body as { prompt?: unknown }).prompt
      : undefined;

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return Response.json(
      { error: "invalid_body", message: "`prompt` is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    return Response.json(
      {
        error: "payload_too_large",
        message: `\`prompt\` exceeds the ${MAX_PROMPT_CHARS} character limit.`,
      },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // Enum output instead of the old `answer.includes("react")` substring test,
    // which classified "a node API that serves a react app" as react. The SDK
    // constrains the model to exactly one of the three values and validates it,
    // so there is no fall-through case to guess at.
    //
    // `generateObject` is @deprecated in ai@6 in favour of this form
    // (node_modules/ai/dist/index.d.ts:5296).
    const { output } = await generateText({
      model: getGroq()(MODELS.classification.id),
      output: Output.choice({ options: [...CLASSIFICATIONS] }),
      system: CLASSIFIER_SYSTEM,
      prompt,
      temperature: 0,
      // qwen3.8 is a reasoning model; keep the chain-of-thought out of the
      // response so it cannot interfere with parsing. Unlike the generation
      // model this one does accept the option — see MODELS in lib/ai/groq.ts.
      providerOptions: reasoningOptions(MODELS.classification),
      abortSignal: req.signal,
    });

    return Response.json(buildResponse(output), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "api/template");
  }
}
