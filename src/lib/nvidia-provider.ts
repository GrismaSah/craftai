import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const apiKey = process.env.NVIDIA_API_KEY;

if (!apiKey) {
  throw new Error("NVIDIA_API_KEY environment variable is not set");
}

export const nvidia = createOpenAICompatible({
  name: "nvidia",
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey,
});

export const NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";
