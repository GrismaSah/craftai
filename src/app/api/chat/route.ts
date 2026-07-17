import { nvidia, NVIDIA_MODEL } from "@/lib/nvidia-provider";
import { streamText } from "ai";
import { getSystemPrompt } from "@/lib/prompts";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        {
          error: "Messages must be an array",
        },
        {
          status: 400,
        }
      );
    }

    const stream = streamText({
      model: nvidia(NVIDIA_MODEL),
      system: getSystemPrompt(),
      messages: messages,
    });

    return stream.toTextStreamResponse();
  } catch (error) {
    console.error(error);

    const err = error as Record<string, unknown>;
    if (err?.statusCode === 429) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          message:
            "API credits exhausted. Please wait a moment and try again.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
