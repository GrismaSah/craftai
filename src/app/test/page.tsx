"use client";

import { useState } from "react";

export default function HomePage() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!message.trim()) return;

    setLoading(true);
    setResponse("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
        }),
      });

      if (!res.body) {
        throw new Error("No response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let result = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);

        result += chunk;

        setResponse(result);
      }
    } catch (error) {
      console.error(error);
      setResponse("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-2xl space-y-4">
        <h1 className="text-4xl font-bold">Groq AI Chat</h1>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask something..."
          className="w-full h-32 p-4 rounded-lg bg-zinc-900 border border-zinc-700 outline-none"
        />

        <button
          onClick={sendMessage}
          disabled={loading}
          className="bg-white text-black px-6 py-3 rounded-lg font-semibold"
        >
          {loading ? "Thinking..." : "Send"}
        </button>

        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 min-h-[200px] whitespace-pre-wrap">
          {response || "AI response will appear here..."}
        </div>
      </div>
    </main>
  );
}