# Routes

## App Router (Next.js 16)

| URL Path | Component File | Layout | Description |
|----------|---------------|--------|-------------|
| `/` | `src/app/page.tsx` | Root layout | Landing page — hero, features, how it works, pricing, footer |
| `/builder` | `src/app/builder/page.tsx` (likely) | Root layout | Website builder interface |
| `/test` | `src/app/test/page.tsx` (likely) | Root layout | Test environment |

### Landing Page (`/`)
**File**: `src/pages/home.tsx`

The landing page compose the following sections in order:
1. NewNavBar — Fixed top nav with glass effect
2. NewHeroSection — Gradient hero with prompt input, voice, suggestions
3. NewFeaturesSection — 3 feature cards (Instant generation, Prompt editing, Clean code)
4. ProcessSection — Horizontal scroll process (6 steps) — currently commented out in home.tsx
5. NewPricingSection — 3-tier pricing
6. NewFooterSection — Footer with links

**Not currently rendered on homepage**: `NewHowItWorks.tsx`, `ProcessSection.tsx`
