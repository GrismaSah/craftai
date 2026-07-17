# Groq AI Integration Setup

This project is now integrated with **Groq** AI through Vercel's AI SDK for real-time text streaming.

## 🚀 Getting Started

### 1. Get Your Groq API Key

1. Visit [Groq Console](https://console.groq.com)
2. Sign up or log in
3. Navigate to API keys section
4. Create a new API key
5. Copy the API key

### 2. Configure Environment Variables

Update the `.env.local` file in the root directory:

```bash
# .env.local
GROQ_API_KEY=your_groq_api_key_here
```

**Important:** Never commit `.env.local` to version control. It's already in `.gitignore`.

### 3. Install Dependencies

All required packages are already installed:

- `@ai-sdk/groq` - Groq provider for Vercel AI SDK
- `ai` - Vercel AI SDK for streaming and text generation

## 📡 API Endpoint

### POST `/api/chat`

Sends a message and receives a streaming response from Groq.

**Request:**
```json
{
  "message": "Your prompt here"
}
```

**Response:**
Streaming text response using Server-Sent Events (SSE)

**Example with cURL:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is Next.js?"}'
```

**Example with JavaScript:**
```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ message: 'Your prompt' }),
});

// Handle streaming response
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Process streaming data
}
```

## 🤖 Available Groq Models

The API uses `mixtral-8x7b-32768` by default, but you can switch to other models:

- `mixtral-8x7b-32768` - Fast, high-quality reasoning (default)
- `llama2-70b-4096` - Large language model
- `gemma-7b-it` - Fast instruction-tuned model
- `gemma2-9b-it` - Latest Gemma model

To use a different model, edit [src/app/api/chat/route.ts](src/app/api/chat/route.ts#L17) and change:

```typescript
const model = groq("mixtral-8x7b-32768"); // Change this
```

## 🔧 How It Works

1. **Frontend** (`src/sections/PromptHero.tsx`):
   - User enters a prompt in the input field
   - `handleGenerate()` sends it to the API

2. **Backend** (`src/app/api/chat/route.ts`):
   - Receives the message
   - Validates input
   - Sends request to Groq API via Vercel AI SDK
   - Returns streaming response

3. **Client** receives streaming text in real-time

## 🐛 Troubleshooting

### Error: "GROQ_API_KEY is not set"
- Ensure you've created `.env.local` in the project root
- Add your actual Groq API key (not placeholder text)
- Restart the development server after updating `.env.local`

### Error: "Invalid model name"
- Check that the model name matches one of Groq's available models
- Visit [Groq Models](https://console.groq.com/keys) to see available options

### API returns 400 Bad Request
- Ensure the request body includes a valid `message` field
- Check that `message` is a non-empty string

### Streaming not working
- The browser must support ReadableStream
- Check that response streaming is enabled in the browser
- Use Chrome, Firefox, or other modern browsers

## 📚 Resources

- [Groq Documentation](https://console.groq.com/docs)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

## ✨ Features

- ✅ Real-time streaming responses
- ✅ Error handling and validation
- ✅ Type-safe with TypeScript
- ✅ No rate limiting concerns (within Groq's free tier)
- ✅ Fast inference with Groq's LPU™ technology

---

**Last Updated:** May 26, 2026
