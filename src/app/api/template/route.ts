import { NextResponse } from "next/server";
import { generateText } from "ai";
import { nvidia, NVIDIA_MODEL } from "@/lib/nvidia-provider";
import { BASE_PROMPT } from "@/lib/prompts";
import { basePrompt as reactBasePrompt } from "@/defaults/react";
import { basePrompt as nodeBasePrompt } from "@/defaults/node";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const { text: answer } = await generateText({
      model: nvidia(NVIDIA_MODEL),
      system:
        "You are a project classifier. Respond with ONLY the word 'react' or 'node'. Nothing else. No explanation, no code, no markdown. Just one word: react or node",
      messages: [
        {
          role: "user",
          content: `Classify this as either a react frontend project or a node backend project. Respond with only 'react' or 'node':\n\n${prompt}`,
        },
      ],
      temperature: 0,
    });

    const cleanedAnswer = answer.trim().toLowerCase();
    console.log("Template classification answer:", cleanedAnswer);

    let classification = "";
    if (cleanedAnswer.includes("react")) {
      classification = "react";
    } else if (cleanedAnswer.includes("node")) {
      classification = "node";
    } else {
      console.warn(
        "Could not classify, defaulting to react. Response:",
        cleanedAnswer
      );
      classification = "react";
    }

    if (classification === "react") {
      const systemPrompt =
        BASE_PROMPT +
        `\n\nIMPORTANT: When writing code files, you MUST wrap your response in XML tags like this:

<boltArtifact id="project-update" title="Updated Project">
<boltAction type="file" filePath="path/to/file.tsx">
file content here
</boltAction>
</boltArtifact>

Generate ALL files needed for the project. Each file should be in its own <boltAction> tag with the correct filePath.`;

      const reactAppGuidance = `\n\nReact projects must be real applications, not the stock Vite starter. Do not leave the default placeholder UI in place. Build a complete interactive experience with state, reusable components, responsive layout, and functionality that matches the user's request.`;

      return NextResponse.json({
        classification: "react",
        prompts: [
          systemPrompt + reactAppGuidance,
          `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nImportant: treat the starter as a scaffold only. Replace the default Vite placeholder with a functional React application that fits the prompt.\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
        ],
        uiPrompts: [reactBasePrompt],
      });
    }

    if (classification === "node") {
      const systemPrompt =
        BASE_PROMPT +
        `\n\nIMPORTANT: When writing code files, you MUST wrap your response in XML tags like this:

<boltArtifact id="project-update" title="Updated Project">
<boltAction type="file" filePath="path/to/file.js">
file content here
</boltAction>
</boltArtifact>

Generate ALL files needed for the project. Each file should be in its own <boltAction> tag with the correct filePath.`;

      return NextResponse.json({
        classification: "node",
        prompts: [
          systemPrompt,
          `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${nodeBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
        ],
        uiPrompts: [nodeBasePrompt],
      });
    }
  } catch (error) {
    const err = error as Record<string, unknown>;
    const statusCode =
      typeof err?.statusCode === "number" ? err.statusCode : 0;

    if (statusCode === 429) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          message:
            "API credits exhausted. Please wait a moment and try again.",
        },
        { status: 429 }
      );
    }

    const message =
      err?.message && typeof err.message === "string"
        ? err.message
        : "Internal Server Error";

    console.error("Template API error:", message, err);

    return NextResponse.json(
      { error: "Internal Server Error", detail: message },
      { status: 500 }
    );
  }
}
