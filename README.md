# CraftAI

Turn your ideas into websites. CraftAI is an AI-powered website builder that generates fully functional websites from a simple text prompt — no coding required.


## Architecture

CraftAI uses a three-stage pipeline to go from prompt to live preview:

<img width="1056" height="680" alt="image" src="https://github.com/user-attachments/assets/a60e9d9e-3919-4270-a401-1225bea28e9a" />


## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment variables
# Create .env.local and add your API keys:
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_key
GROQ_API_KEY=your_groq_key

# 3. Run the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page. Type a prompt, hit send, and the builder will generate your site.
