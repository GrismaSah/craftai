# Theme / Design Tokens

## Tailwind Config
**File**: `tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./sections/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        // Shadcn CSS Variables
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive) / <alpha-value>)", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // Makr Design System
        makr: {
          black: "#050401", white: "#fafaf9", orange: "#f05a1a", terracotta: "#7b4b3a",
          gray: { light: "#f0f0f0", mid: "#8e8e93", dark: "#222222" },
        },
        // CraftAI Design System
        craftai: {
          primary: "#7c3aed", "primary-active": "#6d28d9", ink: "#26251e", body: "#5a5852",
          "body-strong": "#26251e", muted: "#807d72", "muted-soft": "#a09c92",
          hairline: "#e6e5e0", "hairline-soft": "#efeee8", "hairline-strong": "#cfcdc4",
          canvas: "#f5f3ff", "canvas-soft": "#faf8ff", "surface-card": "#ffffff",
          "surface-strong": "#e6e5e0", "on-primary": "#ffffff",
        },
        cream: "#f5f3ff",
        purple: { DEFAULT: "#7c3aed", light: "#a78bfa", lighter: "#ddd6fe", dark: "#6d28d9", darker: "#581c87" },
        lime: { DEFAULT: "#a78bfa", hover: "#9f7aea" },
        success: "#10B981", gold: "#FFB800",
        "card-border": "rgba(124,58,237,0.1)", "code-bg": "#ede9fe", "code-dark": "#1E1E1E",
      },
      borderRadius: { button: "0.75rem", input: "0.875rem" },
      textColor: { "ink-secondary": "#5a5852" },
      boxShadow: {
        card: "0 4px 24px rgba(0,0,0,0.06)",
        "card-hover": "0 12px 40px rgba(0,0,0,0.08)",
        editor: "0 8px 32px rgba(0,0,0,0.08)",
        key: "0 1px 2px rgba(0,0,0,0.15)",
      },
      animation: {
        shimmer: "shimmer 2s infinite",
        "gradient-shift": "gradient-shift 15s ease infinite",
        "caret-blink": "caret-blink 1s ease-in-out infinite",
        "scroll-logos-left": "scroll-logos-left 30s linear infinite",
        "scroll-logos-right": "scroll-logos-right 30s linear infinite",
        float: "float 3s ease-in-out infinite",
        "float-slow": "float-slow 4s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
      },
      keyframes: {
        shimmer: { "0%": { opacity: "1" }, "50%": { opacity: "0.5" }, "100%": { opacity: "1" } },
        "gradient-shift": { "0%": { backgroundPosition: "200% 200%" }, "50%": { backgroundPosition: "0% 0%" }, "100%": { backgroundPosition: "200% 200%" } },
        "caret-blink": { "0%": { opacity: "1" }, "50%": { opacity: "0" }, "100%": { opacity: "1" } },
        "scroll-logos-left": { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-33.333%)" } },
        "scroll-logos-right": { "0%": { transform: "translateX(-33.333%)" }, "100%": { transform: "translateX(0)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        "float-slow": { "0%,100%": { transform: "translateY(0) rotate(0deg)" }, "50%": { transform: "translateY(-8px) rotate(3deg)" } },
        "pulse-glow": { "0%,100%": { opacity: "0.4" }, "50%": { opacity: "0.8" } },
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
```

## CSS Variables (globals.css)

```css
:root {
  --color-primary: #7c3aed;
  --color-primary-active: #6d28d9;
  --color-ink: #26251e;
  --color-body: #5a5852;
  --color-body-strong: #26251e;
  --color-muted: #807d72;
  --color-muted-soft: #a09c92;
  --color-hairline: #e6e5e0;
  --color-hairline-soft: #efeee8;
  --color-hairline-strong: #cfcdc4;
  --color-canvas: #f5f3ff;
  --color-canvas-soft: #faf8ff;
  --color-surface-card: #ffffff;
  --color-surface-strong: #e6e5e0;
  --color-on-primary: #ffffff;
  --color-semantic-error: #cf2d56;
  --color-semantic-success: #1f8a65;
  /* shadcn fallback vars */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}

body {
  background-color: #f5f3ff;
  color: #26251e;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

@keyframes placeholderFade {
  0% { opacity: 0; }
  50% { opacity: 0.3; }
  100% { opacity: 1; }
}

@keyframes voice-wave {
  0%, 100% { transform: scaleY(0.3); }
  25% { transform: scaleY(1); }
  50% { transform: scaleY(0.5); }
  75% { transform: scaleY(0.8); }
}
```
