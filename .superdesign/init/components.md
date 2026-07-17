# UI Components

## Shared UI Primitives

### Button (via shadcn/ui pattern)
Not extracted as a standalone file — uses inline Tailwind button styles throughout.

### Input (Prompt Input)
Used in `NewHeroSection.tsx` — inline styled with Tailwind.

---

## Page-Specific Components

### Sections (in `src/sections/`)

#### `NewNavBar.tsx`
- Fixed top navigation with glass effect
- Logo, nav links (How it works, Features, Pricing, Docs)
- Sign in + Get started free CTA
- Mobile hamburger menu

#### `NewHeroSection.tsx`
- Full-width hero with gradient background (light blue to warm peach)
- Main heading, subtext, AI prompt input with voice recognition
- Suggestion buttons (Portfolio, SaaS, E-commerce, Blog, Startup)
- Orange submit button with loading state

#### `NewFeaturesSection.tsx`
3 feature cards in a 3-column grid:
- `KeyboardCard` — Instant generation card with keyboard illustration and shimmer animation
- `TagsCard` — Prompt-based editing card with floating colored tags on dark background
- `CodeCard` — Clean code card with code editor preview (JSX snippet with syntax colors)

#### `NewHowItWorks.tsx`
3-step process section:
- Describe → CraftAI generates → Edit & deploy
- Numbered cards with accent colors (orange, purple, teal)

#### `ProcessSection.tsx`
Horizontal scroll process:
- 6 steps (Prompt, Generate, Refine, Preview, Export, Publish)
- Progress bar at bottom
- Scroll-driven horizontal animation with GSAP ScrollTrigger

#### `NewPricingSection.tsx`
3-tier pricing:
- Hobby (Free), Pro ($19/mo, highlighted), Team ($49/mo)
- Feature list, CTA buttons
- Dark card for highlighted plan

#### `NewFooterSection.tsx`
- Logo, copyright, footer links (Privacy, Terms, Docs, Twitter/X, GitHub)
